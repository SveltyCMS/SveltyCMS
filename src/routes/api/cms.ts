/**
 * @file src/routes/api/cms.ts
 * @description
 * High-performance, server-side Local API for SveltyCMS.
 * Facilitates 0ms internal communication between CMS components while mirroring
 * the HTTP API for external consumers.
 */

import { contentManager } from "@src/content";
import { modifyRequest } from "@src/routes/api/collections/modify-request";
import { cacheService } from "@src/databases/cache/cache-service";
import { AppError } from "@utils/error-handling";
import { verifyPassword } from "@utils/password";
import { parseSessionDuration } from "@utils/auth-utils";
import {
  getPrivateSettingSync,
  getAllSettings,
  updateSettingsFromSnapshot,
  invalidateSettingsCache,
} from "@src/services/settings-service";
import { reinitializeSystem } from "@src/databases/db";
import { getHealthCheckReport } from "@src/stores/system/reporting";
import { MediaService } from "@utils/media/media-service.server";
import { jobQueue } from "@src/services/jobs/job-queue-service";
import { saveTempPayload } from "@utils/temp-store";
import { fetchDrupalData, fetchWordPressData } from "@src/services/importer/source-adapters";
import { aiService } from "@src/services/ai-service";
import { scaffoldCollectionSchema } from "@src/services/importer/scaffolder";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getAllPermissions } from "@src/databases/auth/permissions";
import type { Role } from "@src/databases/auth/types";
import { invalidateRolesCache } from "@src/hooks/handle-authorization";
import { withTenant } from "@src/databases/db-adapter-wrapper";
import { auditLogService, AuditEventType } from "@src/services/audit-log-service";
import type { DatabaseId, IDBAdapter, ISODateString } from "@src/databases/db-interface";
import type { Schema, FieldInstance, CollectionMap } from "@src/content/types";

/**
 * Type-safe proxy for collection operations.
 * Enables dot-notation access to collections with full IDE autocomplete.
 */
export type CollectionProxy = {
  [K in keyof CollectionMap]: {
    find(options?: any): Promise<any>;
    findById(id: string, options?: any): Promise<any>;
    create(data: Partial<CollectionMap[K]>, options?: any): Promise<any>;
    update(id: string, data: Partial<CollectionMap[K]>, options?: any): Promise<any>;
    delete(id: string, options?: any): Promise<any>;
    queryBuilder(options?: any): any;
  };
};

import { automationService } from "@src/services/automation/automation-service";
import { metricsService } from "@src/services/metrics-service";
import { telemetryService } from "@src/services/telemetry-service";
import { getRevisions } from "@src/services/revision-service";

export interface LocalApiOptions {
  user?: any;
  tenantId?: DatabaseId | null;
  permanent?: boolean;
  bypassCache?: boolean;
  system?: boolean;
}

/**
 * LocalCMS SDK
 * The single source of truth for all CMS operations.
 */
export class LocalCMS {
  public auth: AuthNamespace;
  public collections: CollectionsNamespace;
  public media: MediaNamespace;
  public widgets: WidgetsNamespace;
  public system: SystemNamespace;
  public websiteTokens: WebsiteTokensNamespace;
  public ai = aiService;
  public automation = automationService;
  public metrics = metricsService;
  public telemetry = telemetryService;
  public db: IDBAdapter;

  constructor(private _dbAdapter: IDBAdapter) {
    if (!this._dbAdapter) throw new Error("LocalCMS: DB Adapter is required");
    this.db = this._dbAdapter;
    this.auth = new AuthNamespace(this._dbAdapter);
    this.collections = new CollectionsNamespace(this._dbAdapter);
    this.media = new MediaNamespace(this._dbAdapter);
    this.widgets = new WidgetsNamespace(this._dbAdapter);
    this.system = new SystemNamespace(this._dbAdapter);
    this.websiteTokens = new WebsiteTokensNamespace(this._dbAdapter);

    // Register SDK initialization in metrics
    if (typeof metricsService?.recordMetric === "function") {
      metricsService.recordMetric("sdk:init", 1);
    }
  }

  /**
   * Helper to create a clean locals.cms object with proper context
   * This moves mapping logic out of the hook and into the SDK.
   */
  static getLocals(dbAdapter: IDBAdapter, eventLocals: any = {}) {
    const cms = new LocalCMS(dbAdapter);
    const { tenantId, user, isAdmin } = eventLocals;

    const collections = {
      find: (collection: string, options?: any) =>
        cms.collections.find(collection, { ...options, tenantId, user }),
      findById: (collection: string, id: string, options?: any) =>
        cms.collections.findById(collection, id, { ...options, tenantId, user }),
      create: (collection: string, data: any, options?: any) =>
        cms.collections.create(collection, data, { ...options, tenantId, user }),
      update: (collection: string, id: string, data: any, options?: any) =>
        cms.collections.update(collection, id, data, { ...options, tenantId, user }),
      delete: (collection: string, id: string, options?: any) =>
        cms.collections.delete(collection, id, {
          ...options,
          tenantId,
          user,
          permanent: options?.permanent,
        }),
      bulkCreate: (collection: string, data: any[], options?: any) =>
        cms.collections.bulkCreate(collection, data, { ...options, tenantId, user }),
      bulkUpdate: (collection: string, updates: any[], options?: any) =>
        cms.collections.bulkUpdate(collection, updates, { ...options, tenantId, user }),
      bulkDelete: (collection: string, ids: string[], options?: any) =>
        cms.collections.bulkDelete(collection, ids, { ...options, tenantId, user }),
      queryBuilder: (collection: string, options?: any) =>
        cms.collections.queryBuilder(collection, { ...options, tenantId }),
      modifyRequest: (params: any) => cms.collections.modifyRequest(params),

      // Convenient shortcuts
      refresh: (tId?: string) => cms.collections.refresh((tId || tenantId) as DatabaseId),
      reorderContentNodes: (items: any[], tId?: string) =>
        cms.collections.reorderContentNodes(items, (tId || tenantId) as DatabaseId),
    };

    return {
      auth: cms.auth,
      collections,

      // Top-level CRUD for App.Locals compatibility
      find: collections.find,
      findById: collections.findById,
      create: collections.create,
      update: collections.update,
      delete: collections.delete,
      bulkCreate: collections.bulkCreate,
      bulkUpdate: collections.bulkUpdate,
      bulkDelete: collections.bulkDelete,
      queryBuilder: collections.queryBuilder,

      media: {
        find: (options?: any) => cms.media.find({ ...options, tenantId }),
        findById: (id: string, options?: any) => cms.media.findById(id, { ...options, tenantId }),
        upload: (file: File, options?: any) =>
          cms.media.upload(file, { ...options, userId: user?._id, tenantId }),
        update: (id: string, data: any) => cms.media.update(id, data, tenantId),
        delete: (id: string) => cms.media.delete(id, { tenantId }),
      },
      widgets: {
        list: () => cms.widgets.list(tenantId || "default-tenant"),
        activate: (id: string) => cms.widgets.activate(id),
        deactivate: (id: string) => cms.widgets.deactivate(id),
      },
      system: {
        getHealth: () => cms.system.getHealth(),
        getPreferences: (keys: string[], options?: any) =>
          cms.system.getPreferences(keys, { ...options, userId: user?._id }),
        setPreference: (key: string, value: any, options?: any) =>
          cms.system.setPreference(key, value, { ...options, userId: user?._id }),
        sendMail: (params: any) => cms.system.sendMail(params),
      },
      websiteTokens: {
        list: (options?: any) => cms.websiteTokens.list({ ...options, tenantId }),
        create: (data: any) => cms.websiteTokens.create({ ...data, user, tenantId }),
        delete: (id: string) => cms.websiteTokens.delete(id, tenantId),
      },
      transaction: (fn: any, options?: any) => cms.transaction(fn, options),
      context: { isLocal: true, tenantId, user, isAdmin },
      db: cms.db,

      // Content System methods
      version: contentManager.getContentVersion(),
      getContentStructure: (tId?: string) =>
        contentManager.getContentStructure((tId || tenantId) as DatabaseId),
      getNodeChildren: (parentId: string, tId?: string) =>
        contentManager.getNodeChildren(parentId as DatabaseId, (tId || tenantId) as DatabaseId),
      getContentVersion: () => contentManager.getContentVersion(),
    };
  }

  /**
   * Execute multiple operations within a single database transaction.
   * Only supported by database adapters that have supportsTransactions: true.
   */
  async transaction(
    fn: (transaction: any) => Promise<any>,
    options?: { timeout?: number; isolationLevel?: string },
  ) {
    const start = performance.now();
    try {
      const result = await this._dbAdapter.transaction(fn, options);
      if (typeof metricsService?.recordMetric === "function") {
        metricsService.recordMetric("sdk:transaction:duration", performance.now() - start);
      }
      return result;
    } catch (error: any) {
      if (typeof metricsService?.recordMetric === "function") {
        metricsService.recordMetric("sdk:transaction:error", 1);
      }
      throw error;
    }
  }
}

/**
 * Authentication Namespace
 */
class AuthNamespace {
  public tokens: TokensNamespace;

  constructor(private _dbAdapter: IDBAdapter) {
    this.tokens = new TokensNamespace(this._dbAdapter);
  }

  private async getAuth() {
    // We use the dbAdapter passed to the namespace, which should have auth methods
    return this._dbAdapter.auth;
  }

  async listUsers(
    options: {
      tenantId?: DatabaseId | null;
      page?: number;
      limit?: number;
      search?: string;
      sort?: string;
      order?: "asc" | "desc";
    } = {},
  ) {
    const { tenantId, page = 1, limit = 10, search, sort, order } = options;
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);

    const filter: Record<string, any> = { tenantId: tenantId as DatabaseId };
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const sortOption: any = {};
    if (sort) {
      sortOption[sort] = order === "asc" ? 1 : -1;
    } else {
      sortOption.createdAt = -1;
    }

    const [usersResult, totalResult] = await Promise.all([
      auth.getAllUsers(
        {
          filter,
          limit,
          offset: (page - 1) * limit,
          sort: sortOption,
        },
        { tenantId: tenantId as DatabaseId },
      ),
      auth.getUserCount(filter, { tenantId: tenantId as DatabaseId }),
    ]);

    if (!usersResult.success) throw new AppError(usersResult.message, 500);
    if (!totalResult.success) throw new AppError(totalResult.message, 500);

    return {
      data: usersResult.data,
      pagination: {
        totalItems: totalResult.data,
        page,
        limit,
        totalPages: Math.ceil(totalResult.data / limit),
      },
    };
  }

  async saveAvatar(userId: string, avatar: string, tenantId?: DatabaseId | null) {
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    return auth.updateUserAttributes(
      userId as DatabaseId,
      { avatar },
      { tenantId: tenantId as DatabaseId },
    );
  }

  async deleteAvatar(userId: string, tenantId?: DatabaseId | null) {
    const auth = await this.getAuth();
    return auth.updateUserAttributes(
      userId as DatabaseId,
      { avatar: undefined },
      { tenantId: tenantId as DatabaseId },
    );
  }

  /**
   * Retrieves a list of tokens.
   */
  async list(
    options: {
      tenantId?: DatabaseId | null;
      page?: number;
      limit?: number;
      search?: string;
      sort?: string;
      order?: "asc" | "desc";
    } = {},
  ) {
    const { tenantId, page = 1, limit = 10, search, sort, order } = options;
    const auth = await this._dbAdapter.auth;
    if (!auth) throw new AppError("Authentication system not initialized", 500);

    const filter: Record<string, any> = { tenantId: tenantId as DatabaseId };
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
      ];
    }

    const sortOption: any = {};
    if (sort) {
      sortOption[sort] = order === "asc" ? 1 : -1;
    } else {
      sortOption.createdAt = -1;
    }

    const result = await auth.getAllTokens({ tenantId: tenantId as DatabaseId });
    if (!result.success) throw new AppError(result.message, 500);

    // Apply manual pagination and sorting for tokens (as getAllTokens doesn't support them natively yet)
    let filteredTokens = result.data;
    if (sort) {
      filteredTokens.sort((a: any, b: any) => {
        const valA = a[sort];
        const valB = b[sort];
        if (order === "asc") return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
    }

    const totalItems = filteredTokens.length;
    const paginatedTokens = filteredTokens.slice((page - 1) * limit, page * limit);

    return {
      data: paginatedTokens,
      pagination: {
        totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getUserById(userId: string, tenantId?: DatabaseId | null) {
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    const result = await auth.getUserById(userId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
    if (!result.success || !result.data) {
      throw new AppError("User not found", 404);
    }
    return result.data;
  }

  async updateUserAttributes(userId: string, data: any, tenantId?: DatabaseId | null) {
    const auth = await this.getAuth();
    return auth.updateUserAttributes(userId as DatabaseId, data, {
      tenantId: tenantId as DatabaseId,
    });
  }

  /**
   * Authenticates a user and returns a session.
   */
  async login(credentials: { email: string; password?: string }, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const { email, password } = credentials;

    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);

    // Multi-tenant check
    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required for login", 400);
    }

    const userLookup: { email: string; tenantId?: DatabaseId | null } = { email };
    if (getPrivateSettingSync("MULTI_TENANT") === true)
      userLookup.tenantId = tenantId as DatabaseId;

    const result = await auth.getUserByEmail(userLookup);
    if (!result.success || !result.data) {
      throw new AppError("Invalid credentials", 401);
    }

    const user = result.data;
    if (user.blocked || !user.password) {
      throw new AppError("Account suspended or incomplete", 401);
    }

    if (password) {
      const isValid = await verifyPassword(user.password, password);
      if (!isValid) throw new AppError("Invalid credentials", 401);
    }

    // Create Session
    const sessionResult = await auth.createSession({
      user_id: user._id as DatabaseId,
      tenantId: tenantId as DatabaseId,
      expires: new Date(Date.now() + parseSessionDuration("1d")).toISOString() as ISODateString,
    });

    if (!sessionResult.success) {
      throw new AppError("Failed to create session", 500);
    }

    return { user, session: sessionResult.data };
  }

  /**
   * Terminates a session.
   */
  async logout(sessionId: string) {
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    return auth.deleteSession(sessionId as DatabaseId);
  }

  async updateRoles(roles: Role[], options: { user: any; tenantId?: DatabaseId | null }) {
    const { user, tenantId } = options;

    const validationResult = await this.validateRoles(roles);
    if (!validationResult.isValid) {
      throw new AppError(validationResult.error || "Invalid roles", 400);
    }

    const auth = await this.getAuth();
    const existingRoles = await withTenant(
      (tenantId ?? "") as string,
      async () => {
        return await auth.getAllRoles({ tenantId: tenantId as DatabaseId });
      },
      { collection: "roles" },
    );
    const existingRoleIds = new Set(existingRoles.map((r) => r._id));
    const incomingRoleIds = new Set(roles.map((r: Role) => r._id));

    await withTenant(
      (tenantId ?? "") as string,
      async () => {
        for (const existingRole of existingRoles) {
          if (!incomingRoleIds.has(existingRole._id)) {
            await auth.deleteRole(existingRole._id as DatabaseId, {
              tenantId: tenantId as DatabaseId,
            });
          }
        }

        for (const role of roles) {
          const roleData: Role = {
            ...role,
            tenantId: (tenantId || undefined) as DatabaseId | undefined,
          };
          if (existingRoleIds.has(role._id)) {
            await auth.updateRole(role._id as DatabaseId, roleData, {
              tenantId: tenantId as DatabaseId,
            });
          } else {
            await auth.createRole(roleData);
          }
        }
      },
      { collection: "roles" },
    );

    invalidateRolesCache(tenantId as DatabaseId);

    await auditLogService.logEvent({
      action: "Updated system roles and permissions",
      actorId: user._id as DatabaseId,
      actorEmail: user.email,
      eventType: AuditEventType.USER_ROLE_CHANGED,
      result: "success",
      severity: "high",
      details: { roleCount: roles.length },
    });

    return { success: true };
  }

  private async validateRoles(roles: Role[]): Promise<{ isValid: boolean; error?: string }> {
    if (roles.length === 0) return { isValid: false, error: "At least one role required" };
    const permissions = await getAllPermissions();
    const permissionIds = new Set(permissions.map((p) => p._id));
    const roleNames = new Set<string>();
    const roleIds = new Set<string>();
    let hasAdmin = false;

    for (const role of roles) {
      if (roleIds.has(role._id)) return { isValid: false, error: `Duplicate ID: ${role._id}` };
      if (roleNames.has(role.name.toLowerCase()))
        return { isValid: false, error: `Duplicate name: ${role.name}` };
      roleIds.add(role._id);
      roleNames.add(role.name.toLowerCase());
      if (!role.isAdmin) {
        for (const perm of role.permissions) {
          if (!permissionIds.has(perm as DatabaseId))
            return { isValid: false, error: `Invalid permission: ${perm}` };
        }
      }
      if (role.isAdmin) hasAdmin = true;
    }
    if (!hasAdmin) return { isValid: true }; // Allow non-admin roles if at least one admin exists in system?
    // Wait, the original code had: if (!hasAdmin) return { isValid: false, error: "At least one admin role required" };
    if (!hasAdmin) return { isValid: false, error: "At least one admin role required" };
    return { isValid: true };
  }

  async batchAction(
    userIds: string[],
    action: "delete" | "block" | "unblock",
    tenantId?: DatabaseId | null,
  ) {
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);

    switch (action) {
      case "delete":
        return auth.deleteUsers(userIds as DatabaseId[], { tenantId: tenantId as DatabaseId });
      case "block":
        return auth.blockUsers(userIds as DatabaseId[], { tenantId: tenantId as DatabaseId });
      case "unblock":
        return auth.unblockUsers(userIds as DatabaseId[], { tenantId: tenantId as DatabaseId });
      default:
        throw new AppError("Invalid action", 400);
    }
  }
}

/**
 * Tokens Namespace
 */
class TokensNamespace {
  constructor(private _dbAdapter: IDBAdapter) {}

  async list(
    options: {
      tenantId?: DatabaseId | null;
      search?: string;
      page?: number;
      limit?: number;
      sort?: string;
      order?: "asc" | "desc";
    } = {},
  ) {
    const { tenantId, search, page = 1, limit = 10, sort, order } = options;
    const filter: Record<string, any> = {};
    if (tenantId) filter.tenantId = tenantId;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { token: { $regex: search, $options: "i" } },
      ];
    }

    const result = await this._dbAdapter.auth.getAllTokens({ tenantId: tenantId as DatabaseId });
    if (!result.success) throw new AppError("Failed to fetch tokens", 500);

    let tokens = result.data;

    // Apply manual sorting if requested
    if (sort) {
      tokens.sort((a: any, b: any) => {
        const valA = a[sort];
        const valB = b[sort];
        if (order === "asc") return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
    }

    const startIndex = (page - 1) * limit;
    const paginatedItems = tokens.slice(startIndex, startIndex + limit);

    return {
      data: paginatedItems,
      pagination: {
        totalItems: tokens.length,
        page,
        limit,
        totalPages: Math.ceil(tokens.length / limit),
      },
    };
  }

  async findById(tokenId: string, tenantId?: DatabaseId | null) {
    return this._dbAdapter.auth.getTokenById(tokenId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
  }

  async update(tokenId: string, data: any, tenantId?: DatabaseId | null) {
    return this._dbAdapter.auth.updateToken(tokenId as DatabaseId, data, {
      tenantId: tenantId as DatabaseId,
    });
  }

  async create(data: {
    email: string;
    expires: string;
    role: string;
    tenantId?: DatabaseId | null;
  }) {
    const { email, expires, role, tenantId } = data;
    const userId = (await import("@utils/native-utils")).generateUUID();

    // Convert expiresIn string (e.g. "2 days") to ISO Date
    let expiresDate: string;
    const now = Date.now();
    switch (expires) {
      case "2 hrs":
        expiresDate = new Date(now + 2 * 60 * 60 * 1000).toISOString();
        break;
      case "12 hrs":
        expiresDate = new Date(now + 12 * 60 * 60 * 1000).toISOString();
        break;
      case "2 days":
        expiresDate = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "1 week":
        expiresDate = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "2 weeks":
        expiresDate = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "1 month":
        expiresDate = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        expiresDate = expires; // Assume already ISO if no match
    }

    return this._dbAdapter.auth.createToken({
      user_id: userId as DatabaseId,
      email: email.toLowerCase(),
      role: role,
      expires: expiresDate as ISODateString,
      type: "invite",
      tenantId: tenantId as DatabaseId,
    });
  }

  async delete(tokenId: string, tenantId?: DatabaseId | null) {
    return this._dbAdapter.auth.deleteTokens([tokenId as DatabaseId], {
      tenantId: tenantId as DatabaseId,
    });
  }

  async block(tokenIds: string[], tenantId?: DatabaseId | null) {
    return this._dbAdapter.auth.blockTokens(tokenIds as DatabaseId[], {
      tenantId: tenantId as DatabaseId,
    });
  }

  async unblock(tokenIds: string[], tenantId?: DatabaseId | null) {
    return this._dbAdapter.auth.unblockTokens(tokenIds as DatabaseId[], {
      tenantId: tenantId as DatabaseId,
    });
  }

  async batchAction(
    tokenIds: string[],
    action: "delete" | "block" | "unblock",
    tenantId?: DatabaseId | null,
  ) {
    let targetTokenIds = tokenIds;
    try {
      const tokensResult = await this._dbAdapter.auth.getAllTokens({
        tenantId: tenantId as DatabaseId,
      });
      if (tokensResult.success && tokensResult.data) {
        targetTokenIds = tokenIds.map((val) => {
          const matched = tokensResult.data!.find(
            (t) => t._id === val || (t as any).token === val || (t as any).value === val,
          );
          return matched ? (matched as any)._id || val : val;
        });
      }
    } catch {}

    switch (action) {
      case "delete":
        return this._dbAdapter.auth.deleteTokens(targetTokenIds as DatabaseId[], {
          tenantId: tenantId as DatabaseId,
        });
      case "block":
        return this._dbAdapter.auth.blockTokens(targetTokenIds as DatabaseId[], {
          tenantId: tenantId as DatabaseId,
        });
      case "unblock":
        return this._dbAdapter.auth.unblockTokens(targetTokenIds as DatabaseId[], {
          tenantId: tenantId as DatabaseId,
        });
      default:
        throw new AppError("Invalid action", 400);
    }
  }

  async resolve(text: string, user: any, tenantId?: DatabaseId | null, locale: string = "en") {
    const { processTokensInResponse } = await import("@src/services/token/helper");
    return processTokensInResponse(text, user ?? undefined, locale, { tenantId });
  }
}

/**
 * Collections Namespace with support for typed proxies.
 */
class CollectionsNamespace {
  private _proxy: CollectionProxy;

  constructor(private _dbAdapter: IDBAdapter) {
    if (!_dbAdapter) {
      console.error("[LocalCMS/Collections] ERROR: dbAdapter is null/undefined in constructor");
    }

    // Initialize the Typed Proxy for dot-notation access
    this._proxy = new Proxy({} as CollectionProxy, {
      get: (_, prop: string) => {
        if (prop in this) return (this as any)[prop];
        return {
          find: (options?: any) => this.find(prop, options),
          findById: (id: string, options?: any) => this.findById(prop, id, options),
          create: (data: any, options?: any) => this.create(prop, data, options),
          update: (id: string, data: any, options?: any) => this.update(prop, id, data, options),
          delete: (id: string, options?: any) => this.delete(prop, id, options),
          queryBuilder: (options?: any) => this.queryBuilder(prop, options),
        };
      },
    });
  }

  /**
   * Fully-typed access to collections (e.g. cms.collections.Posts.find())
   * This is the primary entry point for modern CMS usage.
   */
  public get typed(): CollectionProxy {
    return this._proxy;
  }

  private getCollectionName(schemaId: string): string {
    return `collection_${schemaId.replace(/-/g, "")}`;
  }

  private async getSchema(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema> {
    const schema = await contentManager.getCollectionById(collectionId, tenantId);
    if (!schema?._id)
      throw new AppError(`Collection "${collectionId}" not found`, 404, "COLLECTION_NOT_FOUND");
    return schema;
  }

  async list(
    options: { tenantId?: DatabaseId | null; includeFields?: boolean; includeStats?: boolean } = {},
  ) {
    const { tenantId, includeFields = false, includeStats = false } = options;

    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const collections = await contentManager.getCollections(tenantId);

    // Process collections (token replacement, etc.)
    const processed = await Promise.all(
      collections.map(async (c) => {
        const col = { ...c } as any;
        if (!includeFields) delete col.fields;
        if (includeStats) col.stats = { count: 0 }; // Placeholder for actual stats

        // Token replacement in labels/descriptions
        const { replaceTokens } = await import("@src/services/token/engine");
        const now = new Date().toISOString() as ISODateString;
        if (col.label) col.label = await replaceTokens(col.label, { system: { now } });
        if (col.description)
          col.description = await replaceTokens(col.description, { system: { now } });

        return col;
      }),
    );

    return processed;
  }

  async search(
    query: string,
    options: {
      collections?: string[];
      tenantId?: DatabaseId | null;
      user: any;
      page?: number;
      limit?: number;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      filter?: any;
      status?: string;
      isAdmin?: boolean;
    },
  ) {
    const {
      collections,
      tenantId,
      user,
      page = 1,
      limit = 25,
      sortField = "updatedAt",
      sortDirection = "desc",
      filter: additionalFilter = {},
      status,
      isAdmin = false,
    } = options;

    let collectionsToSearch: string[] = [];
    if (collections && collections.length > 0) {
      collectionsToSearch = collections;
    } else {
      const allCollections = await contentManager.getCollections(tenantId);
      collectionsToSearch = allCollections
        .map((c) => c._id)
        .filter((id): id is string => id !== undefined);
    }

    const baseFilter: any = { ...additionalFilter };
    if (!isAdmin) {
      baseFilter.status = status || "published";
    } else if (status) {
      baseFilter.status = status;
    }

    const searchPromises = collectionsToSearch.map(async (collectionId) => {
      const collection = await contentManager.getCollectionById(collectionId, tenantId);
      if (!collection) return [];

      try {
        const result = await this._dbAdapter.crud.findMany(
          this.getCollectionName(collection._id as string),
          baseFilter,
          {
            limit: 100,
            tenantId: tenantId as DatabaseId,
          },
        );

        if (result.success && result.data) {
          let items = Array.isArray(result.data) ? result.data : [];
          if (query) {
            const lowerQuery = query.toLowerCase();
            items = items.filter((item) => {
              const searchableFields = ["title", "content", "description", "name"];
              return searchableFields.some((field) => {
                const value = (item as any)[field];
                return typeof value === "string" && value.toLowerCase().includes(lowerQuery);
              });
            });
          }

          if (items.length > 0) {
            const collectionModel = await this._dbAdapter.collection.getModel(
              collection._id as string,
            );
            await modifyRequest({
              data: items as any[],
              fields: collection.fields as FieldInstance[],
              collection: collectionModel,
              user,
              type: "GET",
              tenantId,
              collectionName: collection.name,
            });
          }

          return items.map((item) => ({
            ...item,
            _collection: { id: collection._id, name: collection.name, label: collection.label },
          }));
        }
        return [];
      } catch {
        return [];
      }
    });

    const resultsArrays = await Promise.all(searchPromises);
    const searchResults = resultsArrays.flat();

    if (sortField && searchResults.length > 0) {
      searchResults.sort((a: any, b: any) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
    }

    const startIndex = (page - 1) * limit;
    return {
      items: searchResults.slice(startIndex, startIndex + limit),
      total: searchResults.length,
      page,
      pageSize: limit,
      totalPages: Math.ceil(searchResults.length / limit),
    };
  }

  async find(collectionId: string, options: any = {}) {
    const { tenantId, filter = {}, limit = 50, offset = 0 } = options;
    const schema = await this.getSchema(collectionId, tenantId);
    const query = { ...filter, ...(tenantId && { tenantId: tenantId as DatabaseId }) };

    return this._dbAdapter.crud.findMany(this.getCollectionName(schema._id as string), query, {
      limit,
      offset,
      tenantId: tenantId as DatabaseId,
    });
  }

  /**
   * Returns a fluent QueryBuilder for a specific collection.
   * Supports native joins and complex filtering if the adapter allows.
   */
  queryBuilder(collectionId: string, options: { tenantId?: DatabaseId | null } = {}) {
    const { tenantId } = options;
    const collectionName = this.getCollectionName(collectionId);
    const builder = this._dbAdapter.queryBuilder<any>(collectionName);

    if (tenantId) {
      builder.where({ tenantId } as any);
    }

    return builder;
  }

  async modifyRequest(params: any) {
    return modifyRequest(params);
  }

  async refresh(tenantId?: DatabaseId | null) {
    return contentManager.initialize(tenantId, true); // skipReconciliation = true for speed
  }

  async reorderContentNodes(items: any[], tenantId?: DatabaseId | null) {
    return contentManager.reorderContentNodes(items, tenantId);
  }

  async bulkCreate(collectionId: string, data: any[], options: LocalApiOptions = {}) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const entries = data.map((item) => ({
      ...item,
      tenantId,
      createdBy: user?._id,
      createdAt: new Date().toISOString(),
    }));

    // Note: modifyRequest currently only handles single items or arrays in-place
    // For large bulk, we might need a more optimized modifyRequestBulk
    const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);
    await modifyRequest({
      data: entries,
      fields: schema.fields as FieldInstance[],
      collection: collectionModel,
      user,
      type: "POST",
      tenantId,
      collectionName: schema.name,
    });

    const result = await this._dbAdapter.batch.bulkInsert(
      this.getCollectionName(schema._id as string),
      entries,
    );

    if (result.success) {
      await this.invalidateCache(schema, tenantId);
      // Publish event
      try {
        const { pubSub } = await import("@src/services/pub-sub");
        pubSub.publish("entryUpdated", {
          collection: schema.name || (schema._id as string),
          id: "bulk",
          action: "bulkCreate",
          data: { count: entries.length },
          timestamp: new Date().toISOString(),
          user,
        });
      } catch {}
    }

    return result;
  }

  async bulkUpdate(
    collectionId: string,
    updates: Array<{ id: string; data: any }>,
    options: LocalApiOptions = {},
  ) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const formattedUpdates = updates.map((u) => ({
      id: u.id as DatabaseId,
      data: {
        ...u.data,
        updatedBy: user?._id,
        updatedAt: new Date().toISOString(),
      },
    }));

    const result = await this._dbAdapter.batch.bulkUpdate(
      this.getCollectionName(schema._id as string),
      formattedUpdates,
    );

    if (result.success) {
      await this.invalidateCache(schema, tenantId);
    }

    return result;
  }

  async bulkDelete(collectionId: string, ids: string[], options: LocalApiOptions = {}) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const result = await this._dbAdapter.batch.bulkDelete(
      this.getCollectionName(schema._id as string),
      ids as DatabaseId[],
    );

    if (result.success) {
      await this.invalidateCache(schema, tenantId);
    }

    return result;
  }

  async findById(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const schema = await this.getSchema(collectionId, tenantId);
    const query: any = {
      _id: entryId as DatabaseId,
      ...(tenantId && { tenantId: tenantId as DatabaseId }),
    };

    return this._dbAdapter.crud.findOne(this.getCollectionName(schema._id as string), query, {
      tenantId: tenantId as DatabaseId,
    });
  }

  async create(collectionId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const schema = await this.getSchema(collectionId, tenantId);

    const entryData = {
      ...data,
      tenantId,
      createdBy: system ? "system" : user?._id,
      createdAt: new Date().toISOString(),
    };

    const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    await modifyRequest({
      data: [entryData],
      fields: schema.fields as FieldInstance[],
      collection: collectionModel,
      user: effectiveUser,
      type: "POST",
      tenantId,
      collectionName: schema.name,
    });

    const result = await this._dbAdapter.crud.insert(
      this.getCollectionName(schema._id as string),
      entryData,
      { tenantId: tenantId as DatabaseId },
    );

    if (result.success && result.data) {
      await this.afterMutation(
        schema,
        tenantId,
        "create",
        result.data._id as string,
        result.data,
        effectiveUser,
      );
    }

    return result;
  }

  async update(collectionId: string, entryId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const schema = await this.getSchema(collectionId, tenantId);

    const updateData = {
      ...data,
      updatedBy: system ? "system" : user?._id,
      updatedAt: new Date().toISOString(),
    };

    const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    await modifyRequest({
      data: [updateData],
      fields: schema.fields as FieldInstance[],
      collection: collectionModel,
      user: effectiveUser,
      type: "PATCH",
      tenantId,
      collectionName: schema.name,
    });

    const result = await this._dbAdapter.crud.update(
      this.getCollectionName(schema._id as string),
      entryId as DatabaseId,
      updateData,
      { tenantId: tenantId as DatabaseId },
    );

    if (result.success && result.data) {
      await this.afterMutation(schema, tenantId, "update", entryId, result.data, effectiveUser);
    }

    return result;
  }

  async delete(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { user, tenantId, permanent = false } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const schema = await this.getSchema(collectionId, tenantId);

    const result = await this._dbAdapter.crud.delete(
      this.getCollectionName(schema._id as string),
      entryId as DatabaseId,
      { tenantId: tenantId as DatabaseId, permanent, userId: user?._id as DatabaseId },
    );

    if (!result.success) {
      throw new AppError(result.error?.message || "Delete failed", 500);
    }

    await this.afterMutation(
      schema,
      tenantId,
      permanent ? "delete" : "trash",
      entryId,
      { _id: entryId },
      user,
    );

    return result;
  }

  async getRevisions(collectionId: string, entryId: string, tenantId?: DatabaseId | null) {
    return getRevisions({
      collectionId,
      entryId,
      tenantId: (tenantId ?? "") as string,
      dbAdapter: this._dbAdapter,
    });
  }

  private async afterMutation(
    schema: Schema,
    tenantId: DatabaseId | null | undefined,
    action: string,
    id: string,
    data: any,
    user: any,
  ) {
    await this.invalidateCache(schema, tenantId);
    try {
      const { contentStore } = await import("@src/stores/content-store.svelte");
      contentStore.updateVersion();
    } catch {}

    try {
      const { pubSub } = await import("@src/services/pub-sub");
      pubSub.publish("entryUpdated", {
        collection: schema.name || (schema._id as string),
        id,
        action,
        data,
        timestamp: new Date().toISOString(),
        user,
      });
    } catch {}
  }

  private async invalidateCache(schema: Schema, tenantId?: DatabaseId | null) {
    const patterns = [
      `collection:${schema._id}:*`,
      `cms:content_structure:${tenantId || "global"}`,
      `cms:content_structure:${tenantId || "global"}:${schema._id}`,
    ];
    for (const pattern of patterns) {
      await cacheService
        .clearByPattern(pattern, (tenantId || undefined) as string | undefined)
        .catch(() => {});
    }
  }
}

/**
 * Media Namespace
 */
class MediaNamespace {
  private mediaService: MediaService;
  constructor(private _dbAdapter: IDBAdapter) {
    this.mediaService = new MediaService(_dbAdapter);
  }

  async find(
    options: {
      tenantId?: DatabaseId | null;
      limit?: number;
      folderId?: string;
      recursive?: boolean;
    } = {},
  ) {
    const { tenantId, limit = 100, folderId, recursive = false } = options;
    return this._dbAdapter.media.files.getByFolder(
      folderId as DatabaseId,
      { pageSize: limit, page: 1, sortField: "updatedAt", sortDirection: "desc" },
      recursive,
      tenantId as DatabaseId,
    );
  }

  async findById(fileId: string, options: { tenantId?: DatabaseId | null } = {}) {
    const { tenantId } = options;
    return this._dbAdapter.crud.findOne(
      "media",
      { _id: fileId as DatabaseId },
      { tenantId: tenantId as DatabaseId },
    );
  }

  async upload(
    file: File,
    options: {
      userId: string;
      access?: any;
      tenantId?: DatabaseId | null;
      watermarkOptions?: any;
    } = {} as any,
  ) {
    const { userId, access = "private", tenantId, watermarkOptions } = options;
    return this.mediaService.saveMedia(
      file,
      userId,
      access,
      tenantId as DatabaseId,
      "global",
      watermarkOptions,
    );
  }

  async update(mediaId: string, data: any, tenantId?: DatabaseId | null) {
    return this.mediaService.updateMedia(mediaId, data, tenantId as DatabaseId);
  }

  async delete(fileId: string, options: { tenantId?: DatabaseId | null } = {}) {
    const { tenantId } = options;
    return this.mediaService.deleteMedia(fileId, tenantId as DatabaseId);
  }

  async updateMedia(fileId: string, updates: any, options: { tenantId?: DatabaseId | null } = {}) {
    const { tenantId } = options;
    return this.mediaService.updateMedia(fileId, updates, tenantId as DatabaseId);
  }

  async batchProcess(
    mediaIds: string[],
    options: any,
    userId: string,
    tenantId?: DatabaseId | null,
  ) {
    return this.mediaService.batchProcessImages(mediaIds, options, userId, tenantId as DatabaseId);
  }
}

/**
 * Widgets Namespace
 */
class WidgetsNamespace {
  constructor(private _dbAdapter: IDBAdapter) {}

  async list(tenantId: string = "default-tenant") {
    const { widgets, getWidgetDependencies } = await import("@src/stores/widget-store.svelte.ts");
    await widgets.initialize(tenantId);

    const activeWidgetsResult = await this._dbAdapter.system.widgets.getActiveWidgets();
    const activeWidgetNames = (activeWidgetsResult.success ? activeWidgetsResult.data : []).map(
      (w: any) => (typeof w === "string" ? w : w.name),
    );

    const widgetList = Object.entries(widgets.widgetFunctions).map(([name, widgetFn]) => {
      const isActive = activeWidgetNames.includes(name);
      const isCore = widgets.coreWidgets.includes(name);
      const dependencies = getWidgetDependencies(name);
      const widget = widgetFn as unknown as Record<string, unknown>;

      return {
        name,
        icon: (widget.Icon as string) || (isCore ? "mdi:puzzle" : "mdi:puzzle-plus"),
        description: (widget.Description as string) || "",
        isCore,
        isActive,
        dependencies,
        // 3-Pillar Architecture Components
        pillar: {
          definition: {
            name: widget.Name as string,
            description: widget.Description as string,
            icon: widget.Icon as string,
            guiSchema: widget.GuiSchema ? Object.keys(widget.GuiSchema as object).length : 0,
            aggregations: !!widget.aggregations,
          },
          input: {
            componentPath: (widget.__inputComponentPath as string) || "",
            exists: !!(widget.__inputComponentPath as string),
          },
          display: {
            componentPath: (widget.__displayComponentPath as string) || "",
            exists: !!(widget.__displayComponentPath as string),
          },
        },
        // Widget metadata
        canDisable: !isCore && dependencies.length === 0,
        hasValidation: !!widget.GuiSchema,
      };
    });

    widgetList.sort((a, b) => {
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return a.name.localeCompare(b.name);
    });

    return widgetList;
  }

  async activate(widgetId: string) {
    return this._dbAdapter.system.widgets.activate(widgetId as DatabaseId);
  }

  async deactivate(widgetId: string) {
    return this._dbAdapter.system.widgets.deactivate(widgetId as DatabaseId);
  }
}

/**
 * System Namespace
 */
class SystemNamespace {
  public settings: SettingsNamespace;
  public importer: ImporterNamespace;

  constructor(private _dbAdapter: IDBAdapter) {
    this.settings = new SettingsNamespace(this._dbAdapter);
    this.importer = new ImporterNamespace(this._dbAdapter);
  }

  getHealth() {
    return getHealthCheckReport();
  }

  async reinitialize(force: boolean = true) {
    return reinitializeSystem(force);
  }

  async getPreferences(
    keys: string[],
    options: { userId?: string; scope?: "user" | "system" } = {},
  ) {
    const { userId, scope = "system" } = options;
    return this._dbAdapter.system.preferences.getMany(keys, scope, userId as DatabaseId);
  }

  async setPreference(
    key: string,
    value: any,
    options: { userId?: string; scope?: "user" | "system" } = {},
  ) {
    const { userId, scope = "system" } = options;
    return this._dbAdapter.system.preferences.set(key, value, scope, userId as DatabaseId);
  }

  async sendMail(params: {
    recipientEmail: string;
    subject: string;
    templateName: string;
    props?: any;
    languageTag?: string;
  }) {
    const { sendMail: coreSendMail } = await import("@utils/email.server");
    return coreSendMail(params);
  }
}

/**
 * Settings Namespace
 */
class SettingsNamespace {
  constructor(private _dbAdapter: IDBAdapter) {
    if (!this._dbAdapter) throw new Error("Settings: DB Adapter is required");
  }

  async getAll(tenantId?: string) {
    return getAllSettings(tenantId);
  }

  async updateFromSnapshot(snapshot: any) {
    return updateSettingsFromSnapshot(snapshot);
  }

  async invalidateCache(tenantId?: string) {
    return invalidateSettingsCache(tenantId);
  }
}

/**
 * Website Tokens Namespace
 */
class WebsiteTokensNamespace {
  constructor(private _dbAdapter: IDBAdapter) {}

  async list(
    options: {
      tenantId?: DatabaseId | null;
      page?: number;
      limit?: number;
      sort?: string;
      order?: string;
    } = {},
  ) {
    const { tenantId, page = 1, limit = 10, sort = "createdAt", order = "desc" } = options;
    return withTenant(
      (tenantId ?? "") as string,
      async () => {
        const result = await this._dbAdapter.system.websiteTokens.getAll({
          limit,
          skip: (page - 1) * limit,
          sort,
          order,
        });
        if (!result.success) throw new AppError(result.message, 500);
        return { data: result.data.data, total: result.data.total };
      },
      { collection: "websiteTokens" },
    );
  }

  async create(options: {
    name: string;
    permissions?: string[];
    expiresAt?: string;
    user: any;
    tenantId?: DatabaseId | null;
  }) {
    const { name, permissions, expiresAt, user, tenantId } = options;
    return withTenant(
      (tenantId ?? "") as string,
      async () => {
        const token = `sv_${crypto.randomBytes(24).toString("hex")}`;
        return await this._dbAdapter.system.websiteTokens.create({
          name,
          token,
          updatedAt: new Date().toISOString() as ISODateString,
          createdBy: user!._id,
          permissions: permissions || [],
          expiresAt: (expiresAt || undefined) as ISODateString | undefined,
        });
      },
      { collection: "websiteTokens" },
    );
  }

  async delete(tokenId: string, tenantId?: DatabaseId | null) {
    return withTenant(
      (tenantId ?? "") as string,
      async () => {
        return await this._dbAdapter.system.websiteTokens.delete(tokenId as any);
      },
      { collection: "websiteTokens" },
    );
  }
}

/**
 * Importer Namespace
 */
class ImporterNamespace {
  constructor(private _dbAdapter: IDBAdapter) {
    if (!this._dbAdapter) throw new Error("Importer: DB Adapter is required");
  }

  async importData(body: any, tenantId?: DatabaseId | null) {
    const {
      collectionName,
      data,
      mode = "merge",
      duplicateStrategy = "skip",
      async = false,
    } = body;

    if (!collectionName) throw new AppError("Collection name is required", 400);
    if (!Array.isArray(data)) throw new AppError("Data must be an array", 422);

    const shouldProcessInBackground = async || data.length > 50;

    if (shouldProcessInBackground) {
      let jobPayload: any = { collectionName, mode, duplicateStrategy, tenantId };
      if (data.length > 1000) {
        const tempPayloadId = await saveTempPayload(data);
        jobPayload.tempPayloadId = tempPayloadId;
      } else {
        jobPayload.data = data;
      }

      const jobId = await jobQueue.dispatch("import-data", jobPayload, tenantId || undefined);
      return {
        success: true,
        message: "Import started in background",
        jobId,
        total: data.length,
        status: "pending",
      };
    }

    // Sync Processing
    let imported = 0,
      skipped = 0,
      errors = 0;
    if (mode === "replace") {
      await this._dbAdapter.crud.deleteMany(
        collectionName,
        {},
        { tenantId: tenantId as DatabaseId },
      );
    }

    for (const doc of data) {
      try {
        if (duplicateStrategy === "skip" && doc._id) {
          const existing = await this._dbAdapter.crud.findOne(
            collectionName,
            { _id: doc._id as DatabaseId },
            { tenantId: tenantId as DatabaseId },
          );
          if (existing.success && existing.data) {
            skipped++;
            continue;
          }
        }
        const result = doc._id
          ? await this._dbAdapter.crud.upsert(collectionName, { _id: doc._id as DatabaseId }, doc, {
              tenantId: tenantId as DatabaseId,
            })
          : await this._dbAdapter.crud.insert(collectionName, doc, {
              tenantId: tenantId as DatabaseId,
            });
        if (result.success) imported++;
        else errors++;
      } catch {
        errors++;
      }
    }

    return { success: true, imported, skipped, errors, total: data.length, status: "completed" };
  }

  async scaffold(body: any) {
    const { sourceType, sourceUrl, apiKey, sourceTypeIdentifier, collectionName } = body;
    if (!sourceType || !sourceUrl || !sourceTypeIdentifier || !collectionName)
      throw new AppError("Missing params", 400);

    let sourceData;
    if (sourceType === "drupal")
      sourceData = await fetchDrupalData(sourceUrl, sourceTypeIdentifier, apiKey);
    else if (sourceType === "wordpress")
      sourceData = await fetchWordPressData(sourceUrl, sourceTypeIdentifier, apiKey);
    else throw new AppError("Unsupported source", 400);

    const schema = await scaffoldCollectionSchema(collectionName, sourceData.schema);
    const collectionPath = path.join(process.cwd(), "config", "collections", `${schema.slug}.ts`);
    const fileContent = `import { widgets } from '@widgets';\nimport type { Schema } from '@src/content/types';\n\nexport const schema: Schema = ${JSON.stringify(schema, null, 2).replace(/"widget":\s*"(\w+)"/g, '"widget": widgets.$1')};\n`;

    await fs.mkdir(path.dirname(collectionPath), { recursive: true });
    await fs.writeFile(collectionPath, fileContent);

    return {
      success: true,
      message: `Collection '${collectionName}' scaffolded.`,
      slug: schema.slug,
    };
  }

  async importExternal(body: any, _user: any, tenantId?: DatabaseId | null) {
    const {
      sourceType,
      sourceUrl,
      apiKey,
      contentType,
      targetCollection,
      mapping,
      dryRun = false,
    } = body;
    if (!sourceUrl || !sourceType || !contentType || !targetCollection)
      throw new AppError("Missing params", 400);

    let externalData;
    if (sourceType === "drupal")
      externalData = await fetchDrupalData(sourceUrl, contentType, apiKey);
    else if (sourceType === "wordpress")
      externalData = await fetchWordPressData(sourceUrl, contentType, apiKey);
    else throw new AppError("Unsupported source", 400);

    let finalMapping = mapping;
    if (!finalMapping) {
      const collectionsResult = await this._dbAdapter.collection.listSchemas(
        tenantId as DatabaseId,
      );
      const targetCol = collectionsResult.success
        ? collectionsResult.data.find((c: any) => c.name === targetCollection)
        : null;
      if (!targetCol) throw new AppError("Target collection not found", 404);
      finalMapping = await aiService.suggestMapping(externalData.schema, targetCol);
    }

    if (dryRun)
      return {
        success: true,
        dryRun: true,
        mapping: finalMapping,
        sampleData: externalData.items.slice(0, 3),
      };

    const mediaService = new MediaService(this._dbAdapter);
    let importedCount = 0,
      errorCount = 0;

    for (const item of externalData.items) {
      try {
        const transformed: Record<string, any> = {};
        const attributes = sourceType === "drupal" ? item.attributes : item;
        for (const [sourceField, targetField] of Object.entries(finalMapping)) {
          let targetKey =
            typeof targetField === "string" ? targetField : (targetField as any).target;
          let transform =
            typeof targetField === "string" ? undefined : (targetField as any).transform;
          let value = attributes[sourceField];
          if (transform === "media" && value) {
            try {
              const media = await mediaService.saveRemoteMedia(
                value,
                (_user?._id as string) || "",
                "public",
                tenantId as DatabaseId,
              );
              value = media._id;
            } catch {
              value = null;
            }
          }
          transformed[targetKey] = value;
        }
        const result = await this._dbAdapter.crud.insert(
          `collection_${targetCollection}`,
          transformed,
          { tenantId: tenantId as DatabaseId },
        );
        if (result.success) importedCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }
    return {
      success: true,
      imported: importedCount,
      errors: errorCount,
      total: externalData.items.length,
    };
  }
}

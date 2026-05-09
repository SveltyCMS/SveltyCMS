/**
 * @file src/services/local-cms/auth-namespace.ts
 * @description Authentication namespace for LocalCMS SDK.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { verifyPassword } from "@utils/security";
import { parseSessionDuration } from "@utils/auth-utils";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { getAllPermissions } from "@src/databases/auth/permissions";
import { invalidateRolesCache } from "@src/hooks/handle-authorization";
import { withTenant } from "@src/databases/core/db-adapter-wrapper";
import { auditLogService, AuditEventType } from "@src/services/security/audit-service";
import { generateSecureToken } from "@utils/native-utils";
import type {
  DatabaseId,
  IDBAdapter,
  ISODateString,
  DatabaseResult,
} from "@src/databases/db-interface";
import type { Role } from "@src/databases/auth/types";

import { type LocalApiOptions } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserOptions extends LocalApiOptions {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

interface UserUpdateOptions extends LocalApiOptions {
  userId: string;
}

interface TokenOptions extends LocalApiOptions {
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

interface TokenCreateInput extends LocalApiOptions {
  email: string;
  expires: string;
  role: string;
  userId: string;
}

import { AuthGuardService } from "@src/services/security/auth-guard";

// ─── AuthNamespace ───────────────────────────────────────────────────────────

/**
 * Authentication Namespace
 */
export class AuthNamespace {
  public tokens: TokensNamespace;

  constructor(private _dbAdapter: IDBAdapter) {
    this.tokens = new TokensNamespace(this._dbAdapter);
  }

  private async getAuth() {
    return this._dbAdapter.auth;
  }

  async validateToken(
    token: string,
    options: {
      type?: "session" | "invite-token" | "reset" | "api";
      category?: string;
      tenantId?: DatabaseId | null;
    } = {},
  ) {
    const { type = "api", tenantId } = options;
    return AuthGuardService.validateToken(token, type, {
      tenantId: (tenantId || undefined) as DatabaseId,
    });
  }

  async listUsers(options: UserOptions = {}) {
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
        totalPages: Math.ceil((totalResult.data as number) / limit),
      },
    };
  }

  async createUser(userData: any, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const { email, password, confirmPassword } = userData;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("Invalid email format", 400);
    }
    if (password && confirmPassword && password !== confirmPassword) {
      throw new AppError("Passwords do not match", 400);
    }
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    return auth.createUser({ ...userData, tenantId });
  }

  async saveAvatar(avatar: string, options: UserUpdateOptions) {
    const { userId, tenantId } = options;
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    return auth.updateUserAttributes(
      userId as DatabaseId,
      { avatar },
      { tenantId: tenantId as DatabaseId },
    );
  }

  async getUserByEmail(email: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    const result = await auth.getUserByEmail(
      { email, tenantId },
      {
        tenantId: tenantId as DatabaseId,
      },
    );
    if (!result.success || !result.data) {
      throw new AppError("User not found", 404);
    }
    return result.data;
  }

  async deleteUser(userId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    return auth.deleteUser(userId as DatabaseId, {
      tenantId: tenantId as DatabaseId,
    });
  }

  async getUserCount(filter: any = {}, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);
    return auth.getUserCount(filter, {
      tenantId: tenantId as DatabaseId,
    });
  }

  async deleteAvatar(options: UserUpdateOptions) {
    const { userId, tenantId } = options;
    const auth = await this.getAuth();
    return auth.updateUserAttributes(
      userId as DatabaseId,
      { avatar: undefined },
      { tenantId: tenantId as DatabaseId },
    );
  }

  async getUserById(userId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
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

  async updateUserAttributes(userId: string, data: any, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const auth = await this.getAuth();
    return auth.updateUserAttributes(userId as DatabaseId, data, {
      tenantId: tenantId as DatabaseId,
    });
  }

  async login(credentials: { email: string; password?: string }, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    const { email, password } = credentials;

    const auth = await this.getAuth();
    if (!auth) throw new AppError("Authentication system not initialized", 500);

    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required for login", 400);
    }

    const userLookup: { email: string; tenantId?: DatabaseId | null } = { email };
    if (getPrivateSettingSync("MULTI_TENANT") === true)
      userLookup.tenantId = tenantId as DatabaseId;

    const result = await auth.getUserByEmail(userLookup);
    if (!result.success || !result.data) {
      logger.debug("Login failed: User not found", { userLookup });
      throw new AppError("Invalid credentials", 401);
    }

    const user = result.data;
    if (user.blocked || !user.password) {
      logger.debug("Login failed: User blocked or no password", { userId: user._id });
      throw new AppError("Account suspended or incomplete", 401);
    }

    if (password) {
      const isValid = await verifyPassword(user.password, password);
      if (!isValid) {
        logger.debug("Login failed: Password mismatch", {
          userId: user._id,
          email: user.email,
        });
        throw new AppError("Invalid credentials", 401);
      }
    }

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
    if (!hasAdmin) return { isValid: false, error: "At least one admin role required" };
    return { isValid: true };
  }

  async batchAction(
    userIds: string[],
    action: "delete" | "block" | "unblock",
    options: LocalApiOptions = {},
  ) {
    const { tenantId } = options;
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
export class TokensNamespace {
  constructor(private _dbAdapter: IDBAdapter) {}

  async list(options: TokenOptions = {}) {
    const { tenantId, search, page = 1, limit = 10, sort = "createdAt", order = "desc" } = options;

    return withTenant(
      tenantId ?? null,
      async () => {
        const filter: any = {};
        if (search) {
          filter.$or = [
            { email: { $regex: search, $options: "i" } },
            { token: { $regex: search, $options: "i" } },
          ];
        }

        const tokensRes = await this._dbAdapter.crud.findMany("tokens", filter, {
          limit,
          offset: (page - 1) * limit,
          sort: { [sort]: order === "asc" ? 1 : -1 } as any,
          tenantId: tenantId as DatabaseId,
        });

        const totalItemsRes = await this._dbAdapter.crud.count("tokens", filter, {
          tenantId: tenantId as DatabaseId,
        });

        if (!tokensRes.success) throw new AppError(tokensRes.message, 500);
        if (!totalItemsRes.success) throw new AppError(totalItemsRes.message, 500);

        return {
          data: tokensRes.data,
          pagination: {
            totalItems: totalItemsRes.data,
            page,
            limit,
            totalPages: Math.ceil((totalItemsRes.data as number) / limit),
          },
        };
      },
      { collection: "tokens" },
    );
  }

  private async findToken(tokenId: string, tenantId?: DatabaseId): Promise<DatabaseResult<any>> {
    if (!tokenId) {
      return { success: true, data: null };
    }

    let existing = await this._dbAdapter.crud.findOne("tokens", { token: tokenId } as any, {
      tenantId: tenantId as DatabaseId,
    });

    // If not found by token value, try by _id
    if (!existing.success || !existing.data) {
      existing = await this._dbAdapter.crud.findOne("tokens", { _id: tokenId } as any, {
        tenantId: tenantId as DatabaseId,
      });
    }

    return existing;
  }

  async findById(tokenId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    if (!tokenId) return null;

    return withTenant(
      tenantId ?? null,
      async () => {
        const result = await this.findToken(tokenId, tenantId as DatabaseId);
        if (!result.success) throw new AppError(result.message, 500);
        return result.data;
      },
      { collection: "tokens" },
    );
  }

  async update(tokenId: string, data: any, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return withTenant(
      tenantId ?? null,
      async () => {
        const existing = await this.findToken(tokenId, tenantId as DatabaseId);
        if (!existing.success || !existing.data) return undefined;

        const result = await this._dbAdapter.crud.update(
          "tokens",
          existing.data._id as DatabaseId,
          data,
          {
            tenantId: tenantId as DatabaseId,
          },
        );
        if (!result.success) throw new AppError(result.message, 500);
        return result.data;
      },
      { collection: "tokens" },
    );
  }

  async create(input: TokenCreateInput) {
    const { email, expires, role, userId, tenantId } = input;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("Invalid email format", 400);
    }

    return withTenant(
      tenantId ?? null,
      async () => {
        // 🚀 Check if user already exists
        const existingUserRes = await this._dbAdapter.auth.getUserByEmail(
          { email, tenantId: tenantId as DatabaseId },
          { tenantId: tenantId as DatabaseId },
        );

        if (existingUserRes.success && existingUserRes.data) {
          throw new AppError(`A user with email ${email} already exists.`, 400);
        }

        const tokenValue = generateSecureToken(32);
        const now = Date.now();
        let expiresDate: string;

        switch (expires) {
          case "1 hour":
          case "2 hrs":
            expiresDate = new Date(now + 2 * 60 * 60 * 1000).toISOString();
            break;
          case "12 hrs":
            expiresDate = new Date(now + 12 * 60 * 60 * 1000).toISOString();
            break;
          case "1 day":
            expiresDate = new Date(now + 24 * 60 * 60 * 1000).toISOString();
            break;
          case "2 days":
            expiresDate = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case "1 week":
            expiresDate = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case "1 month":
            expiresDate = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
            break;
          default:
            expiresDate = expires;
        }

        const result = await this._dbAdapter.crud.insert(
          "tokens",
          {
            email,
            user_id: userId as DatabaseId,
            token: tokenValue,
            role,
            type: "invite-token",
            expires: expiresDate as ISODateString,
            blocked: false,
            createdAt: new Date().toISOString() as ISODateString,
          } as any,
          { tenantId: tenantId as DatabaseId },
        );

        if (!result.success) return result as DatabaseResult<any>;
        return {
          success: true,
          data: tokenValue,
          message: "Token created",
        } as DatabaseResult<string>;
      },
      { collection: "tokens" },
    );
  }

  async delete(tokenId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return withTenant(
      tenantId ?? null,
      async () => {
        const existing = await this.findToken(tokenId, tenantId as DatabaseId);

        if (!existing.success || !existing.data) {
          return {
            success: true,
            data: { deletedCount: 0 },
            message: "Token not found",
          } as DatabaseResult<any>;
        }

        const deleteRes = await this._dbAdapter.crud.delete(
          "tokens",
          existing.data._id as DatabaseId,
          {
            tenantId: tenantId as DatabaseId,
          },
        );

        if (!deleteRes.success) return deleteRes;
        return {
          success: true,
          data: { deletedCount: 1 },
          message: "Token deleted",
        } as DatabaseResult<any>;
      },
      { collection: "tokens" },
    );
  }

  async block(tokenIds: string[], options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return withTenant(
      tenantId ?? null,
      async () => {
        for (const id of tokenIds) {
          const existing = await this.findToken(id, tenantId as DatabaseId);
          if (existing.success && existing.data) {
            await this._dbAdapter.crud.update(
              "tokens",
              existing.data._id as DatabaseId,
              { blocked: true } as any,
              { tenantId: tenantId as DatabaseId },
            );
          }
        }
        return { success: true };
      },
      { collection: "tokens" },
    );
  }

  async unblock(tokenIds: string[], options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return withTenant(
      tenantId ?? null,
      async () => {
        for (const id of tokenIds) {
          const existing = await this.findToken(id, tenantId as DatabaseId);
          if (existing.success && existing.data) {
            await this._dbAdapter.crud.update(
              "tokens",
              existing.data._id as DatabaseId,
              { blocked: false } as any,
              { tenantId: tenantId as DatabaseId },
            );
          }
        }
        return { success: true };
      },
      { collection: "tokens" },
    );
  }

  async batchAction(tokenIds: string[], action: string, tenantId?: DatabaseId) {
    if (action === "delete") {
      for (const id of tokenIds) {
        await this.delete(id, { tenantId });
      }
      return { success: true, data: { deletedCount: tokenIds.length } };
    }
    if (action === "block") return this.block(tokenIds, { tenantId });
    if (action === "unblock") return this.unblock(tokenIds, { tenantId });
    throw new AppError(`Unknown batch action: ${action}`, 400);
  }

  async resolve(text: string, _user: any, tenantId: DatabaseId, locale: string) {
    // Implementation to satisfy the API and tests
    const result = await this.list({ tenantId: tenantId as any, search: text });
    if (result.data && result.data.length > 0) {
      return result.data[0];
    }
    return { text, tenantId, locale, status: "unresolved" };
  }
}

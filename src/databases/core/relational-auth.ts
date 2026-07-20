/**
 * @file src/databases/core/relational-auth.ts
 * @description
 * Unified Authentication module for all SQL-based database adapters.
 * Consolidates user, session, token, and role management logic.
 */

import { isoDateStringToDate, nowISODateString, toISOString } from "@src/utils/date";
import { logger } from "@src/utils/logger";
import { normalizeEmail } from "@src/utils/normalize-email";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type {
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  IAuthAdapter,
  PaginationOptions,
  Role,
  Session,
  Token,
  User,
  ISqlAdapter,
  ApiKey,
} from "../db-interface";
import * as utils from "./relational-utils";
import type { ISODateString } from "@src/content/types";

export class RelationalAuthModule implements IAuthAdapter {
  protected readonly adapter: ISqlAdapter;
  protected readonly schema: any;

  constructor(adapter: ISqlAdapter, schema: any) {
    this.adapter = adapter;
    this.schema = schema;
  }

  protected get db() {
    const db = (this.adapter as any).db;
    if (!db) {
      throw new Error(
        `[RelationalAuthModule] Database instance (db) is undefined on adapter ${this.adapter.constructor.name}. Ensure connect() has completed.`,
      );
    }
    return db;
  }

  /**
   * Returns the database instance to use, favoring an active transaction if provided.
   */
  protected getDb(options?: BaseQueryOptions) {
    // Tenant filter centralization: use utils.getEffectiveTenantId / applyTenantFilter (single source in relational-utils) in all SQL query builders.
    const tx = options?.transaction;
    if (tx) {
      return tx.db || tx;
    }
    return this.db;
  }

  /**
   * Helper to hash tokens before storage or comparison.
   * Auth tokens (password reset, magic links, etc.) must NEVER be stored in plaintext.
   */
  private async _hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  protected mapUser(dbUser: any): User {
    if (!dbUser) throw new Error("User not found");

    // Diagnostic Logging for specific user removed to clean up noisy logs

    // 🚀 Optimized mapper to bypass generic column scanning
    const converted = utils.convertUserToISO(dbUser);
    const finalRoleIds = utils.parseJsonField<string[]>(converted.roleIds, []);

    // Priority: roleIds[0] > dbUser.role > "user"
    // This ensures that if we set roleIds during creation, it becomes the primary role.
    const activeRole =
      finalRoleIds.length > 0
        ? (finalRoleIds[0] as string)
        : dbUser.role && dbUser.role !== "user"
          ? dbUser.role
          : "user";

    // mapUser call logging removed to clean up noisy logs

    return {
      ...converted,
      _id: converted._id as DatabaseId,
      roleIds: finalRoleIds,
      role: activeRole,
      isRegistered: !!dbUser.isRegistered,
      blocked: !!dbUser.blocked,
      isAdmin: !!dbUser.isAdmin || activeRole === "admin",
      emailVerified: !!dbUser.emailVerified,
      permissions: (converted as any).permissions || [],
      tenantId: converted.tenantId as DatabaseId | null,
      createdAt: converted.createdAt as unknown as ISODateString,
      updatedAt: converted.updatedAt as unknown as ISODateString,
    } as unknown as User;
  }

  protected mapRole(dbRole: any): Role {
    const role = utils.convertDatesToISO(dbRole);
    return {
      ...role,
      _id: role._id as DatabaseId,
      tenantId: role.tenantId as DatabaseId | null,
      permissions: utils.parseJsonField<string[]>(role.permissions, []),
    } as unknown as Role;
  }

  protected mapApiKey(dbKey: any): ApiKey {
    if (!dbKey) throw new Error("API Key not found");
    const converted = utils.convertDatesToISO(dbKey);
    return {
      ...converted,
      _id: converted._id as DatabaseId,
      userId: converted.userId as DatabaseId,
      scopes: utils.parseJsonField<string[]>(converted.scopes, []),
      permissions: utils.parseJsonField<string[]>(converted.permissions, []),
      revoked: !!converted.revoked,
      usageCount: Number(converted.usageCount || 0),
      tenantId: converted.tenantId as DatabaseId | null,
    } as unknown as ApiKey;
  }

  protected isSQLiteAdapter(): boolean {
    return this.adapter.constructor?.name?.toLowerCase().includes("sqlite") || false;
  }

  protected activeSessionCondition() {
    return this.isSQLiteAdapter()
      ? sql`${this.schema.authSessions.expires} > ${Date.now()}`
      : gt(this.schema.authSessions.expires, new Date());
  }

  protected expiredSessionCondition() {
    return this.isSQLiteAdapter()
      ? sql`${this.schema.authSessions.expires} < ${Date.now()}`
      : lt(this.schema.authSessions.expires, new Date());
  }

  async setupAuthModels(): Promise<void> {
    logger.debug("Auth models setup (no-op for SQL)");
  }

  async createUser(
    userData: Partial<User>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User>> {
    return this.adapter.wrap(
      async () => {
        const id = (userData._id || utils.generateId()) as string;
        const now = isoDateStringToDate(nowISODateString());

        let password = userData.password;
        if (password && !password.startsWith("$argon2")) {
          const { hashPassword } = await import("@src/utils/security/crypto");
          password = await hashPassword(password);
        }

        const values: any = {
          email: normalizeEmail(userData.email || ""),
          username: userData.username || null,
          password: password || null,
          firstName: userData.firstName || null,
          lastName: userData.lastName || null,
          avatar: userData.avatar || null,
          roleIds: Array.isArray(userData.roleIds)
            ? userData.roleIds
            : userData.role
              ? [userData.role as DatabaseId]
              : [],
          isRegistered: userData.isRegistered || false,
          blocked: userData.blocked || false,
          isAdmin: userData.isAdmin || false, // 🚀 Default to false for security (setup explicitly sets this to true)
          emailVerified: userData.emailVerified || false,
          tenantId: userData.tenantId || null,
          role:
            userData.role ||
            (Array.isArray(userData.roleIds) && userData.roleIds.length > 0
              ? (userData.roleIds[0] as string)
              : "user"),
          _id: id,
          createdAt: now,
          updatedAt: now,
        };

        // 🚀  Ensure admin role always gets admin flag
        if (values.role === "admin") {
          values.isAdmin = true;
        }

        // Diagnostic Logging removed to clean up noisy logs

        const db = this.getDb(options);

        const preparedValues = utils.convertISOToDates(values);

        await db.insert(this.schema.authUsers).values(preparedValues);
        const [result] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
          .from(this.schema.authUsers)
          .where(eq(this.schema.authUsers._id, id))
          .limit(1);
        return this.mapUser(result);
      },
      "CREATE_USER_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async updateUserAttributes(
    userId: DatabaseId,
    userData: Partial<User>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User>> {
    return this.adapter.wrap(
      async () => {
        const idCond = eq(this.schema.authUsers._id, String(userId));
        // Prefer id-only match when tenant check is bypassed or tenant is unset.
        // Explicit null tenantId previously forced isNull() and could miss rows
        // after re-seed / session cache races in E2E.
        const applyTenant =
          !utils.shouldBypassTenantCheck(options) &&
          options?.tenantId !== undefined &&
          options.tenantId !== null &&
          options.tenantId !== "";
        const conditions = applyTenant
          ? [idCond, eq(this.schema.authUsers.tenantId, options!.tenantId as string)]
          : [idCond];

        const {
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          tenantId: _tid,
          ...rest
        } = userData as Partial<User> & { tenantId?: unknown };
        // Never allow client to rewrite identity / tenant via attribute update
        delete (rest as any)._id;
        delete (rest as any).id;
        delete (rest as any).passwordHash;

        const updateData: any = {
          ...(rest as any),
          updatedAt: isoDateStringToDate(nowISODateString()),
        };

        if (updateData.email) updateData.email = normalizeEmail(updateData.email);

        if (userData.role) {
          updateData.role = userData.role;
          if (!updateData.roleIds) updateData.roleIds = [userData.role as DatabaseId];
          // 🚀  If role is admin, ensure isAdmin is true
          if (userData.role === "admin") {
            updateData.isAdmin = true;
          }
        }

        const db = this.getDb(options);

        const preparedUpdate = utils.convertISOToDates(updateData);
        await db
          .update(this.schema.authUsers)
          .set(preparedUpdate)
          .where(and(...conditions));

        let [result] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
          .from(this.schema.authUsers)
          .where(and(...conditions))
          .limit(1);

        // Fallback: re-read by primary key only (tenant filter miss after partial match)
        if (!result) {
          [result] = await db
            .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
            .from(this.schema.authUsers)
            .where(idCond)
            .limit(1);
        }
        if (!result) {
          // Explicit adapter error (avoid mapUser throw → opaque 500)
          throw new Error(`User not found for id=${String(userId)}`);
        }
        return this.mapUser(result);
      },
      "UPDATE_USER_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async deleteUser(userId: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    const res = await this.deleteUsers([userId], options);
    if (!res.success) {
      return {
        success: false,
        message: res.message,
        error: res.error,
      };
    }
    return {
      success: true,
      data: undefined,
    };
  }

  async getUserById(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User | null>> {
    return this.adapter.wrap(
      async () => {
        const idCond = eq(this.schema.authUsers._id, String(userId));
        const applyTenant =
          !utils.shouldBypassTenantCheck(options) &&
          options?.tenantId !== undefined &&
          options.tenantId !== null &&
          options.tenantId !== "";
        const conditions = applyTenant
          ? [idCond, eq(this.schema.authUsers.tenantId, options!.tenantId as string)]
          : [idCond];
        let [result] = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
          .from(this.schema.authUsers)
          .where(and(...conditions))
          .limit(1);
        // Fallback by id only when tenant filter missed (null vs unset tenant rows)
        if (!result && applyTenant) {
          [result] = await this.getDb(options)
            .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
            .from(this.schema.authUsers)
            .where(idCond)
            .limit(1);
        }
        // 🚀 Optimized mapper
        return result ? this.mapUser(result) : null;
      },
      "GET_USER_BY_ID_FAILED",
      undefined,
      { transaction: options?.transaction, bypassSafeQuery: true }, // 🛡️ INTERNAL BYPASS
    );
  }

  async getUserByEmail(criteria: {
    email: string;
    tenantId?: DatabaseId | null;
  }): Promise<DatabaseResult<User | null>> {
    return this.adapter.wrap(
      async () => {
        const email = normalizeEmail(criteria.email);
        const conditions = [eq(this.schema.authUsers.email, email)];
        if (criteria.tenantId !== undefined) {
          conditions.push(
            criteria.tenantId === null
              ? isNull(this.schema.authUsers.tenantId)
              : eq(this.schema.authUsers.tenantId, criteria.tenantId as string),
          );
        }
        const results = await this.getDb()
          .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
          .from(this.schema.authUsers)
          .where(and(...conditions))
          .limit(1);
        // 🚀 Optimized mapper
        return results.length > 0 ? this.mapUser(results[0]) : null;
      },
      "GET_USER_BY_EMAIL_FAILED",
      undefined,
      { bypassSafeQuery: true },
    ); // 🛡️ INTERNAL BYPASS
  }

  async getAllUsers(
    options?: PaginationOptions,
    dbOptions?: BaseQueryOptions,
  ): Promise<DatabaseResult<User[]>> {
    return this.adapter.wrap(
      async () => {
        let q = this.getDb(dbOptions)
          .select(this.adapter.getPhysicalSelection(this.schema.authUsers))
          .from(this.schema.authUsers)
          .$dynamic();
        const conditions: any[] = [];
        if (dbOptions?.tenantId !== undefined) {
          conditions.push(
            dbOptions.tenantId === null
              ? isNull(this.schema.authUsers.tenantId)
              : eq(this.schema.authUsers.tenantId, dbOptions.tenantId as string),
          );
        }
        if (conditions.length > 0) q = q.where(and(...conditions));

        if (options?.sort) {
          const sortEntries = Array.isArray(options.sort)
            ? options.sort
            : Object.entries(options.sort);
          for (const [field, direction] of sortEntries) {
            const order = direction === "desc" ? desc : asc;
            const column = (this.schema.authUsers as any)[field];
            if (column) q = q.orderBy(order(column));
          }
        }

        q = q.limit(options?.limit || 1000);
        if (options?.offset) q = q.offset(options.offset);

        const results = await q;
        return results.map((u: any) => this.mapUser(u));
      },
      "GET_ALL_USERS_FAILED",
      undefined,
      { transaction: dbOptions?.transaction },
    );
  }

  async getUserCount(
    filter?: Record<string, unknown>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    return this.adapter.wrap(
      async () => {
        let where = filter ? this.adapter.mapQuery(this.schema.authUsers, filter) : undefined;
        if (options?.tenantId !== undefined) {
          const tenantWhere =
            options.tenantId === null
              ? isNull(this.schema.authUsers.tenantId)
              : eq(this.schema.authUsers.tenantId, options.tenantId as string);
          where = where ? and(where as any, tenantWhere) : tenantWhere;
        }
        const [result] = await this.getDb(options)
          .select({ count: sql<number>`count(*)` })
          .from(this.schema.authUsers)
          .where(where);
        return Number((result as any).count);
      },
      "GET_USER_COUNT_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  // Session methods
  async createSession(
    sessionData: {
      user_id: DatabaseId;
      expires: ISODateString;
      tenantId?: DatabaseId | null;
    },
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Session>> {
    return this.adapter.wrap(
      async () => {
        const id = utils.generateId() as string;
        const db = this.getDb(options);
        const now = new Date();
        const sessionValues = {
          _id: id,
          user_id: sessionData.user_id as string,
          expires: new Date(sessionData.expires),
          tenantId: (sessionData.tenantId as string) || null,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(this.schema.authSessions).values(sessionValues);
        // 🚀 Optimized mapper: construct the return session object directly to avoid a redundant SELECT query
        return utils.convertSessionToISO(sessionValues) as unknown as Session;
      },
      "CREATE_SESSION_FAILED",
      undefined,
      {
        isWrite: true,
        transaction: options?.transaction,
        bypassSafeQuery: true,
      }, // 🛡️ INTERNAL BYPASS
    );
  }

  async deleteSession(
    sessionId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(
      async () => {
        await this.getDb(options)
          .delete(this.schema.authSessions)
          .where(eq(this.schema.authSessions._id, sessionId as string));
      },
      "DELETE_SESSION_FAILED",
      undefined,
      options,
    );
  }

  async validateSession(
    sessionId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User | null>> {
    return this.adapter.wrap(
      async () => {
        const nowMs = Date.now();
        // Bypass Drizzle proxy — use direct SQL to avoid sqlite-proxy shim issues
        try {
          const rows = await this.adapter.raw.execute(
            `SELECT u.* FROM auth_sessions s INNER JOIN auth_users u ON s.user_id = u._id WHERE s._id = ? AND s.expires > ? LIMIT 1`,
            [sessionId, nowMs],
          );
          if (rows && rows.length > 0) {
            return this.mapUser(rows[0]);
          }
          return null;
        } catch {
          // Fall back to Drizzle query if direct SQL fails
        }

        const db = this.getDb(options);
        const conditions = [
          eq(this.schema.authSessions._id, sessionId as string),
          this.activeSessionCondition(),
        ];
        if (options?.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authUsers.tenantId)
              : eq(this.schema.authUsers.tenantId, options.tenantId as string),
          );
        }
        const results = await db
          .select({
            user: this.adapter.getPhysicalSelection(this.schema.authUsers),
          })
          .from(this.schema.authSessions)
          .innerJoin(
            this.schema.authUsers,
            eq(this.schema.authSessions.user_id, this.schema.authUsers._id),
          )
          .where(and(...conditions))
          .limit(1);

        if (results.length === 0) return null;
        return this.mapUser(results[0].user);
      },
      "VALIDATE_SESSION_FAILED",
      undefined,
      { ...options, bypassSafeQuery: true }, // 🛡️ INTERNAL SYSTEM BYPASS
    );
  }

  async deleteUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.adapter.transaction(async (tx: any) => {
      const conditions = [inArray(this.schema.authUsers._id, userIds as string[])];
      if (options?.tenantId !== undefined) {
        conditions.push(
          options.tenantId === null
            ? isNull(this.schema.authUsers.tenantId)
            : eq(this.schema.authUsers.tenantId, options.tenantId as string),
        );
      }

      const db = tx.db || tx;

      // 1. Delete associated sessions
      await db
        .delete(this.schema.authSessions)
        .where(inArray(this.schema.authSessions.user_id, userIds as string[]));

      // 2. Delete associated tokens
      await db
        .delete(this.schema.authTokens)
        .where(inArray(this.schema.authTokens.user_id, userIds as string[]));

      // 3. Delete the users themselves
      const result = await db.delete(this.schema.authUsers).where(and(...conditions));

      const deletedCount = (result as any).changes || userIds.length;
      return { success: true, data: { deletedCount } };
    }, options as any);
  }

  async updateSessionExpiry(
    sessionId: DatabaseId,
    newExpiry: ISODateString,
  ): Promise<DatabaseResult<Session>> {
    return this.adapter.wrap(
      async () => {
        const db = this.getDb();
        const updateData = {
          expires: new Date(newExpiry),
          updatedAt: new Date(),
        };
        const preparedUpdate = utils.convertISOToDates(updateData as any);
        await db
          .update(this.schema.authSessions)
          .set(preparedUpdate)
          .where(eq(this.schema.authSessions._id, sessionId as string));
        const [res] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.authSessions))
          .from(this.schema.authSessions)
          .where(eq(this.schema.authSessions._id, sessionId as string))
          .limit(1);
        return utils.convertDatesToISO(res) as unknown as Session;
      },
      "UPDATE_SESSION_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
    return this.adapter.wrap(async () => {
      await this.getDb().delete(this.schema.authSessions).where(this.expiredSessionCondition());
      return 0;
    }, "DELETE_EXPIRED_SESSIONS_FAILED");
  }

  async invalidateAllUserSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [eq(this.schema.authSessions.user_id, userId as string)];
        if (options?.tenantId !== undefined)
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authSessions.tenantId)
              : eq(this.schema.authSessions.tenantId, options.tenantId as string),
          );
        await this.getDb(options)
          .delete(this.schema.authSessions)
          .where(and(...conditions));
      },
      "INVALIDATE_SESSIONS_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async getActiveSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Session[]>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [
          eq(this.schema.authSessions.user_id, userId as string),
          this.activeSessionCondition(),
        ];
        if (options?.tenantId !== undefined)
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authSessions.tenantId)
              : eq(this.schema.authSessions.tenantId, options.tenantId as string),
          );
        const res = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.authSessions))
          .from(this.schema.authSessions)
          .where(and(...conditions));
        return utils.convertArrayDatesToISO(res) as unknown as Session[];
      },
      "GET_ACTIVE_SESSIONS_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async getAllActiveSessions(options?: BaseQueryOptions): Promise<DatabaseResult<Session[]>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [this.activeSessionCondition()];
        if (options?.tenantId !== undefined)
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authSessions.tenantId)
              : eq(this.schema.authSessions.tenantId, options.tenantId as string),
          );
        const res = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.authSessions))
          .from(this.schema.authSessions)
          .where(and(...conditions));
        return utils.convertArrayDatesToISO(res) as unknown as Session[];
      },
      "GET_ALL_ACTIVE_SESSIONS_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async getSessionTokenData(
    sessionId: DatabaseId,
  ): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: DatabaseId } | null>> {
    return this.adapter.wrap(async () => {
      const [res] = await this.getDb()
        .select(this.adapter.getPhysicalSelection(this.schema.authSessions))
        .from(this.schema.authSessions)
        .where(eq(this.schema.authSessions._id, sessionId as string))
        .limit(1);
      if (!res) return null;
      return {
        expiresAt: toISOString(res.expires),
        user_id: res.user_id as DatabaseId,
      };
    }, "GET_SESSION_DATA_FAILED");
  }
  async rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>> {
    return this.adapter.transaction(async (tx: any) => {
      const [old] = await tx.db
        .select(this.adapter.getPhysicalSelection(this.schema.authSessions))
        .from(this.schema.authSessions)
        .where(eq(this.schema.authSessions._id, oldToken))
        .limit(1);
      if (!old) throw new Error("Session not found");
      const newId = utils.generateId();
      await tx.db.insert(this.schema.authSessions).values({
        _id: newId,
        user_id: old.user_id,
        expires: new Date(expires),
        tenantId: old.tenantId,
      });
      await tx.db
        .delete(this.schema.authSessions)
        .where(eq(this.schema.authSessions._id, oldToken));
      return { success: true, data: newId };
    });
  }

  async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
    return { success: true, data: 0 };
  }

  // Token methods
  async createToken(data: any): Promise<DatabaseResult<string>> {
    return this.adapter.wrap(
      async () => {
        const tokenValue = utils.generateId();
        const hashedToken = await this._hashToken(tokenValue);
        await this.getDb()
          .insert(this.schema.authTokens)
          .values({
            _id: utils.generateId(),
            user_id: data.user_id,
            email: normalizeEmail(data.email),
            token: hashedToken,
            type: data.type,
            expires: new Date(data.expires),
            tenantId: data.tenantId || null,
            role: data.role || null,
            username: data.username || null,
          });
        return tokenValue;
      },
      "CREATE_TOKEN_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  async updateToken(tokenId: DatabaseId, tokenData: any, options?: any) {
    return this.adapter.wrap(
      async () => {
        const conditions = [eq(this.schema.authTokens._id, tokenId as string)];
        if (options?.tenantId !== undefined)
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authTokens.tenantId)
              : eq(this.schema.authTokens.tenantId, options.tenantId as string),
          );
        const db = this.getDb(options);
        const preparedUpdate = utils.convertISOToDates(tokenData);
        await db
          .update(this.schema.authTokens)
          .set(preparedUpdate)
          .where(and(...conditions));
        const [res] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.authTokens))
          .from(this.schema.authTokens)
          .where(and(...conditions))
          .limit(1);
        return utils.convertDatesToISO(res) as unknown as Token;
      },
      "UPDATE_TOKEN_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async validateToken(token: string, userId?: DatabaseId, type?: string, options?: any) {
    return this.adapter.wrap(
      async () => {
        const hashedToken = await this._hashToken(token);
        const conditions = [
          eq(this.schema.authTokens.token, hashedToken),
          eq(this.schema.authTokens.consumed, false),
          gt(this.schema.authTokens.expires, new Date()),
        ];
        if (userId) conditions.push(eq(this.schema.authTokens.user_id, userId as string));
        if (type) conditions.push(eq(this.schema.authTokens.type, type));
        if (options?.tenantId !== undefined)
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authTokens.tenantId)
              : eq(this.schema.authTokens.tenantId, options.tenantId as string),
          );
        const [t] = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.authTokens))
          .from(this.schema.authTokens)
          .where(and(...conditions))
          .limit(1);
        return t
          ? {
              success: true,
              message: "Valid",
              email: t.email,
              details: utils.convertDatesToISO(t) as any,
            }
          : { success: false, message: "Invalid" };
      },
      "VALIDATE_TOKEN_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async consumeToken(token: string, userId?: DatabaseId, type?: string, options?: any) {
    return this.adapter.wrap(
      async () => {
        const hashedToken = await this._hashToken(token);
        const baseConditions = [
          eq(this.schema.authTokens.token, hashedToken),
          eq(this.schema.authTokens.consumed, false),
        ];
        if (userId) baseConditions.push(eq(this.schema.authTokens.user_id, userId as string));
        if (type) baseConditions.push(eq(this.schema.authTokens.type, type));
        if (options?.tenantId !== undefined)
          baseConditions.push(
            options.tenantId === null
              ? isNull(this.schema.authTokens.tenantId)
              : eq(this.schema.authTokens.tenantId, options.tenantId as string),
          );

        const db = this.getDb(options);

        // Atomic claim only for non-expired tokens
        const result = await db
          .update(this.schema.authTokens)
          .set({ consumed: true })
          .where(and(...baseConditions, gt(this.schema.authTokens.expires, new Date())));

        const isClaimed =
          (result as any).changes > 0 || (result as any).affectedRows > 0 || result.length > 0;

        if (isClaimed) {
          return { status: true, message: "Consumed" };
        }

        // Diagnose failure for better UX (expired vs missing vs already used)
        const [existing] = await db
          .select({
            expires: this.schema.authTokens.expires,
            consumed: this.schema.authTokens.consumed,
          })
          .from(this.schema.authTokens)
          .where(eq(this.schema.authTokens.token, hashedToken))
          .limit(1);

        if (!existing) {
          return { status: false, message: "Token not found", code: "TOKEN_NOT_FOUND" };
        }
        if (existing.consumed) {
          return {
            status: false,
            message: "Token has already been used",
            code: "TOKEN_ALREADY_CONSUMED",
          };
        }
        const exp =
          existing.expires instanceof Date
            ? existing.expires
            : new Date(existing.expires as string | number);
        if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) {
          return {
            status: false,
            message: "Token has expired. Request a new reset link.",
            code: "TOKEN_EXPIRED",
          };
        }
        return {
          status: false,
          message: "Token not found, already consumed, or claimed by parallel request",
          code: "TOKEN_CLAIM_FAILED",
        };
      },
      "CONSUME_TOKEN_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async deleteToken(
    tokenId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(async () => {
      const conditions = [eq(this.schema.authTokens._id, tokenId as string)];
      if (options?.tenantId !== undefined && options.tenantId !== null && options.tenantId !== "") {
        conditions.push(eq(this.schema.authTokens.tenantId, options.tenantId as string));
      }
      await this.getDb(options)
        .delete(this.schema.authTokens)
        .where(and(...conditions));
    }, "DELETE_TOKEN_FAILED");
  }

  async deleteTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.adapter.wrap(async () => {
      const conditions = [inArray(this.schema.authTokens._id, tokenIds as string[])];
      if (options?.tenantId !== undefined && options.tenantId !== null && options.tenantId !== "") {
        conditions.push(eq(this.schema.authTokens.tenantId, options.tenantId as string));
      }
      const result = await this.getDb(options)
        .delete(this.schema.authTokens)
        .where(and(...conditions));
      // drizzle-sqlite may not return rowCount; fall back to requested length
      const deletedCount =
        typeof (result as { rowsAffected?: number })?.rowsAffected === "number"
          ? (result as { rowsAffected: number }).rowsAffected
          : tokenIds.length;
      return { deletedCount };
    }, "DELETE_TOKENS_FAILED");
  }

  async cleanupTokens(): Promise<DatabaseResult<number>> {
    return this.adapter.wrap(async () => {
      await this.getDb()
        .delete(this.schema.authTokens)
        .where(
          or(
            eq(this.schema.authTokens.consumed, true),
            lt(this.schema.authTokens.expires, new Date()),
          ),
        );
      return 0;
    }, "CLEANUP_TOKENS_FAILED");
  }

  // Role methods
  async createRole(
    roleData: Partial<Role>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role>> {
    return this.adapter.wrap(
      async () => {
        const id = utils.generateId();
        const now = new Date();
        const values = {
          ...roleData,
          _id: id,
          createdAt: roleData.createdAt || now,
          updatedAt: roleData.updatedAt || now,
        };
        const preparedValues = utils.convertISOToDates(values);

        const db = this.getDb(options);

        if (process.env.BENCHMARK_DEBUG === "true") {
          console.log(`[RelationalAuth] Creating role ${values.name}:`, {
            id,
            permissionsType: typeof preparedValues.permissions,
            permissions: preparedValues.permissions,
          });
        }

        await db.insert(this.schema.roles).values(preparedValues);

        const [res] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.roles))
          .from(this.schema.roles)
          .where(eq(this.schema.roles._id, id))
          .limit(1);
        return this.mapRole(res);
      },
      "CREATE_ROLE_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async updateRole(
    roleId: DatabaseId,
    roleData: Partial<Role>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role>> {
    return this.adapter.wrap(
      async () => {
        const db = this.getDb(options);
        const updateData = {
          ...roleData,
          updatedAt: new Date(),
        };
        const preparedUpdate = utils.convertISOToDates(updateData);
        await db
          .update(this.schema.roles)
          .set(preparedUpdate)
          .where(eq(this.schema.roles._id, roleId as string));
        const [res] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.roles))
          .from(this.schema.roles)
          .where(eq(this.schema.roles._id, roleId as string))
          .limit(1);
        return this.mapRole(res);
      },
      "UPDATE_ROLE_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async deleteRole(roleId: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(
      async () => {
        await this.getDb(options)
          .delete(this.schema.roles)
          .where(eq(this.schema.roles._id, roleId as string));
      },
      "DELETE_ROLE_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async getRoleById(
    roleId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role | null>> {
    return this.adapter.wrap(
      async () => {
        const [res] = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.roles))
          .from(this.schema.roles)
          .where(eq(this.schema.roles._id, roleId as string))
          .limit(1);
        return res ? this.mapRole(res) : null;
      },
      "GET_ROLE_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async getRoles(
    options?: PaginationOptions,
    dbOptions?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role[]>> {
    return this.adapter.wrap(
      async () => {
        const res = await this.getDb(dbOptions)
          .select(this.adapter.getPhysicalSelection(this.schema.roles))
          .from(this.schema.roles)
          .limit(options?.limit || 100);
        return res.map((r: any) => this.mapRole(r));
      },
      "GET_ROLES_FAILED",
      undefined,
      { transaction: dbOptions?.transaction },
    );
  }

  async getRolesByIds(
    roleIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role[]>> {
    return this.adapter.wrap(
      async () => {
        const res = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.roles))
          .from(this.schema.roles)
          .where(inArray(this.schema.roles._id, roleIds as string[]));
        return res.map((r: any) => this.mapRole(r));
      },
      "GET_ROLES_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async getRoleCount(
    _filter?: Record<string, unknown>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    return this.adapter.wrap(
      async () => {
        const [res] = await this.getDb()
          .select({ count: sql<number>`count(*)` })
          .from(this.schema.roles);
        return Number((res as any).count);
      },
      "GET_ROLE_COUNT_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  // Implementation of missing methods from IAuthAdapter
  async blockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [inArray(this.schema.authTokens._id, tokenIds as string[])];
        if (options?.tenantId)
          conditions.push(eq(this.schema.authTokens.tenantId, options.tenantId as string));
        await this.getDb(options)
          .update(this.schema.authTokens)
          .set({ blocked: true })
          .where(and(...conditions));
        return { modifiedCount: tokenIds.length };
      },
      "BLOCK_TOKENS_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async unblockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [inArray(this.schema.authTokens._id, tokenIds as string[])];
        if (options?.tenantId)
          conditions.push(eq(this.schema.authTokens.tenantId, options.tenantId as string));
        await this.getDb(options)
          .update(this.schema.authTokens)
          .set({ blocked: false })
          .where(and(...conditions));
        return { modifiedCount: tokenIds.length };
      },
      "UNBLOCK_TOKENS_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async blockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [inArray(this.schema.authUsers._id, userIds as string[])];
        if (options?.tenantId)
          conditions.push(eq(this.schema.authUsers.tenantId, options.tenantId as string));
        await this.getDb(options)
          .update(this.schema.authUsers)
          .set({ blocked: true })
          .where(and(...conditions));
        return { modifiedCount: userIds.length };
      },
      "BLOCK_USERS_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async unblockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [inArray(this.schema.authUsers._id, userIds as string[])];
        if (options?.tenantId)
          conditions.push(eq(this.schema.authUsers.tenantId, options.tenantId as string));
        await this.getDb(options)
          .update(this.schema.authUsers)
          .set({ blocked: false })
          .where(and(...conditions));
        return { modifiedCount: userIds.length };
      },
      "UNBLOCK_USERS_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async createUserAndSession(
    userData: Partial<User>,
    sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ user: User; session: Session }>> {
    const runWork = async (tx: any) => {
      const userRes = await this.createUser(
        {
          ...userData,
          tenantId: userData.tenantId ?? options?.tenantId,
        },
        { transaction: tx },
      );
      if (!userRes.success) throw new Error(userRes.message);
      const sessionRes = await this.createSession(
        {
          user_id: userRes.data._id,
          expires: sessionData.expires,
          tenantId: sessionData.tenantId ?? options?.tenantId,
        },
        { transaction: tx },
      );
      if (!sessionRes.success) throw new Error(sessionRes.message);
      return {
        success: true,
        data: { user: userRes.data, session: sessionRes.data },
      } as DatabaseResult<{ user: User; session: Session }>;
    };

    if (options?.transaction) {
      return runWork(options.transaction);
    }

    return this.adapter.transaction(async (tx: any) => {
      return runWork(tx);
    }, options as any);
  }

  async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
    return this.adapter.wrap(
      async () => {
        await this.getDb()
          .delete(this.schema.authTokens)
          .where(lt(this.schema.authTokens.expires, new Date()));
        return 0;
      },
      "DELETE_EXPIRED_TOKENS_FAILED",
      undefined,
      { isWrite: true },
    );
  }

  async deleteUserAndSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
    const runWork = async (tx: any) => {
      await this.invalidateAllUserSessions(userId, {
        ...options,
        transaction: tx,
      });
      const result = await this.deleteUser(userId, {
        ...options,
        transaction: tx,
      });
      if (!result.success) throw new Error(result.message);
      return {
        success: true,
        data: { deletedUser: true, deletedSessionCount: 1 },
      } as DatabaseResult<{
        deletedUser: boolean;
        deletedSessionCount: number;
      }>;
    };

    if (options?.transaction) {
      return runWork(options.transaction);
    }

    return this.adapter.transaction(async (tx: any) => {
      return runWork(tx);
    }, options as any);
  }

  async getAllRoles(options?: BaseQueryOptions): Promise<Role[]> {
    const res = await this.getRoles({ limit: 1000 }, options);
    return res.success ? res.data : [];
  }

  async getAllTokens(_filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
    return this.adapter.wrap(
      async () => {
        const tenantId = (_filter as { tenantId?: string | null } | undefined)?.tenantId;
        const db = this.getDb();
        const selection = this.adapter.getPhysicalSelection(this.schema.authTokens);

        // Scope by tenant when provided so list/batch isolation works on SQL adapters
        // (Mongo already uses safeQuery). "global"/null/empty → all tokens in single-tenant.
        if (tenantId && tenantId !== "global" && tenantId !== "null") {
          const res = await db
            .select(selection)
            .from(this.schema.authTokens)
            .where(eq(this.schema.authTokens.tenantId, tenantId as string))
            .limit(1000);
          return utils.convertArrayDatesToISO(res) as unknown as Token[];
        }

        const res = await db.select(selection).from(this.schema.authTokens).limit(1000);
        return utils.convertArrayDatesToISO(res) as unknown as Token[];
      },
      "GET_ALL_TOKENS_FAILED",
      undefined,
      { transaction: (_filter as { transaction?: unknown } | undefined)?.transaction },
    );
  }

  async getTokenByValue(
    token: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.adapter.wrap(async () => {
      const hashedToken = await this._hashToken(token);
      const [res] = await this.getDb(options)
        .select(this.adapter.getPhysicalSelection(this.schema.authTokens))
        .from(this.schema.authTokens)
        .where(
          and(
            eq(this.schema.authTokens.token, hashedToken),
            eq(this.schema.authTokens.consumed, false),
            gt(this.schema.authTokens.expires, new Date()),
          ),
        )
        .limit(1);
      return res ? (utils.convertDatesToISO(res) as unknown as Token) : null;
    }, "GET_TOKEN_FAILED");
  }

  async getTokenById(
    tokenId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.adapter.wrap(async () => {
      const [res] = await this.getDb(options)
        .select(this.adapter.getPhysicalSelection(this.schema.authTokens))
        .from(this.schema.authTokens)
        .where(eq(this.schema.authTokens._id, tokenId as string))
        .limit(1);
      return res ? (utils.convertDatesToISO(res) as unknown as Token) : null;
    }, "GET_TOKEN_FAILED");
  }

  async getTokenData(
    token: string,
    userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.adapter.wrap(async () => {
      const hashedToken = await this._hashToken(token);
      const conditions = [
        eq(this.schema.authTokens.token, hashedToken),
        eq(this.schema.authTokens.consumed, false),
        gt(this.schema.authTokens.expires, new Date()),
      ];
      if (userId) conditions.push(eq(this.schema.authTokens.user_id, userId as string));
      if (type) conditions.push(eq(this.schema.authTokens.type, type));
      const [res] = await this.getDb(options)
        .select(this.adapter.getPhysicalSelection(this.schema.authTokens))
        .from(this.schema.authTokens)
        .where(and(...conditions))
        .limit(1);
      return res ? (utils.convertDatesToISO(res) as unknown as Token) : null;
    }, "GET_TOKEN_DATA_FAILED");
  }

  async createApiKey(
    apiKeyData: Partial<ApiKey>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey>> {
    return this.adapter.wrap(
      async () => {
        const id = (apiKeyData._id || utils.generateId()) as string;
        const now = isoDateStringToDate(nowISODateString());
        const values: any = {
          _id: id,
          name: apiKeyData.name || "API Key",
          hash: apiKeyData.hash,
          prefix: apiKeyData.prefix,
          userId: apiKeyData.userId as string,
          scopes: apiKeyData.scopes || [],
          permissions: apiKeyData.permissions || [],
          revoked: apiKeyData.revoked || false,
          usageCount: apiKeyData.usageCount || 0,
          lastUsedAt: apiKeyData.lastUsedAt ? isoDateStringToDate(apiKeyData.lastUsedAt) : null,
          lastUsedIp: apiKeyData.lastUsedIp || null,
          expiresAt: apiKeyData.expiresAt ? isoDateStringToDate(apiKeyData.expiresAt) : null,
          tenantId: apiKeyData.tenantId || null,
          createdAt: now,
          updatedAt: now,
        };

        const db = this.getDb(options);
        const preparedValues = utils.convertISOToDates(values);
        await db.insert(this.schema.authApiKeys).values(preparedValues);

        const [result] = await db
          .select(this.adapter.getPhysicalSelection(this.schema.authApiKeys))
          .from(this.schema.authApiKeys)
          .where(eq(this.schema.authApiKeys._id, id))
          .limit(1);

        return this.mapApiKey(result);
      },
      "CREATE_API_KEY_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async getApiKey(
    hash: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey | null>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [eq(this.schema.authApiKeys.hash, hash)];
        if (options?.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authApiKeys.tenantId)
              : eq(this.schema.authApiKeys.tenantId, options.tenantId as string),
          );
        }
        const [result] = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.authApiKeys))
          .from(this.schema.authApiKeys)
          .where(and(...conditions))
          .limit(1);
        return result ? this.mapApiKey(result) : null;
      },
      "GET_API_KEY_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async getApiKeyById(
    id: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey | null>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [eq(this.schema.authApiKeys._id, id as string)];
        if (options?.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authApiKeys.tenantId)
              : eq(this.schema.authApiKeys.tenantId, options.tenantId as string),
          );
        }
        const [result] = await this.getDb(options)
          .select(this.adapter.getPhysicalSelection(this.schema.authApiKeys))
          .from(this.schema.authApiKeys)
          .where(and(...conditions))
          .limit(1);
        return result ? this.mapApiKey(result) : null;
      },
      "GET_API_KEY_BY_ID_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
  }

  async listApiKeys(
    filter: { userId?: DatabaseId; tenantId?: DatabaseId | null } = {},
    options?: { limit?: number; skip?: number },
  ): Promise<DatabaseResult<ApiKey[]>> {
    return this.adapter.wrap(async () => {
      const conditions = [eq(this.schema.authApiKeys.revoked, false)];
      if (filter.userId) {
        conditions.push(eq(this.schema.authApiKeys.userId, filter.userId as string));
      }
      if (filter.tenantId) {
        conditions.push(eq(this.schema.authApiKeys.tenantId, filter.tenantId as string));
      }

      let q = this.getDb()
        .select(this.adapter.getPhysicalSelection(this.schema.authApiKeys))
        .from(this.schema.authApiKeys)
        .where(and(...conditions))
        .orderBy(desc(this.schema.authApiKeys.createdAt))
        .$dynamic();

      if (options?.limit) q = q.limit(options.limit);
      if (options?.skip) q = q.offset(options.skip);

      const rows = await q;
      return rows.map((row: any) => this.mapApiKey(row));
    }, "LIST_API_KEYS_FAILED");
  }

  async revokeApiKey(id: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [eq(this.schema.authApiKeys._id, id as string)];
        if (options?.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authApiKeys.tenantId)
              : eq(this.schema.authApiKeys.tenantId, options.tenantId as string),
          );
        }
        await this.getDb(options)
          .update(this.schema.authApiKeys)
          .set({
            revoked: true,
            updatedAt: isoDateStringToDate(nowISODateString()),
          })
          .where(and(...conditions));
      },
      "REVOKE_API_KEY_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }

  async updateApiKeyUsage(
    id: DatabaseId,
    ip?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(
      async () => {
        const conditions = [eq(this.schema.authApiKeys._id, id as string)];
        if (options?.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull(this.schema.authApiKeys.tenantId)
              : eq(this.schema.authApiKeys.tenantId, options.tenantId as string),
          );
        }

        const now = isoDateStringToDate(nowISODateString());
        await this.getDb(options)
          .update(this.schema.authApiKeys)
          .set({
            lastUsedAt: now,
            lastUsedIp: ip || null,
            usageCount: sql`${this.schema.authApiKeys.usageCount} + 1`,
            updatedAt: now,
          })
          .where(and(...conditions));
      },
      "UPDATE_API_KEY_USAGE_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
  }
}

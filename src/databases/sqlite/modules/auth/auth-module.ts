/**
 * @file src/databases/sqlite/modules/auth/auth-module.ts
 * @description Authentication and authorization module for SQLite
 *
 * Features:
 * - Create user
 * - Update user
 * - Delete user
 * - Get user by id
 * - Get user by email
 * - Session management
 * - Token management
 * - Multi-tenancy support
 * - Role management
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
} from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import { schema } from "../../schema";
import * as utils from "../../utils";
import { logger } from "../../../../utils/logger.server";
import { isoDateStringToDate, nowISODateString } from "../../../../utils/date-utils";
import type { ISODateString } from "@src/content/types";

export class AuthModule implements IAuthAdapter {
  constructor(private core: AdapterCore) {}

  private get db() {
    return this.core.db;
  }

  private mapUser(dbUser: typeof schema.authUsers.$inferSelect): User {
    if (!dbUser) {
      throw new Error("User not found");
    }
    const user = utils.convertDatesToISO(dbUser);

    // Handle roleIds - ensure it is an array
    let roleIds = user.roleIds;
    if (typeof roleIds === "string") {
      try {
        roleIds = JSON.parse(roleIds);
      } catch {
        // Fallback if parsing fails
        roleIds = [];
      }
    }

    const finalRoleIds = Array.isArray(roleIds) ? (roleIds as DatabaseId[]) : [];

    return {
      ...user,
      _id: user._id as DatabaseId,
      roleIds: finalRoleIds,
      role: dbUser.role || (finalRoleIds.length > 0 ? (finalRoleIds[0] as string) : "user"),
      isAdmin: !!dbUser.isAdmin,
      isRegistered: !!dbUser.isRegistered,
      blocked: !!dbUser.blocked,
      emailVerified: !!dbUser.emailVerified,
      permissions: (user as unknown as { permissions?: string[] }).permissions || [],
      tenantId: user.tenantId as DatabaseId | null,
      createdAt: (user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : user.createdAt) as ISODateString,
      updatedAt: (user.updatedAt instanceof Date
        ? user.updatedAt.toISOString()
        : user.updatedAt) as ISODateString,
    } as unknown as User;
  }

  // Setup method for model registration
  async setupAuthModels(): Promise<void> {
    // No-op for SQL - tables created by migrations
    logger.debug("Auth models setup (no-op for SQL)");
  }

  // User methods
  async createUser(userData: Partial<User>): Promise<DatabaseResult<User>> {
    return this.core.wrap(async () => {
      const id = (userData._id || utils.generateId()) as string;
      const now = isoDateStringToDate(nowISODateString());

      // Ensure password is hashed if provided and not already hashed
      let password = userData.password;
      if (password && !password.startsWith("$argon2")) {
        const argon2 = await import("argon2");
        password = await argon2.hash(password);
      }

      // Map legacy 'role' string to 'roleIds' array if roleIds is missing/empty
      let roleIds: DatabaseId[] = [];
      if (userData.roleIds?.length) {
        roleIds = userData.roleIds;
      } else if (userData.role) {
        roleIds = [userData.role as DatabaseId];
      }

      const values: typeof schema.authUsers.$inferInsert = {
        email: userData.email || "",
        username: userData.username || null,
        password: password || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        avatar: userData.avatar || null,
        roleIds: roleIds,
        isAdmin: userData.isAdmin || false,
        isRegistered: userData.isRegistered || false,
        blocked: userData.blocked || false,
        emailVerified: userData.emailVerified || false,
        tenantId: (userData.tenantId as string | null) || null,
        role: userData.role || (roleIds.length > 0 ? (roleIds[0] as string) : "user"),
        _id: id,
        createdAt: now,
        updatedAt: now,
      };

      logger.debug(
        `[SQLite/Auth] Creating user: ${values.email}, isAdmin: ${values.isAdmin}, roles: ${JSON.stringify(values.roleIds)}`,
      );

      await this.db.insert(schema.authUsers).values(values);
      const [result] = await this.db
        .select()
        .from(schema.authUsers)
        .where(eq(schema.authUsers._id, id))
        .limit(1);
      return this.mapUser(result);
    }, "CREATE_USER_FAILED");
  }

  async updateUserAttributes(
    userId: DatabaseId,
    userData: Partial<User>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User>> {
    return this.core.wrap(async () => {
      const now = isoDateStringToDate(nowISODateString());
      const conditions = [eq(schema.authUsers._id, userId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }

      const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = userData;
      const updateData: Partial<typeof schema.authUsers.$inferInsert> = {
        ...(rest as any),
        updatedAt: now,
      };

      // Handle role mapping if needed
      if (userData.role) {
        updateData.role = userData.role;
        if (!userData.roleIds) {
          updateData.roleIds = [userData.role as DatabaseId];
        }
      }

      await this.db
        .update(schema.authUsers)
        .set(updateData)
        .where(and(...conditions));
      const [result] = await this.db
        .select()
        .from(schema.authUsers)
        .where(and(...conditions))
        .limit(1);
      return this.mapUser(result);
    }, "UPDATE_USER_FAILED");
  }

  async deleteUser(userId: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authUsers._id, userId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }
      await this.db.delete(schema.authUsers).where(and(...conditions));
    }, "DELETE_USER_FAILED");
  }

  async deleteUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions = [inArray(schema.authUsers._id, userIds as string[])];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }
      await this.db.delete(schema.authUsers).where(and(...conditions));
      return { deletedCount: userIds.length };
    }, "DELETE_USERS_FAILED");
  }

  async blockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions = [inArray(schema.authUsers._id, userIds as string[])];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }
      await this.db
        .update(schema.authUsers)
        .set({ blocked: true })
        .where(and(...conditions));
      return { modifiedCount: userIds.length };
    }, "BLOCK_USERS_FAILED");
  }

  async unblockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions = [inArray(schema.authUsers._id, userIds as string[])];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }
      await this.db
        .update(schema.authUsers)
        .set({ blocked: false })
        .where(and(...conditions));
      return { modifiedCount: userIds.length };
    }, "UNBLOCK_USERS_FAILED");
  }

  async getUserById(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authUsers._id, userId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }
      const [result] = await this.db
        .select()
        .from(schema.authUsers)
        .where(and(...conditions))
        .limit(1);
      return result ? this.mapUser(result) : null;
    }, "GET_USER_FAILED");
  }

  async getUserByEmail(
    criteria: {
      email: string;
      tenantId?: DatabaseId | null;
    },
    _options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authUsers.email, criteria.email)];
      if (criteria.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, criteria.tenantId as string));
      } else {
        conditions.push(isNull(schema.authUsers.tenantId));
      }

      const [result] = await this.db
        .select()
        .from(schema.authUsers)
        .where(and(...conditions))
        .limit(1);
      return result ? this.mapUser(result) : null;
    }, "GET_USER_BY_EMAIL_FAILED");
  }

  async getAllUsers(
    options?: PaginationOptions,
    dbOptions?: BaseQueryOptions,
  ): Promise<DatabaseResult<User[]>> {
    return this.core.wrap(async () => {
      const conditions = [];
      const tenantId = dbOptions?.tenantId || options?.filter?.tenantId;
      if (tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, tenantId as string));
      }

      let q = this.db.select().from(schema.authUsers).$dynamic();
      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }
      if (options?.limit) q = q.limit(options.limit);
      if (options?.offset) q = q.offset(options.offset);
      // Support for new PaginationOptions
      if (!options?.limit && options?.pageSize) q = q.limit(options.pageSize);
      if (!options?.offset && options?.page && options?.pageSize)
        q = q.offset((options.page - 1) * options.pageSize);

      const results = await q;
      return results.map((u) => this.mapUser(u));
    }, "GET_ALL_USERS_FAILED");
  }

  async getUserCount(
    filter?: Record<string, unknown>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      const conditions = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }
      if (filter?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, filter.tenantId as string));
      }

      let q = this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.authUsers)
        .$dynamic();
      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }

      const results = await q;
      return results[0]?.count || 0;
    }, "GET_USER_COUNT_FAILED");
  }

  async createUserAndSession(
    userData: Partial<User>,
    sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
    _options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ user: User; session: Session }>> {
    return this.core.wrap(async () => {
      const userRes = await this.createUser(userData);
      if (!userRes.success) throw new Error(userRes.message);

      const sessionRes = await this.createSession({
        user_id: userRes.data._id,
        expires: sessionData.expires,
        tenantId: sessionData.tenantId,
      });
      if (!sessionRes.success) throw new Error(sessionRes.message);

      return { user: userRes.data, session: sessionRes.data };
    }, "CREATE_USER_AND_SESSION_FAILED");
  }

  async deleteUserAndSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
    return this.core.wrap(async () => {
      await this.invalidateAllUserSessions(userId, options);
      await this.deleteUser(userId, options);
      return { deletedUser: true, deletedSessionCount: 1 };
    }, "DELETE_USER_AND_SESSIONS_FAILED");
  }

  // Session methods
  async createSession(sessionData: {
    user_id: DatabaseId;
    expires: ISODateString;
    tenantId?: DatabaseId | null;
  }): Promise<DatabaseResult<Session>> {
    return this.core.wrap(async () => {
      const id = utils.generateId();
      const now = isoDateStringToDate(nowISODateString());
      const expires = isoDateStringToDate(sessionData.expires);

      const values = {
        ...sessionData,
        _id: id,
        user_id: sessionData.user_id as string,
        tenantId: sessionData.tenantId as string | null,
        expires: expires as Date,
        createdAt: now,
        updatedAt: now,
      };

      await this.db.insert(schema.authSessions).values(values);
      const [result] = await this.db
        .select()
        .from(schema.authSessions)
        .where(eq(schema.authSessions._id, id))
        .limit(1);
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Session;
    }, "CREATE_SESSION_FAILED");
  }

  async validateSession(sessionId: DatabaseId): Promise<DatabaseResult<User | null>> {
    return this.core.wrap(async () => {
      const [session] = await this.db
        .select()
        .from(schema.authSessions)
        .where(eq(schema.authSessions._id, sessionId as string))
        .limit(1);

      if (!session || new Date(session.expires) < new Date()) {
        if (session) {
          await this.db
            .delete(schema.authSessions)
            .where(eq(schema.authSessions._id, sessionId as string));
        }
        return null;
      }

      const [user] = await this.db
        .select()
        .from(schema.authUsers)
        .where(eq(schema.authUsers._id, session.user_id))
        .limit(1);
      return user ? this.mapUser(user) : null;
    }, "VALIDATE_SESSION_FAILED");
  }

  async deleteSession(sessionId: DatabaseId): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      await this.db
        .delete(schema.authSessions)
        .where(eq(schema.authSessions._id, sessionId as string));
    }, "DELETE_SESSION_FAILED");
  }

  async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      await this.db.delete(schema.authSessions).where(sql`expires < ${Date.now()}`);
      return 1;
    }, "DELETE_EXPIRED_SESSIONS_FAILED");
  }

  async updateSessionExpiry(
    sessionId: DatabaseId,
    newExpiry: ISODateString,
  ): Promise<DatabaseResult<Session>> {
    return this.core.wrap(async () => {
      await this.db
        .update(schema.authSessions)
        .set({ expires: isoDateStringToDate(newExpiry) })
        .where(eq(schema.authSessions._id, sessionId as string));

      const [result] = await this.db
        .select()
        .from(schema.authSessions)
        .where(eq(schema.authSessions._id, sessionId as string))
        .limit(1);
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Session;
    }, "UPDATE_SESSION_EXPIRY_FAILED");
  }

  async invalidateAllUserSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authSessions.user_id, userId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authSessions.tenantId, options.tenantId as string));
      }
      await this.db.delete(schema.authSessions).where(and(...conditions));
    }, "INVALIDATE_USER_SESSIONS_FAILED");
  }

  async getActiveSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Session[]>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authSessions.user_id, userId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authSessions.tenantId, options.tenantId as string));
      }
      const results = await this.db
        .select()
        .from(schema.authSessions)
        .where(and(...conditions));
      return (utils.convertArrayDatesToISO(results) as any[]).map((s) => ({
        ...s,
        _id: s._id as DatabaseId,
        user_id: s.user_id as DatabaseId,
        tenantId: s.tenantId as DatabaseId | null,
      })) as Session[];
    }, "GET_ACTIVE_SESSIONS_FAILED");
  }

  async getAllActiveSessions(options?: BaseQueryOptions): Promise<DatabaseResult<Session[]>> {
    return this.core.wrap(async () => {
      const conditions = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.authSessions.tenantId, options.tenantId as string));
      }
      let q = this.db.select().from(schema.authSessions).$dynamic();
      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }
      const results = await q;
      return (utils.convertArrayDatesToISO(results) as any[]).map((s) => ({
        ...s,
        _id: s._id as DatabaseId,
        user_id: s.user_id as DatabaseId,
        tenantId: s.tenantId as DatabaseId | null,
      })) as Session[];
    }, "GET_ALL_ACTIVE_SESSIONS_FAILED");
  }

  async getSessionTokenData(
    sessionId: DatabaseId,
  ): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: DatabaseId } | null>> {
    return this.core.wrap(async () => {
      const [session] = await this.db
        .select()
        .from(schema.authSessions)
        .where(eq(schema.authSessions._id, sessionId as string))
        .limit(1);
      if (!session) return null;
      const iso = utils.convertDatesToISO(session);
      return {
        expiresAt: (iso as any).expires as unknown as ISODateString,
        user_id: session.user_id as DatabaseId,
      };
    }, "GET_SESSION_TOKEN_DATA_FAILED");
  }

  async getTokenById(
    tokenId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authTokens._id, tokenId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      const [t] = await this.db
        .select()
        .from(schema.authTokens)
        .where(and(...conditions))
        .limit(1);
      if (!t) return null;
      const converted = utils.convertDatesToISO(t);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Token;
    }, "GET_TOKEN_BY_ID_FAILED");
  }

  async createToken(tokenData: {
    user_id: DatabaseId;
    email: string;
    expires: ISODateString;
    type: string;
    tenantId?: DatabaseId | null;
    role?: string;
  }): Promise<DatabaseResult<string>> {
    return this.core.wrap(async () => {
      const id = utils.generateId();
      const now = isoDateStringToDate(nowISODateString());
      const expires = isoDateStringToDate(tokenData.expires);
      const tokenValue = utils.generateId();

      const values = {
        ...tokenData,
        _id: id,
        user_id: tokenData.user_id as string,
        tenantId: tokenData.tenantId as string | null,
        token: tokenValue,
        expires: expires as Date,
        createdAt: now,
        updatedAt: now,
      };

      await this.db.insert(schema.authTokens).values(values);
      return tokenValue;
    }, "CREATE_TOKEN_FAILED");
  }

  async getTokenByValue(
    token: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authTokens.token, token)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      const [result] = await this.db
        .select()
        .from(schema.authTokens)
        .where(and(...conditions))
        .limit(1);
      if (!result) return null;
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Token;
    }, "GET_TOKEN_FAILED");
  }

  async getTokenData(
    token: string,
    _userId?: DatabaseId,
    _type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.getTokenByValue(token, options);
  }

  async validateToken(
    token: string,
    _userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
    return this.core.wrap(async () => {
      const tokenRes = await this.getTokenByValue(token, options);
      if (!tokenRes.success || !tokenRes.data) {
        return { success: false, message: "Token not found" };
      }
      const t = tokenRes.data;
      if (new Date(t.expires) < new Date()) {
        return { success: false, message: "Token expired" };
      }
      if (type && t.type !== type) {
        return { success: false, message: "Invalid token type" };
      }
      return { success: true, message: "Token valid", email: t.email };
    }, "VALIDATE_TOKEN_FAILED");
  }

  async consumeToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ status: boolean; message: string }>> {
    return this.core.wrap(async () => {
      const val = await this.validateToken(token, userId, type, options);
      if (!val.success || !val.data.success) {
        return {
          status: false,
          message: val.success ? val.data.message : val.error?.message || "Invalid token",
        };
      }
      const tokenRes = await this.getTokenByValue(token, options);
      if (tokenRes.success && tokenRes.data) {
        await this.db
          .delete(schema.authTokens)
          .where(eq(schema.authTokens._id, tokenRes.data._id as string));
      }
      return { status: true, message: "Token consumed" };
    }, "CONSUME_TOKEN_FAILED");
  }

  async deleteTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions = [inArray(schema.authTokens._id, tokenIds as string[])];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      await this.db.delete(schema.authTokens).where(and(...conditions));
      return { deletedCount: tokenIds.length };
    }, "DELETE_TOKENS_FAILED");
  }

  async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      await this.db.delete(schema.authTokens).where(sql`expires < ${Date.now()}`);
      return 1;
    }, "DELETE_EXPIRED_TOKENS_FAILED");
  }

  async blockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions = [inArray(schema.authTokens._id, tokenIds as string[])];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      await this.db
        .update(schema.authTokens)
        .set({ blocked: true })
        .where(and(...conditions));
      return { modifiedCount: tokenIds.length };
    }, "BLOCK_TOKENS_FAILED");
  }

  async unblockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions = [inArray(schema.authTokens._id, tokenIds as string[])];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      await this.db
        .update(schema.authTokens)
        .set({ blocked: false })
        .where(and(...conditions));
      return { modifiedCount: tokenIds.length };
    }, "UNBLOCK_TOKENS_FAILED");
  }

  async updateToken(
    tokenId: DatabaseId,
    tokenData: Partial<Token>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authTokens._id, tokenId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      await this.db
        .update(schema.authTokens)
        .set(tokenData as any)
        .where(and(...conditions));
      const [res] = await this.db
        .select()
        .from(schema.authTokens)
        .where(and(...conditions))
        .limit(1);
      if (!res) throw new Error("Token not found");
      const converted = utils.convertDatesToISO(res);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Token;
    }, "UPDATE_TOKEN_FAILED");
  }

  async rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>> {
    return this.core.wrap(async () => {
      const tokenRes = await this.getTokenByValue(oldToken);
      if (!tokenRes.success || !tokenRes.data) throw new Error("Token not found");
      const newToken = utils.generateId();
      await this.db
        .update(schema.authTokens)
        .set({ token: newToken, expires: isoDateStringToDate(expires) })
        .where(eq(schema.authTokens.token, oldToken));
      return newToken;
    }, "ROTATE_TOKEN_FAILED");
  }

  async getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
    return this.core.wrap(async () => {
      const conditions = [];
      if (filter?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, filter.tenantId as string));
      }
      let q = this.db.select().from(schema.authTokens).$dynamic();
      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }
      const results = await q;
      return results.map((t) => {
        const converted = utils.convertDatesToISO(t);
        return {
          ...converted,
          _id: converted._id as DatabaseId,
          user_id: converted.user_id as DatabaseId,
          tenantId: converted.tenantId as DatabaseId | null,
        } as unknown as Token;
      });
    }, "GET_ALL_TOKENS_FAILED");
  }

  // Role methods
  async createRole(roleData: Role): Promise<DatabaseResult<Role>> {
    return this.core.wrap(async () => {
      const id = (roleData._id || utils.generateId()) as string;
      const now = isoDateStringToDate(nowISODateString());

      const values: typeof schema.roles.$inferInsert = {
        ...roleData,
        _id: id,
        tenantId: (roleData.tenantId as string | null) || null,
        permissions: roleData.permissions || [],
        createdAt: now,
        updatedAt: now,
      };

      await this.db.insert(schema.roles).values(values).onConflictDoNothing();
      const [result] = await this.db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles._id, id))
        .limit(1);
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Role;
    }, "CREATE_ROLE_FAILED");
  }

  async getRoleById(
    roleId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.roles._id, roleId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.roles.tenantId, options.tenantId as string));
      }
      const [result] = await this.db
        .select()
        .from(schema.roles)
        .where(and(...conditions))
        .limit(1);
      if (!result) return null;
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Role;
    }, "GET_ROLE_FAILED");
  }

  async getAllRoles(options?: BaseQueryOptions): Promise<Role[]> {
    const res = await this.core.wrap(async () => {
      const conditions = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.roles.tenantId, options.tenantId as string));
      }
      let q = this.db.select().from(schema.roles).$dynamic();
      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }
      const results = await q;
      return results.map((r) => {
        const converted = utils.convertDatesToISO(r);
        return {
          ...converted,
          _id: converted._id as DatabaseId,
          tenantId: converted.tenantId as DatabaseId | null,
        } as unknown as Role;
      });
    }, "GET_ALL_ROLES_FAILED");
    return res.success ? res.data : [];
  }

  async updateRole(
    roleId: DatabaseId,
    roleData: Partial<Role>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role>> {
    return this.core.wrap(async () => {
      const now = isoDateStringToDate(nowISODateString());
      const conditions = [eq(schema.roles._id, roleId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.roles.tenantId, options.tenantId as string));
      }

      const updateData = {
        ...roleData,
        updatedAt: now,
      };

      await this.db
        .update(schema.roles)
        .set(updateData as any)
        .where(and(...conditions));
      const [result] = await this.db
        .select()
        .from(schema.roles)
        .where(and(...conditions))
        .limit(1);
      if (!result) throw new Error("Role not found");
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Role;
    }, "UPDATE_ROLE_FAILED");
  }

  async deleteRole(roleId: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.roles._id, roleId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.roles.tenantId, options.tenantId as string));
      }
      await this.db.delete(schema.roles).where(and(...conditions));
    }, "DELETE_ROLE_FAILED");
  }
}

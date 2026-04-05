/**
 * @file src/databases/postgresql/modules/auth/auth-module.ts
 * @description Authentication and authorization module for PostgreSQL
 *
 * Features:
 * - Create user
 * - Update user
 * - Delete user
 * - Get user by id
 * - Get user by email
 * - Get all users
 * - Get user count
 * - Delete users
 */

import type { ISODateString } from "@src/content/types";
import { isoDateStringToDate, nowISODateString } from "@src/utils/date-utils";
import { logger } from "@src/utils/logger";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type {
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  PaginationOption,
  Role,
  Session,
  Token,
  User,
} from "../../../db-interface";
import type { AdapterCore } from "../../adapter/adapter-core";
import * as schema from "../../schema";
import * as utils from "../../utils";

export class AuthModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  private mapUser(dbUser: typeof schema.authUsers.$inferSelect): User {
    if (!dbUser) {
      throw new Error("User not found");
    }
    const converted = utils.convertDatesToISO(dbUser);

    const finalRoleIds = utils.parseJsonField<DatabaseId[]>(converted.roleIds, []);

    return {
      ...converted,
      _id: converted._id as DatabaseId,
      roleIds: finalRoleIds,
      role: dbUser.role || (finalRoleIds.length > 0 ? (finalRoleIds[0] as string) : "user"),
      isRegistered: !!dbUser.isRegistered,
      blocked: !!dbUser.blocked,
      isAdmin: !!dbUser.isAdmin,
      emailVerified: !!dbUser.emailVerified,
      permissions: (dbUser as unknown as { permissions?: string[] }).permissions || [],
      tenantId: converted.tenantId as DatabaseId | null,
      createdAt: converted.createdAt as unknown as ISODateString,
      updatedAt: converted.updatedAt as unknown as ISODateString,
    } as unknown as User;
  }

  private mapRole(dbRole: typeof schema.roles.$inferSelect): Role {
    const role = utils.convertDatesToISO(dbRole);
    return {
      ...role,
      _id: role._id as DatabaseId,
      tenantId: role.tenantId as DatabaseId | null,
      permissions: utils.parseJsonField<string[]>(role.permissions, []),
    } as unknown as Role;
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

      const values: typeof schema.authUsers.$inferInsert = {
        email: userData.email || "",
        username: userData.username || null,
        password: password || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        avatar: userData.avatar || null,
        roleIds: [],
        isRegistered: userData.isRegistered || false,
        blocked: userData.blocked || false,
        isAdmin: userData.isAdmin || false,
        emailVerified: userData.emailVerified || false,
        tenantId: userData.tenantId || null,
        role: userData.role || "user",
        _id: id,
        createdAt: now,
        updatedAt: now,
      };

      // Map legacy 'role' string to 'roleIds' array if roleIds is missing/empty
      if (userData.roleIds?.length) {
        values.roleIds = userData.roleIds;
      } else if (userData.role) {
        values.roleIds = [userData.role as DatabaseId];
      }

      try {
        const [result] = await this.db.insert(schema.authUsers).values(values).returning();
        return this.mapUser(result);
      } catch (e: any) {
        logger.error("POSTGRES_CREATE_USER_ERROR:", e.message, e);
        throw e;
      }
    }, "CREATE_USER_FAILED");
  }

  async updateUserAttributes(
    userId: DatabaseId,
    userData: Partial<User>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<User>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authUsers._id, userId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, options.tenantId as string));
      }

      const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = userData;
      const updateData: Partial<typeof schema.authUsers.$inferInsert> = {
        ...(rest as any),
        updatedAt: isoDateStringToDate(nowISODateString()),
      } as Record<string, unknown>;

      // Map legacy role string to database columns
      if (userData.role) {
        updateData.role = userData.role;
        if (!updateData.roleIds) {
          updateData.roleIds = [userData.role as DatabaseId];
        }
      }

      const [result] = await this.db
        .update(schema.authUsers)
        .set(updateData as Record<string, unknown>)
        .where(and(...conditions))
        .returning();

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
    }, "GET_USER_BY_ID_FAILED");
  }

  async getUserByEmail(criteria: {
    email: string;
    tenantId?: DatabaseId | null;
  }): Promise<DatabaseResult<User | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authUsers.email, criteria.email)];
      if (criteria.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, criteria.tenantId as string));
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
    options?: PaginationOption,
    dbOptions?: BaseQueryOptions,
  ): Promise<DatabaseResult<User[]>> {
    return this.core.wrap(async () => {
      let q = this.db.select().from(schema.authUsers).$dynamic();

      const conditions: import("drizzle-orm").SQL[] = [];
      if (dbOptions?.tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, dbOptions.tenantId as string));
      }
      if (conditions.length > 0) {
        q = q.where(and(...conditions));
      }

      if (options?.sort) {
        if (Array.isArray(options.sort)) {
          for (const [field, direction] of options.sort) {
            const order = direction === "desc" ? desc : asc;
            const column = (schema.authUsers as unknown as Record<string, unknown>)[field];
            if (column && typeof column === "object") {
              q = q.orderBy(order(column as import("drizzle-orm").Column));
            }
          }
        } else {
          for (const [field, direction] of Object.entries(options.sort)) {
            const order = direction === "desc" ? desc : asc;
            const column = (schema.authUsers as unknown as Record<string, unknown>)[field];
            if (column && typeof column === "object") {
              q = q.orderBy(order(column as import("drizzle-orm").Column));
            }
          }
        }
      }

      if (options?.limit) {
        q = q.limit(options.limit);
      }
      if (options?.offset) {
        q = q.offset(options.offset);
      }

      const results = await q;
      return results.map((u) => this.mapUser(u));
    }, "GET_ALL_USERS_FAILED");
  }

  async getUserCount(
    filter?: Record<string, unknown>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      const table = schema.authUsers;
      // Pass table schema AND filter to mapQuery
      let where = filter
        ? (this.core.mapQuery(
            table as unknown as Record<string, unknown>,
            filter,
          ) as import("drizzle-orm").SQL)
        : undefined;

      if (options?.tenantId) {
        const tenantWhere = eq(schema.authUsers.tenantId, options.tenantId as string);
        where = where ? and(where, tenantWhere) : tenantWhere;
      }

      const query = this.db.select({ count: sql<number>`count(*)` }).from(table);

      if (where) {
        query.where(where);
      }

      const [result] = await query;
      return Number(result.count);
    }, "GET_USER_COUNT_FAILED");
  }

  async deleteUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.core.wrap(async () => {
      const tenantId = options?.tenantId;
      const conditions = [inArray(schema.authUsers._id, userIds as string[])];
      if (tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, tenantId as string));
      }
      const results = await this.db
        .delete(schema.authUsers)
        .where(and(...conditions))
        .returning();
      return { deletedCount: results.length };
    }, "DELETE_USERS_FAILED");
  }

  async blockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const tenantId = options?.tenantId;
      const conditions = [inArray(schema.authUsers._id, userIds as string[])];
      if (tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, tenantId as string));
      }
      const results = await this.db
        .update(schema.authUsers)
        .set({
          blocked: true,
          updatedAt: isoDateStringToDate(nowISODateString()),
        })
        .where(and(...conditions))
        .returning();
      return { modifiedCount: results.length };
    }, "BLOCK_USERS_FAILED");
  }

  async unblockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const tenantId = options?.tenantId;
      const conditions = [inArray(schema.authUsers._id, userIds as string[])];
      if (tenantId) {
        conditions.push(eq(schema.authUsers.tenantId, tenantId as string));
      }
      const results = await this.db
        .update(schema.authUsers)
        .set({
          blocked: false,
          updatedAt: isoDateStringToDate(nowISODateString()),
        })
        .where(and(...conditions))
        .returning();
      return { modifiedCount: results.length };
    }, "UNBLOCK_USERS_FAILED");
  }

  // Combined methods
  async createUserAndSession(
    userData: Partial<User>,
    sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
  ): Promise<DatabaseResult<{ user: User; session: Session }>> {
    return this.core.wrap(async () => {
      const userResult = await this.createUser(userData);
      if (!userResult.success) {
        throw new Error(userResult.message);
      }
      const user = userResult.data;

      const sessionResult = await this.createSession({
        user_id: user._id,
        expires: sessionData.expires,
        tenantId: sessionData.tenantId,
      });
      if (!sessionResult.success) {
        throw new Error(sessionResult.message);
      }
      const session = sessionResult.data;
      return { user, session };
    }, "CREATE_USER_AND_SESSION_FAILED");
  }

  async deleteUserAndSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
    return this.core.wrap(async () => {
      await this.invalidateAllUserSessions(userId, options);
      const userDeleteResult = await this.deleteUser(userId, options);

      return {
        deletedUser: userDeleteResult.success,
        deletedSessionCount: 0,
      };
    }, "DELETE_USER_AND_SESSIONS_FAILED");
  }

  // Session methods
  async createSession(sessionData: {
    user_id: DatabaseId;
    expires: ISODateString;
    tenantId?: DatabaseId | null;
  }): Promise<DatabaseResult<Session>> {
    return this.core.wrap(async () => {
      const id = utils.generateId() as string;
      const [result] = await this.db
        .insert(schema.authSessions)
        .values({
          _id: id,
          user_id: sessionData.user_id as string,
          expires: new Date(sessionData.expires),
          tenantId: (sessionData.tenantId as string) || null,
        })
        .returning();
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Session;
    }, "CREATE_SESSION_FAILED");
  }

  async updateSessionExpiry(
    sessionId: DatabaseId,
    newExpiry: ISODateString,
  ): Promise<DatabaseResult<Session>> {
    return this.core.wrap(async () => {
      const [result] = await this.db
        .update(schema.authSessions)
        .set({
          expires: new Date(newExpiry),
          updatedAt: isoDateStringToDate(nowISODateString()),
        })
        .where(eq(schema.authSessions._id, sessionId as string))
        .returning();
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Session;
    }, "UPDATE_SESSION_FAILED");
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
      const results = await this.db
        .delete(schema.authSessions)
        .where(lt(schema.authSessions.expires, isoDateStringToDate(nowISODateString())))
        .returning();
      return results.length;
    }, "DELETE_EXPIRED_SESSIONS_FAILED");
  }

  async validateSession(sessionId: DatabaseId): Promise<DatabaseResult<User | null>> {
    return this.core.wrap(async () => {
      const [session] = await this.db
        .select()
        .from(schema.authSessions)
        .where(
          and(
            eq(schema.authSessions._id, sessionId as string),
            gt(schema.authSessions.expires, isoDateStringToDate(nowISODateString())),
          ),
        )
        .limit(1);

      if (!session) {
        return null;
      }

      const userResult = await this.getUserById(session.user_id as DatabaseId, {
        tenantId: (session.tenantId as DatabaseId) || undefined,
      });
      return userResult.success ? userResult.data : null;
    }, "VALIDATE_SESSION_FAILED");
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
      const conditions = [
        eq(schema.authSessions.user_id, userId as string),
        gt(schema.authSessions.expires, isoDateStringToDate(nowISODateString())),
      ];
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
      const conditions = [gt(schema.authSessions.expires, isoDateStringToDate(nowISODateString()))];
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
      if (!session) {
        return null;
      }
      return {
        expiresAt: utils.dateToISO(session.expires) as ISODateString,
        user_id: session.user_id as DatabaseId,
      };
    }, "GET_SESSION_TOKEN_DATA_FAILED");
  }

  async rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>> {
    return this.core.wrap(async () => {
      const [oldSession] = await this.db
        .select()
        .from(schema.authSessions)
        .where(eq(schema.authSessions._id, oldToken as string))
        .limit(1);

      if (!oldSession) {
        throw new Error("Session not found");
      }

      const newId = utils.generateId() as string;
      const now = isoDateStringToDate(nowISODateString());

      await this.db.insert(schema.authSessions).values({
        _id: newId,
        user_id: oldSession.user_id,
        tenantId: oldSession.tenantId,
        expires: new Date(expires),
        createdAt: now,
        updatedAt: now,
      });

      await this.db
        .delete(schema.authSessions)
        .where(eq(schema.authSessions._id, oldToken as string));

      return newId;
    }, "ROTATE_TOKEN_FAILED");
  }

  async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
    return this.core.notImplemented("auth.cleanupRotatedSessions");
  }

  // Token methods
  async createToken(data: {
    user_id: DatabaseId;
    email: string;
    expires: ISODateString;
    type: string;
    tenantId?: DatabaseId | null;
    role?: string;
    username?: string;
  }): Promise<DatabaseResult<string>> {
    return this.core.wrap(async () => {
      const id = utils.generateId() as string;
      const tokenValue = utils.generateId() as string; // Returns a dash-less UUID now
      await this.db.insert(schema.authTokens).values({
        _id: id,
        user_id: data.user_id as string,
        email: data.email,
        token: tokenValue,
        type: data.type,
        expires: new Date(data.expires),
        tenantId: (data.tenantId as string) || null,
        role: data.role || null,
        username: data.username || null,
        consumed: false,
      });
      return tokenValue;
    }, "CREATE_TOKEN_FAILED");
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
      const [result] = await this.db
        .update(schema.authTokens)
        .set({
          ...tokenData,
          updatedAt: isoDateStringToDate(nowISODateString()),
        } as Record<string, unknown>)
        .where(and(...conditions))
        .returning();
      const converted = utils.convertDatesToISO(result);
      return {
        ...converted,
        _id: converted._id as DatabaseId,
        user_id: converted.user_id as DatabaseId,
        tenantId: converted.tenantId as DatabaseId | null,
      } as unknown as Token;
    }, "UPDATE_TOKEN_FAILED");
  }

  async validateToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
    return this.core.wrap(async () => {
      const conditions = [
        eq(schema.authTokens.token, token as string),
        gt(schema.authTokens.expires, isoDateStringToDate(nowISODateString())),
        eq(schema.authTokens.consumed, false),
      ];
      if (userId) {
        conditions.push(eq(schema.authTokens.user_id, userId as string));
      }
      if (type) {
        conditions.push(eq(schema.authTokens.type, type));
      }
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }

      const [t] = await this.db
        .select()
        .from(schema.authTokens)
        .where(and(...conditions))
        .limit(1);

      if (!t) {
        return { success: false, message: "Invalid or expired token" };
      }
      return {
        success: true,
        message: "Token is valid",
        email: t.email as string,
      };
    }, "VALIDATE_TOKEN_FAILED");
  }

  async consumeToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ status: boolean; message: string }>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authTokens.token, token as string)];
      if (userId) {
        conditions.push(eq(schema.authTokens.user_id, userId as string));
      }
      if (type) {
        conditions.push(eq(schema.authTokens.type, type));
      }
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }

      const results = await this.db
        .update(schema.authTokens)
        .set({
          consumed: true,
          updatedAt: isoDateStringToDate(nowISODateString()),
        })
        .where(and(...conditions))
        .returning();

      return {
        status: results.length > 0,
        message: results.length > 0 ? "Token consumed" : "Token not found or already consumed",
      };
    }, "CONSUME_TOKEN_FAILED");
  }

  async getTokenData(
    token: string,
    userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.authTokens.token, token as string)];
      if (userId) {
        conditions.push(eq(schema.authTokens.user_id, userId as string));
      }
      if (type) {
        conditions.push(eq(schema.authTokens.type, type));
      }
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
    }, "GET_TOKEN_DATA_FAILED");
  }

  async getTokenByValue(
    token: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    return this.getTokenData(token, undefined, undefined, options);
  }

  async getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [];
      if (filter?.email) {
        conditions.push(eq(schema.authTokens.email, filter.email as string));
      }
      if (filter?.user_id) {
        conditions.push(eq(schema.authTokens.user_id, filter.user_id as string));
      }
      if (filter?.type) {
        conditions.push(eq(schema.authTokens.type, filter.type as string));
      }
      if (filter?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, filter.tenantId as string));
      }

      // Handle MongoDB-style $or for search (mapped from API route)
      if (filter?.$or && Array.isArray(filter.$or)) {
        const orConditions: import("drizzle-orm").SQL[] = [];
        for (const part of filter.$or) {
          const field = Object.keys(part)[0];
          const val = part[field];
          const searchVal = typeof val === "object" && val.$regex ? `%${val.$regex}%` : `%${val}%`;

          const column = (schema.authTokens as any)[field];
          if (column) {
            orConditions.push(sql`${column} ILIKE ${searchVal}`);
          }
        }
        if (orConditions.length > 0) {
          conditions.push(or(...orConditions)!);
        }
      }

      const results = await this.db
        .select()
        .from(schema.authTokens)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return (utils.convertArrayDatesToISO(results) as any[]).map((t) => ({
        ...t,
        _id: t._id as DatabaseId,
        user_id: t.user_id as DatabaseId,
        tenantId: t.tenantId as DatabaseId | null,
      })) as Token[];
    }, "GET_ALL_TOKENS_FAILED");
  }

  async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
    return this.core.wrap(async () => {
      const results = await this.db
        .delete(schema.authTokens)
        .where(lt(schema.authTokens.expires, isoDateStringToDate(nowISODateString())))
        .returning();
      return results.length;
    }, "DELETE_EXPIRED_TOKENS_FAILED");
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

  async deleteTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.core.wrap(async () => {
      // API endpoints often pass token values instead of _ids
      const conditions: import("drizzle-orm").SQL[] = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }

      // Try delete by BOTH _id and token value simultaneously to be safe
      const results = await this.db
        .delete(schema.authTokens)
        .where(
          and(
            or(
              inArray(schema.authTokens._id, tokenIds as string[]),
              inArray(schema.authTokens.token, tokenIds as string[]),
            ),
            ...conditions,
          ),
        )
        .returning();

      return { deletedCount: results.length };
    }, "DELETE_TOKENS_FAILED");
  }

  async blockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      const results = await this.db
        .update(schema.authTokens)
        .set({
          blocked: true,
          updatedAt: isoDateStringToDate(nowISODateString()),
        })
        .where(
          and(
            or(
              inArray(schema.authTokens._id, tokenIds as string[]),
              inArray(schema.authTokens.token, tokenIds as string[]),
            ),
            ...conditions,
          ),
        )
        .returning();
      return { modifiedCount: results.length };
    }, "BLOCK_TOKENS_FAILED");
  }

  async unblockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const conditions: import("drizzle-orm").SQL[] = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.authTokens.tenantId, options.tenantId as string));
      }
      const results = await this.db
        .update(schema.authTokens)
        .set({
          blocked: false,
          updatedAt: isoDateStringToDate(nowISODateString()),
        })
        .where(
          and(
            or(
              inArray(schema.authTokens._id, tokenIds as string[]),
              inArray(schema.authTokens.token, tokenIds as string[]),
            ),
            ...conditions,
          ),
        )
        .returning();
      return { modifiedCount: results.length };
    }, "UNBLOCK_TOKENS_FAILED");
  }

  // Role methods
  async getAllRoles(options?: BaseQueryOptions): Promise<Role[]> {
    if (!this.db) {
      return [];
    }
    try {
      const conditions = [];
      if (options?.tenantId) {
        conditions.push(eq(schema.roles.tenantId, options.tenantId as string));
      }
      const results = await this.db
        .select()
        .from(schema.roles)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return results.map((r) => this.mapRole(r));
    } catch (error) {
      logger.error("Get all roles failed:", error);
      return [];
    }
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
      return result ? this.mapRole(result) : null;
    }, "GET_ROLE_BY_ID_FAILED");
  }

  async createRole(role: Role): Promise<DatabaseResult<Role>> {
    return this.core.wrap(async () => {
      const id = (role._id || utils.generateId()) as string;
      const [result] = await this.db
        .insert(schema.roles)
        .values({
          ...role,
          _id: id,
          tenantId: role.tenantId || null,
          createdAt: isoDateStringToDate(nowISODateString()),
          updatedAt: isoDateStringToDate(nowISODateString()),
          permissions: role.permissions || [],
        } as typeof schema.roles.$inferInsert)
        .returning();
      return this.mapRole(result);
    }, "CREATE_ROLE_FAILED");
  }

  async updateRole(
    roleId: DatabaseId,
    roleData: Partial<Role>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role>> {
    return this.core.wrap(async () => {
      const conditions = [eq(schema.roles._id, roleId as string)];
      if (options?.tenantId) {
        conditions.push(eq(schema.roles.tenantId, options.tenantId as string));
      }
      const [result] = await this.db
        .update(schema.roles)
        .set({
          ...roleData,
          updatedAt: isoDateStringToDate(nowISODateString()),
        } as Record<string, unknown>)
        .where(and(...conditions))
        .returning();
      return this.mapRole(result);
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

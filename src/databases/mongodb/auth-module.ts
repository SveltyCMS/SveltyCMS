/**
 * @file src/databases/mongodb/auth-module.ts
 * @description Consolidated Authentication module for the MongoDB adapter.
 * Handles users, sessions, tokens, API keys, and roles with full tenant isolation.
 */

import { DatabaseModule } from "../core/base-adapter";
import type {
  IAuthAdapter,
  DatabaseResult,
  DatabaseId,
  BaseQueryOptions,
  PaginationOptions,
  Role,
  Token,
  User,
  ISODateString,
  ApiKey,
  ApiKeyUsageUpdate,
} from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import type { Session } from "@src/databases/auth/types";
import { safeQuery } from "@src/utils/security/safe-query";
import mongoose, { type Connection } from "mongoose";
import { getOrCreateModel } from "./mongodb-utils";
import { SessionAdapter, SessionSchema } from "./auth-session";
import { TokenAdapter, TokenSchema } from "./auth-token";
import { UserAdapter, UserSchema } from "./auth-user";
import { ApiKeyAdapter } from "./auth-api-key";

/** Helper to get or create the Role model idempotently. */
function getRoleModel(conn: Connection | typeof mongoose) {
  const schema = new mongoose.Schema<Role>(
    {
      _id: { type: String, required: true },
      tenantId: { type: String, required: true },
      name: { type: String, required: true },
      permissions: [{ type: String }],
      description: String,
      isNative: { type: Boolean, default: false },
      isAdmin: { type: Boolean, default: false },
      groupName: String,
      icon: String,
      color: String,
      isDeleted: { type: Boolean, default: false },
    },
    {
      _id: false,
      timestamps: true,
      collection: "auth_roles",
    },
  );

  schema.index({ tenantId: 1 });
  schema.index({ tenantId: 1, _id: 1 });

  return getOrCreateModel<Role>(conn, "auth_roles", schema as any);
}

export class MongoAuthModule extends DatabaseModule<MongoAdapterCore> implements IAuthAdapter {
  private readonly userAdapter: UserAdapter;
  private readonly sessionAdapter: SessionAdapter;
  private readonly tokenAdapter: TokenAdapter;
  private readonly apiKeyAdapter: ApiKeyAdapter;

  constructor(adapter: MongoAdapterCore) {
    super(adapter);
    this.userAdapter = new UserAdapter();
    this.sessionAdapter = new SessionAdapter();
    this.tokenAdapter = new TokenAdapter();
    this.apiKeyAdapter = new ApiKeyAdapter();
    this.userAdapter.setSessionAdapter(this.sessionAdapter);
  }

  private get activeConnection(): any {
    return this.adapter.connection || mongoose;
  }

  async setupAuthModels(): Promise<void> {
    const conn = this.activeConnection;
    this.userAdapter.setModel(conn);
    this.sessionAdapter.setModel(conn);
    this.tokenAdapter.setModel(conn);
    this.apiKeyAdapter.setModel(conn);

    if (!conn.models["auth_users"]) conn.model("auth_users", UserSchema);
    if (!conn.models["auth_sessions"]) conn.model("auth_sessions", SessionSchema);
    if (!conn.models["auth_tokens"]) conn.model("auth_tokens", TokenSchema);
  }

  // ─── User Management ──────────────────────────────────────────────────────────
  createUser(userData: Partial<User>, options?: BaseQueryOptions) {
    return this.userAdapter.createUser(userData, options);
  }
  updateUserAttributes(
    userId: DatabaseId,
    updates: Partial<User>,
    options?: BaseQueryOptions & { allowPrivilegeEscalation?: boolean },
  ) {
    return this.userAdapter.updateUserAttributes(userId, updates, options);
  }
  deleteUser(userId: DatabaseId, options?: BaseQueryOptions) {
    return this.userAdapter.deleteUser(userId, options);
  }
  getUserById(userId: DatabaseId, options?: BaseQueryOptions) {
    return this.userAdapter.getUserById(userId, options);
  }
  getUserByEmail(
    criteria: { email: string; tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ) {
    return this.userAdapter.getUserByEmail(criteria, options);
  }
  getAllUsers(options?: BaseQueryOptions & PaginationOptions) {
    return this.userAdapter.getAllUsers(options);
  }
  getUserCount(filter?: Record<string, unknown>, options?: BaseQueryOptions) {
    return this.userAdapter.getUserCount(filter, options);
  }
  deleteUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.userAdapter.deleteUsers(userIds, options);
  }
  blockUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.userAdapter.blockUsers(userIds, options);
  }
  unblockUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.userAdapter.unblockUsers(userIds, options);
  }

  // ─── Combined User + Session Operations ───────────────────────────────────────
  async createUserAndSession(
    userData: Partial<User>,
    sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ user: User; session: Session }>> {
    try {
      const userResult = await this.userAdapter.createUser(userData, options);
      if (!userResult.success) {
        return userResult as any;
      }

      const sessionResult = await this.sessionAdapter.createSession({
        user_id: userResult.data._id,
        expires: sessionData.expires,
        tenantId: sessionData.tenantId,
      });

      if (!sessionResult.success) {
        await this.userAdapter.deleteUser(userResult.data._id, {
          tenantId: sessionData.tenantId,
        });
        return sessionResult as any;
      }

      return {
        success: true,
        data: {
          user: userResult.data,
          session: sessionResult.data,
        },
      };
    } catch (err) {
      const message = `Error in createUserAndSession: ${String(err)}`;
      return {
        success: false,
        message,
        error: { code: "CREATE_USER_AND_SESSION_ERROR", message },
      };
    }
  }

  async deleteUserAndSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
    try {
      const tenantId = options?.tenantId;
      let deletedSessionCount = 0;
      const activeSessions = await this.sessionAdapter.getActiveSessions(userId, tenantId);
      if (activeSessions.success && activeSessions.data) {
        deletedSessionCount = activeSessions.data.length;
      }

      await this.sessionAdapter.invalidateAllUserSessions(userId, tenantId);
      const userResult = await this.userAdapter.deleteUser(userId, options);

      if (!userResult.success) {
        return userResult as any;
      }

      return {
        success: true,
        data: {
          deletedUser: true,
          deletedSessionCount,
        },
      };
    } catch (err) {
      const message = `Error in deleteUserAndSessions: ${String(err)}`;
      return {
        success: false,
        message,
        error: { code: "DELETE_USER_AND_SESSIONS_ERROR", message },
      };
    }
  }

  // ─── Session Management ───────────────────────────────────────────────────────
  createSession(sessionData: {
    user_id: DatabaseId;
    expires: ISODateString;
    tenantId?: DatabaseId | null;
  }) {
    return this.sessionAdapter.createSession(sessionData);
  }
  updateSessionExpiry(sessionId: DatabaseId, expires: ISODateString, options?: BaseQueryOptions) {
    return this.sessionAdapter.updateSessionExpiry(
      sessionId,
      expires,
      options?.tenantId ?? undefined,
    );
  }
  deleteSession(sessionId: DatabaseId, options?: BaseQueryOptions) {
    return this.sessionAdapter.deleteSession(sessionId, options?.tenantId ?? undefined);
  }
  deleteExpiredSessions() {
    return this.sessionAdapter.deleteExpiredSessions();
  }
  validateSession(sessionId: DatabaseId, options?: BaseQueryOptions) {
    return this.userAdapter.validateSession(sessionId, options);
  }
  invalidateAllUserSessions(userId: DatabaseId, options?: BaseQueryOptions) {
    return this.sessionAdapter.invalidateAllUserSessions(userId, options);
  }
  getActiveSessions(userId: DatabaseId, options?: BaseQueryOptions) {
    return this.sessionAdapter.getActiveSessions(userId, options);
  }
  getAllActiveSessions(options?: BaseQueryOptions) {
    return this.sessionAdapter.getAllActiveSessions(options);
  }
  getSessionTokenData(sessionId: DatabaseId) {
    return this.sessionAdapter.getSessionTokenData(sessionId);
  }
  rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>> {
    return this.sessionAdapter.rotateToken(oldToken as DatabaseId, expires);
  }
  async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
    return { success: true, data: 0 };
  }

  // ─── Token Management ─────────────────────────────────────────────────────────
  createToken(tokenData: Partial<Token>) {
    return this.tokenAdapter.createToken(
      tokenData as {
        user_id: DatabaseId;
        email: string;
        expires: ISODateString;
        type: string;
        tenantId?: DatabaseId | null;
        role?: string;
      },
    );
  }
  validateToken(token: string, userId?: DatabaseId, type?: string, options?: BaseQueryOptions) {
    return this.tokenAdapter.validateToken(token, userId, type, options);
  }
  consumeToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ status: boolean; message: string; code?: string }>> {
    return this.tokenAdapter.consumeToken(token, userId, type, options) as unknown as Promise<
      DatabaseResult<{ status: boolean; message: string; code?: string }>
    >;
  }
  getTokenByValue(token: string, options?: BaseQueryOptions) {
    return this.tokenAdapter.getTokenByValue(token, options);
  }
  getTokenData(
    token: string,
    _userId?: DatabaseId,
    _type?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Token | null>> {
    // Delegates to the token adapter's hashed-by-value read path, which already
    // applies tenant scoping and the legacy plaintext fallback. No Mongo callers
    // currently rely on userId/type narrowing in this read-only lookup.
    return this.tokenAdapter.getTokenByValue(token, options);
  }
  getTokenById(tokenId: DatabaseId, options?: BaseQueryOptions) {
    return this.tokenAdapter.getTokenById(tokenId, options);
  }
  deleteExpiredTokens() {
    return this.tokenAdapter.deleteExpiredTokens();
  }
  getAllTokens(options?: BaseQueryOptions & PaginationOptions) {
    return this.tokenAdapter.getAllTokens(options);
  }
  updateToken(tokenId: DatabaseId, updates: Partial<Token>, options?: BaseQueryOptions) {
    return this.tokenAdapter.updateToken(tokenId, updates, options);
  }
  deleteToken(tokenId: DatabaseId, options?: BaseQueryOptions) {
    return this.tokenAdapter.deleteTokens([tokenId], options);
  }
  deleteTokens(tokenIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.tokenAdapter.deleteTokens(tokenIds, options);
  }
  blockTokens(tokenIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.tokenAdapter.blockTokens(tokenIds, options);
  }
  unblockTokens(tokenIds: DatabaseId[], options?: BaseQueryOptions) {
    return this.tokenAdapter.unblockTokens(tokenIds, options);
  }

  // ─── API Key Management ───────────────────────────────────────────────────────
  createApiKey(keyData: Partial<ApiKey>, options?: BaseQueryOptions) {
    return this.apiKeyAdapter.createApiKey(keyData, options);
  }
  getApiKey(keyHash: string, options?: BaseQueryOptions) {
    return this.apiKeyAdapter.getApiKey(keyHash, options);
  }
  getApiKeyById(id: DatabaseId, options?: BaseQueryOptions) {
    return this.apiKeyAdapter.getApiKeyById(id, options);
  }
  listApiKeys(options?: BaseQueryOptions) {
    return this.apiKeyAdapter.listApiKeys(options);
  }
  revokeApiKey(id: DatabaseId, options?: BaseQueryOptions) {
    return this.apiKeyAdapter.revokeApiKey(id, options);
  }
  updateApiKeyUsage(
    id: DatabaseId,
    ip?: string,
    options?: BaseQueryOptions,
    usage?: ApiKeyUsageUpdate,
  ) {
    return this.apiKeyAdapter.updateApiKeyUsage(id, ip, options, usage);
  }

  // ─── Role Management ──────────────────────────────────────────────────────────
  async createRole(role: Role): Promise<DatabaseResult<Role>> {
    try {
      const ROLE_MODEL = getRoleModel(this.activeConnection);
      const res = await ROLE_MODEL.findOneAndUpdate(
        { _id: role._id, tenantId: role.tenantId as any },
        { $set: role },
        { upsert: true, returnDocument: "after" },
      ).lean<Role>();

      return { success: true, data: res };
    } catch (err) {
      return {
        success: false,
        message: "Role creation failed",
        error: { code: "ROLE_ERROR", message: String(err) },
      };
    }
  }

  async getAllRoles(options?: BaseQueryOptions): Promise<Role[]> {
    try {
      const ROLE_MODEL = getRoleModel(this.activeConnection);
      const filter = safeQuery({}, options?.tenantId as string, {
        bypassTenantCheck: options?.bypassTenantCheck,
        bypassSafeQuery: options?.bypassSafeQuery,
      });

      return await ROLE_MODEL.find(filter).lean<Role[]>();
    } catch {
      return [];
    }
  }

  async getRoleById(
    roleId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role | null>> {
    try {
      const ROLE_MODEL = getRoleModel(this.activeConnection);
      const filter = safeQuery({ _id: roleId } as any, options?.tenantId as string, {
        bypassTenantCheck: options?.bypassTenantCheck,
        bypassSafeQuery: options?.bypassSafeQuery,
      });

      const role = await ROLE_MODEL.findOne(filter).lean<Role>();
      return { success: true, data: role || null };
    } catch (err) {
      return {
        success: false,
        message: "Get role failed",
        error: { code: "ROLE_ERROR", message: String(err) },
      };
    }
  }

  async getRoleCount(
    filter?: Record<string, unknown>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    try {
      const ROLE_MODEL = getRoleModel(this.activeConnection);
      const safeFilter = safeQuery(filter || {}, options?.tenantId as string, {
        bypassTenantCheck: options?.bypassTenantCheck,
        bypassSafeQuery: options?.bypassSafeQuery,
      });

      const count = await ROLE_MODEL.countDocuments(safeFilter);
      return { success: true, data: count };
    } catch (err) {
      return {
        success: false,
        message: "Count roles failed",
        error: { code: "ROLE_ERROR", message: String(err) },
      };
    }
  }

  async updateRole(
    roleId: DatabaseId,
    roleData: Partial<Role>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<Role>> {
    try {
      const ROLE_MODEL = getRoleModel(this.activeConnection);
      const filter = safeQuery({ _id: roleId } as any, options?.tenantId as string, {
        bypassTenantCheck: options?.bypassTenantCheck,
        bypassSafeQuery: options?.bypassSafeQuery,
      });

      const res = await ROLE_MODEL.findOneAndUpdate(
        filter,
        { $set: roleData },
        { returnDocument: "after" },
      ).lean<Role>();
      if (!res) throw new Error("Role not found");
      return { success: true, data: res };
    } catch (err) {
      return {
        success: false,
        message: "Update role failed",
        error: { code: "ROLE_ERROR", message: String(err) },
      };
    }
  }

  async deleteRole(roleId: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    try {
      const ROLE_MODEL = getRoleModel(this.activeConnection);
      const filter = safeQuery({ _id: roleId } as any, options?.tenantId as string, {
        bypassTenantCheck: options?.bypassTenantCheck,
        bypassSafeQuery: options?.bypassSafeQuery,
      });

      await ROLE_MODEL.deleteOne(filter);
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        message: "Delete role failed",
        error: { code: "ROLE_ERROR", message: String(err) },
      };
    }
  }
}

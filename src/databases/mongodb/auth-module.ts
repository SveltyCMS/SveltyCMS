/**
 * @file src/databases/mongodb/modules/auth-module.ts
 * @description Authentication module for MongoDB.
 */

import { DatabaseModule } from "../base-adapter";
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
} from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import { composeMongoAuthAdapter } from "./auth-composition";

export class MongoAuthModule extends DatabaseModule<MongoAdapterCore> implements IAuthAdapter {
  private _auth: IAuthAdapter;

  constructor(adapter: MongoAdapterCore) {
    super(adapter);
    this._auth = composeMongoAuthAdapter();
  }

  async setupAuthModels(): Promise<void> {
    if (this.adapter.connection) {
      await (this._auth as any).setupAuthModels(this.adapter.connection);
    }
  }

  // Delegate all methods to the composed auth adapter
  blockTokens(tokenIds: DatabaseId[], options?: BaseQueryOptions) {
    return this._auth.blockTokens(tokenIds, options);
  }
  blockUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this._auth.blockUsers(userIds, options);
  }
  async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
    if (typeof this._auth.cleanupRotatedSessions === "function") {
      return this._auth.cleanupRotatedSessions();
    }
    return { success: true as const, data: 0 };
  }
  consumeToken(token: string, userId?: DatabaseId, type?: string, options?: BaseQueryOptions) {
    return this._auth.consumeToken(token, userId, type, options);
  }
  createRole(role: Role) {
    return this._auth.createRole(role);
  }
  createSession(sessionData: {
    user_id: DatabaseId;
    expires: ISODateString;
    tenantId?: DatabaseId | null;
  }) {
    return this._auth.createSession(sessionData);
  }
  createToken(data: {
    user_id: DatabaseId;
    email: string;
    expires: ISODateString;
    type: string;
    tenantId?: DatabaseId | null;
    role?: string;
  }) {
    return this._auth.createToken(data);
  }
  createUser(userData: Partial<User>) {
    return this._auth.createUser(userData);
  }
  createUserAndSession(
    userData: Partial<User>,
    sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ) {
    return this._auth.createUserAndSession(userData, sessionData, options);
  }
  deleteExpiredSessions() {
    return this._auth.deleteExpiredSessions();
  }
  deleteExpiredTokens() {
    return this._auth.deleteExpiredTokens();
  }
  deleteRole(roleId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.deleteRole(roleId, options);
  }
  deleteSession(sessionId: DatabaseId) {
    return this._auth.deleteSession(sessionId);
  }
  deleteTokens(tokenIds: DatabaseId[], options?: BaseQueryOptions) {
    return this._auth.deleteTokens(tokenIds, options);
  }
  deleteUser(userId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.deleteUser(userId, options);
  }
  deleteUserAndSessions(userId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.deleteUserAndSessions(userId, options);
  }
  deleteUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this._auth.deleteUsers(userIds, options);
  }
  getActiveSessions(userId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.getActiveSessions(userId, options);
  }
  getAllActiveSessions(options?: BaseQueryOptions) {
    return this._auth.getAllActiveSessions(options);
  }
  getAllRoles(options?: BaseQueryOptions) {
    return this._auth.getAllRoles(options);
  }
  getAllTokens(filter?: Record<string, unknown>) {
    return this._auth.getAllTokens(filter);
  }
  getAllUsers(options?: PaginationOptions, dbOptions?: BaseQueryOptions) {
    return this._auth.getAllUsers(options, dbOptions);
  }
  getRoleById(roleId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.getRoleById(roleId, options);
  }
  getSessionTokenData(sessionId: DatabaseId) {
    return this._auth.getSessionTokenData(sessionId);
  }
  getTokenByValue(token: string, options?: BaseQueryOptions) {
    return this._auth.getTokenByValue(token, options);
  }
  getTokenById(tokenId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.getTokenById(tokenId, options);
  }
  getTokenData(token: string, userId?: DatabaseId, type?: string, options?: BaseQueryOptions) {
    return this._auth.getTokenData(token, userId, type, options);
  }
  getUserByEmail(
    criteria: { email: string; tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ) {
    return this._auth.getUserByEmail(criteria, options);
  }
  getUserById(userId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.getUserById(userId, options);
  }
  getUserCount(filter?: Record<string, unknown>, options?: BaseQueryOptions) {
    return this._auth.getUserCount(filter, options);
  }
  invalidateAllUserSessions(userId: DatabaseId, options?: BaseQueryOptions) {
    return this._auth.invalidateAllUserSessions(userId, options);
  }
  rotateToken(oldToken: string, expires: ISODateString) {
    return this._auth.rotateToken(oldToken, expires);
  }
  unblockTokens(tokenIds: DatabaseId[], options?: BaseQueryOptions) {
    return this._auth.unblockTokens(tokenIds, options);
  }
  unblockUsers(userIds: DatabaseId[], options?: BaseQueryOptions) {
    return this._auth.unblockUsers(userIds, options);
  }
  updateRole(roleId: DatabaseId, roleData: Partial<Role>, options?: BaseQueryOptions) {
    return this._auth.updateRole(roleId, roleData, options);
  }
  updateSessionExpiry(sessionId: DatabaseId, newExpiry: ISODateString) {
    return this._auth.updateSessionExpiry(sessionId, newExpiry);
  }
  updateToken(tokenId: DatabaseId, tokenData: Partial<Token>, options?: BaseQueryOptions) {
    return this._auth.updateToken(tokenId, tokenData, options);
  }
  updateUserAttributes(userId: DatabaseId, userData: Partial<User>, options?: BaseQueryOptions) {
    return this._auth.updateUserAttributes(userId, userData, options);
  }
  validateSession(sessionId: DatabaseId) {
    return this._auth.validateSession(sessionId);
  }
  validateToken(token: string, userId?: DatabaseId, type?: string, options?: BaseQueryOptions) {
    return this._auth.validateToken(token, userId, type, options);
  }
}

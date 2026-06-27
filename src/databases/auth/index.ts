/**
 * @file src/databases/auth/index.ts
 * @description Quantum-resistant authentication and authorization system with multi-tenant support
 * Features:
 * - Argon2id hashing
 * - AES-256-GCM encryption
 * - session management
 * - RBAC
 * - tenant scoping
 */

import type { ISODateString, DatabaseId } from "@src/content/types";
import type {
  DatabaseAdapter,
  DatabaseResult,
  BaseQueryOptions,
  PaginationOptions,
} from "@src/databases/db-interface";
// Import global settings service for DB-based configuration
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { dateToISODateString, isoDateStringToDate } from "@src/utils/date";
import { error } from "@sveltejs/kit";
import { cacheService } from "@src/databases/cache/cache-service";
// System Logger
import { logger } from "@utils/logger";
import { corePermissions } from "./core-permissions";
import type { Permission, Role, Session, SessionStore, Token, User, ApiKey } from "./types";

export {
  checkPermissions,
  getAllPermissions,
  getPermissionById,
  getPermissionConfig,
  getRolePermissionsWithRoles as checkRolePermissions,
  hasPermissionByAction,
  hasPermissionWithRoles as hasPermission,
  isAdminRoleWithRoles,
  permissionConfigs,
  permissions,
  registerPermission,
  validateUserPermission,
} from "./permissions";

// Note: TOTP functions are server-only and should be imported from './totp' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { generateTOTPSecret, ... } from '@src/databases/auth/totp';

// Note: TwoFactorAuthService is server-only and should be imported from './two-factor-auth' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { TwoFactorAuthService, ... } from '@src/databases/auth/two-factor-auth';

// Export safe constants
export { generateRandomToken, generateTokenWithExpiry, SESSION_COOKIE_NAME } from "./constants";
export type { TwoFactorSetupResponse, TwoFactorVerificationResult } from "./two-factor-auth-types";
export type {
  Permission,
  PermissionAction,
  PermissionType,
  Role,
  RolePermissions,
  Session,
  SessionStore,
  Token,
  User,
  ApiKey,
} from "./types";

// Import shared password utilities (Argon2id)
// NOTE: Import directly from ./crypto, NOT from @utils/security barrel,
// to avoid pulling server-only modules (cors-utils, csrf-utils, etc.) into the client bundle.
import {
  hashPassword as cryptoHashPassword,
  verifyPassword as cryptoVerifyPassword,
} from "@utils/security/crypto";
// Import for internal use
import { SESSION_COOKIE_NAME } from "./constants";

// Main Auth class
export class Auth {
  private readonly db: DatabaseAdapter;
  private readonly sessionStore: SessionStore;
  private readonly permissions: Permission[] = [...corePermissions];

  constructor(db: DatabaseAdapter, sessionStore: SessionStore) {
    this.db = db;
    this.sessionStore = sessionStore;
  }

  public get authInterface(): DatabaseAdapter["auth"] {
    return this.db.auth;
  }

  // Combined Performance-Optimized Methods (wrapper for db.auth methods)
  async createUserAndSession(
    userData: Partial<User>,
    sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ user: User; session: Session }>> {
    try {
      const { email, password } = userData;

      if (email) userData.email = email.toLowerCase();

      // --- PASSWORD HASHING ---
      if (password) {
        if (password.length < 8) throw new Error("Password too short");
        userData.password = await cryptoHashPassword(password);
      }

      // Delegate to adapter — each adapter has its own manual rollback.
      // MongoDB: auth-composition.ts line 100-112 (deleteUser on session failure).
      // SQL: relational-auth.ts createUserAndSession (same pattern).
      return await this.db.auth.createUserAndSession(userData, sessionData, options);
    } catch (err: any) {
      throw new Error(err.message || "Failed to create user and session");
    }
  }

  async deleteUserAndSessions(
    userId: DatabaseId,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
    return this.db.auth.deleteUserAndSessions(userId, { tenantId });
  }

  async blockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.db.auth.blockUsers(userIds, options);
  }

  async unblockUsers(
    userIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.db.auth.unblockUsers(userIds, options);
  }

  // Permission management

  getPermissions(): Permission[] {
    return this.permissions;
  }

  addPermission(permission: Permission): void {
    const exists = this.permissions.some((p) => p._id === permission._id);
    if (!exists) {
      this.permissions.push(permission);
    }
  }

  // User management

  async createUser(userData: Partial<User>, oauth = false): Promise<User> {
    try {
      const { email, password, tenantId, samlId } = userData;

      if (!(email && (oauth || password || samlId))) {
        throw error(400, "Email and password (or OAuth/SAML provider context) are required");
      }

      if (getPrivateSettingSync("MULTI_TENANT") && !tenantId && userData.role !== "admin") {
        throw error(400, "Tenant ID is required in multi-tenant mode");
      }

      const normalizedEmail = email.toLowerCase();

      // --- PASSWORD STRENGTH VALIDATION ---
      if (!oauth && !samlId && password) {
        this.validatePasswordStrength(password);
      }

      let hashedPassword: string | undefined;
      if (!oauth && !samlId && password) {
        hashedPassword = await cryptoHashPassword(password);
      }

      const preferences = userData.preferences || {};
      if (oauth) {
        preferences.auth = { ...(preferences.auth as any), oauthEnabled: true };
      }

      const result = await this.db.auth.createUser({
        ...userData,
        preferences,
        email: normalizedEmail,
        password: hashedPassword,
      });
      if (!(result?.success && result.data && result.data._id)) {
        throw error(500, "User creation failed");
      }
      return result.data;
    } catch (err: any) {
      throw error(500, `Failed to create user: ${err.message}`);
    }
  }

  async getUserById(userId: DatabaseId, options?: BaseQueryOptions): Promise<User | null> {
    // No caching - getUserById is fast enough and avoids cache invalidation complexity
    // Session cache already stores user data for authenticated requests
    const result = (await this.db.auth.getUserById(userId, options)) as unknown;
    if (
      result &&
      typeof result === "object" &&
      result !== null &&
      "success" in (result as Record<string, unknown>)
    ) {
      const r = result as DatabaseResult<User | null>;
      if (r.success && r.data) {
        return r.data;
      }
      return null;
    }
    return (result as User | null) ?? null;
  }

  async getUserBySamlId(samlId: string, options?: BaseQueryOptions): Promise<User | null> {
    // Uses generic checkUser structure mapping to adapter lookup
    return this.checkUser(
      {
        user_id: undefined as any,
        email: undefined as any,
        samlId,
        tenantId: options?.tenantId,
      },
      options,
    );
  }

  async getUserByEmail(
    criteria: { email: string; tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ): Promise<User | null> {
    // No caching - getUserByEmail is only used during login/registration
    // Caching here adds complexity without significant performance benefit
    const result = (await this.db.auth.getUserByEmail(criteria, options)) as unknown;

    if (
      result &&
      typeof result === "object" &&
      result !== null &&
      "success" in (result as Record<string, unknown>)
    ) {
      const r = result as DatabaseResult<User | null>;

      if (r.success === true) {
        const userData = "data" in r ? (r as { data: User | null }).data : null;
        // No caching - not needed for login/registration flows
        return userData ?? null;
      }
      return null;
    }
    return (result as User | null) ?? null;
  }
  async updateUser(
    userId: DatabaseId,
    updates: Partial<User>,
    options?: BaseQueryOptions,
  ): Promise<void> {
    if (updates.password) {
      this.validatePasswordStrength(updates.password);
      const originalPassword = updates.password;
      updates.password = await cryptoHashPassword(updates.password);
      logger.debug("updateUser: Password hashed", {
        userId,
        originalLength: originalPassword.length,
        hashPrefix: updates.password.substring(0, 20),
      });
    }
    const result = await this.db.auth.updateUserAttributes(userId, updates, options);
    if (!result?.success) {
      throw error(500, "Failed to update user");
    }

    // No cache invalidation needed - we removed user-by-id and user-by-email caching
    // Session cache is the only cache, and it's invalidated by updateUserAttributes API
  }

  async deleteUser(userId: DatabaseId, options?: BaseQueryOptions): Promise<void> {
    // Get user first to clear email cache
    const user = await this.getUserById(userId, options);

    const result = await this.db.auth.deleteUser(userId, options);
    if (!result?.success) {
      throw error(500, "Failed to delete user");
    }

    // Invalidate all caches for this user
    const cacheKey = `user:id:${userId}`;
    await cacheService.delete(cacheKey, options?.tenantId);

    if (user?.email) {
      const emailCacheKey = `user:email:${user.email.toLowerCase()}`;
      await cacheService.delete(emailCacheKey, options?.tenantId);
    }
  }
  async getAllUsers(options?: PaginationOptions, dbOptions?: BaseQueryOptions): Promise<User[]> {
    const result = await this.db.auth.getAllUsers(options, dbOptions);
    if (result?.success) {
      return result.data;
    }
    return [];
  }

  async getUserCount(
    filter?: { tenantId?: DatabaseId | null },
    options?: BaseQueryOptions,
  ): Promise<number> {
    const result = await this.db.auth.getUserCount(filter, options);
    if (result?.success) {
      return result.data;
    }
    // Return -1 ("unknown"), NOT 0, on failure: a failed/early read must not be
    // mistaken for a genuine empty database (which would force the first-user/sign-up flow).
    return -1;
  }

  async createSession(
    sessionData: {
      user_id: DatabaseId;
      expires: ISODateString;
      tenantId?: DatabaseId | null;
    },
    _options?: BaseQueryOptions,
  ): Promise<Session> {
    const sr = (await this.db.auth.createSession(sessionData)) as unknown;
    let session: Session | null = null;
    if (
      sr &&
      typeof sr === "object" &&
      sr !== null &&
      "success" in (sr as Record<string, unknown>)
    ) {
      const sessionResult = sr as DatabaseResult<Session>;
      if (!sessionResult?.success) {
        throw error(500, "Session creation failed");
      }
      session = sessionResult.data;
    } else {
      session = sr as Session;
    }

    if (!session) {
      throw error(500, "Session creation failed");
    }

    const ur = (await this.db.auth.getUserById(sessionData.user_id, {
      tenantId: sessionData.tenantId,
    })) as unknown;
    let user: User | null = null;
    if (
      ur &&
      typeof ur === "object" &&
      ur !== null &&
      "success" in (ur as Record<string, unknown>)
    ) {
      const userResult = ur as DatabaseResult<User | null>;
      if (userResult?.success && userResult.data) {
        user = userResult.data;
      }
    } else {
      user = (ur as User) ?? null;
    }

    if (!user) {
      throw error(404, `User not found for ID: ${sessionData.user_id}`);
    }

    await this.sessionStore.set(session._id, user, sessionData.expires);
    return session;
  }

  async validateSession(sessionId: DatabaseId, options?: BaseQueryOptions): Promise<User | null> {
    const result = await this.db.auth.validateSession(sessionId, options);
    if (result?.success) {
      return result.data;
    }
    return null;
  }

  async destroySession(sessionId: DatabaseId, options?: BaseQueryOptions): Promise<void> {
    await this.db.auth.deleteSession(sessionId, options);
    await this.sessionStore.delete(sessionId);
  }

  async getSessionTokenData(
    sessionId: DatabaseId,
  ): Promise<{ expiresAt: ISODateString; user_id: DatabaseId } | null> {
    const result = await this.db.auth.getSessionTokenData(sessionId);
    if (result?.success) {
      return result.data;
    }
    return null;
  }

  async rotateToken(oldToken: string, expires: ISODateString): Promise<string> {
    // Try adapter-level rotation first
    if (this.db.auth.rotateToken) {
      const result = await this.db.auth.rotateToken(oldToken, expires);
      if (result?.success) return result.data;
    }

    // Fallback: generate new token, copy metadata from old, delete old
    const old = await this.getTokenByValue(oldToken);
    if (!old) throw error(404, "Token not found");

    const newToken = await this.createToken({
      user_id: old.user_id as DatabaseId,
      type: old.type || "access",
      expires: expires,
    });

    await this.db.auth.deleteTokens([old._id]);
    return newToken;
  }

  async getAllRoles(options?: BaseQueryOptions): Promise<Role[]> {
    return this.db.auth.getAllRoles(options);
  }

  async getAllTokens(filter?: { tenantId?: DatabaseId | null }): Promise<DatabaseResult<Token[]>> {
    const result = await this.db.auth.getAllTokens(filter);
    return result;
  }

  /**
   * Create a token for a user.
   * @param tokenData - Token creation data including user_id, expires, type, and optional tenantId
   * @returns The created token string
   */
  async createToken(tokenData: {
    user_id: DatabaseId;
    expires: ISODateString;
    type: string;
    tenantId?: DatabaseId | null;
  }): Promise<string> {
    // Get user email (required for token creation)
    const user = await this.getUserById(tokenData.user_id, {
      tenantId: tokenData.tenantId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const result = await this.db.auth.createToken({
      user_id: tokenData.user_id,
      email: user.email.toLowerCase(),
      expires: tokenData.expires,
      type: tokenData.type,
      tenantId: tokenData.tenantId,
    });

    if (typeof result === "string") {
      return result;
    }
    if (result?.success && typeof result.data === "string") {
      return result.data;
    }
    if (result && !result.success && result.error?.message) {
      throw new Error(result.error.message);
    }
    throw new Error("Failed to create token");
  }

  // Token management wrappers for interface completeness
  async updateToken(
    tokenId: DatabaseId,
    tokenData: Partial<Token>,
    options?: BaseQueryOptions,
  ): Promise<Token> {
    const result = await this.db.auth.updateToken(tokenId, tokenData, options);
    if (result?.success) {
      return result.data;
    }
    throw error(
      500,
      !result || result.success
        ? "Failed to update token"
        : result.message || "Failed to update token",
    );
  }

  async deleteTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<{ deletedCount: number }> {
    const result = await this.db.auth.deleteTokens(tokenIds, options);
    if (result?.success) {
      return result.data;
    }
    throw error(
      500,
      !result || result.success
        ? "Failed to delete tokens"
        : result.message || "Failed to delete tokens",
    );
  }

  async blockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.db.auth.blockTokens(tokenIds, options);
    if (result?.success) {
      return result.data;
    }
    throw error(
      500,
      !result || result.success
        ? "Failed to block tokens"
        : result.message || "Failed to block tokens",
    );
  }

  async unblockTokens(
    tokenIds: DatabaseId[],
    options?: BaseQueryOptions,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.db.auth.unblockTokens(tokenIds, options);
    if (result?.success) {
      return result.data;
    }
    throw error(
      500,
      !result || result.success
        ? "Failed to unblock tokens"
        : result.message || "Failed to unblock tokens",
    );
  }

  async getTokenByValue(token: string, options?: BaseQueryOptions): Promise<Token | null> {
    const result = await this.db.auth.getTokenByValue(token, options);
    if (result?.success) {
      return result.data;
    }
    throw error(
      500,
      !result || result.success ? "Failed to get token" : result.message || "Failed to get token",
    );
  }

  async validateToken(
    token: string,
    userId?: DatabaseId,
    type = "access",
    options?: BaseQueryOptions,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const result = await this.db.auth.validateToken(token, userId, type, options);
    if (result?.success && result.data) {
      return {
        success: true,
        message: result.data.message ?? "Token validated",
        data: result.data,
      };
    }
    return {
      success: false,
      message:
        !result || result.success
          ? "Token validation failed"
          : result.message || "Token validation failed",
    };
  }

  async validateRegistrationToken(
    token: string,
    options?: BaseQueryOptions,
  ): Promise<{ isValid: boolean; message: string; details?: Token }> {
    // Use the global standard 'invite-token' type
    const result = await this.db.auth.validateToken(token, undefined, "invite-token", options);

    if (result?.success && result.data && result.data.success) {
      const tokenDoc = result.data.details;
      return {
        isValid: true,
        message: result.data.message,
        details: tokenDoc ?? undefined,
      };
    }
    return {
      isValid: false,
      message:
        !result || result.success
          ? "Token validation failed"
          : result.message || "Token validation failed",
    };
  }

  async consumeToken(
    token: string,
    userId?: DatabaseId,
    type = "access",
    options?: BaseQueryOptions,
  ): Promise<{ status: boolean; message: string }> {
    const result = await this.db.auth.consumeToken(token, userId, type, options);
    if (result?.success) {
      return result.data;
    }
    return {
      status: false,
      message:
        !result || result.success
          ? "Failed to consume token"
          : result.message || "Failed to consume token",
    };
  }

  async consumeRegistrationToken(
    token: string,
    options?: BaseQueryOptions,
  ): Promise<{ status: boolean; message: string }> {
    // Attempt to consume using the global standard 'invite-token'
    const result = await this.db.auth.consumeToken(token, undefined, "invite-token", options);

    if (result?.success && result.data) {
      return result.data;
    }
    return {
      status: false,
      message:
        !result || result.success
          ? "Failed to consume token"
          : result.message || "Failed to consume token",
    };
  }
  async authenticate(
    email: string,
    password: string,
    tenantId?: DatabaseId | null,
    options?: { bypassTenantCheck?: boolean },
  ): Promise<{ user: User; sessionId: DatabaseId } | null> {
    try {
      const user = await this.getUserByEmail({ email, tenantId }, options);
      if (!user) {
        logger.debug("User not found for authentication", { email, tenantId });
        return null;
      }

      // --- ACCOUNT LOCKOUT CHECK ---
      if (user.lockoutUntil) {
        const lockoutDate = isoDateStringToDate(user.lockoutUntil);
        if (lockoutDate > new Date()) {
          const remainingMinutes = Math.ceil((lockoutDate.getTime() - Date.now()) / 60000);
          logger.warn("Authentication attempt on locked account", {
            email,
            lockoutUntil: user.lockoutUntil,
          });
          throw error(
            423,
            `Account is temporarily locked. Please try again in ${remainingMinutes} minutes.`,
          );
        }
        // Lockout expired, clear it
        await this.db.auth.updateUserAttributes(user._id, {
          lockoutUntil: null,
          failedAttempts: 0,
        });
      }

      if (!user.password) {
        logger.debug("User has no password field", {
          email,
          tenantId,
          userId: user._id,
        });
        return null;
      }

      const isValid = await cryptoVerifyPassword(user.password, password);

      logger.debug("Password verification result", { email, isValid });

      if (!isValid) {
        // --- FAILED ATTEMPT TRACKING ---
        const failedAttempts = (user.failedAttempts || 0) + 1;
        const updates: Partial<User> = { failedAttempts };

        if (failedAttempts >= 5) {
          // Lock for 15 minutes after 5 failures
          const lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
          updates.lockoutUntil = dateToISODateString(lockoutUntil);
          logger.error("Account locked due to multiple failed attempts", {
            email,
          });
        }

        await this.db.auth.updateUserAttributes(user._id, updates);
        logger.warn("Password authentication failed", {
          email,
          failedAttempts,
        });
        return null;
      }

      // --- SUCCESS: RESET LOCKOUT STATE ---
      if (user.failedAttempts || user.lockoutUntil) {
        await this.db.auth.updateUserAttributes(user._id, {
          failedAttempts: 0,
          lockoutUntil: null,
        });
      }

      const expiresAt = dateToISODateString(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours
      const session = await this.createSession(
        {
          user_id: user._id,
          expires: expiresAt,
          tenantId,
        },
        options,
      );

      await this.sessionStore.set(session._id, user, expiresAt);

      return { user, sessionId: session._id };
    } catch (err: any) {
      // Vite 8 dev-mode HMR cycle — non-fatal, retry will succeed
      if (err.message?.includes("module runner has been closed")) {
        logger.debug(
          `Auth: Vite module runner closed during authenticate (HMR cycle), returning null`,
        );
      } else {
        logger.error(`Authentication error: ${err.message}`);
      }
      return null;
    }
  }

  async logOut(sessionId: DatabaseId): Promise<void> {
    await this.destroySession(sessionId);
  }

  async checkUser(
    fields: {
      user_id?: DatabaseId;
      email?: string;
      samlId?: string;
      tenantId?: DatabaseId | null;
    },
    options?: { bypassTenantCheck?: boolean },
  ): Promise<User | null> {
    if (fields.samlId) {
      // Workaround for DB adapter missing native getBySamlId - search all users
      const result = await this.db.auth.getAllUsers({
        filter: { tenantId: fields.tenantId },
      });
      if (result?.success) {
        return result.data.find((u) => u.samlId === fields.samlId) || null;
      }
      return null;
    }
    if (fields.email) {
      const result = await this.db.auth.getUserByEmail(
        {
          email: fields.email,
          tenantId: fields.tenantId,
        },
        options,
      );
      if (result?.success) {
        return result.data;
      }
      return null;
    }
    if (fields.user_id) {
      const result = await this.db.auth.getUserById(fields.user_id, {
        ...options,
        tenantId: fields.tenantId,
      });
      if (result?.success) {
        return result.data;
      }
      return null;
    }
    return null;
  }

  async updateUserAttributes(
    userId: DatabaseId,
    attributes: Partial<User>,
    options?: BaseQueryOptions,
  ): Promise<User> {
    const isServer =
      typeof window === "undefined" || (typeof process !== "undefined" && process.versions != null);
    if (attributes.password && isServer) {
      attributes.password = await cryptoHashPassword(attributes.password);
    }
    if (attributes.email === null) {
      attributes.email = undefined;
    }
    const result = await this.db.auth.updateUserAttributes(userId, attributes, options);
    if (result?.success) {
      return result.data;
    }
    throw error(500, "Failed to update user attributes");
  }

  createSessionCookie(sessionId: DatabaseId): {
    name: string;
    value: string;
    attributes: unknown;
  } {
    return {
      name: SESSION_COOKIE_NAME,
      value: sessionId,
      attributes: {
        httpOnly: true,
        secure:
          process.env.NODE_ENV !== "development" &&
          process.env.NODE_ENV !== "test" &&
          process.env.TEST_MODE !== "true",
        sameSite: "strict",
        maxAge: 24 * 60 * 60,
        path: "/",
      },
    };
  }

  async invalidateAllUserSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
    currentSessionId?: DatabaseId,
  ): Promise<DatabaseId[]> {
    // 1. Get all active sessions for this user so we can clean L0/L1 caches
    const { data: activeSessions } = await this.getActiveSessions(userId, options);

    // 2. Delete each session from the session store (in-memory/Redis L0/L1)
    const invalidatedIds: DatabaseId[] = [];
    for (const session of activeSessions || []) {
      // Skip the current session if specified (keep the password-changer logged in)
      if (currentSessionId && session._id === currentSessionId) continue;
      await this.sessionStore.delete(session._id).catch(() => {});
      invalidatedIds.push(session._id);
    }

    // 3. Delete all user sessions from the database (L2)
    await this.db.auth.invalidateAllUserSessions(userId, options);

    return invalidatedIds;
  }

  async getActiveSessions(
    userId: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<{ success: boolean; data: Session[]; message?: string }> {
    try {
      const result = await this.db.auth.getActiveSessions(userId, options);
      if (result?.success) {
        return { success: true, data: result.data };
      }
      return {
        success: false,
        data: [],
        message: "Failed to retrieve active sessions",
      };
    } catch (err: any) {
      logger.error(`Error getting active sessions: ${err.message}`);
      return {
        success: false,
        data: [],
        message: err.message || "Unknown error",
      };
    }
  }

  async getAllActiveSessions(
    options?: BaseQueryOptions,
  ): Promise<{ success: boolean; data: Session[]; message?: string }> {
    try {
      const result = await this.db.auth.getAllActiveSessions(options);
      if (result?.success) {
        return { success: true, data: result.data };
      }
      return {
        success: false,
        data: [],
        message: "Failed to retrieve all active sessions",
      };
    } catch (err: any) {
      logger.error(`Error getting all active sessions: ${err.message}`);
      return {
        success: false,
        data: [],
        message: err.message || "Unknown error",
      };
    }
  }

  async updateUserPassword(
    email: string,
    password: string,
    options?: BaseQueryOptions,
    currentSessionId?: DatabaseId,
  ): Promise<{
    status: boolean;
    message?: string;
    invalidatedSessions?: DatabaseId[];
  }> {
    const user = await this.getUserByEmail({ email, tenantId: options?.tenantId }, options);
    if (!user) {
      return { status: false, message: "User not found" };
    }

    // We don't hash here because updateUser() handles hashing and validation
    await this.updateUser(user._id, { password }, options);

    // Invalidate all other sessions across all devices for security
    // Skip the current session so the password-changer stays logged in
    const invalidatedIds = await this.invalidateAllUserSessions(
      user._id,
      options,
      currentSessionId,
    );

    return { status: true, invalidatedSessions: invalidatedIds };
  }

  /**
   * Validates password strength based on enterprise standards.
   * - Minimum 8 characters (default, configurable via PASSWORD_MIN_LENGTH)
   * - Includes uppercase, lowercase, numbers, and special characters
   */
  private validatePasswordStrength(password: string): void {
    const minLength = (getPrivateSettingSync("PASSWORD_MIN_LENGTH") as number) || 8;
    if (password.length < minLength) {
      throw error(400, `Password must be at least ${minLength} characters long.`);
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!(hasUpper && hasLower && hasNumber && hasSpecial)) {
      throw error(
        400,
        "Password must contain uppercase, lowercase, numbers, and special characters.",
      );
    }
  }

  async createApiKey(
    apiKeyData: Partial<ApiKey>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey>> {
    return this.db.auth.createApiKey(apiKeyData, options);
  }

  async getApiKey(
    hash: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey | null>> {
    return this.db.auth.getApiKey(hash, options);
  }

  async getApiKeyById(
    id: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey | null>> {
    return this.db.auth.getApiKeyById(id, options);
  }

  async listApiKeys(
    filter?: { userId?: DatabaseId; tenantId?: DatabaseId | null },
    options?: { limit?: number; skip?: number },
  ): Promise<DatabaseResult<ApiKey[]>> {
    return this.db.auth.listApiKeys(filter, options);
  }

  async revokeApiKey(id: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    const existing = await this.db.auth.getApiKeyById(id, options);
    const result = await this.db.auth.revokeApiKey(id, options);
    if (result.success && existing.success && existing.data?.hash) {
      const { invalidateApiKeyAuth } = await import("./credential-auth-cache");
      await invalidateApiKeyAuth(String(id), options?.tenantId ?? null, existing.data.hash);
    }
    return result;
  }

  async updateApiKeyUsage(
    id: DatabaseId,
    ip?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.db.auth.updateApiKeyUsage(id, ip, options);
  }
}

// Utility functions for backwards compatibility and convenience
// All password operations use quantum-resistant Argon2id

/**
 * Hash a password using quantum-resistant Argon2id
 *
 * SECURITY: Uses Argon2id with memory-hard properties that resist quantum speedup
 * @param password - Plain text password to hash
 * @returns Promise resolving to hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return cryptoHashPassword(password);
}

/**
 * Verify password against hash using constant-time comparison
 *
 * SECURITY: Timing-safe verification prevents side-channel attacks
 * @param hash - Hashed password to compare against
 * @param password - Plain text password to verify
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return cryptoVerifyPassword(hash, password);
}

/**
 * @file src/databases/mongodb/methods/auth-composition.ts
 * @description Composition layer for MongoDB authentication adapters
 */

import type { Role, Session, User } from "@src/databases/auth/types";
import type {
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
  ISODateString,
  BaseQueryOptions,
} from "@src/databases/db-interface";
import { safeQuery } from "@src/utils/security/safe-query";
import mongoose, { type Connection } from "mongoose";
import { getOrCreateModel } from "../methods/mongodb-utils";
import { SessionAdapter } from "../models/auth-session";
import { TokenAdapter } from "../models/auth-token";
import { UserAdapter } from "../models/auth-user";

import { MongoAuthModelRegistrar } from "./auth-methods";

// Type helper to extract the auth interface from IDBAdapter
type AuthInterface = IDBAdapter["auth"];

/**
 * Helper to get or create the Role model idempotently.
 */
function getRoleModel(conn: Connection | typeof mongoose) {
  const schema = new mongoose.Schema<Role>(
    {
      _id: { type: String, required: true },
      tenantId: { type: String, required: true },
      name: { type: String, required: true },
      permissions: [{ type: String }],
      description: String,
      isNative: { type: Boolean, default: false },
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

export function composeMongoAuthAdapter(): AuthInterface {
  const userAdapter = new UserAdapter();
  const sessionAdapter = new SessionAdapter();
  const tokenAdapter = new TokenAdapter();
  const modelRegistrar = new MongoAuthModelRegistrar(mongoose);

  // Link adapters for cross-model validation (e.g. validateSession)
  userAdapter.setSessionAdapter(sessionAdapter);

  let activeConnection: any = mongoose;

  const adapter = {
    // Setup method
    setupAuthModels: async (connection?: any) => {
      activeConnection = connection || mongoose;
      userAdapter.setModel(activeConnection);
      sessionAdapter.setModel(activeConnection);
      tokenAdapter.setModel(activeConnection);
      await modelRegistrar.setupAuthModels(activeConnection);
    },

    // User Management Methods
    createUser: userAdapter.createUser.bind(userAdapter),
    updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
    deleteUser: userAdapter.deleteUser.bind(userAdapter),
    getUserById: userAdapter.getUserById.bind(userAdapter),
    getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
    getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
    getUserCount: userAdapter.getUserCount.bind(userAdapter),
    deleteUsers: userAdapter.deleteUsers.bind(userAdapter),
    blockUsers: userAdapter.blockUsers.bind(userAdapter),
    unblockUsers: userAdapter.unblockUsers.bind(userAdapter),

    // Combined Performance-Optimized Methods
    createUserAndSession: async (
      userData: Partial<User>,
      sessionData: { expires: ISODateString; tenantId?: DatabaseId | null },
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<{ user: User; session: Session }>> => {
      try {
        // NOTE: userData.password is hashed internally by userAdapter.createUser
        // No need to hash it here, otherwise we get double-hashing which breaks argon2 verify.

        const userResult = await userAdapter.createUser(userData, options);
        if (!userResult.success) {
          return userResult as any;
        }

        const sessionResult = await sessionAdapter.createSession({
          user_id: userResult.data._id,
          expires: sessionData.expires,
          tenantId: sessionData.tenantId,
        });

        if (!sessionResult.success) {
          await userAdapter.deleteUser(userResult.data._id, { tenantId: sessionData.tenantId });
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
    },

    deleteUserAndSessions: async (
      userId: DatabaseId,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> => {
      try {
        const tenantId = options?.tenantId;
        let deletedSessionCount = 0;
        const activeSessions = await sessionAdapter.getActiveSessions(userId, tenantId);
        if (activeSessions.success && activeSessions.data) {
          deletedSessionCount = activeSessions.data.length;
        }

        await sessionAdapter.invalidateAllUserSessions(userId, tenantId);
        const userResult = await userAdapter.deleteUser(userId, options);

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
    },

    // Session Management Methods
    createSession: sessionAdapter.createSession.bind(sessionAdapter),
    updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
    deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
    deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
    validateSession: userAdapter.validateSession.bind(userAdapter),
    invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
    getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),
    getAllActiveSessions: sessionAdapter.getAllActiveSessions.bind(sessionAdapter),
    getSessionTokenData: sessionAdapter.getSessionTokenData.bind(sessionAdapter),
    rotateToken: sessionAdapter.rotateToken.bind(sessionAdapter),

    // Token Management Methods
    createToken: tokenAdapter.createToken.bind(tokenAdapter),
    validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
    consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
    getTokenByValue: tokenAdapter.getTokenByValue.bind(tokenAdapter),
    getTokenById: tokenAdapter.getTokenById.bind(tokenAdapter),
    deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
    getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
    updateToken: tokenAdapter.updateToken.bind(tokenAdapter),
    deleteTokens: tokenAdapter.deleteTokens.bind(tokenAdapter),
    blockTokens: tokenAdapter.blockTokens.bind(tokenAdapter),
    unblockTokens: tokenAdapter.unblockTokens.bind(tokenAdapter),

    // Role Management Methods
    createRole: async (role: Role): Promise<DatabaseResult<Role>> => {
      try {
        const ROLE_MODEL = getRoleModel(activeConnection);
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
    },

    getAllRoles: async (options?: BaseQueryOptions): Promise<Role[]> => {
      try {
        const ROLE_MODEL = getRoleModel(activeConnection);
        const filter = safeQuery({}, options?.tenantId as string, {
          bypassTenantCheck: options?.bypassTenantCheck,
        });
        return await ROLE_MODEL.find(filter).lean<Role[]>();
      } catch {
        return [];
      }
    },

    getRoleById: async (
      roleId: DatabaseId,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<Role | null>> => {
      try {
        const ROLE_MODEL = getRoleModel(activeConnection);
        const filter = safeQuery({ _id: roleId } as any, options?.tenantId as string, {
          bypassTenantCheck: options?.bypassTenantCheck,
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
    },

    updateRole: async (
      roleId: DatabaseId,
      roleData: Partial<Role>,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<Role>> => {
      try {
        const ROLE_MODEL = getRoleModel(activeConnection);
        const filter = safeQuery({ _id: roleId } as any, options?.tenantId as string, {
          bypassTenantCheck: options?.bypassTenantCheck,
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
    },

    deleteRole: async (
      roleId: DatabaseId,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<void>> => {
      try {
        const ROLE_MODEL = getRoleModel(activeConnection);
        const filter = safeQuery({ _id: roleId } as any, options?.tenantId as string, {
          bypassTenantCheck: options?.bypassTenantCheck,
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
    },
  };

  return adapter as unknown as AuthInterface;
}

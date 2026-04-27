/**
 * @file src/databases/mongodb/models/auth-user.ts
 * @description MongoDB adapter for user-related operations.
 */

// Types
import type { User } from "@src/databases/auth/types";
// Adapter
import type {
  DatabaseId,
  DatabaseResult,
  PaginationOptions,
  BaseQueryOptions,
} from "@src/databases/db-interface";
import {
  generateId,
  getOrCreateModel,
  createDatabaseError,
} from "@src/databases/mongodb/methods/mongodb-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import { toISOString } from "@src/utils/date-utils";

// Define the User schema
export const UserSchema = new Schema(
  {
    _id: { type: String, required: true }, // UUID as primary key
    email: { type: String, required: true, unique: true }, // User's email, required field
    tenantId: { type: String }, // Tenant identifier for multi-tenancy
    password: { type: String }, // User's password
    role: { type: String, required: true }, // User's role
    permissions: [{ type: String }], // User-specific permissions
    username: String,
    firstName: String,
    lastName: String,
    locale: String,
    avatar: String,
    lastAuthMethod: String,
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    isRegistered: Boolean,
    failedAttempts: { type: Number, default: 0 },
    blocked: Boolean,
    isAdmin: Boolean,
    emailVerified: Boolean,
    resetRequestedAt: { type: Date },
    resetToken: String,
    lockoutUntil: { type: Date },
    is2FAEnabled: Boolean,
    totpSecret: String,
    backupCodes: [String],
    last2FAVerification: { type: Date },
  },
  {
    timestamps: true,
    collection: "auth_users",
    _id: false,
  },
);

// --- Indexes ---
UserSchema.index({ tenantId: 1, email: 1 });
UserSchema.index({ tenantId: 1, role: 1, blocked: 1 });
UserSchema.index({ tenantId: 1, username: 1 }, { sparse: true });

/**
 * UserAdapter class handles all user-related database operations.
 */
export class UserAdapter {
  private _UserModel: Model<User> | null = null;
  private _sessionAdapter: any | null = null;
  private _activeConnection: any = mongoose;

  private get UserModel(): Model<User> {
    if (!this._UserModel) {
      this._UserModel = getOrCreateModel(this._activeConnection, "auth_users", UserSchema);
    }
    return this._UserModel;
  }

  /**
   * Explicitly set the model using a specific connection to support isolated adapters.
   */
  public setModel(conn: any) {
    this._activeConnection = conn || mongoose;
    this._UserModel = getOrCreateModel(this._activeConnection, "auth_users", UserSchema);
  }

  /**
   * Set the session adapter for session validation.
   */
  public setSessionAdapter(adapter: any) {
    this._sessionAdapter = adapter;
  }

  private mapUser(user: any): User {
    if (!user) return user as unknown as User;
    const result = { ...user };
    result._id = (result._id as string | { toString(): string }).toString();

    // Convert all date fields to ISO strings
    const dateFields = [
      "lastActiveAt",
      "expiresAt",
      "resetRequestedAt",
      "lockoutUntil",
      "last2FAVerification",
      "createdAt",
      "updatedAt",
    ];
    for (const field of dateFields) {
      if (result[field]) result[field] = toISOString(result[field]);
    }

    // Booleans
    result.isRegistered = !!result.isRegistered;
    result.blocked = !!result.blocked;
    result.isAdmin = !!result.isAdmin;
    result.emailVerified = !!result.emailVerified;

    // Strip internal Mongoose fields
    const { __v, ...cleanResult } = result;

    if (cleanResult.permissions && Array.isArray(cleanResult.permissions)) {
      cleanResult.permissions = cleanResult.permissions.map((p: any) => String(p));
    }

    return cleanResult as User;
  }

  constructor() {}

  async createUser(
    userData: Partial<User>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User>> {
    try {
      const normalizedData = { ...userData, email: userData.email?.toLowerCase() };

      // Ensure password is hashed if provided and not already hashed
      if (normalizedData.password && !normalizedData.password.startsWith("$argon2")) {
        const { hashPassword } = await import("@src/utils/password");
        normalizedData.password = await hashPassword(normalizedData.password);
      }

      // safeQuery used for validation side-effects as per documentation requirement
      safeQuery({}, userData.tenantId as string, { bypassTenantCheck: options.bypassTenantCheck });

      const userId = generateId();
      const Model = this.UserModel;
      const user = new Model({ ...normalizedData, _id: userId });
      await user.save();

      return { success: true, data: this.mapUser(user.toObject()) };
    } catch (err) {
      const message = "Error creating user";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "CREATE_USER_ERROR", message),
      };
    }
  }

  async updateUserAttributes(
    userId: DatabaseId,
    userData: Partial<User>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User>> {
    try {
      const normalizedData = { ...userData };
      if (normalizedData.email) {
        normalizedData.email = normalizedData.email.toLowerCase();
      }

      // Ensure password is hashed if provided and not already hashed
      if (normalizedData.password && !normalizedData.password.startsWith("$argon2")) {
        const { hashPassword } = await import("@src/utils/password");
        normalizedData.password = await hashPassword(normalizedData.password);
      }

      const filter = safeQuery({ _id: userId } as any, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });

      const user = await this.UserModel.findOneAndUpdate(filter, normalizedData, {
        returnDocument: "after",
      }).lean();

      if (!user) {
        return {
          success: false,
          message: "User not found",
          error: { code: "USER_NOT_FOUND", message: "User not found" },
        };
      }

      return { success: true, data: this.mapUser(user) };
    } catch (err) {
      const message = "Error updating user";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "UPDATE_USER_ERROR", message),
      };
    }
  }

  async getAllUsers(
    options: PaginationOptions = {},
    dbOptions: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User[]>> {
    try {
      const filter = safeQuery({}, dbOptions.tenantId as string, {
        bypassTenantCheck: dbOptions.bypassTenantCheck,
      });
      let query = this.UserModel.find(filter).lean();

      if (options.sortField) {
        query = query.sort({ [options.sortField]: options.sortDirection === "desc" ? -1 : 1 });
      }

      if (options.pageSize) {
        query = query.limit(options.pageSize);
        if (options.page) query = query.skip((options.page - 1) * options.pageSize);
      }

      const [users, total] = await Promise.all([
        query.exec(),
        this.UserModel.countDocuments(filter),
      ]);

      return { success: true, data: users.map((u) => this.mapUser(u)), meta: { total } } as any;
    } catch (err) {
      const message = "Error fetching users";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "GET_ALL_USERS_ERROR", message),
      };
    }
  }

  async getUserCount(
    filter: any = {},
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<number>> {
    try {
      const safeFilter = safeQuery(filter, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });
      const count = await this.UserModel.countDocuments(safeFilter);
      return { success: true, data: count };
    } catch (err) {
      const message = "Error counting users";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "GET_USER_COUNT_ERROR", message),
      };
    }
  }

  async blockUsers(
    userIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const filter = safeQuery({ _id: { $in: userIds } } as any, tenantId as string);

      const result = await this.UserModel.updateMany(filter, {
        blocked: true,
        lockoutUntil: new Date(),
      });
      return { success: true, data: { modifiedCount: result.modifiedCount } };
    } catch (err) {
      const message = "Error blocking users";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "BLOCK_USERS_ERROR", message),
      };
    }
  }

  async unblockUsers(
    userIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const filter = safeQuery({ _id: { $in: userIds } } as any, tenantId as string);

      const result = await this.UserModel.updateMany(filter, {
        blocked: false,
        lockoutUntil: null,
      });
      return { success: true, data: { modifiedCount: result.modifiedCount } };
    } catch (err) {
      const message = "Error unblocking users";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "UNBLOCK_USERS_ERROR", message),
      };
    }
  }

  async deleteUser(
    userId: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<void>> {
    try {
      const filter = safeQuery({ _id: userId } as any, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });
      const result = await this.UserModel.findOneAndDelete(filter);
      if (!result) {
        return {
          success: false,
          message: "User not found or access denied",
          error: { code: "USER_NOT_FOUND", message: "User not found" },
        };
      }
      return { success: true, data: undefined };
    } catch (err) {
      const message = "Error deleting user";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "DELETE_USER_ERROR", message),
      };
    }
  }

  async deleteUsers(
    userIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      const filter = safeQuery({ _id: { $in: userIds } } as any, tenantId as string);
      const result = await this.UserModel.deleteMany(filter);
      return { success: true, data: { deletedCount: result.deletedCount } };
    } catch (err) {
      const message = "Error deleting users";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "DELETE_USERS_ERROR", message),
      };
    }
  }

  async getUserById(
    userId: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User | null>> {
    try {
      const filter = safeQuery({ _id: userId } as any, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });
      const user = await this.UserModel.findOne(filter).lean();
      return { success: true, data: user ? this.mapUser(user) : null };
    } catch (err) {
      const message = "Error fetching user by ID";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "GET_USER_BY_ID_ERROR", message),
      };
    }
  }

  async getUserByEmail(
    criteria: { email: string; tenantId?: DatabaseId | null },
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User | null>> {
    try {
      const filter = safeQuery(
        { email: criteria.email.toLowerCase() } as any,
        criteria.tenantId as string,
        {
          bypassTenantCheck: options.bypassTenantCheck,
        },
      );
      const user = await this.UserModel.findOne(filter).lean();
      return { success: true, data: user ? this.mapUser(user) : null };
    } catch (err) {
      const message = "Error fetching user by email";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "GET_USER_BY_EMAIL_ERROR", message),
      };
    }
  }

  async validateSession(sessionId: DatabaseId): Promise<DatabaseResult<User | null>> {
    try {
      const SessionModel =
        this._sessionAdapter?.SessionModel ||
        this._activeConnection?.models?.auth_sessions ||
        mongoose.models.auth_sessions;

      if (!SessionModel) {
        throw new Error("Session model (auth_sessions) not registered");
      }

      const session = await SessionModel.findById(sessionId).lean();
      if (!session || !session.expires || new Date(session.expires as any) < new Date()) {
        return { success: true, data: null };
      }
      const user = await this.UserModel.findById(session.user_id).lean();
      return { success: true, data: user ? this.mapUser(user) : null };
    } catch (err) {
      const message = "Session validation failed";
      return {
        success: false,
        message,
        error: createDatabaseError(err, "AUTH_ERROR", message),
      };
    }
  }
}

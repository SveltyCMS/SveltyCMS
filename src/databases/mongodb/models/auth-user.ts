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
import { generateId } from "@src/databases/mongodb/methods/mongodb-utils";
import { safeQuery } from "@src/utils/security/safe-query";
// System Logging
import { logger } from "@utils/logger";
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
  private readonly UserModel: Model<User>;

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

    if (result.permissions && Array.isArray(result.permissions)) {
      result.permissions = result.permissions.map((p: any) => String(p));
    }

    return result as User;
  }

  constructor() {
    this.UserModel = mongoose.models?.auth_users || mongoose.model<User>("auth_users", UserSchema);
  }

  async createUser(
    userData: Partial<User>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User>> {
    try {
      const normalizedData = { ...userData, email: userData.email?.toLowerCase() };
      safeQuery({}, userData.tenantId as string, { bypassTenantCheck: options.bypassTenantCheck });

      const userId = generateId();
      const user = new this.UserModel({ ...normalizedData, _id: userId });
      await user.save();

      return { success: true, data: this.mapUser(user.toObject()) };
    } catch (err) {
      const message = `Error creating user: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "CREATE_USER_ERROR", message } };
    }
  }

  async updateUserAttributes(
    userId: DatabaseId,
    userData: Partial<User>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<User>> {
    try {
      const filter = safeQuery({ _id: userId } as any, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });

      const user = await this.UserModel.findOneAndUpdate(filter, userData, {
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
      const message = `Error updating user: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "UPDATE_USER_ERROR", message } };
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

      const users = await query.exec();
      return { success: true, data: users.map((u) => this.mapUser(u)) };
    } catch (err) {
      const message = `Error fetching users: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "GET_ALL_USERS_ERROR", message } };
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
      const message = `Error counting users: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "GET_USER_COUNT_ERROR", message } };
    }
  }

  async blockUsers(
    userIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const filter: any = { _id: { $in: userIds } };
      if (tenantId) filter.tenantId = tenantId;

      const result = await this.UserModel.updateMany(filter, {
        blocked: true,
        lockoutUntil: new Date(),
      });
      return { success: true, data: { modifiedCount: result.modifiedCount } };
    } catch (err) {
      const message = `Error blocking users: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "BLOCK_USERS_ERROR", message } };
    }
  }

  async unblockUsers(
    userIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const filter: any = { _id: { $in: userIds } };
      if (tenantId) filter.tenantId = tenantId;

      const result = await this.UserModel.updateMany(filter, {
        blocked: false,
        lockoutUntil: null,
      });
      return { success: true, data: { modifiedCount: result.modifiedCount } };
    } catch (err) {
      const message = `Error unblocking users: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "UNBLOCK_USERS_ERROR", message } };
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
      await this.UserModel.findOneAndDelete(filter);
      return { success: true, data: undefined };
    } catch (err) {
      const message = `Error deleting user: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "DELETE_USER_ERROR", message } };
    }
  }

  async deleteUsers(
    userIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      const filter: any = { _id: { $in: userIds } };
      if (tenantId) filter.tenantId = tenantId;
      const result = await this.UserModel.deleteMany(filter);
      return { success: true, data: { deletedCount: result.deletedCount } };
    } catch (err) {
      const message = `Error deleting users: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "DELETE_USERS_ERROR", message } };
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
      const message = `Error fetching user by ID: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "GET_USER_BY_ID_ERROR", message } };
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
      const message = `Error fetching user by email: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      return { success: false, message, error: { code: "GET_USER_BY_EMAIL_ERROR", message } };
    }
  }

  async validateSession(sessionId: DatabaseId): Promise<DatabaseResult<User | null>> {
    try {
      const SessionModel = mongoose.models.auth_sessions;
      const session = await SessionModel.findById(sessionId).lean();
      if (!session || new Date(session.expires as any) < new Date()) {
        return { success: true, data: null };
      }
      const user = await this.UserModel.findById(session.user_id).lean();
      return { success: true, data: user ? this.mapUser(user) : null };
    } catch {
      return {
        success: false,
        message: "Session validation failed",
        error: { code: "AUTH_ERROR", message: "Error" },
      };
    }
  }
}

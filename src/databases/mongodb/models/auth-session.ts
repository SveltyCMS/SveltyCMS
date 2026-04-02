/**
 * @file src/databases/mongodb/models/auth-session.ts
 * @description MongoDB adapter for session-related operations.
 */

import type { Session } from "@src/databases/auth/types";
import type { DatabaseId, DatabaseResult, ISODateString } from "@src/databases/db-interface";
import mongoose, { Schema, type Model } from "mongoose";
import { generateId } from "../methods/mongodb-utils";

export const SessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    expires: { type: Date, required: true },
    user_id: { type: String, required: true, ref: "auth_users" },
    tenantId: { type: String },
    rotated: Boolean,
    rotatedTo: String,
  },
  {
    timestamps: true,
    collection: "auth_sessions",
    _id: false,
  },
);

SessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ user_id: 1 });
SessionSchema.index({ tenantId: 1 });

export class SessionAdapter {
  private readonly SessionModel: Model<Session>;

  constructor() {
    this.SessionModel =
      mongoose.models.auth_sessions || mongoose.model<Session>("auth_sessions", SessionSchema);
  }

  async createSession(data: {
    user_id: DatabaseId;
    expires: ISODateString;
    tenantId?: DatabaseId | null;
  }): Promise<DatabaseResult<Session>> {
    try {
      const session = new this.SessionModel({
        ...data,
        _id: generateId(),
      });
      await session.save();
      return { success: true, data: session.toObject() };
    } catch (err) {
      return {
        success: false,
        message: "Session creation failed",
        error: { code: "SESSION_CREATE_ERROR", message: String(err) },
      };
    }
  }

  async validateSession(sessionId: DatabaseId): Promise<DatabaseResult<Session | null>> {
    try {
      const session = await this.SessionModel.findById(sessionId).lean();
      if (!session || new Date(session.expires) < new Date()) {
        return { success: true, data: null };
      }
      return { success: true, data: session as Session };
    } catch (err) {
      return {
        success: false,
        message: "Session validation failed",
        error: { code: "SESSION_VALIDATE_ERROR", message: String(err) },
      };
    }
  }

  async deleteSession(sessionId: DatabaseId): Promise<DatabaseResult<void>> {
    try {
      await this.SessionModel.findByIdAndDelete(sessionId);
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        message: "Session deletion failed",
        error: { code: "SESSION_DELETE_ERROR", message: String(err) },
      };
    }
  }

  async updateSessionExpiry(
    sessionId: DatabaseId,
    newExpiry: ISODateString,
  ): Promise<DatabaseResult<Session>> {
    try {
      const session = await this.SessionModel.findByIdAndUpdate(
        sessionId,
        { expires: newExpiry },
        { new: true },
      ).lean();
      if (!session) {
        throw new Error("Session not found");
      }
      return { success: true, data: session as Session };
    } catch (err) {
      return {
        success: false,
        message: "Session update failed",
        error: { code: "SESSION_UPDATE_ERROR", message: String(err) },
      };
    }
  }

  async invalidateAllUserSessions(
    userId: DatabaseId,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<void>> {
    try {
      const filter: any = { user_id: userId };
      if (tenantId) filter.tenantId = tenantId;
      await this.SessionModel.deleteMany(filter);
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        message: "Session invalidation failed",
        error: { code: "SESSION_INVALIDATE_ERROR", message: String(err) },
      };
    }
  }

  async getActiveSessions(
    userId: DatabaseId,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Session[]>> {
    try {
      const filter: any = { user_id: userId, expires: { $gt: new Date() } };
      if (tenantId) filter.tenantId = tenantId;
      const sessions = await this.SessionModel.find(filter).lean();
      return { success: true, data: sessions as Session[] };
    } catch (err) {
      return {
        success: false,
        message: "Failed to get active sessions",
        error: { code: "SESSION_GET_ERROR", message: String(err) },
      };
    }
  }

  async getAllActiveSessions(tenantId?: DatabaseId | null): Promise<DatabaseResult<Session[]>> {
    try {
      const filter: any = { expires: { $gt: new Date() } };
      if (tenantId) filter.tenantId = tenantId;
      const sessions = await this.SessionModel.find(filter).lean();
      return { success: true, data: sessions as Session[] };
    } catch (err) {
      return {
        success: false,
        message: "Failed to get active sessions",
        error: { code: "SESSION_GET_ERROR", message: String(err) },
      };
    }
  }

  async getSessionTokenData(
    sessionId: DatabaseId,
  ): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: DatabaseId } | null>> {
    try {
      const session = await this.SessionModel.findById(sessionId).lean();
      if (!session) return { success: true, data: null };
      return {
        success: true,
        data: {
          expiresAt: (session.expires as any).toISOString(),
          user_id: session.user_id as DatabaseId,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: "Failed to get session data",
        error: { code: "SESSION_GET_ERROR", message: String(err) },
      };
    }
  }

  async rotateToken(oldToken: string, _expires: ISODateString): Promise<DatabaseResult<string>> {
    // Placeholder implementation
    return { success: true, data: oldToken };
  }

  async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
    try {
      const res = await this.SessionModel.deleteMany({ expires: { $lt: new Date() } });
      return { success: true, data: res.deletedCount };
    } catch (err) {
      return {
        success: false,
        message: "Failed to delete expired sessions",
        error: { code: "SESSION_CLEANUP_ERROR", message: String(err) },
      };
    }
  }
}

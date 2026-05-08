/**
 * @file src/databases/mongodb/models/auth-session.ts
 * @description MongoDB adapter for session-related operations.
 */

import type { Session } from "@src/databases/auth/types";
import type { DatabaseId, DatabaseResult, ISODateString } from "@src/databases/db-interface";
import mongoose, { Schema, type Model } from "mongoose";
import { generateId, getOrCreateModel, convertMongoSessionToISO } from "./mongodb-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import { logger } from "@src/utils/logger";

export const SessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    expires: { type: Date, required: true },
    user_id: { type: String, required: true, ref: "auth_users" },
    tenantId: { type: String },
    rotated: { type: Boolean, default: false },
    rotatedTo: { type: String },
    lastActiveAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "auth_sessions",
    _id: false,
  },
);

SessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ user_id: 1, tenantId: 1 });
SessionSchema.index({ tenantId: 1 });
SessionSchema.index({ rotated: 1 });

export class SessionAdapter {
  private _SessionModel: Model<Session> | null = null;

  private get SessionModel(): Model<Session> {
    if (!this._SessionModel) {
      this._SessionModel = getOrCreateModel(mongoose, "auth_sessions", SessionSchema);
    }
    return this._SessionModel;
  }

  /**
   * Explicitly set the model using a specific connection to support isolated adapters.
   */
  public setModel(conn: any) {
    this._SessionModel = getOrCreateModel(conn, "auth_sessions", SessionSchema);
  }

  constructor() {}

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

      const sessionObj = session.toObject();
      return { success: true, data: this.mapSession(sessionObj) };
    } catch (err) {
      const message = "Session creation failed";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "SESSION_CREATE_ERROR", message },
      };
    }
  }

  private mapSession(session: any): Session {
    return convertMongoSessionToISO(session) as Session;
  }

  async validateSession(sessionId: DatabaseId): Promise<DatabaseResult<Session | null>> {
    try {
      // Atomic findOneAndUpdate to refresh lastActiveAt and fix TOCTOU race condition
      const filter: any = {
        _id: sessionId,
        expires: { $gt: new Date() },
        rotated: { $ne: true }, // Ensure session hasn't been rotated away
      };

      const sessionData = await this.SessionModel.findOneAndUpdate(
        filter,
        { $set: { lastActiveAt: new Date() } },
        { returnDocument: "after", lean: true },
      );

      if (!sessionData) {
        return { success: true, data: null };
      }
      return { success: true, data: this.mapSession(sessionData) };
    } catch (err) {
      const message = "Session validation failed";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "SESSION_VALIDATE_ERROR", message },
      };
    }
  }

  async deleteSession(sessionId: DatabaseId, tenantId?: string): Promise<DatabaseResult<void>> {
    try {
      const filter = safeQuery({ _id: sessionId } as any, tenantId as string);
      const result = await this.SessionModel.findOneAndDelete(filter);
      if (!result) {
        return {
          success: false,
          message: "Session not found",
          error: { code: "SESSION_NOT_FOUND", message: "Session not found" },
        };
      }
      return { success: true, data: undefined };
    } catch (err) {
      const message = "Session deletion failed";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "SESSION_DELETE_ERROR", message },
      };
    }
  }

  async updateSessionExpiry(
    sessionId: DatabaseId,
    newExpiry: ISODateString,
    tenantId?: string,
  ): Promise<DatabaseResult<Session>> {
    try {
      const filter = safeQuery({ _id: sessionId } as any, tenantId as string);
      const session = await this.SessionModel.findOneAndUpdate(
        filter,
        { expires: new Date(newExpiry) },
        { returnDocument: "after", lean: true },
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

  async getAllActiveSessions(tenantId: string): Promise<DatabaseResult<Session[]>> {
    try {
      const filter = safeQuery({ expires: { $gt: new Date() } } as any, tenantId);
      const sessions = await this.SessionModel.find(filter).lean();
      return { success: true, data: sessions.map((s) => this.mapSession(s)) };
    } catch (err) {
      const message = "Failed to get all active sessions";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "SESSION_GET_ERROR", message },
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
          expiresAt: new Date(session.expires).toISOString() as ISODateString,
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

  async rotateToken(
    oldSessionId: DatabaseId,
    expiresAt: ISODateString,
    tenantId?: string,
  ): Promise<DatabaseResult<string>> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const filter = safeQuery(
        { _id: oldSessionId, rotated: { $ne: true } } as any,
        tenantId as string,
      );
      const oldSession = await this.SessionModel.findOne(filter).session(session).lean();

      if (!oldSession) {
        throw new Error("Original session not found or already rotated");
      }

      const newId = generateId();

      // Mark old as rotated
      await this.SessionModel.updateOne(
        { _id: oldSessionId },
        { $set: { rotated: true, rotatedTo: newId } },
        { session },
      );

      // Create new session
      const Model = this.SessionModel;
      const newSession = new Model({
        _id: newId,
        user_id: oldSession.user_id,
        tenantId: oldSession.tenantId,
        expires: new Date(expiresAt),
      });
      await newSession.save({ session });

      await session.commitTransaction();
      return { success: true, data: newId };
    } catch (err) {
      await session.abortTransaction();
      const message = `Token rotation failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "SESSION_ROTATE_ERROR", message },
      };
    } finally {
      session.endSession();
    }
  }

  async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
    try {
      const res = await this.SessionModel.deleteMany({ expires: { $lt: new Date() } } as any);
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

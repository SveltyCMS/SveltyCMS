/**
 * @file src/databases/mongodb/models/auth-token.ts
 * @description MongoDB adapter for token-related operations.
 */

import type { Token } from "@src/databases/auth/types";
import type { DatabaseId, DatabaseResult, ISODateString } from "@src/databases/db-interface";
import mongoose, { Schema, type Model } from "mongoose";
import { generateId, getOrCreateModel } from "../methods/mongodb-utils";
import { generateRandomToken } from "@src/databases/auth/constants";
import { safeQuery } from "@src/utils/security/safe-query";
import { logger } from "@src/utils/logger";

export const TokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    user_id: { type: String, required: true, ref: "auth_users" },
    email: { type: String, required: true },
    type: { type: String, required: true },
    expires: { type: Date, required: true },
    tenantId: { type: String },
    blocked: { type: Boolean, default: false },
    role: String,
    username: String,
  },
  {
    timestamps: true,
    collection: "auth_tokens",
    _id: false,
  },
);

// TokenSchema.index({ token: 1 }); // Redundant, already part of unique: true in schema
TokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
TokenSchema.index({ tenantId: 1 });

export class TokenAdapter {
  private _TokenModel: Model<Token> | null = null;

  private get TokenModel(): Model<Token> {
    if (!this._TokenModel) {
      this._TokenModel = getOrCreateModel(mongoose, "auth_tokens", TokenSchema);
    }
    return this._TokenModel;
  }

  /**
   * Explicitly set the model using a specific connection to support isolated adapters.
   */
  public setModel(conn: any) {
    this._TokenModel = getOrCreateModel(conn, "auth_tokens", TokenSchema);
  }

  constructor() {}

  async createToken(data: {
    user_id: DatabaseId;
    email: string;
    expires: ISODateString;
    type: string;
    tenantId?: DatabaseId | null;
    role?: string;
  }): Promise<DatabaseResult<string>> {
    try {
      const tokenValue = generateRandomToken(32);
      const Model = this.TokenModel;
      const token = new Model({
        ...data,
        email: data.email.toLowerCase(),
        token: tokenValue,
        _id: generateId(),
      });
      await token.save();
      return { success: true, data: tokenValue };
    } catch (err) {
      const message = "Token creation failed";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "TOKEN_CREATE_ERROR", message },
      };
    }
  }

  async validateToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ email: string }>> {
    try {
      const filter = safeQuery({ token } as any, tenantId as string);
      if (userId) filter.user_id = userId;
      if (type) filter.type = type;

      const found = await this.TokenModel.findOne(filter).lean();
      if (!found || found.blocked || new Date(found.expires) < new Date()) {
        return {
          success: false,
          message: "Invalid or expired token",
          error: { code: "TOKEN_INVALID", message: "Token not found or expired" },
        };
      }
      return { success: true, data: { email: found.email } };
    } catch (err) {
      const message = "Token validation error";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "TOKEN_VALIDATE_ERROR", message },
      };
    }
  }

  async consumeToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<void>> {
    try {
      // Atomic findOneAndDelete fixes TOCTOU race condition
      const filter = safeQuery({ token } as any, tenantId as string);
      if (userId) filter.user_id = userId;
      if (type) filter.type = type;

      const found = await this.TokenModel.findOneAndDelete(filter).lean();

      if (!found || found.blocked || new Date(found.expires) < new Date()) {
        return {
          success: false,
          message: "Invalid or expired token",
          error: { code: "TOKEN_INVALID", message: "Token not found or expired" },
        };
      }

      return { success: true, data: undefined };
    } catch (err) {
      const message = "Token consumption error";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "TOKEN_CONSUME_ERROR", message },
      };
    }
  }

  async getTokenByValue(
    token: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Token | null>> {
    try {
      const filter: any = { token };
      if (tenantId) filter.tenantId = tenantId;
      const found = await this.TokenModel.findOne(filter).lean();
      return { success: true, data: found as Token | null };
    } catch (err) {
      return {
        success: false,
        message: "Error getting token",
        error: { code: "TOKEN_GET_ERROR", message: String(err) },
      };
    }
  }

  async getTokenById(
    tokenId: DatabaseId,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Token | null>> {
    try {
      const filter: any = { _id: tokenId };
      if (tenantId) filter.tenantId = tenantId;
      const found = await this.TokenModel.findOne(filter).lean();
      return { success: true, data: found as Token | null };
    } catch (err) {
      return {
        success: false,
        message: "Error getting token",
        error: { code: "TOKEN_GET_ERROR", message: String(err) },
      };
    }
  }

  async getAllTokens(tenantId: string, filter: any = {}): Promise<DatabaseResult<Token[]>> {
    try {
      const safeFilter = safeQuery(filter, tenantId);
      const tokens = await this.TokenModel.find(safeFilter).lean();
      return { success: true, data: tokens as Token[] };
    } catch (err) {
      const message = "Error getting tokens";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "TOKEN_GET_ERROR", message },
      };
    }
  }

  async updateToken(
    tokenId: DatabaseId,
    tokenData: Partial<Token>,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Token>> {
    try {
      const filter = safeQuery({ _id: tokenId } as any, tenantId as string);

      // Prevent token value from being updated
      const { token: _, ...validUpdates } = tokenData;

      const res = await this.TokenModel.findOneAndUpdate(filter, validUpdates, {
        returnDocument: "after",
      }).lean();
      if (!res) throw new Error("Token not found");
      return { success: true, data: res as Token };
    } catch (err) {
      const message = "Error updating token";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "TOKEN_UPDATE_ERROR", message },
      };
    }
  }

  async deleteTokens(
    tokenIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      const filter: any = { _id: { $in: tokenIds } };
      if (tenantId) filter.tenantId = tenantId;
      const res = await this.TokenModel.deleteMany(filter);
      return { success: true, data: { deletedCount: res.deletedCount } };
    } catch (err) {
      return {
        success: false,
        message: "Error deleting tokens",
        error: { code: "TOKEN_DELETE_ERROR", message: String(err) },
      };
    }
  }

  async blockTokens(
    tokenIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const filter: any = { _id: { $in: tokenIds } };
      if (tenantId) filter.tenantId = tenantId;
      const res = await this.TokenModel.updateMany(filter, { blocked: true });
      return { success: true, data: { modifiedCount: res.modifiedCount } };
    } catch (err) {
      return {
        success: false,
        message: "Error blocking tokens",
        error: { code: "TOKEN_BLOCK_ERROR", message: String(err) },
      };
    }
  }

  async unblockTokens(
    tokenIds: DatabaseId[],
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const filter: any = { _id: { $in: tokenIds } };
      if (tenantId) filter.tenantId = tenantId;
      const res = await this.TokenModel.updateMany(filter, { blocked: false });
      return { success: true, data: { modifiedCount: res.modifiedCount } };
    } catch (err) {
      return {
        success: false,
        message: "Error unblocking tokens",
        error: { code: "TOKEN_UNBLOCK_ERROR", message: String(err) },
      };
    }
  }

  async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
    try {
      const res = await this.TokenModel.deleteMany({ expires: { $lt: new Date() } } as any);
      return { success: true, data: res.deletedCount };
    } catch (err) {
      return {
        success: false,
        message: "Error deleting expired tokens",
        error: { code: "TOKEN_CLEANUP_ERROR", message: String(err) },
      };
    }
  }
}

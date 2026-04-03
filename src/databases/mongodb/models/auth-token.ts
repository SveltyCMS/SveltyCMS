/**
 * @file src/databases/mongodb/models/auth-token.ts
 * @description MongoDB adapter for token-related operations.
 */

import type { Token } from "@src/databases/auth/types";
import type { DatabaseId, DatabaseResult, ISODateString } from "@src/databases/db-interface";
import mongoose, { Schema, type Model } from "mongoose";
import { generateId } from "../methods/mongodb-utils";
import { generateRandomToken } from "@src/databases/auth/constants";

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

TokenSchema.index({ token: 1 });
TokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
TokenSchema.index({ tenantId: 1 });

export class TokenAdapter {
  private readonly TokenModel: Model<Token>;

  constructor() {
    this.TokenModel =
      mongoose.models.auth_tokens || mongoose.model<Token>("auth_tokens", TokenSchema);
  }

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
      const token = new this.TokenModel({
        ...data,
        token: tokenValue,
        _id: generateId(),
      });
      await token.save();
      return { success: true, data: tokenValue };
    } catch (err) {
      return {
        success: false,
        message: "Token creation failed",
        error: { code: "TOKEN_CREATE_ERROR", message: String(err) },
      };
    }
  }

  async validateToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
    try {
      const filter: any = { token };
      if (userId) filter.user_id = userId;
      if (type) filter.type = type;
      if (tenantId) filter.tenantId = tenantId;

      const found = await this.TokenModel.findOne(filter).lean();
      if (!found || found.blocked || new Date(found.expires) < new Date()) {
        return { success: true, data: { success: false, message: "Invalid or expired token" } };
      }
      return { success: true, data: { success: true, message: "Valid token", email: found.email } };
    } catch (err) {
      return {
        success: false,
        message: "Token validation error",
        error: { code: "TOKEN_VALIDATE_ERROR", message: String(err) },
      };
    }
  }

  async consumeToken(
    token: string,
    userId?: DatabaseId,
    type?: string,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<{ status: boolean; message: string }>> {
    const val = await this.validateToken(token, userId, type, tenantId);
    if (!val.success) {
      return { success: true, data: { status: false, message: val.message || "Invalid token" } };
    }
    if (!val.data.success) {
      return {
        success: true,
        data: { status: false, message: val.data.message || "Invalid token" },
      };
    }
    await this.TokenModel.deleteOne({ token });
    return { success: true, data: { status: true, message: "Token consumed" } };
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

  async getAllTokens(filter: any = {}): Promise<DatabaseResult<Token[]>> {
    try {
      const tokens = await this.TokenModel.find(filter).lean();
      return { success: true, data: tokens as Token[] };
    } catch (err) {
      return {
        success: false,
        message: "Error getting tokens",
        error: { code: "TOKEN_GET_ERROR", message: String(err) },
      };
    }
  }

  async updateToken(
    tokenId: DatabaseId,
    tokenData: Partial<Token>,
    tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Token>> {
    try {
      const filter: any = { _id: tokenId };
      if (tenantId) filter.tenantId = tenantId;
      const res = await this.TokenModel.findOneAndUpdate(filter, tokenData, { new: true }).lean();
      if (!res) throw new Error("Token not found");
      return { success: true, data: res as Token };
    } catch (err) {
      return {
        success: false,
        message: "Error updating token",
        error: { code: "TOKEN_UPDATE_ERROR", message: String(err) },
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

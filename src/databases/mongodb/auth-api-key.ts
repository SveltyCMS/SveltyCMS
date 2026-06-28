/**
 * @file src/databases/mongodb/auth-api-key.ts
 * @description MongoDB schema and adapter for API key operations.
 */

import type { ApiKey } from "@src/databases/auth/types";
import type { DatabaseId, DatabaseResult, BaseQueryOptions } from "@src/databases/db-interface";
import mongoose, { Schema, type Model } from "mongoose";
import { generateId, getOrCreateModel } from "./mongodb-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import { logger } from "@src/utils/logger";

export const ApiKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    hash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    userId: { type: String, required: true, ref: "auth_users" },
    scopes: [{ type: String }],
    permissions: [{ type: String }],
    revoked: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
    lastUsedIp: { type: String },
    expiresAt: { type: Date },
    tenantId: { type: String },
  },
  {
    timestamps: true,
    collection: "auth_api_keys",
    _id: false,
  },
);

ApiKeySchema.index({ hash: 1 }, { unique: true });
ApiKeySchema.index({ tenantId: 1 });
ApiKeySchema.index({ tenantId: 1, hash: 1 });

export class ApiKeyAdapter {
  private _ApiKeyModel: Model<ApiKey> | null = null;

  private get ApiKeyModel(): Model<ApiKey> {
    if (!this._ApiKeyModel) {
      this._ApiKeyModel = getOrCreateModel(mongoose, "auth_api_keys", ApiKeySchema);
    }
    return this._ApiKeyModel;
  }

  public setModel(conn: any) {
    this._ApiKeyModel = getOrCreateModel(conn, "auth_api_keys", ApiKeySchema);
  }

  constructor() {}

  async createApiKey(
    apiKeyData: Partial<ApiKey>,
    _options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey>> {
    try {
      const id = apiKeyData._id || generateId();
      const Model = this.ApiKeyModel;
      const apiKey = new Model({
        ...apiKeyData,
        _id: id,
      });
      await apiKey.save();
      return { success: true, data: apiKey.toObject() as ApiKey };
    } catch (err) {
      const message = "API Key creation failed";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "API_KEY_CREATE_ERROR", message },
      };
    }
  }

  async getApiKey(
    hash: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey | null>> {
    try {
      const tenantId = options?.tenantId;
      const filter = safeQuery({ hash } as any, tenantId as string);
      const found = await this.ApiKeyModel.findOne(filter).lean();
      return { success: true, data: found as ApiKey | null };
    } catch (err) {
      const message = "Error getting API key";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "API_KEY_GET_ERROR", message },
      };
    }
  }

  async getApiKeyById(
    id: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<ApiKey | null>> {
    try {
      const tenantId = options?.tenantId;
      const filter = safeQuery({ _id: id } as any, tenantId as string);
      const found = await this.ApiKeyModel.findOne(filter).lean();
      return { success: true, data: (found as ApiKey) || null };
    } catch (err) {
      const message = "Error getting API key by id";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "API_KEY_GET_BY_ID_ERROR", message },
      };
    }
  }

  async listApiKeys(
    filter: { userId?: DatabaseId; tenantId?: DatabaseId | null } = {},
    options?: { limit?: number; skip?: number },
  ): Promise<DatabaseResult<ApiKey[]>> {
    try {
      const query: Record<string, unknown> = { revoked: { $ne: true } };
      if (filter.userId) query.userId = filter.userId;
      if (filter.tenantId) query.tenantId = filter.tenantId;

      let q = this.ApiKeyModel.find(query).sort({ createdAt: -1 });
      if (options?.skip) q = q.skip(options.skip);
      if (options?.limit) q = q.limit(options.limit);

      const rows = await q.lean();
      return { success: true, data: rows as ApiKey[] };
    } catch (err) {
      const message = "Error listing API keys";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "API_KEY_LIST_ERROR", message },
      };
    }
  }

  async revokeApiKey(id: DatabaseId, options?: BaseQueryOptions): Promise<DatabaseResult<void>> {
    try {
      const tenantId = options?.tenantId;
      const filter = safeQuery({ _id: id } as any, tenantId as string);
      const res = await this.ApiKeyModel.findOneAndUpdate(
        filter,
        { revoked: true },
        { returnDocument: "after" },
      ).lean();
      if (!res) throw new Error("API Key not found");
      return { success: true, data: undefined };
    } catch (err) {
      const message = "Error revoking API key";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "API_KEY_REVOKE_ERROR", message },
      };
    }
  }

  async updateApiKeyUsage(
    id: DatabaseId,
    ip?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    try {
      const tenantId = options?.tenantId;
      const filter = safeQuery({ _id: id } as any, tenantId as string);
      const res = await this.ApiKeyModel.findOneAndUpdate(
        filter,
        {
          $set: { lastUsedAt: new Date(), lastUsedIp: ip || null },
          $inc: { usageCount: 1 },
        },
        { returnDocument: "after" },
      ).lean();
      if (!res) throw new Error("API Key not found");
      return { success: true, data: undefined };
    } catch (err) {
      const message = "Error updating API key usage";
      logger.error(message, err);
      return {
        success: false,
        message,
        error: { code: "API_KEY_USAGE_UPDATE_ERROR", message },
      };
    }
  }
}

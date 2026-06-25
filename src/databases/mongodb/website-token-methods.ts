/**
 * @file src/databases/mongodb/website-token-methods.ts
 * @description Secure CRUD operations for WebsiteToken collection with tenant isolation and token hashing.
 *
 * ### Features:
 * - mandatory token hashing before persistence
 * - safeQuery-enforced soft-delete and tenant boundaries
 * - parallel list + count queries
 * - credential lookup aligned with API key auth (tenant-scoped when context exists)
 * - compound index on { token, tenantId } for high-throughput auth lookups
 */

import { generateId } from "@src/databases/mongodb/mongodb-utils";
import type { WebsiteToken } from "@src/content/types";
import { hashCredentialSha256Hex } from "@src/utils/security/credential-hash";
import { nowISODateString } from "@utils/date";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";
import type { DatabaseId, DatabaseResult, QueryFilter } from "../db-interface";
import { MongoCrudMethods } from "./crud-methods";
import { createDatabaseError } from "./mongodb-utils";

export const websiteTokenSchema = new Schema<WebsiteToken>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    name: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    createdAt: { type: String, default: () => nowISODateString() },
    updatedAt: { type: String, default: () => nowISODateString() },
    createdBy: { type: String, required: true },
    permissions: { type: [String], default: [] },
    expiresAt: { type: String, required: false },
    tenantId: { type: String, index: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    collection: "system_website_tokens",
    strict: true,
  },
);

websiteTokenSchema.index({ createdBy: 1 });
websiteTokenSchema.index({ tenantId: 1, name: 1 });
websiteTokenSchema.index({ token: 1, tenantId: 1 });

export const WebsiteTokenModel =
  (mongoose.models?.WebsiteToken as Model<WebsiteToken> | undefined) ||
  mongoose.model<WebsiteToken>("WebsiteToken", websiteTokenSchema);

export class MongoWebsiteTokenMethods {
  private readonly crud: MongoCrudMethods<WebsiteToken>;

  constructor(websiteTokenModel: Model<WebsiteToken>, adapter: any) {
    this.crud = new MongoCrudMethods(websiteTokenModel, adapter);
  }

  private _tenantOpts(tenantId?: string, credentialLookup = false) {
    return {
      ...(tenantId ? { tenantId: tenantId as DatabaseId } : {}),
      ...(credentialLookup && !tenantId ? { bypassTenantCheck: true } : {}),
    };
  }

  async create(
    tokenData: Omit<WebsiteToken, "_id" | "createdAt" | "updatedAt" | "tenantId">,
    tenantId?: string,
  ): Promise<DatabaseResult<WebsiteToken>> {
    try {
      const originalToken = tokenData.token;
      const hashedToken = await hashCredentialSha256Hex(originalToken);

      const secureToken: Record<string, unknown> = {
        ...tokenData,
        token: hashedToken,
        isDeleted: false,
      };
      if (tenantId) {
        secureToken.tenantId = tenantId as DatabaseId;
      }

      const result = await this.crud.insert(
        secureToken as unknown as WebsiteToken,
        tenantId ? { tenantId: tenantId as DatabaseId } : {},
      );

      if (result.success && result.data) {
        result.data = { ...result.data, token: originalToken };
      }

      return result;
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to create website token",
        error: createDatabaseError(error, "TOKEN_CREATE_FAILED", error.message),
      };
    }
  }

  async getAll(
    options: {
      limit?: number;
      skip?: number;
      sort?: string;
      order?: string;
      filter?: Record<string, unknown>;
    },
    tenantId?: string,
  ): Promise<DatabaseResult<{ data: WebsiteToken[]; total: number }>> {
    try {
      const allowedFilters = ["name", "isActive"];
      const sanitizedFilter: Record<string, unknown> = {};

      if (options.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          if (allowedFilters.includes(key)) {
            sanitizedFilter[key] = value;
          }
        }
      }

      const sort: Record<string, 1 | -1> =
        options.sort && options.order
          ? { [options.sort]: options.order === "desc" ? -1 : 1 }
          : { createdAt: -1 };

      const queryOpts = {
        ...this._tenantOpts(tenantId),
        limit: options.limit || 100,
        offset: options.skip,
        sort: sort as any,
      };

      const [dataRes, totalRes] = await Promise.all([
        this.crud.findMany(sanitizedFilter as QueryFilter<WebsiteToken>, queryOpts),
        this.crud.count(sanitizedFilter as QueryFilter<WebsiteToken>, this._tenantOpts(tenantId)),
      ]);

      if (!dataRes.success) return dataRes as any;
      if (!totalRes.success) return totalRes as any;

      const scrubbedData = dataRes.data.map((t) => {
        const { token: _, ...rest } = t;
        return rest as WebsiteToken;
      });

      return {
        success: true,
        data: { data: scrubbedData, total: totalRes.data },
      };
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to list website tokens",
        error: createDatabaseError(error, "TOKEN_LIST_FAILED", error.message),
      };
    }
  }

  async delete(tokenId: DatabaseId, tenantId?: string): Promise<DatabaseResult<void>> {
    const result = await this.crud.delete(
      tokenId,
      tenantId ? { tenantId: tenantId as DatabaseId, permanent: true } : { permanent: true },
    );
    if (!result.success) return result as DatabaseResult<void>;
    return { success: true, data: undefined };
  }

  async getByName(name: string, tenantId?: string): Promise<DatabaseResult<WebsiteToken | null>> {
    return this.crud.findOne({ name } as QueryFilter<WebsiteToken>, this._tenantOpts(tenantId));
  }

  async verifyToken(
    plaintextToken: string,
    tenantId: string,
  ): Promise<DatabaseResult<WebsiteToken | null>> {
    try {
      const hashed = await hashCredentialSha256Hex(plaintextToken);
      return this.crud.findOne({ token: hashed, tenantId } as QueryFilter<WebsiteToken>, {
        tenantId: tenantId as DatabaseId,
      });
    } catch (error: any) {
      return {
        success: false,
        message: "Token verification failed",
        error: createDatabaseError(error, "TOKEN_VERIFY_FAILED", error.message),
      };
    }
  }

  async getByToken(
    plaintextToken: string,
    tenantId?: string,
  ): Promise<DatabaseResult<WebsiteToken | null>> {
    try {
      const hashed = await hashCredentialSha256Hex(plaintextToken);
      return this.getByTokenHash(hashed, tenantId);
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to get token by value",
        error: createDatabaseError(error, "TOKEN_GET_FAILED", error.message),
      };
    }
  }

  async getByTokenHash(
    tokenHash: string,
    tenantId?: string,
  ): Promise<DatabaseResult<WebsiteToken | null>> {
    try {
      return this.crud.findOne(
        { token: tokenHash } as QueryFilter<WebsiteToken>,
        this._tenantOpts(tenantId, true),
      );
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to get token by hash",
        error: createDatabaseError(error, "TOKEN_GET_FAILED", error.message),
      };
    }
  }

  async getById(
    tokenId: DatabaseId,
    tenantId?: string,
  ): Promise<DatabaseResult<WebsiteToken | null>> {
    return this.crud.findOne(
      { _id: tokenId } as QueryFilter<WebsiteToken>,
      this._tenantOpts(tenantId),
    );
  }
}

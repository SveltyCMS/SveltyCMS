/**
 * @file src/databases/mongodb/models/websiteToken.ts
 * @description Mongoose model for Website Tokens used for external access
 *
 * ### Fields
 * - `_id`: Unique identifier for the token
 * - `name`: Human-readable name for the token
 * - `token`: The actual token string used for authentication
 * - `createdAt`: Timestamp of when the token was created
 * - `updatedAt`: Timestamp of the last update to the token
 * - `createdBy`: User ID of the creator of the token
 */

import { generateId } from "@src/databases/mongodb/mongodb-utils";
import type { WebsiteToken } from "@src/content/types";
import { nowISODateString } from "@utils/date";
import type { Model } from "mongoose";
import mongoose, { Schema } from "mongoose";

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
  },
  {
    // ⚠️ timestamps: true conflicts with explicit createdAt/updatedAt String types.
    // crud.insert() manually sets both to nowISODateString() — timestamps plugin
    // would coerce them to Date, breaking type consistency and toObject() output.
    collection: "system_website_tokens",
    strict: true,
    _id: false,
  },
);

websiteTokenSchema.index({ createdBy: 1 });

export const WebsiteTokenModel =
  (mongoose.models?.WebsiteToken as Model<WebsiteToken> | undefined) ||
  mongoose.model<WebsiteToken>("WebsiteToken", websiteTokenSchema);

// --- Merged from website-token.ts (model + statics) into methods for file reduction pilot ---

/**
 * @file src/databases/mongodb/methods/website-token-methods.ts
 * @description Secure CRUD operations for WebsiteToken collection with mandatory tenant isolation and token hashing.
 */

import type { DatabaseId, DatabaseResult, QueryFilter } from "../db-interface";
import { MongoCrudMethods } from "./crud-methods";
import { createDatabaseError } from "./mongodb-utils";

export class MongoWebsiteTokenMethods {
  private readonly crud: MongoCrudMethods<WebsiteToken>;

  constructor(websiteTokenModel: Model<WebsiteToken>, adapter: any) {
    this.crud = new MongoCrudMethods(websiteTokenModel, adapter);
  }

  /**
   * Helper to hash tokens before storage or comparison.
   * Website tokens represent API credentials and must NEVER be stored in plaintext.
   */
  private async _hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async create(
    tokenData: Omit<WebsiteToken, "_id" | "createdAt" | "updatedAt" | "tenantId">,
    tenantId?: string,
  ): Promise<DatabaseResult<WebsiteToken>> {
    try {
      // Hash the sensitive token value before it touches the database layer
      const hashedToken = await this._hashToken(tokenData.token);

      const secureToken: Record<string, unknown> = {
        ...tokenData,
        token: hashedToken,
      };
      if (tenantId) {
        secureToken.tenantId = tenantId as DatabaseId;
      }

      return this.crud.insert(
        secureToken as any as WebsiteToken,
        tenantId ? { tenantId: tenantId as DatabaseId } : {},
      );
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
      // Sanitize filter to prevent raw MongoDB operator injection/credential enumeration
      const allowedFilters = ["name", "isActive"];
      const sanitizedFilter: Record<string, any> = {};
      if (tenantId) sanitizedFilter.tenantId = tenantId;

      if (options.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          if (allowedFilters.includes(key)) {
            sanitizedFilter[key] = value;
          }
        }
      }

      const sort: any =
        options.sort && options.order
          ? { [options.sort]: options.order as "asc" | "desc" | 1 | -1 }
          : { createdAt: -1 };

      const findManyOpts: any = {
        limit: options.limit || 100,
        offset: options.skip,
        sort,
      };
      if (tenantId) {
        findManyOpts.tenantId = tenantId as DatabaseId;
      }

      const countOpts: any = tenantId ? { tenantId: tenantId as DatabaseId } : {};

      const [dataRes, totalRes] = await Promise.all([
        this.crud.findMany(sanitizedFilter as QueryFilter<WebsiteToken>, findManyOpts),
        this.crud.count(sanitizedFilter as QueryFilter<WebsiteToken>, countOpts),
      ]);

      if (!dataRes.success) return dataRes as any;
      if (!totalRes.success) return totalRes as any;

      // Scrub tokens from the list for security
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
    const filter: QueryFilter<WebsiteToken> = tenantId
      ? ({ name, tenantId } as QueryFilter<WebsiteToken>)
      : ({ name } as QueryFilter<WebsiteToken>);
    return this.crud.findOne(filter, tenantId ? { tenantId: tenantId as DatabaseId } : {});
  }

  /**
   * Verified a token against its stored hash.
   */
  async verifyToken(
    plaintextToken: string,
    tenantId: string,
  ): Promise<DatabaseResult<WebsiteToken | null>> {
    try {
      const hashed = await this._hashToken(plaintextToken);
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
      const hashed = await this._hashToken(plaintextToken);
      const filter: any = { token: hashed };
      if (tenantId) filter.tenantId = tenantId;

      return this.crud.findOne(filter as QueryFilter<WebsiteToken>, {
        tenantId: tenantId as DatabaseId,
      });
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to get token by value",
        error: createDatabaseError(error, "TOKEN_GET_FAILED", error.message),
      };
    }
  }
}

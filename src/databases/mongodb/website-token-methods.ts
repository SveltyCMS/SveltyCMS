/**
 * @file src/databases/mongodb/methods/website-token-methods.ts
 * @description Secure CRUD operations for WebsiteToken collection with mandatory tenant isolation and token hashing.
 */

import type { Model } from "mongoose";
import type { DatabaseId, DatabaseResult, WebsiteToken, QueryFilter } from "../db-interface";
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
    tenantId: string | undefined,
    options: {
      limit?: number;
      skip?: number;
      sort?: string;
      order?: string;
      filter?: Record<string, unknown>;
    },
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

      const [dataRes, totalRes] = await Promise.all([
        this.crud.findMany(sanitizedFilter as QueryFilter<WebsiteToken>, {
          limit: options.limit || 100,
          offset: options.skip,
          sort,
          ...(tenantId ? { tenantId: tenantId as DatabaseId } : {}),
        }),
        this.crud.count(sanitizedFilter as QueryFilter<WebsiteToken>, {
          ...(tenantId ? { tenantId: tenantId as DatabaseId } : {}),
        }),
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

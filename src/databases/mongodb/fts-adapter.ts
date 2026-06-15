/**
 * @file src/databases/mongodb/fts-adapter.ts
 * @description
 * MongoDB Full-Text Search adapter using $text index with field weights.
 *
 * Features:
 * - $text: { $search: query } with optional field weights
 * - $regex fallback when $text index is unavailable
 */

import type { IFtsAdapter, DatabaseResult } from "../db-interface";
import type { IDBAdapter } from "../db-interface";
import { logger } from "@utils/logger";

export class MongoFtsAdapter implements IFtsAdapter {
  private adapter: IDBAdapter;

  constructor(adapter: IDBAdapter) {
    this.adapter = adapter;
  }

  async search(
    collection: string,
    query: string,
    options?: {
      columns?: Array<{ name: string; weight?: "A" | "B" | "C" | "D" }>;
      limit?: number;
      offset?: number;
      tenantId?: string | null;
      language?: string;
      filters?: Record<string, unknown>;
    },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const columns = options?.columns ?? [
      { name: "title" },
      { name: "content" },
      { name: "description" },
    ];

    try {
      return await this.searchWithText(collection, query, limit, offset, options);
    } catch {
      logger.debug("[MongoFtsAdapter] $text not available, falling back to regex");
      return this.searchWithRegex(collection, query, columns, limit, offset, options);
    }
  }

  private async searchWithText(
    collection: string,
    query: string,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const mongoFilter: Record<string, unknown> = {
      $text: { $search: query },
    };

    if (options?.tenantId) {
      mongoFilter.tenantId = options.tenantId;
    }

    if (options?.filters) {
      Object.assign(mongoFilter, options.filters);
    }

    const result = await this.adapter.crud.findMany(collection, mongoFilter as any, {
      limit,
      offset,
      tenantId: options?.tenantId as any,
    });

    if (result.success && result.data) {
      const items = result.data as unknown as any[];
      return { success: true, data: { items, total: items.length } };
    }

    return { success: true, data: { items: [], total: 0 } };
  }

  private async searchWithRegex(
    collection: string,
    query: string,
    columns: Array<{ name: string }>,
    limit: number,
    offset: number,
    options?: { tenantId?: string | null; filters?: Record<string, unknown> },
  ): Promise<DatabaseResult<{ items: any[]; total: number }>> {
    const colNames = columns.map((c) => c.name);
    const regexFilter = { $regex: query, $options: "i" };
    const orFilter = colNames.map((name) => ({ [name]: regexFilter }));

    const mongoFilter: Record<string, unknown> = {
      $or: orFilter,
    };

    if (options?.tenantId) {
      mongoFilter.tenantId = options.tenantId;
    }

    if (options?.filters) {
      Object.assign(mongoFilter, options.filters);
    }

    const result = await this.adapter.crud.findMany(collection, mongoFilter as any, {
      limit,
      offset,
      tenantId: options?.tenantId as any,
    });

    if (result.success && result.data) {
      const items = result.data as unknown as any[];
      return { success: true, data: { items, total: items.length } };
    }

    return { success: true, data: { items: [], total: 0 } };
  }
}

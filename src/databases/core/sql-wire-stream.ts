/**
 * @file src/databases/core/sql-wire-stream.ts
 * @description
 * Native direct-to-wire read streaming for SQL database adapters.
 * Bypasses full ORM / JavaScript deserialization overhead by querying pre-serialized
 * JSON payloads directly from SQLite/PostgreSQL/MariaDB wire engines.
 *
 * ### Features:
 * - Direct-to-wire point reads with automated ETag computation
 * - Publication-gated point reads with fallback to trimmed domain plane
 * - Direct-to-wire list query streaming with sorting and pagination
 * - Discriminated results: found, missing, or declined
 */

import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseResult,
  DatabaseId,
  QueryFilter,
} from "../db-interface";
import { serializeSuccessEnvelope } from "@utils/fast-json";
import { trimPointReadEnvelope } from "@utils/point-read-payload";
import { versionTokenString } from "@utils/optimistic-lock";
import { isPublishedStatus } from "@src/utils/security/publication-policy";

/**
 * Outcome of a native direct-to-wire point read (`rawFindPointWireStream`).
 *
 * - `found`    — the engine produced a pre-serialized wire body.
 * - `missing`  — the SELECT ran and returned no row (id absent or
 *                publication-clamped away). Definitively not servable by the
 *                wire plane.
 * - `declined` — the engine/table cannot produce a native wire body.
 */
export type RawPointWireStreamResult =
  | { kind: "found"; wireBody: string; etag: string }
  | { kind: "missing" }
  | { kind: "declined" };

/**
 * Outcome of a native direct-to-wire list read (`rawFindListWireStream`).
 *
 * - `found`    — the engine produced a pre-serialized JSON array wire body.
 * - `declined` — the engine declines (e.g. client-server DBs where JS stringification is faster).
 */
export type RawListWireStreamResult =
  | { kind: "found"; wireBody: string; etag: string }
  | { kind: "declined" };

/**
 * Structural contract required by the direct-to-wire read runner.
 */
export interface SqlWireStreamContext {
  getTable(collection: string): any;
  rawFindPointWireStream(
    table: any,
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult>;
  rawFindListWireStream(
    table: any,
    collection: string,
    options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      fields?: string[];
    },
  ): Promise<RawListWireStreamResult>;
  findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T | null>>;
  wrap<T>(
    operation: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
}

/**
 * Point-read direct-to-wire pipeline.
 */
export async function executeFindPointWireStream(
  ctx: SqlWireStreamContext,
  collection: string,
  id: DatabaseId,
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
  if (typeof collection !== "string" || !id) {
    return {
      success: false,
      message: "Invalid collection or id",
      error: { code: "INVALID_QUERY", message: "Invalid collection or id" },
    };
  }
  const table = ctx.getTable(collection);
  if (!table) {
    return {
      success: false,
      message: `Collection table not found: ${collection}`,
      error: {
        code: "COLLECTION_NOT_FOUND",
        message: `Collection table not found: ${collection}`,
      },
    };
  }

  // The raw stream self-catches and reports found / missing / declined.
  const rawWire = await ctx.rawFindPointWireStream(table, collection, id, options);
  // Fast path: the engine already produced the serialized wire body — return it
  // without `wrap()` (which would re-enter the queue gate / AsyncLocalStorage /
  // traceSpan for an in-memory object).
  if (rawWire.kind === "found") {
    return { success: true, data: { wireBody: rawWire.wireBody, etag: rawWire.etag } };
  }
  if (rawWire.kind === "missing") {
    return {
      success: false,
      message: "Entry not found",
      error: { code: "RECORD_NOT_FOUND", message: "Entry not found" },
    };
  }

  return ctx.wrap(async () => {
    // Engine declined (no native JSON support, etc.) → findOne fallback.
    const findRes = await ctx.findOne(collection, { _id: id } as any, options as any);
    const record =
      findRes && typeof findRes === "object" && "success" in findRes
        ? ((findRes as { success: boolean; data?: unknown }).data ?? null)
        : findRes;
    if (!record) return null;
    // Wire Plane publication guarantee: check status if required
    if (options.requirePublished === true && !isPublishedStatus(record)) return null;
    const trimmed = trimPointReadEnvelope({ success: true, data: record }) as {
      data?: unknown;
    };
    const wireBody = serializeSuccessEnvelope(JSON.stringify(trimmed.data ?? null));
    const etag = `"${String((record as any)._id ?? id)}-${versionTokenString((record as any).updatedAt)}"`;
    return { wireBody, etag };
  }, "FIND_POINT_WIRE_STREAM_FAILED");
}

/**
 * List-read direct-to-wire pipeline.
 */
export async function executeFindListWireStream(
  ctx: SqlWireStreamContext,
  collection: string,
  options: BaseQueryOptions & {
    limit?: number;
    offset?: number;
    requirePublished?: boolean;
    sortField?: string;
    sortDirection?: "asc" | "desc";
    fields?: string[];
  } = {},
): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
  if (typeof collection !== "string") {
    return {
      success: false,
      message: "Invalid collection",
      error: { code: "INVALID_QUERY", message: "Invalid collection" },
    };
  }
  const table = ctx.getTable(collection);
  if (!table) {
    return {
      success: false,
      message: `Collection table not found: ${collection}`,
      error: {
        code: "COLLECTION_NOT_FOUND",
        message: `Collection table not found: ${collection}`,
      },
    };
  }

  const rawWire = await ctx.rawFindListWireStream(table, collection, options);
  if (rawWire.kind === "found") {
    return { success: true, data: { wireBody: rawWire.wireBody, etag: rawWire.etag } };
  }

  return {
    success: false,
    message: "Direct-to-wire list declined",
    error: { code: "DECLINED", message: "Direct-to-wire list declined" },
  };
}

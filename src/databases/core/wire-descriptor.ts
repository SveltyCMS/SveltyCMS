/**
 * @file src/databases/core/wire-descriptor.ts
 * @description
 * Compiled wire-plane descriptor engine for zero-allocation database-native JSON streaming.
 *
 * Compiles database-level JSON serialization expressions (PostgreSQL jsonb_build_object,
 * SQLite json_object, MariaDB JSON_OBJECT, MongoDB $project) directly from collection schemas.
 * Bypasses JavaScript DTO hydration and JSON.stringify entirely on high-throughput list reads.
 *
 * ### Features:
 * - Single canonical descriptor definition across all 4 database adapters
 * - WeakMap-backed compilation cache (compiled once per schema definition)
 * - Safe SQL identifier quoting and type coercion (dates, numbers, JSON fields)
 * - Support for custom field subsets and projections
 */

export interface WireFieldDefinition {
  /** Output JSON property key. */
  key: string;
  /** Physical column name in the database table. */
  sourceColumn: string;
  /** Whether the field is native JSON / JSONB. */
  isJson?: boolean;
  /** Whether the field represents an ISO date. */
  isDate?: boolean;
}

export interface WirePlaneDescriptor {
  /** Collection or table name. */
  collection: string;
  /** Ordered list of fields to include in the wire output. */
  fields: WireFieldDefinition[];
}

export type WireDialect = "postgresql" | "sqlite" | "mariadb" | "mongodb";

/** Cache of compiled wire SQL expressions by descriptor reference */
const compiledDescriptorCache = new WeakMap<
  WirePlaneDescriptor,
  {
    postgresql?: string;
    sqlite?: string;
    mariadb?: string;
    mongodb?: Record<string, unknown>;
  }
>();

/**
 * Compile a wire projection SQL expression or pipeline stage for the target dialect.
 */
export function compileWireProjection(
  descriptor: WirePlaneDescriptor,
  dialect: WireDialect,
): string | Record<string, unknown> {
  let cached = compiledDescriptorCache.get(descriptor);
  if (!cached) {
    cached = {};
    compiledDescriptorCache.set(descriptor, cached);
  }

  if (dialect === "postgresql") {
    if (!cached.postgresql) {
      cached.postgresql = buildPostgresWireExpression(descriptor);
    }
    return cached.postgresql;
  }

  if (dialect === "sqlite") {
    if (!cached.sqlite) {
      cached.sqlite = buildSqliteWireExpression(descriptor);
    }
    return cached.sqlite;
  }

  if (dialect === "mariadb") {
    if (!cached.mariadb) {
      cached.mariadb = buildMariaDbWireExpression(descriptor);
    }
    return cached.mariadb;
  }

  if (dialect === "mongodb") {
    if (!cached.mongodb) {
      cached.mongodb = buildMongoWireExpression(descriptor);
    }
    return cached.mongodb;
  }

  throw new Error(`Unsupported wire projection dialect: ${dialect}`);
}

/**
 * PostgreSQL: jsonb_build_object('k1', col1, 'k2', col2, ...)
 */
function buildPostgresWireExpression(descriptor: WirePlaneDescriptor): string {
  const parts: string[] = [];
  for (const f of descriptor.fields) {
    const safeKey = `'${f.key.replace(/'/g, "''")}'`;
    const colRef = `"${f.sourceColumn.replace(/"/g, '""')}"`;
    parts.push(safeKey);
    if (f.isDate) {
      parts.push(`to_char(${colRef} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
    } else {
      parts.push(colRef);
    }
  }
  return `jsonb_build_object(${parts.join(", ")})`;
}

/**
 * SQLite: json_object('k1', col1, 'k2', col2, ...)
 */
function buildSqliteWireExpression(descriptor: WirePlaneDescriptor): string {
  const parts: string[] = [];
  for (const f of descriptor.fields) {
    const safeKey = `'${f.key.replace(/'/g, "''")}'`;
    const colRef = `"${f.sourceColumn.replace(/"/g, '""')}"`;
    parts.push(safeKey);
    if (f.isJson) {
      parts.push(`json(${colRef})`);
    } else {
      parts.push(colRef);
    }
  }
  return `json_object(${parts.join(", ")})`;
}

/**
 * MariaDB / MySQL: JSON_OBJECT('k1', col1, 'k2', col2, ...)
 */
function buildMariaDbWireExpression(descriptor: WirePlaneDescriptor): string {
  const parts: string[] = [];
  for (const f of descriptor.fields) {
    const safeKey = `'${f.key.replace(/'/g, "''")}'`;
    const colRef = `\`${f.sourceColumn.replace(/`/g, "``")}\``;
    parts.push(safeKey);
    if (f.isJson) {
      parts.push(`JSON_EXTRACT(${colRef}, '$')`);
    } else {
      parts.push(colRef);
    }
  }
  return `JSON_OBJECT(${parts.join(", ")})`;
}

/**
 * MongoDB: $project stage { k1: '$sourceCol1', ... }
 */
function buildMongoWireExpression(descriptor: WirePlaneDescriptor): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  for (const f of descriptor.fields) {
    projection[f.key] = `$${f.sourceColumn}`;
  }
  return projection;
}

/**
 * Helper to build a standard wire descriptor for a content collection.
 */
export function createContentNodeWireDescriptor(collectionName: string): WirePlaneDescriptor {
  return {
    collection: collectionName,
    fields: [
      { key: "_id", sourceColumn: "_id" },
      { key: "tenantId", sourceColumn: "tenantId" },
      { key: "collection", sourceColumn: "collection" },
      { key: "status", sourceColumn: "status" },
      { key: "createdAt", sourceColumn: "createdAt", isDate: true },
      { key: "updatedAt", sourceColumn: "updatedAt", isDate: true },
      { key: "data", sourceColumn: "data", isJson: true },
    ],
  };
}

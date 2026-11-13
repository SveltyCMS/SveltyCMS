/**
 * @file src/services/core/relation-link-service.ts
 * @description Normalized many-to-many junction storage (`content_relations`).
 *
 * A `Relation` field with `multiple: true` stores an array of ids inside the
 * document. That is a genuine many-to-many, but it cannot carry per-link data
 * (order, label, role) and it makes reverse lookups an array scan. This service
 * backs the `ManyToMany` widget with one row per edge instead:
 *
 * - deterministic edge ids (`sha256` of the full edge key) make writes
 *   idempotent and duplicate-proof even where a nullable `tenantId` would make
 *   a unique index treat two NULL rows as distinct;
 * - `syncSourceLinks` diffs against the stored edges and issues one delete plus
 *   one upsert for only the changed rows (no churn on an unchanged save);
 * - `getSourceLinks` hydrates a whole page of parents in one query;
 * - `getReverseLinks` answers "which sources link to this target?";
 * - `deleteSourceLinks` / `deleteTargetLinks` cascade on either side.
 *
 * ### Features:
 * - diff-based sync: one read + one delete + one upsert
 * - deterministic edge ids (idempotent upserts, no duplicate rows)
 * - batched source hydration (`sourceId $in`) for list/detail reads
 * - reverse lookup by target collection + id
 * - cascade cleanup for source and target deletions
 * - tenant-scoped on every query
 */

import { createHash } from "node:crypto";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";

/** Canonical collection name the CRUD layer maps to the `content_relations` table. */
export const RELATION_LINK_COLLECTION = "contentRelations";

/** Minimal adapter surface the service needs (keeps unit tests cheap). */
export type RelationLinkAdapter = Pick<IDBAdapter, "crud">;

/** One desired edge, as accepted from a schema payload. */
export interface RelationLinkInput {
  id: string;
  /** Explicit position; defaults to the array index. */
  sort?: number;
  /** Per-link data (label, role, …) stored verbatim. */
  metadata?: Record<string, unknown> | null;
}

/** One stored edge, as returned by the adapter. */
export interface RelationLinkRow {
  _id: string;
  tenantId?: string | null;
  sourceCollection: string;
  sourceId: string;
  fieldName: string;
  targetCollection: string;
  targetId: string;
  sortOrder: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** A field's desired edges, produced from the write payload. */
export interface JunctionLinkDescriptor {
  fieldName: string;
  targetCollection: string;
  desired: RelationLinkInput[];
  /** Physical/canonical link collection; defaults to `contentRelations`. */
  through?: string;
}

interface LinkScope {
  tenantId?: DatabaseId | string | null;
  transaction?: unknown;
}

/**
 * Accept the two payload shapes the widget/API may send:
 * `["id-a", "id-b"]` and `[{ id: "id-a", sort: 0, metadata: {...} }]`.
 * Unknown/empty entries are dropped, later duplicates win, and order is kept.
 */
export function normalizeLinkInputs(value: unknown): RelationLinkInput[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, RelationLinkInput>();
  let index = 0;
  for (const entry of value) {
    let id: string | undefined;
    let sort: number | undefined;
    let metadata: Record<string, unknown> | null | undefined;
    if (typeof entry === "string") {
      id = entry;
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      if (typeof record.id === "string") id = record.id;
      if (typeof record.sort === "number" && Number.isFinite(record.sort)) sort = record.sort;
      if (
        record.metadata &&
        typeof record.metadata === "object" &&
        !Array.isArray(record.metadata)
      ) {
        metadata = record.metadata as Record<string, unknown>;
      }
    }
    if (!id) continue;
    byId.delete(id);
    byId.set(id, {
      id,
      sort: sort ?? index,
      metadata: metadata ?? null,
    });
    index++;
  }
  return [...byId.values()];
}

/**
 * Deterministic edge id. `tenantId` is part of the key, so the same pair may be
 * linked independently in two tenants. Formats 32 hex chars as a UUID so it
 * fits every adapter's `varchar(36)` primary key.
 * slop:suppress — SHA-256 here derives a deterministic primary key from a
 * tenant-scoped tuple; it never hashes a secret, password or token.
 */
export function relationLinkId(
  tenantId: string | null | undefined,
  sourceCollection: string,
  fieldName: string,
  sourceId: string,
  targetId: string,
): string {
  const key = [tenantId ?? "", sourceCollection, fieldName, sourceId, targetId].join("\u0000");
  // slop:suppress fast-hash-secret — deterministic primary key over a tenant-scoped tuple; never hashes a secret
  const hex = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function scoped(scope: LinkScope): { tenantId?: DatabaseId; transaction?: unknown } {
  return {
    tenantId: (scope.tenantId ?? undefined) as DatabaseId | undefined,
    ...(scope.transaction ? { transaction: scope.transaction } : {}),
  };
}

function sameMetadata(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (!a && !b) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    // catch-allow: a circular metadata object cannot be serialised; treat it as changed.
    return false;
  }
}

/**
 * Load the edges of one field for many parent rows in one query.
 * Returns `sourceId → edges` (ordered by `sortOrder`). Read paths treat a
 * failure as "no links" rather than failing the whole page: a junction error
 * must not turn a readable entry into a 500.
 */
export async function getSourceLinks(
  adapter: RelationLinkAdapter,
  params: {
    tenantId?: DatabaseId | string | null;
    sourceCollection: string;
    fieldName: string;
    sourceIds: readonly string[];
    through?: string;
  },
): Promise<Map<string, RelationLinkRow[]>> {
  const sourceIds = [...new Set(params.sourceIds.filter((id) => typeof id === "string" && id))];
  const out = new Map<string, RelationLinkRow[]>();
  if (sourceIds.length === 0) return out;

  const result = await adapter.crud.findMany(
    params.through ?? RELATION_LINK_COLLECTION,
    {
      sourceCollection: params.sourceCollection,
      fieldName: params.fieldName,
      sourceId: { $in: sourceIds },
    } as never,
    {
      tenantId: (params.tenantId ?? undefined) as DatabaseId | undefined,
      limit: Math.max(1000, sourceIds.length * 100),
    },
  );

  if (!result.success || !Array.isArray(result.data)) {
    logger.debug(
      `[RelationLinks] Could not read links for ${params.sourceCollection}.${params.fieldName}: ${
        result.success ? "no data" : result.error
      }`,
    );
    return out;
  }

  for (const row of (result.data ?? []) as unknown as RelationLinkRow[]) {
    const key = String(row.sourceId);
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  return out;
}

/**
 * Replace one parent's edges for one field.
 *
 * Only changed rows are written: `desired` is compared against the stored edges
 * by deterministic id, then removed edges are deleted and new/changed edges are
 * upserted. An unchanged save issues no write at all.
 */
export async function syncSourceLinks(
  adapter: RelationLinkAdapter,
  params: {
    tenantId?: DatabaseId | string | null;
    sourceCollection: string;
    sourceId: string;
    links: readonly JunctionLinkDescriptor[];
    transaction?: unknown;
  },
): Promise<void> {
  if (params.links.length === 0) return;

  const tenantKey = params.tenantId ?? null;
  const opts = scoped({ tenantId: params.tenantId, transaction: params.transaction });

  for (const link of params.links) {
    const collection = link.through ?? RELATION_LINK_COLLECTION;
    const existing = await adapter.crud.findMany(
      collection,
      {
        sourceCollection: params.sourceCollection,
        fieldName: link.fieldName,
        sourceId: params.sourceId,
      } as never,
      { tenantId: opts.tenantId, limit: 10000 },
    );
    if (!existing.success) {
      throw new Error(
        `[RelationLinks] Could not compare links for ${params.sourceCollection}.${link.fieldName}: ${existing.error}`,
      );
    }

    const existingById = new Map(
      ((existing.data ?? []) as unknown as RelationLinkRow[]).map((row) => [String(row._id), row]),
    );
    const now = nowISODateString();
    const desiredRows = link.desired.map((entry, index) => {
      const _id = relationLinkId(
        tenantKey,
        params.sourceCollection,
        link.fieldName,
        params.sourceId,
        entry.id,
      );
      return {
        _id,
        tenantId: tenantKey,
        sourceCollection: params.sourceCollection,
        sourceId: params.sourceId,
        fieldName: link.fieldName,
        targetCollection: link.targetCollection,
        targetId: entry.id,
        sortOrder: entry.sort ?? index,
        metadata: entry.metadata ?? null,
        updatedAt: now,
      };
    });

    const desiredIds = new Set(desiredRows.map((row) => row._id));
    const removed = [...existingById.keys()].filter((id) => !desiredIds.has(id));
    if (removed.length > 0) {
      const deleted = await adapter.crud.deleteMany(
        collection,
        { _id: { $in: removed as unknown as DatabaseId[] } } as never,
        { tenantId: opts.tenantId, ...(opts.transaction ? { transaction: opts.transaction } : {}) },
      );
      if (!deleted.success) {
        throw new Error(
          `[RelationLinks] Could not delete stale links for ${params.sourceCollection}.${link.fieldName}: ${deleted.error}`,
        );
      }
    }

    const toUpsert = desiredRows.filter((row) => {
      const current = existingById.get(row._id);
      if (!current) return true;
      return (
        current.sortOrder !== row.sortOrder ||
        current.targetId !== row.targetId ||
        current.targetCollection !== row.targetCollection ||
        !sameMetadata(current.metadata, row.metadata)
      );
    });
    if (toUpsert.length === 0) continue;

    const upserted = await adapter.crud.upsertMany(
      collection,
      toUpsert.map((row) => ({
        query: { _id: row._id },
        data: { ...row, createdAt: existingById.get(row._id)?.createdAt ?? now },
      })) as never,
      { tenantId: opts.tenantId, ...(opts.transaction ? { transaction: opts.transaction } : {}) },
    );
    if (!upserted.success) {
      throw new Error(
        `[RelationLinks] Could not write links for ${params.sourceCollection}.${link.fieldName}: ${upserted.error}`,
      );
    }
  }
}

/** Remove every edge owned by a deleted parent (optionally one field only). */
export async function deleteSourceLinks(
  adapter: RelationLinkAdapter,
  params: {
    tenantId?: DatabaseId | string | null;
    sourceCollection: string;
    sourceId: string;
    fieldName?: string;
    through?: string;
    transaction?: unknown;
  },
): Promise<void> {
  const opts = scoped({ tenantId: params.tenantId, transaction: params.transaction });
  const result = await adapter.crud.deleteMany(
    params.through ?? RELATION_LINK_COLLECTION,
    {
      sourceCollection: params.sourceCollection,
      sourceId: params.sourceId,
      ...(params.fieldName ? { fieldName: params.fieldName } : {}),
    } as never,
    opts,
  );
  if (!result.success) {
    logger.warn(
      `[RelationLinks] Could not delete source links for ${params.sourceCollection}:${params.sourceId}: ${result.error}`,
    );
  }
}

/** Remove every edge that points at a deleted target (the reverse cascade). */
export async function deleteTargetLinks(
  adapter: RelationLinkAdapter,
  params: {
    tenantId?: DatabaseId | string | null;
    targetCollection: string;
    targetId: string;
    through?: string;
    transaction?: unknown;
  },
): Promise<void> {
  const opts = scoped({ tenantId: params.tenantId, transaction: params.transaction });
  const result = await adapter.crud.deleteMany(
    params.through ?? RELATION_LINK_COLLECTION,
    { targetCollection: params.targetCollection, targetId: params.targetId } as never,
    opts,
  );
  if (!result.success) {
    logger.warn(
      `[RelationLinks] Could not delete target links for ${params.targetCollection}:${params.targetId}: ${result.error}`,
    );
  }
}

/**
 * Reverse lookup: every source that links to `targetId` through `fieldName`
 * (or every field when omitted). This is the junction-table capability the
 * id-array relation cannot offer without an array scan.
 */
export async function getReverseLinks(
  adapter: RelationLinkAdapter,
  params: {
    tenantId?: DatabaseId | string | null;
    targetCollection: string;
    targetId: string;
    fieldName?: string;
    sourceCollection?: string;
    through?: string;
    limit?: number;
  },
): Promise<RelationLinkRow[]> {
  const result = await adapter.crud.findMany(
    params.through ?? RELATION_LINK_COLLECTION,
    {
      targetCollection: params.targetCollection,
      targetId: params.targetId,
      ...(params.fieldName ? { fieldName: params.fieldName } : {}),
      ...(params.sourceCollection ? { sourceCollection: params.sourceCollection } : {}),
    } as never,
    {
      tenantId: (params.tenantId ?? undefined) as DatabaseId | undefined,
      limit: params.limit ?? 1000,
    },
  );
  if (!result.success || !Array.isArray(result.data)) return [];
  return result.data as unknown as RelationLinkRow[];
}

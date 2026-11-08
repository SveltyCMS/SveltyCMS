/**
 * @file src/services/sdk/namespaces/collections/access-filter.ts
 * @description Ownership and role-based row/field filtering for CollectionsNamespace.
 *
 * Features:
 * - Scoped ownership query generation (`ownership: { field }`)
 * - Ownership extraction and non-owner row filtering
 * - Safe copy-on-write envelope stripping to avoid cache poisoning
 */

import { isAdmin } from "@src/databases/auth/constants";
import type { Schema } from "@src/content/types";

/**
 * Row-ownership scope for a schema (`ownership: { field }`).
 *
 * Returns `false` when no restriction applies (no ownership declared, or an
 * admin/system caller), `null` when the caller cannot see any row (ownership is
 * declared but the caller has no user id — fail closed), and the extra WHERE
 * fragment otherwise. Merged into the list query before the cache key, so pages
 * and counts reflect exactly the rows the caller may read.
 */
export function ownershipFilter(
  schema: Schema,
  user: unknown,
  system?: boolean,
): Record<string, unknown> | null | false {
  const ownership = (schema as { ownership?: { field?: unknown } }).ownership;
  const field = ownership && typeof ownership === "object" ? ownership.field : undefined;
  if (typeof field !== "string" || !field) return false;
  if (system || isAdmin(user)) return false;
  const ownerId = (user as { _id?: unknown } | undefined | null)?._id;
  if (ownerId === undefined || ownerId === null || ownerId === "") return null;
  return { [field]: ownerId };
}

export function ownerValue(row: unknown, field: string): unknown {
  if (!row || typeof row !== "object") return undefined;
  const value = (row as Record<string, unknown>)[field];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as { _id?: unknown })._id;
  }
  return value;
}

/**
 * Drop rows the caller does not own from a read envelope.
 *
 * Envelopes already served by an ownership-scoped query pass through untouched
 * (the fast paths return the same reference); a foreign row is removed on a
 * **copied** envelope, so a shared point-read cache entry is never mutated or
 * poisoned.
 */
export function stripUnownedRows(envelope: unknown, field: string, user: unknown): unknown {
  if (!envelope || typeof envelope !== "object") return envelope;
  const record = envelope as { data?: unknown };
  const ownerId = (user as { _id?: unknown } | undefined | null)?._id;
  const ownerKey =
    ownerId === undefined || ownerId === null || ownerId === "" ? null : String(ownerId);
  const owns = (row: unknown): boolean => {
    if (ownerKey === null) return false;
    const value = ownerValue(row, field);
    return value !== undefined && value !== null && String(value) === ownerKey;
  };

  const data = record.data;
  if (Array.isArray(data)) {
    let firstForeign = -1;
    for (let i = 0; i < data.length; i++) {
      if (!owns(data[i])) {
        firstForeign = i;
        break;
      }
    }
    if (firstForeign === -1) return envelope;
    const kept: unknown[] = data.slice(0, firstForeign);
    for (let i = firstForeign + 1; i < data.length; i++) {
      if (owns(data[i])) kept.push(data[i]);
    }
    return { ...record, data: kept };
  }
  if (data === null || data === undefined || owns(data)) return envelope;
  return { ...record, data: null };
}

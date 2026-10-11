/**
 * @file src/utils/guarded-query.ts
 * @description Drop filter and sort keys the caller may not read.
 *
 * Unguarded schemas, admins, and system callers return the same object
 * reference. A blocked key is removed on a copy so a cached filter is never
 * mutated. The blocked-name set is cached per schema and role.
 *
 * Features:
 * - Zero work when the schema has no guarded fields
 * - Per-role blocked set (a guard the role may read stays queryable)
 * - System columns stay sortable: status, createdAt, updatedAt, _id, tenantId
 * - Nested $and / $or / AND / OR walked; other keys stripped by root name
 */

import type { FieldInstance, Schema } from "@src/content/types";
import type { SchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import { isAdmin } from "@src/databases/auth/constants";
import { canAccessField } from "@utils/field-access";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";

const SYSTEM_QUERY_FIELDS = new Set(["status", "createdAt", "updatedAt", "_id", "tenantId"]);

const LOGICAL_KEYS = new Set(["$and", "$or", "$nor", "AND", "OR"]);

type Actor = { _id?: unknown; role?: unknown; isAdmin?: unknown } | null | undefined;

const blockedBySchema = new WeakMap<object, Map<string, ReadonlySet<string>>>();

function roleCacheKey(user: Actor): string {
  const role = typeof user?.role === "string" && user.role ? user.role : "public";
  const authed = user?._id != null && user._id !== "" ? "1" : "0";
  return `${role}\0${authed}`;
}

function fieldByName(fields: readonly FieldInstance[], name: string): FieldInstance | undefined {
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    if (field.db_fieldName === name) return field;
    if ((field as { name?: string }).name === name) return field;
  }
  return undefined;
}

/**
 * Names this caller must not filter or sort. `null` means the query is unchanged
 * (no guards, or the caller may see every guarded field).
 */
export function blockedGuardedNames(
  schema: Schema,
  user: Actor,
  system?: boolean,
): ReadonlySet<string> | null {
  if (system || user?._id === "system" || isAdmin(user)) return null;

  let hot = schema as Schema & SchemaHotFlags;
  if (hot._hasGuardedFields !== true) {
    if (hot._hasGuardedFields === false) return null;
    hot = ensureSchemaHotFlags(schema);
    if (hot._hasGuardedFields !== true) return null;
  }

  const names = hot._guardedFieldNames;
  if (!names || names.length === 0) return null;

  const cacheKey = roleCacheKey(user);
  let byRole = blockedBySchema.get(schema);
  if (!byRole) {
    byRole = new Map();
    blockedBySchema.set(schema, byRole);
  }
  const cached = byRole.get(cacheKey);
  if (cached) return cached.size === 0 ? null : cached;

  const fields = (schema.fields || []) as FieldInstance[];
  const blocked = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!name || SYSTEM_QUERY_FIELDS.has(name)) continue;
    const field = fieldByName(fields, name);
    if (!field || !canAccessField(field, user as { _id: string; role: string }, "read")) {
      blocked.add(name);
    }
  }
  byRole.set(cacheKey, blocked);
  return blocked.size === 0 ? null : blocked;
}

function rootName(path: string): string {
  const dot = path.indexOf(".");
  return dot === -1 ? path : path.slice(0, dot);
}

function isEmptyRecord(value: unknown): boolean {
  return (
    !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0
  );
}

function stripList(list: unknown[], blocked: ReadonlySet<string>): unknown[] {
  let copy: unknown[] | null = null;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const next =
      item && typeof item === "object" && !Array.isArray(item)
        ? stripGuardedFilter(item as Record<string, unknown>, blocked)
        : item;
    // An emptied clause must not stay. `{ $and: [{}] }` matches every row.
    if (isEmptyRecord(next)) {
      if (!copy) copy = list.slice(0, i);
      continue;
    }
    if (next !== item) {
      if (!copy) copy = list.slice(0, i);
      copy.push(next);
    } else if (copy) {
      copy.push(item);
    }
  }
  return copy ?? list;
}

/** Same reference when nothing is removed. */
export function stripGuardedFilter<T>(filter: T, blocked: ReadonlySet<string> | null): T {
  if (!blocked || blocked.size === 0) return filter;
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return filter;
  const source = filter as Record<string, unknown>;
  let copy: Record<string, unknown> | null = null;
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = source[key];
    if (LOGICAL_KEYS.has(key) && Array.isArray(value)) {
      const next = stripList(value, blocked);
      if (next !== value) {
        if (!copy) copy = { ...source };
        if (next.length === 0) delete copy[key];
        else copy[key] = next;
      }
      continue;
    }
    if (blocked.has(key) || blocked.has(rootName(key))) {
      if (!copy) copy = { ...source };
      delete copy[key];
    }
  }
  return (copy ?? filter) as T;
}

function sortFieldOf(term: unknown): string | null {
  if (typeof term === "string") return term;
  if (Array.isArray(term) && typeof term[0] === "string") return term[0];
  if (term && typeof term === "object" && typeof (term as { field?: unknown }).field === "string") {
    return (term as { field: string }).field;
  }
  return null;
}

function isBlockedSortField(field: string, blocked: ReadonlySet<string>): boolean {
  return blocked.has(field) || blocked.has(rootName(field));
}

/**
 * Drop sort terms on blocked fields. An empty sort becomes `undefined` so the
 * caller keeps its default order. The input is not mutated.
 */
export function stripGuardedSort<T>(sort: T, blocked: ReadonlySet<string> | null): T | undefined {
  if (!blocked || blocked.size === 0 || sort == null) return sort;
  if (typeof sort === "string") {
    return isBlockedSortField(sort, blocked) ? undefined : sort;
  }
  if (Array.isArray(sort)) {
    let copy: unknown[] | null = null;
    for (let i = 0; i < sort.length; i++) {
      const term = sort[i];
      const field = sortFieldOf(term);
      const drop = field ? isBlockedSortField(field, blocked) : false;
      if (drop) {
        if (!copy) copy = sort.slice(0, i);
        continue;
      }
      if (copy) copy.push(term);
    }
    if (!copy) return sort;
    return (copy.length > 0 ? copy : undefined) as T | undefined;
  }
  if (typeof sort === "object") {
    const record = sort as Record<string, unknown>;
    if (typeof record.field === "string") {
      return isBlockedSortField(record.field, blocked) ? undefined : sort;
    }
    let copy: Record<string, unknown> | null = null;
    const keys = Object.keys(record);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (isBlockedSortField(key, blocked)) {
        if (!copy) copy = { ...record };
        delete copy[key];
      }
    }
    if (!copy) return sort;
    return (Object.keys(copy).length > 0 ? copy : undefined) as T | undefined;
  }
  return sort;
}

/**
 * @file src/services/security/access-rule-service.ts
 * @description Row-level read constraints as a **query fragment**, not a
 * post-fetch filter.
 *
 * ### Why
 * Endpoint RBAC (`collection:read`) says *whether* a caller may list a
 * collection. It cannot say *which rows* — so a role that may only see its own
 * drafts previously had two choices: see everything, or filter in JS after the
 * page/count was already computed. This service turns the rule into a WHERE
 * fragment that is merged before pagination, keyset cursors, `COUNT(*)`, and
 * streaming, so page sizes, totals, and next-cursor semantics stay truthful.
 *
 * ### Configuration (`ACCESS_RULES`, private setting)
 * ```json
 * {
 *   "posts": {
 *     "editor": { "read": { "authorId": "$user._id" } },
 *     "reviewer": { "read": { "status": ["draft", "review"] } }
 *   }
 * }
 * ```
 * - Admins and roles without an entry are unrestricted (backward compatible).
 * - A value may be a literal (`"published"`, `42`, `true`), an array (→ `$in`),
 *   or a dynamic token: `$user._id`, `$user.role`, `$tenant.id`.
 * - Only top-level fields are supported; rules are intentionally declarative so
 *   they can be validated and indexed.
 *
 * ### Features
 * - memoized config (60s TTL) with explicit invalidation on settings save
 * - pure `buildReadConstraint()` / `mergeAccessConstraint()` for tests
 * - `rowMatchesConstraint()` for defense-in-depth on cached/point reads
 * - prototype-pollution keys are dropped
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import { isAdmin } from "@src/databases/auth/constants";

export type AccessRuleScalar = string | number | boolean;
export type AccessRuleValue = AccessRuleScalar | AccessRuleScalar[];
export type AccessRule = { read?: Record<string, AccessRuleValue> };
export type AccessRuleConfig = Record<string, Record<string, AccessRule>>;

export interface AccessRuleContext {
  role?: string;
  tenantId?: string | null;
  user?: { _id?: unknown; role?: unknown } | null;
}

const CONFIG_TTL_MS = 60_000;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

let cachedConfig: AccessRuleConfig | null = null;
let cachedAt = 0;
let hasConfig = false;

function normalizeConfig(raw: unknown): AccessRuleConfig | null {
  let parsed: unknown = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn("[AccessRules] Invalid ACCESS_RULES JSON:", err);
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as AccessRuleConfig;
}

/** Parsed `ACCESS_RULES` config (memoized, 60s TTL). `null` = disabled. */
export function getAccessRuleConfig(): AccessRuleConfig | null {
  const now = Date.now();
  // Cache BOTH outcomes. The previous `hasConfig` guard re-read and re-parsed
  // the setting on every read whenever ACCESS_RULES was absent — the common
  // case — turning an intended zero-cost fast path into a settings lookup per
  // query. `cachedAt !== 0` distinguishes "never loaded" from "cached null".
  if (cachedAt !== 0 && now - cachedAt < CONFIG_TTL_MS) return cachedConfig;

  const parsed = normalizeConfig(getPrivateSettingSync("ACCESS_RULES") as unknown);
  hasConfig = parsed !== null && Object.keys(parsed).length > 0;
  cachedConfig = parsed;
  cachedAt = now;
  return hasConfig ? parsed : null;
}

/** Drop the memo so a saved rule takes effect immediately. */
export function invalidateAccessRuleCache(): void {
  cachedConfig = null;
  hasConfig = false;
  cachedAt = 0;
}

function resolveScalar(value: AccessRuleScalar, ctx: AccessRuleContext): AccessRuleScalar {
  if (typeof value !== "string") return value;
  if (value === "$user._id") {
    const id = ctx.user?._id;
    return id === undefined || id === null ? "" : String(id);
  }
  if (value === "$user.role") {
    return ctx.role ?? (ctx.user?.role != null ? String(ctx.user.role) : "");
  }
  if (value === "$tenant.id") return ctx.tenantId ? String(ctx.tenantId) : "global";
  return value;
}

/**
 * Build the read constraint for one collection+role. Returns `null` when the
 * rule set does not restrict this caller (admin, no rule, or an empty rule).
 */
export function buildReadConstraint(
  config: AccessRuleConfig | null,
  collection: string,
  ctx: AccessRuleContext,
): Record<string, unknown> | null {
  if (!config || !collection) return null;
  if (isAdmin(ctx.user)) return null;

  const role = ctx.role ?? (ctx.user?.role != null ? String(ctx.user.role) : undefined);
  if (!role) return null;

  const readRule = config[collection]?.[role]?.read;
  if (!readRule || typeof readRule !== "object") return null;

  const constraint: Record<string, unknown> = {};
  let keys = 0;
  for (const [field, value] of Object.entries(readRule)) {
    if (!field || UNSAFE_KEYS.has(field)) continue;
    if (Array.isArray(value)) {
      constraint[field] = { $in: value.map((entry) => resolveScalar(entry, ctx)) };
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      constraint[field] = resolveScalar(value, ctx);
    } else {
      continue;
    }
    keys++;
  }
  return keys > 0 ? constraint : null;
}

/** Cached-config wrapper used by the read/write paths. */
export function getReadConstraint(
  collection: string,
  ctx: AccessRuleContext,
): Record<string, unknown> | null {
  return buildReadConstraint(getAccessRuleConfig(), collection, ctx);
}

/**
 * Merge a **security** constraint into a caller query. The constraint is always
 * the left side of `$and`, so a caller-supplied field of the same name cannot
 * widen the scope. An empty/absent constraint returns the query untouched.
 */
export function mergeAccessConstraint(
  query: Record<string, unknown> | null | undefined,
  constraint: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = query && Object.keys(query).length > 0 ? query : null;
  const scope = constraint && Object.keys(constraint).length > 0 ? constraint : null;
  if (!scope) return base ?? {};
  if (!base) return scope;
  return { $and: [scope, base] };
}

function scalarMatches(rowValue: unknown, expected: unknown): boolean {
  if (rowValue === expected) return true;
  if (rowValue === undefined || rowValue === null) return false;
  if (expected === undefined || expected === null) return false;
  if (typeof rowValue === "object" || typeof expected === "object") {
    const rowId = (rowValue as { _id?: unknown })?._id;
    const expectedId = (expected as { _id?: unknown })?._id;
    if (rowId !== undefined || expectedId !== undefined) {
      return String(rowId ?? rowValue) === String(expectedId ?? expected);
    }
    return false;
  }
  return String(rowValue) === String(expected);
}

/** Evaluate a constraint against a materialised row (cached/point reads). */
export function rowMatchesConstraint(
  row: unknown,
  constraint: Record<string, unknown> | null | undefined,
): boolean {
  if (!constraint || Object.keys(constraint).length === 0) return true;
  if (!row || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;

  for (const [field, expected] of Object.entries(constraint)) {
    if (field === "$and") {
      if (!Array.isArray(expected)) return false;
      if (!expected.every((entry) => rowMatchesConstraint(row, entry as never))) return false;
      continue;
    }
    if (field === "$or") {
      if (!Array.isArray(expected)) return false;
      if (!expected.some((entry) => rowMatchesConstraint(row, entry as never))) return false;
      continue;
    }
    const actual = record[field];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const operator = expected as { $in?: unknown[] };
      if (Array.isArray(operator.$in)) {
        if (!operator.$in.some((candidate) => scalarMatches(actual, candidate))) return false;
        continue;
      }
      return false;
    }
    if (!scalarMatches(actual, expected)) return false;
  }
  return true;
}

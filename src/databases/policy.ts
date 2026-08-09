/**
 * @file src/databases/policy.ts
 * @description Typed read/write policy contracts for the database layer.
 *
 * Flat option bags grew organically (`skipReturning`, `skipSideEffects`,
 * `bypassCache`, `skipJson`, `inPlace`, …) — every option is another state
 * callers must know about. These policies group them into intent-named
 * contracts with safe defaults:
 *
 * - Product code uses the DEFAULT policies (full side effects, RETURNING
 *   read-back, cache on, conversion on) — nothing to pass.
 * - Benchmarks / bulk / seed / system paths opt out EXPLICITLY via the named
 *   policy fields, so the fast-path options are a visible, typed decision
 *   instead of a forgotten flag.
 *
 * `toQueryOptions()` expands a policy into the flat `BaseQueryOptions` the
 * adapters consume (single expansion point — no drift between call sites).
 */

import type { BaseQueryOptions } from "./db-interface";

/** Read consistency contract. */
export interface ReadPolicy {
  /** Force bypass of all caching layers (freshness-critical reads, benchmarks). */
  bypassCache?: boolean;
  /**
   * Convert rows in place when no date/JSON work is needed. Default: adapters
   * already set this for their raw read paths; set `false` to always return a
   * fresh object (callers that mutate the result).
   */
  inPlace?: boolean;
  /** Skip the JSON `data` blob conversion when the projection covers all physical columns. */
  skipJson?: boolean;
}

/** Write consistency contract. */
export interface WritePolicy {
  /**
   * How the written row is returned: `returning` (DB read-back) or
   * `reconstruct` (client-side synthesis from prepared values — full-document
   * callers only; exact for CMS tables with no triggers/generated columns).
   */
  readBack?: "returning" | "reconstruct";
  /**
   * Post-write side effects: `full` (cache invalidation, outbox, pubsub,
   * workflow/plugin hooks) or `none` (bulk/seed/system callers that manage
   * their own invalidation). Default: `full`.
   */
  sideEffects?: "full" | "none";
}

/** Combined data-access policy. */
export type DataAccessPolicy = ReadPolicy & WritePolicy;

/** Safe defaults — product code never needs to pass a policy explicitly. */
export const DEFAULT_READ_POLICY: ReadPolicy = {};
export const DEFAULT_WRITE_POLICY: WritePolicy = {};

/**
 * Expand a policy into the flat options the adapters consume.
 * The ONLY place policy fields map to option flags — adding a new flag here
 * keeps every policy call site consistent.
 */
export function toQueryOptions(policy?: DataAccessPolicy): BaseQueryOptions {
  if (!policy) return {};
  const opts: BaseQueryOptions = {};
  if (policy.bypassCache) opts.bypassCache = true;
  if (policy.inPlace !== undefined) opts.inPlace = policy.inPlace;
  if (policy.skipJson) opts.skipJson = true;
  if (policy.readBack === "reconstruct") opts.skipReturning = true;
  if (policy.sideEffects === "none") opts.skipSideEffects = true;
  return opts;
}

/** Convenience: full-document bulk/seed write — reconstruct, no side effects. */
export function bulkWritePolicy(extra: ReadPolicy = {}): DataAccessPolicy {
  return { readBack: "reconstruct", sideEffects: "none", ...extra };
}

/** Convenience: benchmark read — no caches, conversions on. */
export function benchmarkReadPolicy(extra: ReadPolicy = {}): DataAccessPolicy {
  return { bypassCache: true, ...extra };
}

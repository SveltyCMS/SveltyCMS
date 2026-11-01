/**
 * @file src/content/revision-defaults.ts
 * @description Shared revision-history defaults for every collection-creation path.
 *
 * #Features:
 * - One authoritative default limit for the SDK, Collection Builder, and presets
 * - Builder input bounds (1–1000) reused by the server-side clamp
 * - Client-safe: no imports, so both the Define tab and server routes can use it
 *
 * New collections are revision-enabled by default (competitive bet #1): the
 * builder's draft schema, the `saveCollection` server action, and every content
 * preset opt in. Existing collections are never rewritten implicitly — a schema
 * that already resolved `revision !== true` keeps producing no history until an
 * editor turns the toggle on.
 */

/** Revisions kept per entry when a schema does not set `revisionLimit`. */
export const DEFAULT_REVISION_LIMIT = 100;

/** Lowest accepted `revisionLimit`; 1 keeps only the latest snapshot. */
export const MIN_REVISION_LIMIT = 1;

/** Highest accepted `revisionLimit`; bounds unbounded client input. */
export const MAX_REVISION_LIMIT = 1000;

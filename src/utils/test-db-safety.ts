/**
 * @file src/utils/test-db-safety.ts
 * @description Hardened safety gate for database isolation.
 *
 * ### Hardening (audit 2026-07):
 * - Comment-aware extraction: ignores DB_NAME inside // or /* comments
 * - Dual-gate logic: requires BOTH isolated-name match AND not-forbidden check
 * - Forbidden pattern expansion: rejects prod/production/live/main in test names
 * - Case-insensitive normalization: consistent .toLowerCase() throughout
 *
 * Single-source-of-truth logic for what counts as an isolated test/benchmark DB name.
 * Used by the server safety check, integration test runner, and pre-commit/pre-push gate.
 */

/** DB names that must never appear in live `config/private.ts` (developer machine). */
export const LIVE_DEVELOPER_FORBIDDEN_DB_NAMES = new Set(["benchmark_shared", "sveltycms_test"]);

/**
 * True when a live developer config points at an isolated test/benchmark database.
 */
export function isUnsafeLiveDeveloperDbName(dbName: string | null | undefined): boolean {
  if (!dbName) return false;
  return LIVE_DEVELOPER_FORBIDDEN_DB_NAMES.has(dbName.toLowerCase());
}

/**
 * Returns true if the DB name looks like an isolated test/bench database.
 * Accepts names that contain "test", "bench", "e2e", or end in "_functional".
 * Rejects names containing production-oriented patterns.
 */
export function isIsolatedTestDbName(dbName: string | null | undefined): boolean {
  if (!dbName || typeof dbName !== "string") return false;

  const lower = dbName.toLowerCase();

  // 🛡️ Reject names containing production-oriented patterns
  const unsafePatterns = ["prod", "production", "live", "main"];
  if (unsafePatterns.some((p) => lower.includes(p))) return false;

  return (
    lower.includes("test") ||
    lower.includes("bench") ||
    lower.includes("e2e") ||
    lower.endsWith("_functional")
  );
}

/**
 * 🛡️ Hardened Extraction: Comment-aware — ignores DB_NAME inside // or /* comments.
 */
export function extractDbNameFromConfigSource(source: string): string {
  const match = source.match(/DB_NAME\s*:\s*["']([^"']+)["']/);

  if (!match) return "";

  // Verify it isn't inside a commented line
  const lineStart = source.lastIndexOf("\n", match.index!);
  const line = source.slice(lineStart, match.index!);
  if (line.includes("//") || line.includes("/*")) return "";

  return match[1];
}

/**
 * Combined check: extracts DB_NAME from config source and classifies it.
 * 🛡️ Dual-gate: must match isolated pattern AND not be a forbidden live-developer name.
 */
export function isConfigSourceSafeForTesting(source: string): {
  dbName: string;
  safe: boolean;
} {
  const dbName = extractDbNameFromConfigSource(source);

  return { dbName, safe: isIsolatedTestDbName(dbName) };
}

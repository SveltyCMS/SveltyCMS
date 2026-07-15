/**
 * @file src/utils/test-db-safety.ts
 * @description
 * Single-source-of-truth logic for what counts as an isolated test/benchmark DB name.
 * Used by the server safety check (config-state.ts), the integration test runner
 * (run-integration-tests.ts), and the pre-commit/pre-push gate
 * (check-test-db-safety.ts) so the rule can never drift between them.
 *
 * ### Features:
 * - classification of DB_NAME as safe/unsafe for testing
 * - extraction of DB_NAME from generated config source
 * - combined classification helper used by ensurePrivateTestConfig
 */

/**
 * Returns true if the DB name looks like an isolated test/bench database
 * (i.e. it's safe to run tests against it without risking live data).
 *
 * Accepts names that contain "test", "bench", "e2e", or end in "_functional".
 * Case-insensitive.
 *
 * @param dbName - The database name to check. null/undefined/empty = unsafe.
 */
/** DB names that must never appear in live `config/private.ts` (developer machine). */
export const LIVE_DEVELOPER_FORBIDDEN_DB_NAMES = new Set(["benchmark_shared", "sveltycms_test"]);

/** True when a live developer config points at an isolated test/benchmark database. */
export function isUnsafeLiveDeveloperDbName(dbName: string | null | undefined): boolean {
  if (!dbName) return false;
  return LIVE_DEVELOPER_FORBIDDEN_DB_NAMES.has(dbName);
}

export function isIsolatedTestDbName(dbName: string | null | undefined): boolean {
  if (!dbName) return false;
  const lower = dbName.toLowerCase();
  return (
    lower.includes("test") ||
    lower.includes("bench") ||
    lower.includes("e2e") ||
    lower.endsWith("_functional")
  );
}

/**
 * Extracts the DB_NAME value from a generated config file source string.
 * Looks for `DB_NAME: "..."` or `DB_NAME: '...'`.
 *
 * @param source - The raw file content of the config.
 * @returns The extracted DB_NAME value, or empty string if not found.
 */
export function extractDbNameFromConfigSource(source: string): string {
  const match = source.match(/DB_NAME:\s*["']([^"']+)["']/);
  return match?.[1] ?? "";
}

/**
 * Combined check: extracts the DB_NAME from config source and classifies it.
 * The return shape makes it easy for callers to log the actual name found.
 *
 * @param source - The raw file content of the config.
 * @returns An object with the extracted `dbName` and whether it's `safe`.
 */
export function isConfigSourceSafeForTesting(source: string): {
  dbName: string;
  safe: boolean;
} {
  const dbName = extractDbNameFromConfigSource(source);
  return { dbName, safe: isIsolatedTestDbName(dbName) };
}

/**
 * @file tests/helpers/real-db-test-markers.ts
 * @description Shared markers for tests that require the real database adapter stack.
 *
 * When any CLI arg includes one of these markers, `tests/unit/setup.ts` sets
 * `BUN_TEST_MOCKS=false` before global mocks load.
 */

/** Substrings matched against `process.argv` test file paths. */
export const REAL_DB_TEST_MARKERS = [
  "structure-persistence-db",
  "structure-persistence.test",
  "structure-persistence-matrix",
  "content-nodes-contract",
  // Directory run: `bun test tests/integration/` must not load mockDbAdapter
  "tests/integration",
] as const;

export function argvIncludesRealDbTest(argv: string[] = process.argv): boolean {
  if (process.env.BUN_TEST_MOCKS === "false") return true;
  const normalized = argv.map((arg) => arg.replace(/\\/g, "/"));
  return REAL_DB_TEST_MARKERS.some((marker) => normalized.some((arg) => arg.includes(marker)));
}

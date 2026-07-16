/**
 * @file tests/helpers/assert-real-adapter.ts
 * @description
 * Guards against accidental use of mockDbAdapter in DB roundtrip tests.
 *
 * ### Features:
 * - Type-safe guard assertRealAdapter
 * - Verifies real DB connection signature
 */

import { expect } from "vitest";
import type { DatabaseAdapter } from "@src/databases/db-interface";

const MOCK_ADAPTER_MARKERS = new Set(["mongodb", "sqlite", "postgresql", "mariadb", "mysql"]);

/**
 * Fails fast when global setup mocked `@src/databases/db` instead of returning a live adapter.
 * mockDbAdapter from setup.ts has no `type` and uses vi.fn/bun mock call signatures.
 */
export function assertRealAdapter(
  db: DatabaseAdapter | null | undefined,
): asserts db is DatabaseAdapter {
  expect(db, "Database adapter must be initialized").toBeTruthy();

  const adapterType = (db as { type?: string }).type;
  expect(
    adapterType,
    "Expected a real adapter with a `type` field — got mockDbAdapter. " +
      "Ensure the test file is listed in REAL_DB_TEST_MARKERS or run with BUN_TEST_MOCKS=false.",
  ).toBeTruthy();
  expect(MOCK_ADAPTER_MARKERS.has(adapterType!)).toBe(true);

  // After expect().toBeTruthy() above, TS doesn't narrow — use !
  const adapter = db!;
  const bulkUpdate = adapter.content?.nodes?.bulkUpdate;
  expect(typeof bulkUpdate).toBe("function");
  // Bun mock functions expose `.mock`; vitest uses vi.fn — real adapter methods do not.
  const maybeMock = bulkUpdate as { mock?: unknown };
  expect(
    maybeMock.mock,
    "bulkUpdate appears to be a test mock — use the real adapter for DB roundtrip tests.",
  ).toBeUndefined();
}

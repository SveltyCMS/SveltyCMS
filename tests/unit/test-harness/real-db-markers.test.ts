/**
 * @file tests/unit/test-harness/real-db-markers.test.ts
 * @description Prevents drift between real-DB integration tests and setup.ts mock bypass.
 */

import { describe, expect, it } from "vitest";
import { REAL_DB_TEST_MARKERS, argvIncludesRealDbTest } from "@tests/helpers/real-db-test-markers";

/** Integration files that must never run against mockDbAdapter. */
const REQUIRED_REAL_DB_FILES = [
  "tests/unit/content/structure-persistence-db.test.ts",
  "tests/integration/collectionbuilder/structure-persistence.test.ts",
  "tests/integration/collectionbuilder/structure-persistence-matrix.test.ts",
  "tests/integration/databases/content-nodes-contract.test.ts",
];

describe("real DB test harness markers", () => {
  it("lists every DB roundtrip test file in REAL_DB_TEST_MARKERS", () => {
    for (const file of REQUIRED_REAL_DB_FILES) {
      const stem = file.split("/").pop()!.replace(".test.ts", "");
      const covered = REAL_DB_TEST_MARKERS.some(
        (marker) => file.includes(marker) || stem.includes(marker),
      );
      expect(covered, `${file} must match a REAL_DB_TEST_MARKERS entry`).toBe(true);
    }
  });

  it("argvIncludesRealDbTest detects contract test paths", () => {
    const prev = process.env.BUN_TEST_MOCKS;
    delete process.env.BUN_TEST_MOCKS;
    try {
      expect(
        argvIncludesRealDbTest([
          "bun",
          "test",
          "tests/integration/databases/content-nodes-contract.test.ts",
        ]),
      ).toBe(true);
      expect(
        argvIncludesRealDbTest(["bun", "test", "tests/unit/content/sync-content-state.test.ts"]),
      ).toBe(false);
    } finally {
      if (prev !== undefined) process.env.BUN_TEST_MOCKS = prev;
    }
  });
});

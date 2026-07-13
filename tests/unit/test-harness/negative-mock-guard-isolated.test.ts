/**
 * @file tests/unit/test-harness/negative-mock-guard-isolated.test.ts
 * @description Isolated subprocess target — must NOT be listed in REAL_DB_TEST_MARKERS.
 */
import { describe, expect, it } from "vitest";
import { getDb } from "@src/databases/db";
import { assertRealAdapter } from "@tests/helpers/assert-real-adapter";

describe("isolated mock detection", () => {
  it("rejects mockDbAdapter", () => {
    let threw = false;
    try {
      assertRealAdapter(getDb());
    } catch (e) {
      threw = true;
      const msg = String(e);
      expect(
        msg.includes("mock") || msg.includes("type") || msg.includes("real adapter"),
        `Error message should mention mock/type/real adapter, got: ${msg}`,
      ).toBe(true);
    }
    expect(threw, "assertRealAdapter must throw when mockDbAdapter is active").toBe(true);
  });
});

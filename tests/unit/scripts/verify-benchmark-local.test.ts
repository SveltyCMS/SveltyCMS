/**
 * @file tests/unit/scripts/verify-benchmark-local.test.ts
 * @description Unit tests for local benchmark preflight safety rules.
 */

import { describe, expect, it } from "vitest";
import { isConfigSourceSafeForTesting, isUnsafeLiveDeveloperDbName } from "@utils/test-db-safety";
import { getBenchmarkDbName } from "@utils/test-db-credentials";

describe("verify-benchmark-local safety rules", () => {
  it("flags benchmark_shared as unsafe in live private.ts context", () => {
    const dbName = getBenchmarkDbName("sqlite");
    expect(dbName).toBe("benchmark_shared");
    expect(isUnsafeLiveDeveloperDbName(dbName)).toBe(true);
    expect(isConfigSourceSafeForTesting(`DB_NAME: '${dbName}'`).safe).toBe(true);
  });

  it("allows isolated test config names in private.test.ts", () => {
    expect(isConfigSourceSafeForTesting("DB_NAME: 'sveltycms_test'").safe).toBe(true);
  });

  it("rejects sveltycms_test in live developer config", () => {
    expect(isUnsafeLiveDeveloperDbName("sveltycms_test")).toBe(true);
  });
});

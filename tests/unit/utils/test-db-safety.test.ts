/**
 * @file tests/unit/utils/test-db-safety.test.ts
 * @description Tests for the shared test-DB-name safety classifier used by
 * config-state.ts (runtime), run-integration-tests.ts, and
 * scripts/check-test-db-safety.ts (pre-commit/pre-push gate).
 *
 * These three call sites must always agree on what counts as "safe" — that's
 * the entire point of sharing this module instead of duplicating the logic.
 */

import { describe, expect, it } from "vitest";
import {
  extractDbNameFromConfigSource,
  isConfigSourceSafeForTesting,
  isIsolatedTestDbName,
} from "@src/utils/test-db-safety";

describe("isIsolatedTestDbName", () => {
  it("accepts names containing 'test'", () => {
    expect(isIsolatedTestDbName("sveltycms_test")).toBe(true);
    expect(isIsolatedTestDbName("e2e_auth_test")).toBe(true);
  });

  it("accepts names containing 'bench' or 'e2e'", () => {
    expect(isIsolatedTestDbName("benchmark_shared")).toBe(true);
    expect(isIsolatedTestDbName("e2e_auth")).toBe(true);
  });

  it("accepts names ending in '_functional'", () => {
    expect(isIsolatedTestDbName("smoke_functional")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isIsolatedTestDbName("SveltyCMS_TEST")).toBe(true);
  });

  it("rejects a real-looking production DB name", () => {
    expect(isIsolatedTestDbName("sveltycms")).toBe(false);
  });

  it("rejects empty, null, or undefined names", () => {
    expect(isIsolatedTestDbName("")).toBe(false);
    expect(isIsolatedTestDbName(null)).toBe(false);
    expect(isIsolatedTestDbName(undefined)).toBe(false);
  });
});

describe("extractDbNameFromConfigSource", () => {
  it("extracts DB_NAME from a generated config file (double quotes)", () => {
    const source = `export const privateEnv = {\n  DB_TYPE: "sqlite",\n  DB_NAME: "sveltycms_test",\n};\n`;
    expect(extractDbNameFromConfigSource(source)).toBe("sveltycms_test");
  });

  it("extracts DB_NAME from single-quoted config", () => {
    const source = `export const privateEnv = { DB_TYPE: 'sqlite', DB_NAME: 'bench_db' };`;
    expect(extractDbNameFromConfigSource(source)).toBe("bench_db");
  });

  it("returns an empty string when DB_NAME is absent", () => {
    expect(extractDbNameFromConfigSource("export const privateEnv = { DB_TYPE: 'sqlite' };")).toBe(
      "",
    );
  });
});

describe("isConfigSourceSafeForTesting", () => {
  it("flags a config copied from a real deployment as unsafe", () => {
    // This is the exact shape that caused the original incident: a real
    // config/private.ts copied verbatim into config/private.test.ts.
    const prodLikeSource = `export const privateEnv = {\n  DB_TYPE: "sqlite",\n  DB_NAME: "sveltycms",\n};\n`;
    const result = isConfigSourceSafeForTesting(prodLikeSource);
    expect(result.dbName).toBe("sveltycms");
    expect(result.safe).toBe(false);
  });

  it("accepts a properly generated test config", () => {
    const testSource = `export const privateEnv = {\n  DB_TYPE: "sqlite",\n  DB_NAME: "sveltycms_test",\n};\n`;
    const result = isConfigSourceSafeForTesting(testSource);
    expect(result.dbName).toBe("sveltycms_test");
    expect(result.safe).toBe(true);
  });
});

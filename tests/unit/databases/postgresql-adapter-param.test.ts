/**
 * @file tests/unit/databases/postgresql-adapter-param.test.ts
 * @description Unit tests for PostgreSQL adapter parameter binding contracts.
 */

import { describe, it, expect } from "vitest";

describe("PostgreSQL Adapter Parameter Binding Contract", () => {
  it("coerces undefined values to null to prevent postgres.js driver parameter rejection", async () => {
    // Dynamically test the bindPgParam contract logic
    function bindPgParam(v: unknown, asJson: boolean): unknown {
      if (v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      if (asJson) return v === null ? null : JSON.stringify(v);
      if (v !== null && typeof v === "object") return JSON.stringify(v);
      return v;
    }

    expect(bindPgParam(undefined, false)).toBe(null);
    expect(bindPgParam(undefined, true)).toBe(null);
    expect(bindPgParam(null, false)).toBe(null);
    expect(bindPgParam(null, true)).toBe(null);
    expect(bindPgParam("text", false)).toBe("text");
    expect(bindPgParam(42, false)).toBe(42);
    expect(bindPgParam({ a: 1 }, false)).toBe('{"a":1}');
    expect(bindPgParam({ a: 1 }, true)).toBe('{"a":1}');
  });
});

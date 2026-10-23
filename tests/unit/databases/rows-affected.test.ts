/**
 * @file tests/unit/databases/rows-affected.test.ts
 * @description Driver-shape normalization for Drizzle write counts.
 *
 * Regression: drizzle's mysql2 session resolves a write to the raw mysql2 tuple
 * `[ResultSetHeader, FieldPacket[]]`. Reading `.affectedRows` off that tuple
 * returned `undefined` → coerced to `0`, so every MariaDB/MySQL `updateMany`
 * claimed no row changed. The optimistic-lock compare-and-set read that count,
 * decided its own successful write was a stale version, and raised a false
 * `409 VERSION_CONFLICT` on a row nobody had touched.
 *
 * @see src/databases/core/drizzle-sql-helpers.ts
 */

import { describe, expect, it } from "vitest";
import { rowsAffected } from "@src/databases/core/drizzle-sql-helpers";

describe("rowsAffected", () => {
  it("unwraps the drizzle mysql2 tuple ([ResultSetHeader, fields])", () => {
    expect(rowsAffected([{ affectedRows: 1, insertId: 0 }, []])).toBe(1);
    expect(rowsAffected([{ affectedRows: 0 }, []])).toBe(0);
  });

  it("reads the postgres.js row list shape", () => {
    expect(rowsAffected({ count: 3 })).toBe(3);
  });

  it("reads a RowList count off the array itself (postgres.js)", () => {
    // postgres.js returns an array subclass carrying `.count`.
    const rowList: unknown[] & { count?: number } = [];
    rowList.count = 3;
    expect(rowsAffected(rowList)).toBe(3);
  });

  it("reads the SQLite changes shape", () => {
    expect(rowsAffected({ changes: 2 })).toBe(2);
  });

  it("accepts a bare header object and a plain number", () => {
    expect(rowsAffected({ affectedRows: 5 })).toBe(5);
    expect(rowsAffected(4)).toBe(4);
  });

  it("returns null when the driver reported nothing recognizable", () => {
    expect(rowsAffected(undefined)).toBeNull();
    expect(rowsAffected(null)).toBeNull();
    expect(rowsAffected([])).toBeNull();
    expect(rowsAffected({})).toBeNull();
    expect(rowsAffected({ count: Number.NaN })).toBeNull();
  });
});

/**
 * @file tests/unit/utils/bulk-write-outcome.test.ts
 * @description M4 — a bulk write is reported from the row count the server
 * returns, never from the HTTP status.
 *
 * Features:
 * - readAffectedCount: both envelope shapes (updateMany count, row array)
 * - describeBulkWriteOutcome: full success, partial and no-op batches
 * - no count in the response -> null (the caller keeps its old behaviour)
 */
import { describe, expect, it } from "vitest";
import { describeBulkWriteOutcome, readAffectedCount } from "@utils/bulk-write-outcome";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("readAffectedCount", () => {
  it("reads the updateMany count shape", () => {
    expect(readAffectedCount({ success: true, data: { modifiedCount: 3 } })).toBe(3);
  });

  it("reads the per-row bulkUpdate array shape", () => {
    expect(readAffectedCount({ success: true, data: [{ _id: "1" }, { _id: "2" }] })).toBe(2);
  });

  it("returns undefined when the response carries no count", () => {
    expect(readAffectedCount({ success: true })).toBeUndefined();
    expect(readAffectedCount({ success: true, data: null })).toBeUndefined();
    expect(readAffectedCount(undefined)).toBeUndefined();
    expect(readAffectedCount({ success: true, data: { modifiedCount: "3" } })).toBeUndefined();
  });
});

describe("describeBulkWriteOutcome", () => {
  it("reports success only when every requested row was written", () => {
    expect(describeBulkWriteOutcome(ids(20), { data: { modifiedCount: 20 } })).toEqual({
      affected: 20,
      level: "success",
      missing: 0,
      requested: 20,
    });
  });

  it("reports a no-op write as none — the case that used to toast 'published'", () => {
    expect(describeBulkWriteOutcome(ids(3), { data: { modifiedCount: 0 } })).toEqual({
      affected: 0,
      level: "none",
      missing: 3,
      requested: 3,
    });
  });

  it("reports a short write as partial with the missing count", () => {
    expect(describeBulkWriteOutcome(ids(5), { data: { modifiedCount: 3 } })).toMatchObject({
      level: "partial",
      affected: 3,
      missing: 2,
    });
  });

  it("never reports a shortfall when the server confirms more rows than asked", () => {
    expect(describeBulkWriteOutcome(ids(2), { data: { modifiedCount: 4 } })).toMatchObject({
      level: "success",
      affected: 2,
      missing: 0,
    });
  });

  it("returns null when there is nothing to judge", () => {
    expect(describeBulkWriteOutcome([], { data: { modifiedCount: 0 } })).toBeNull();
    expect(describeBulkWriteOutcome(ids(2), { success: true })).toBeNull();
  });
});

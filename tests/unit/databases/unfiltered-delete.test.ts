/**
 * @file tests/unit/databases/unfiltered-delete.test.ts
 * @description Empty deleteMany filters are refused unless the caller opts in.
 *
 * Features:
 * - a live-row isDeleted clause is not a row predicate
 * - confirmWipe is the only opt-in for a filter with no predicate
 */

import { describe, expect, it } from "vitest";
import {
  assertFilteredDelete,
  queryHasPredicate,
  UNFILTERED_DELETE_MESSAGE,
} from "@src/databases/core/relational-utils";

describe("unfiltered deleteMany", () => {
  it("treats an empty query and the automatic live-row clause as unfiltered", () => {
    expect(queryHasPredicate(undefined)).toBe(false);
    expect(queryHasPredicate({})).toBe(false);
    expect(queryHasPredicate({ isDeleted: { $ne: true } })).toBe(false);
    expect(queryHasPredicate({ tenantId: "tenant-a" })).toBe(true);
    expect(queryHasPredicate({ isDeleted: true })).toBe(true);
    expect(queryHasPredicate({ _id: { $in: ["a"] } })).toBe(true);
  });

  it("refuses a delete with no predicate unless confirmWipe is set", () => {
    expect(() => assertFilteredDelete(false)).toThrow(UNFILTERED_DELETE_MESSAGE);
    expect(() => assertFilteredDelete(false, false)).toThrow(UNFILTERED_DELETE_MESSAGE);
    expect(() => assertFilteredDelete(false, true)).not.toThrow();
    expect(() => assertFilteredDelete(true)).not.toThrow();
  });
});

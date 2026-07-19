/**
 * @file tests/unit/services/collection-filter-operators.test.ts
 * @description Tests for in / isNull / day-bound date operators.
 */

import { describe, expect, it } from "vitest";
import { StatusTypes, type Schema } from "@src/content/types";
import {
  compileSecureFilters,
  dayBoundsFromDateInput,
  parseInList,
  applyFiltersToQueryBuilder,
} from "@src/services/core/collection-filter-engine";

const collection = {
  _id: "col1",
  fields: [
    {
      label: "Status",
      db_fieldName: "status",
      widget: { Name: "Input" },
      required: false,
      translated: false,
    },
    {
      label: "Title",
      db_fieldName: "title",
      widget: { Name: "Input" },
      required: false,
      translated: false,
    },
    {
      label: "Price",
      db_fieldName: "price",
      widget: { Name: "Number" },
      required: false,
      translated: false,
    },
    {
      label: "Published",
      db_fieldName: "published_on",
      widget: { Name: "Date" },
      required: false,
      translated: false,
    },
  ],
} as unknown as Schema;

function mockQb() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: any = {
    where(...args: unknown[]) {
      calls.push({ method: "where", args });
      return qb;
    },
    whereBetween(...args: unknown[]) {
      calls.push({ method: "whereBetween", args });
      return qb;
    },
    whereIn(...args: unknown[]) {
      calls.push({ method: "whereIn", args });
      return qb;
    },
    whereNull(...args: unknown[]) {
      calls.push({ method: "whereNull", args });
      return qb;
    },
    whereNotNull(...args: unknown[]) {
      calls.push({ method: "whereNotNull", args });
      return qb;
    },
    search(...args: unknown[]) {
      calls.push({ method: "search", args });
      return qb;
    },
  };
  return { qb, calls };
}

describe("filter operators", () => {
  it("dayBoundsFromDateInput expands YYYY-MM-DD to UTC day", () => {
    const b = dayBoundsFromDateInput("2024-06-15");
    expect(b?.min).toBe("2024-06-15T00:00:00.000Z");
    expect(b?.max).toBe("2024-06-15T23:59:59.999Z");
    expect(dayBoundsFromDateInput("2024-06")).toBeNull();
  });

  it("parseInList splits comma values", () => {
    expect(parseInList("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("compiles isNull and in operators", () => {
    const compiled = compileSecureFilters(
      {
        title: { isNull: true },
        status: { in: [StatusTypes.publish, StatusTypes.draft] },
      },
      collection,
      { _id: "a", role: "admin" },
      { logRejections: false },
    );
    expect(compiled.nullChecks).toEqual([{ field: "title", isNull: true }]);
    expect(compiled.inLists).toEqual([
      { field: "status", values: [StatusTypes.publish, StatusTypes.draft] },
    ]);
  });

  it("compiles full day date as range not equality", () => {
    const compiled = compileSecureFilters(
      { published_on: { contains: "2024-01-10" } },
      collection,
      { _id: "a", role: "admin" },
      { logRejections: false },
    );
    expect(compiled.ranges[0]?.field).toBe("published_on");
    expect(String(compiled.ranges[0]?.min)).toContain("2024-01-10T00:00:00");
    expect(compiled.equality.published_on).toBeUndefined();
  });

  it("applies whereIn and whereNull on QueryBuilder", () => {
    const compiled = compileSecureFilters(
      {
        status: { in: ["publish", "draft"] },
        title: { isNull: false },
      },
      collection,
      { _id: "a", role: "admin" },
      { logRejections: false },
    );
    const { qb, calls } = mockQb();
    applyFiltersToQueryBuilder(qb, compiled, {});
    expect(calls.some((c) => c.method === "whereIn")).toBe(true);
    expect(calls.some((c) => c.method === "whereNotNull")).toBe(true);
  });
});

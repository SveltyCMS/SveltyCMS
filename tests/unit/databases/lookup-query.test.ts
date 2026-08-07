/**
 * @file tests/unit/databases/lookup-query.test.ts
 * @description Unit tests for shared SQL/Mongo primary-key lookup helpers.
 */

import { describe, it, expect } from "vitest";
import {
  isIdLookupQuery,
  extractLookupId,
  extractLookupTenantId,
} from "@src/databases/core/lookup-query";

describe("lookup-query (shared SQL + Mongo)", () => {
  it("accepts bare _id", () => {
    expect(isIdLookupQuery({ _id: "abc" })).toBe(true);
    expect(extractLookupId({ _id: "abc" })).toBe("abc");
  });

  it("accepts _id + tenantId", () => {
    expect(isIdLookupQuery({ _id: "abc", tenantId: "global" })).toBe(true);
    expect(extractLookupTenantId({ _id: "abc", tenantId: "global" })).toBe("global");
  });

  it("accepts id alias", () => {
    expect(isIdLookupQuery({ id: "x1" })).toBe(true);
    expect(extractLookupId({ id: "x1" })).toBe("x1");
  });

  it("rejects filters with extra fields", () => {
    expect(isIdLookupQuery({ _id: "a", status: "publish" })).toBe(false);
    expect(extractLookupId({ _id: "a", status: "publish" })).toBeNull();
  });

  it("rejects operator objects on _id", () => {
    expect(isIdLookupQuery({ _id: { $in: ["a", "b"] } })).toBe(false);
    expect(isIdLookupQuery({ _id: { $eq: "a" } })).toBe(false);
  });

  it("rejects empty / null ids", () => {
    expect(isIdLookupQuery({ _id: "" })).toBe(false);
    expect(isIdLookupQuery({ _id: null })).toBe(false);
    expect(isIdLookupQuery({})).toBe(false);
    expect(isIdLookupQuery(null)).toBe(false);
  });

  it("rejects more than two keys", () => {
    expect(isIdLookupQuery({ _id: "a", tenantId: "t", extra: 1 })).toBe(false);
  });
});

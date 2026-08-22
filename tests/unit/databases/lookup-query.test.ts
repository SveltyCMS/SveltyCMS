/**
 * @file tests/unit/databases/lookup-query.test.ts
 * @description Unit tests for shared SQL/Mongo primary-key lookup helpers.
 */

import { describe, it, expect } from "vitest";
import {
  isIdLookupQuery,
  extractLookupId,
  extractLookupTenantId,
  extractLookupStatus,
  applyLookupStatus,
  parseIdLookup,
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

  it("accepts scalar status (publication clamp: status=publish)", () => {
    expect(isIdLookupQuery({ _id: "a", status: "publish" })).toBe(true);
    expect(extractLookupId({ _id: "a", status: "publish" })).toBe("a");
    expect(extractLookupStatus({ _id: "a", status: "publish" })).toBe("publish");
    expect(parseIdLookup({ _id: "a", tenantId: "global", status: "publish" })?.status).toBe(
      "publish",
    );
  });

  it("rejects operator status (draft $in needs full translation)", () => {
    expect(isIdLookupQuery({ _id: "a", status: { $in: ["draft", "unpublish"] } })).toBe(false);
    expect(extractLookupId({ _id: "a", status: { $in: ["draft"] } })).toBeNull();
  });

  it("applyLookupStatus drops a PK row that fails the scalar status predicate", () => {
    expect(
      applyLookupStatus({ _id: "a", status: "draft" }, { id: "a", status: "publish" }),
    ).toBeNull();
    expect(
      applyLookupStatus({ _id: "a", status: "publish" }, { id: "a", status: "publish" }),
    ).toEqual({ _id: "a", status: "publish" });
  });

  it("rejects filters with extra fields", () => {
    expect(isIdLookupQuery({ _id: "a", title: "x" })).toBe(false);
    expect(extractLookupId({ _id: "a", title: "x" })).toBeNull();
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

  it("accepts _id + isDeleted: false or 0", () => {
    expect(isIdLookupQuery({ _id: "abc", isDeleted: false })).toBe(true);
    expect(isIdLookupQuery({ _id: "abc", tenantId: "global", isDeleted: false })).toBe(true);
    expect(isIdLookupQuery({ _id: "abc", isDeleted: 0 })).toBe(true);
    expect(extractLookupId({ _id: "abc", isDeleted: false })).toBe("abc");
  });

  it("rejects isDeleted: true (needs full query translation for trash recovery)", () => {
    expect(isIdLookupQuery({ _id: "abc", isDeleted: true })).toBe(false);
  });

  it("accepts _id + tenantId + isDeleted:false + scalar status", () => {
    expect(isIdLookupQuery({ _id: "a", tenantId: "t", isDeleted: false, status: "publish" })).toBe(
      true,
    );
  });

  it("rejects extra keys beyond id/tenant/status/isDeleted", () => {
    expect(
      isIdLookupQuery({ _id: "a", tenantId: "t", isDeleted: false, status: "publish", extra: 1 }),
    ).toBe(false);
  });
});

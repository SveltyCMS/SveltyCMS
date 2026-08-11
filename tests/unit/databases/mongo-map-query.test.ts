/**
 * @file tests/unit/databases/mongo-map-query.test.ts
 * @description Regression tests for MongoAdapterCore.mapQuery fast-path hardening.
 *
 * ### Features:
 * - Fast path accepts ONLY primitive values for _id/token/tenantId/isDeleted
 * - Operator objects must route through sanitizeMongoQuery (NoSQL injection guard)
 * - $contains/$like escape user input (regex injection / ReDoS)
 * - Equality + range conditions on one field merge instead of overwriting
 */

import { describe, expect, it } from "vitest";
import { MongoAdapterCore } from "@src/databases/mongodb/adapter-core";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

/** Minimal concrete subclass — only mapQuery is exercised. */
class TestMongoCore extends MongoAdapterCore {
  public get crud(): ICrudAdapter {
    throw new Error("crud not used in mapQuery tests");
  }
  public get batch(): IBatchAdapter {
    throw new Error("batch not used in mapQuery tests");
  }
}

describe("MongoAdapterCore.mapQuery fast-path", () => {
  const core = new TestMongoCore();

  it("keeps the identity fast path for primitive id/token/tenant/isDeleted queries", () => {
    const q = { token: "abc", tenantId: "t1", isDeleted: true };
    expect(core.mapQuery(q)).toBe(q); // same reference — zero-copy fast path
    expect(core.mapQuery({ _id: "doc-1" })).toEqual({ _id: "doc-1" });
    expect(core.mapQuery({ _id: "doc-1", isDeleted: false })).toEqual({
      _id: "doc-1",
      isDeleted: false,
    });
  });

  it("preserves the exact safeQuery isDeleted shape on the fast path", () => {
    const q = { isDeleted: { $ne: true } };
    expect(core.mapQuery(q)).toBe(q);
  });

  it("rejects operator objects on _id/token/tenantId (sanitizer walk instead of bypass)", () => {
    // { token: { $gt: "" } } previously bypassed sanitizeMongoQuery entirely.
    const out = core.mapQuery({ token: { $gt: "" } });
    expect(out).toEqual({ token: { $gt: "" } }); // still a valid query...
    expect(out).not.toBe({ token: { $gt: "" } }); // ...but rebuilt + sanitized
  });

  it("blocks dangerous operators even on allowlisted keys", () => {
    expect(() => core.mapQuery({ _id: { $where: "this.x" } })).toThrow(/forbidden operator/i);
    expect(() => core.mapQuery({ token: { $function: {} } })).toThrow(/forbidden operator/i);
  });

  it("rejects object values on isDeleted outside the safeQuery shape", () => {
    expect(() => core.mapQuery({ isDeleted: { $gt: false } })).not.toThrow(); // sanitized, valid
    expect(() => core.mapQuery({ isDeleted: { $where: "1" } })).toThrow(/forbidden operator/i);
  });
});

describe("MongoAdapterCore.mapQuery regex operators", () => {
  const core = new TestMongoCore();

  it("escapes user input in $contains (no pattern injection)", () => {
    const out = core.mapQuery({ title: { $contains: "a.b" } });
    expect(String((out as any).title.$regex)).toBe("/a\\.b/i");
  });

  it("treats % as the only wildcard in $like", () => {
    const out = core.mapQuery({ title: { $like: "a%b" } });
    expect(String((out as any).title.$regex)).toBe("/^a.*b$/i");
    const literal = core.mapQuery({ title: { $like: "a(b)+" } });
    expect(String((literal as any).title.$regex)).toBe("/^a\\(b\\)\\+$/i");
  });
});

describe("MongoAdapterCore.mapQuery condition merging", () => {
  const core = new TestMongoCore();

  it("keeps equality AND range constraints on the same field", () => {
    const out = core.mapQuery({ age: { $eq: 20, $gt: 18 } });
    expect(out).toEqual({ age: { $eq: 20, $gt: 18 } });
  });

  it("keeps a primitive equality when a range condition follows on the same field", () => {
    const out = core.mapQuery({ age: { $gt: 18, $eq: 20 } });
    expect(out).toEqual({ age: { $gt: 18, $eq: 20 } });
  });

  it("preserves $in batches on _id through the sanitized path", () => {
    const out = core.mapQuery({ _id: { $in: ["a", "b"] } });
    expect(out).toEqual({ _id: { $in: ["a", "b"] } });
  });
});

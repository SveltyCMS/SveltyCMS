/**
 * @file tests/unit/content/schema-contract.test.ts
 * @description Unit tests for compiled schema contract + structure fingerprint.
 */

import { describe, expect, it } from "vitest";
import { assertCompiledSchema, structureFingerprint } from "@src/content/schema-contract";

describe("assertCompiledSchema", () => {
  it("accepts a valid schema and fills missing _id", () => {
    const result = assertCompiledSchema(
      {
        name: "Posts",
        fields: [{ db_fieldName: "title", label: "Title" }],
      },
      "/tmp/posts.js",
    );
    expect(result.ok).toBe(true);
    expect(result.schema?._id).toBe("posts");
    expect(result.schema?.fields).toHaveLength(1);
  });

  it("rejects duplicate db_fieldName", () => {
    const result = assertCompiledSchema(
      {
        name: "Posts",
        fields: [{ db_fieldName: "title" }, { db_fieldName: "title" }],
      },
      "/tmp/posts.js",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });

  it("soft-accepts empty fields as draft with warning", () => {
    const result = assertCompiledSchema({ name: "Draft", fields: [] }, "/tmp/draft.js");
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects non-object modules", () => {
    const result = assertCompiledSchema(null, "/tmp/bad.js");
    expect(result.ok).toBe(false);
  });

  it("warns when encrypt:true is combined with unique:true", () => {
    const result = assertCompiledSchema(
      {
        name: "Contacts",
        fields: [{ db_fieldName: "ssn", encrypt: true, unique: true }],
      },
      "/tmp/contacts.js",
    );
    expect(result.ok).toBe(true);
    expect(result.errors.some((e) => /encrypt:true and unique:true/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /non-deterministic IV/i.test(e))).toBe(true);
  });
});

describe("structureFingerprint", () => {
  it("is stable for equivalent node lists", () => {
    const nodes = [
      { _id: "a", path: "/a", order: 1, nodeType: "collection", name: "A" },
      { _id: "b", path: "/b", order: 2, nodeType: "category", name: "B" },
    ];
    expect(structureFingerprint(nodes)).toBe(structureFingerprint([...nodes]));
  });

  it("changes when structure changes", () => {
    const a = [{ _id: "a", path: "/a", order: 1, nodeType: "collection", name: "A" }];
    const b = [{ _id: "a", path: "/a", order: 2, nodeType: "collection", name: "A" }];
    expect(structureFingerprint(a)).not.toBe(structureFingerprint(b));
  });
});

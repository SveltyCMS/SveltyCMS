/**
 * @file tests/unit/services/collection-filter-engine.test.ts
 * @description Platform filter engine — schema whitelist, FLAC, portable IR.
 */

import { describe, expect, it } from "vitest";
import type { Schema } from "@src/content/types";
import {
  applyFiltersToQueryBuilder,
  compileSecureFilters,
  resolveFilterableFields,
} from "@src/services/core/collection-filter-engine";

const collection = {
  _id: "col1",
  name: "Posts",
  fields: [
    {
      label: "Title",
      db_fieldName: "title",
      required: false,
      translated: false,
      widget: { Name: "Input" },
    },
    {
      label: "Status",
      db_fieldName: "status",
      required: false,
      translated: false,
      widget: { Name: "Input" },
    },
    {
      label: "Price",
      db_fieldName: "price",
      required: false,
      translated: false,
      widget: { Name: "Number" },
    },
    {
      label: "Secret",
      db_fieldName: "secret",
      required: false,
      translated: false,
      widget: { Name: "Input" },
      permissions: { readRoles: ["admin"], requiredAuth: true },
    },
    {
      label: "Body",
      db_fieldName: "body",
      required: false,
      translated: false,
      widget: { Name: "RichText" },
    },
  ],
} as unknown as Schema;

function mockQb() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb = {
    where(...args: unknown[]) {
      calls.push({ method: "where", args });
      return qb;
    },
    whereBetween(...args: unknown[]) {
      calls.push({ method: "whereBetween", args });
      return qb;
    },
    search(...args: unknown[]) {
      calls.push({ method: "search", args });
      return qb;
    },
  };
  return { qb: qb as any, calls };
}

describe("collection-filter-engine", () => {
  describe("resolveFilterableFields", () => {
    it("excludes unsafe widgets and includes system fields", () => {
      const defs = resolveFilterableFields(collection, { _id: "u1", role: "admin" });
      const ids = defs.map((d) => d.id);
      expect(ids).toContain("title");
      expect(ids).toContain("status");
      expect(ids).toContain("price");
      expect(ids).toContain("createdAt");
      expect(ids).not.toContain("body");
    });

    it("applies FLAC — non-admin cannot filter secret field", () => {
      const editor = resolveFilterableFields(collection, { _id: "e1", role: "editor" });
      expect(editor.map((d) => d.id)).not.toContain("secret");

      const admin = resolveFilterableFields(collection, { _id: "a1", role: "admin" });
      expect(admin.map((d) => d.id)).toContain("secret");
    });
  });

  describe("compileSecureFilters", () => {
    it("rejects unknown and unauthorized fields", () => {
      const compiled = compileSecureFilters(
        {
          title: { contains: "hello" },
          evil: { contains: "$ne" },
          secret: { contains: "x" },
          body: { contains: "html" },
        },
        collection,
        { _id: "e1", role: "editor" },
        { logRejections: false },
      );

      expect(compiled.equality).toEqual({});
      expect(compiled.textSearch).toEqual([{ field: "title", value: "hello" }]);
      expect(
        compiled.rejected.some((r) => r.field === "evil" && r.reason === "unknown_field"),
      ).toBe(true);
      expect(
        compiled.rejected.some((r) => r.field === "secret" && r.reason === "unknown_field"),
      ).toBe(true);
      expect(compiled.queryHash).toMatch(/^[0-9a-f]{8}$/);
    });

    it("compiles status as equality and price as range", () => {
      const compiled = compileSecureFilters(
        {
          status: { contains: "publish" },
          price: { contains: "10:50" },
        },
        collection,
        { _id: "a1", role: "admin" },
        { logRejections: false },
      );

      expect(compiled.equality.status).toBe("publish");
      expect(compiled.ranges).toEqual([{ field: "price", min: 10, max: 50 }]);
    });

    it("compiles boolean and rejects invalid booleans", () => {
      const withBool = {
        ...collection,
        fields: [
          ...collection.fields,
          {
            label: "Featured",
            db_fieldName: "featured",
            required: false,
            translated: false,
            widget: { Name: "Checkbox" },
          },
        ],
      } as unknown as Schema;

      const ok = compileSecureFilters(
        { featured: { contains: "true" } },
        withBool,
        { _id: "a1", role: "admin" },
        { logRejections: false },
      );
      expect(ok.equality.featured).toBe(true);

      const bad = compileSecureFilters(
        { featured: { contains: "maybe" } },
        withBool,
        { _id: "a1", role: "admin" },
        { logRejections: false },
      );
      expect(bad.equality.featured).toBeUndefined();
      expect(bad.rejected.some((r) => r.reason === "invalid_value")).toBe(true);
    });
  });

  describe("applyFiltersToQueryBuilder", () => {
    it("applies where + whereBetween + search portably", () => {
      const compiled = compileSecureFilters(
        {
          status: { contains: "draft" },
          price: { contains: "5:20" },
          title: { contains: "news" },
        },
        collection,
        { _id: "a1", role: "admin" },
        { logRejections: false },
      );

      const { qb, calls } = mockQb();
      applyFiltersToQueryBuilder(qb, compiled, {
        baseWhere: { tenantId: "t1" },
        globalSearch: "",
        collection,
        user: { _id: "a1", role: "admin" },
      });

      const whereCall = calls.find((c) => c.method === "where");
      expect(whereCall?.args[0]).toMatchObject({
        tenantId: "t1",
        status: "draft",
      });

      const between = calls.find((c) => c.method === "whereBetween");
      expect(between?.args).toEqual(["price", 5, 20]);

      // Single text filter → search on that field
      const search = calls.find((c) => c.method === "search");
      expect(search?.args[0]).toBe("news");
      expect(search?.args[1]).toEqual(["title"]);
    });

    it("uses global search when provided", () => {
      const compiled = compileSecureFilters(
        {},
        collection,
        { _id: "a1", role: "admin" },
        {
          logRejections: false,
        },
      );
      const { qb, calls } = mockQb();
      applyFiltersToQueryBuilder(qb, compiled, {
        globalSearch: "hello",
        collection,
        user: { _id: "a1", role: "admin" },
      });
      const search = calls.find((c) => c.method === "search");
      expect(search?.args[0]).toBe("hello");
      expect(Array.isArray(search?.args[1])).toBe(true);
    });
  });
});

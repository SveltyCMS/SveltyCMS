/**
 * @file tests/unit/utils/guarded-query.test.ts
 * @description Guarded filter and sort stripping stays a no-op without guards.
 */

import { describe, expect, it } from "vitest";
import type { Schema } from "@src/content/types";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import { blockedGuardedNames, stripGuardedFilter, stripGuardedSort } from "@utils/guarded-query";

function schemaWith(fields: Schema["fields"]): Schema {
  return { _id: "posts", name: "posts", fields };
}

describe("guarded query", () => {
  it("returns the same filter and sort when the schema has no guards", () => {
    const schema = schemaWith([
      {
        db_fieldName: "title",
        label: "Title",
        required: false,
        translated: false,
        widget: { Name: "Text" },
      } as Schema["fields"][number],
    ]);
    ensureSchemaHotFlags(schema);
    const filter = { title: "hello" };
    const sort = [["title", "asc"]] as [string, "asc" | "desc"][];
    expect(blockedGuardedNames(schema, { _id: "u1", role: "editor" })).toBeNull();
    expect(stripGuardedFilter(filter, null)).toBe(filter);
    expect(stripGuardedSort(sort, null)).toBe(sort);
  });

  it("drops a private field for an editor and keeps it for a role that may read it", () => {
    const schema = schemaWith([
      {
        db_fieldName: "title",
        label: "Title",
        required: false,
        translated: false,
        widget: { Name: "Text" },
      } as Schema["fields"][number],
      {
        db_fieldName: "salary",
        label: "Salary",
        required: false,
        translated: false,
        widget: { Name: "Text" },
        permissions: { visibility: "private", readRoles: ["finance"] },
      } as Schema["fields"][number],
    ]);
    ensureSchemaHotFlags(schema);
    const editor = { _id: "u1", role: "editor" };
    const finance = { _id: "u2", role: "finance" };
    const blocked = blockedGuardedNames(schema, editor);
    expect(blocked?.has("salary")).toBe(true);
    expect(blockedGuardedNames(schema, finance)).toBeNull();
    expect(blockedGuardedNames(schema, { _id: "a", role: "admin", isAdmin: true })).toBeNull();

    const filter = { title: "a", salary: 10, $and: [{ salary: 1 }, { title: "b" }] };
    const stripped = stripGuardedFilter(filter, blocked);
    expect(stripped).toEqual({ title: "a", $and: [{ title: "b" }] });
    expect(filter.salary).toBe(10);

    const sort = [
      ["salary", "desc"],
      ["title", "asc"],
    ] as [string, "asc" | "desc"][];
    expect(stripGuardedSort(sort, blocked)).toEqual([["title", "asc"]]);
    expect(stripGuardedSort([["salary", "asc"]], blocked)).toBeUndefined();
    expect(stripGuardedSort({ field: "salary", direction: "desc" }, blocked)).toBeUndefined();
    expect(stripGuardedFilter({ $and: [{ salary: 1 }] }, blocked)).toEqual({});
    expect(stripGuardedSort({ field: "createdAt", direction: "desc" }, blocked)).toEqual({
      field: "createdAt",
      direction: "desc",
    });
  });
});

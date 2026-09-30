/**
 * @file tests/unit/sdk/collections-ownership.test.ts
 * @description Unit tests for row-ownership scoping (`ownership: { field }`).
 *
 * Features tested:
 * - ownershipFilter: no restriction without ownership or for admin/system callers,
 *   fail-closed `null` without a usable user id, scoped fragment otherwise
 * - stripUnownedRows: same-reference fast paths, copied envelopes for foreign rows,
 *   populated references, no-user drop, non-envelope inputs
 */
import { describe, expect, it } from "vitest";
import {
  ownershipFilter,
  stripUnownedRows,
} from "@src/services/sdk/namespaces/collections-namespace";
import type { Schema } from "@src/content/types";

const schemaWith = (ownership?: { field: string }): Schema =>
  ({ _id: "documents", fields: [], ...(ownership ? { ownership } : {}) }) as unknown as Schema;

const user = { _id: "u1", role: "editor" };
const admin = { _id: "a1", isAdmin: true };

describe("ownershipFilter", () => {
  it("does not restrict schemas without ownership", () => {
    expect(ownershipFilter(schemaWith(), user)).toBe(false);
  });

  it("scopes to the owner field for a regular user", () => {
    expect(ownershipFilter(schemaWith({ field: "ownerId" }), user)).toEqual({ ownerId: "u1" });
  });

  it("lets admins and system scope bypass", () => {
    expect(ownershipFilter(schemaWith({ field: "ownerId" }), admin)).toBe(false);
    expect(ownershipFilter(schemaWith({ field: "ownerId" }), user, true)).toBe(false);
  });

  it("fails closed without a usable user id", () => {
    expect(ownershipFilter(schemaWith({ field: "ownerId" }), undefined)).toBeNull();
    expect(ownershipFilter(schemaWith({ field: "ownerId" }), {})).toBeNull();
    expect(ownershipFilter(schemaWith({ field: "ownerId" }), { _id: "" })).toBeNull();
  });
});

describe("stripUnownedRows", () => {
  const envelope = (data: unknown) => ({ success: true, data });

  it("returns the same envelope when every row is owned", () => {
    const input = envelope([
      { _id: "1", ownerId: "u1" },
      { _id: "2", ownerId: "u1" },
    ]);
    expect(stripUnownedRows(input, "ownerId", user)).toBe(input);
  });

  it("drops foreign rows on a copied envelope without mutating the cached one", () => {
    const input = envelope([
      { _id: "1", ownerId: "u1" },
      { _id: "2", ownerId: "u2" },
      { _id: "3", ownerId: "u1" },
    ]);
    const result = stripUnownedRows(input, "ownerId", user) as {
      success: boolean;
      data: Array<{ _id: string }>;
    };
    expect(result).not.toBe(input);
    expect(result.success).toBe(true);
    expect(result.data.map((row) => row._id)).toEqual(["1", "3"]);
    expect(input.data).toHaveLength(3); // the cached envelope was not mutated
  });

  it("drops a foreign point-read row on a copy and keeps an owned one by reference", () => {
    const owned = envelope({ _id: "1", ownerId: "u1" });
    expect(stripUnownedRows(owned, "ownerId", user)).toBe(owned);

    const foreign = envelope({ _id: "1", ownerId: "u2" });
    const result = stripUnownedRows(foreign, "ownerId", user) as {
      success: boolean;
      data: unknown;
    };
    expect(result).not.toBe(foreign);
    expect(result.data).toBeNull();
  });

  it("matches a populated reference object and drops everything without a user", () => {
    const populated = envelope([{ _id: "1", ownerId: { _id: "u1" } }]);
    expect(stripUnownedRows(populated, "ownerId", user)).toBe(populated);

    const input = envelope([{ _id: "1", ownerId: "u1" }]);
    const result = stripUnownedRows(input, "ownerId", undefined) as { data: unknown[] };
    expect(result.data).toEqual([]);
  });

  it("leaves missing data and non-envelope inputs untouched", () => {
    const empty = envelope(null);
    expect(stripUnownedRows(empty, "ownerId", user)).toBe(empty);
    expect(stripUnownedRows(null, "ownerId", user)).toBeNull();
  });
});

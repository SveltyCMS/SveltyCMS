/**
 * @file tests/unit/content/collection-order.test.ts
 * @description Unit tests for collection order resolution — regression coverage
 * for the "order only honoured on first sight" bug (999 sentinel wedging,
 * file changes silently ignored, GUI drag order lost).
 * Features: explicitOrder, resolveCollectionOrder, buildOrganizationalManifestFromNodes
 */

import { describe, expect, it } from "vitest";
import {
  buildOrganizationalManifestFromNodes,
  explicitOrder,
  resolveCollectionOrder,
} from "@utils/collection-order.server";

describe("explicitOrder", () => {
  it("treats undefined and the 999 sentinel as no order", () => {
    expect(explicitOrder(undefined)).toBeUndefined();
    expect(explicitOrder(999)).toBeUndefined();
  });

  it("keeps real declared positions", () => {
    expect(explicitOrder(0)).toBe(0);
    expect(explicitOrder(5)).toBe(5);
  });
});

describe("resolveCollectionOrder", () => {
  it("lets the declared file order win when the file changed (0 → 9)", () => {
    expect(resolveCollectionOrder({ schemaOrder: 9, existingOrder: 0, lastDeclaredOrder: 0 })).toBe(
      9,
    );
  });

  it("lets a declared order win over a persisted 999 sentinel", () => {
    expect(
      resolveCollectionOrder({
        schemaOrder: 0,
        existingOrder: 999,
        lastDeclaredOrder: undefined,
      }),
    ).toBe(0);
  });

  it("ignores a 999 sentinel in the manifest", () => {
    expect(
      resolveCollectionOrder({
        schemaOrder: 0,
        existingOrder: 999,
        lastDeclaredOrder: undefined,
        manifestOrder: 999,
      }),
    ).toBe(0);
  });

  it("keeps the existing DB order when nothing changed", () => {
    expect(resolveCollectionOrder({ schemaOrder: 0, existingOrder: 0, lastDeclaredOrder: 0 })).toBe(
      0,
    );
  });

  it("survives a GUI drag order when the file is unchanged", () => {
    expect(
      resolveCollectionOrder({
        schemaOrder: 0,
        existingOrder: 2,
        lastDeclaredOrder: 0,
        manifestOrder: 2,
      }),
    ).toBe(2);
  });

  it("prefers the manifest GUI override over the DB value when unchanged", () => {
    expect(
      resolveCollectionOrder({
        schemaOrder: 1,
        existingOrder: 0,
        lastDeclaredOrder: 1,
        manifestOrder: 2,
      }),
    ).toBe(2);
  });

  it("falls back to 999 when nothing is declared anywhere", () => {
    expect(resolveCollectionOrder({})).toBe(999);
  });
});

describe("buildOrganizationalManifestFromNodes", () => {
  const baseNode = {
    _id: "posts",
    collectionDef: { _id: "PostsId", slug: "posts" },
    name: "Posts",
    nodeType: "collection",
    path: "/collection/posts",
  };

  it("never persists the 999 sentinel into the manifest", () => {
    const { order } = buildOrganizationalManifestFromNodes([{ ...baseNode, order: 999 }] as never);
    expect(Object.keys(order)).toHaveLength(0);
  });

  it("persists declared orders under id, collection id and slug aliases", () => {
    const { order } = buildOrganizationalManifestFromNodes([{ ...baseNode, order: 0 }] as never);
    expect(order["posts"]).toBe(0);
    expect(order["PostsId"]).toBe(0);
    expect(order["postsid"]).toBe(0);
    expect(order["posts"]).toBe(0);
  });

  it("does not record an undeclared order at position 0 in structure nodes", () => {
    const { structureNodes } = buildOrganizationalManifestFromNodes([
      {
        _id: "cat-1",
        name: "Category",
        nodeType: "category",
        path: "/category/cat-1",
        source: "builder",
      },
    ] as never);
    expect(structureNodes[0]?.order).toBe(999);
  });
});

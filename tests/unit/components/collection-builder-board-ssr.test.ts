/**
 * @vitest-environment node
 * @file tests/unit/components/collection-builder-board-ssr.test.ts
 * @description Guards the Collection Builder's server render.
 *
 * The board used to seed `treeRoots`/`expandedNodes` from an `$effect`. Effects
 * never run during SSR, so the server emitted the empty state and hydration
 * swapped in the whole board — the biggest layout shift on
 * /config/collectionbuilder. The tree must be built during component init.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import TreeViewBoard from "@src/routes/(app)/config/collectionbuilder/nested-content/tree-view-board.svelte";
import type { ContentNode } from "@src/content/types";

const nodes = [
  {
    _id: "cat-1",
    name: "Content",
    nodeType: "category",
    order: 0,
    path: "/content",
  },
  {
    _id: "col-1",
    name: "Blog Posts",
    nodeType: "collection",
    parentId: "cat-1",
    order: 0,
    path: "/content/blog-posts",
  },
] as unknown as ContentNode[];

describe("Collection builder board (SSR)", () => {
  it("renders the tree during SSR without waiting for client effects", () => {
    const { body } = render(TreeViewBoard, {
      props: {
        contentNodes: nodes,
        structureKey: 0,
        onEditCategory: () => {},
        onNodeUpdate: () => {},
      },
    });

    // Both the category and its child must already be in the server HTML.
    expect(body).toContain('data-item-id="cat-1"');
    expect(body).toContain('data-item-id="col-1"');
    expect(body).toContain("Blog Posts");
  });
});

/**
 * @vitest-environment node
 * @file tests/unit/components/ui/tree-view.test.ts
 * @description Unit tests for the Svelte 5 TreeView primitive component.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import TreeView from "@src/components/ui/tree-view.svelte";

const mockItems = [
  {
    id: "root-1",
    label: "Root Folder",
    icon: "mdi:folder",
    children: [{ id: "child-1", label: "Child File", icon: "mdi:file" }],
  },
];

describe("TreeView component (SSR)", () => {
  it("renders root items correctly", () => {
    const { body } = render(TreeView, { props: { items: mockItems } });
    expect(body).toContain("Root Folder");
    expect(body).toContain("mdi:folder");
  });

  it("handles compact layout mode correctly", () => {
    const { body } = render(TreeView, {
      props: { items: mockItems, compact: true },
    });
    // Compact rail stacks the icon (row 1) over the label (row 2) as a tile.
    expect(body).toContain("flex-col items-center justify-center");
    expect(body).toContain("px-1 py-2");
  });

  it("tints category icons blue and collection icons via iconColorClass", () => {
    const { body } = render(TreeView, {
      props: {
        iconColorClass: "text-error-500",
        items: [
          { id: "cat-1", label: "Category", icon: "mdi:folder", type: "category" },
          { id: "col-1", label: "Collection", icon: "mdi:file", type: "collection" },
        ],
      },
    });
    expect(body).toContain("text-tertiary-500 dark:text-tertiary-400");
    expect(body).toContain("text-error-500");
  });

  it("handles density comfortable mode correctly", () => {
    const { body } = render(TreeView, {
      props: { items: mockItems, density: "comfortable" },
    });
    // comfortable density returns py-1.5 gap-2
    expect(body).toContain("py-1.5 gap-2");
  });

  it("handles density spacious mode correctly", () => {
    const { body } = render(TreeView, {
      props: { items: mockItems, density: "spacious" },
    });
    // spacious density returns py-2.5 gap-2.5
    expect(body).toContain("py-2.5 gap-2.5");
  });
});

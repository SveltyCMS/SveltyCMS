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
    const { body } = render(TreeView, { props: { items: mockItems, compact: true } });
    // compact density returns py-1 gap-1.5
    expect(body).toContain("py-1 gap-1.5");
  });

  it("handles density comfortable mode correctly", () => {
    const { body } = render(TreeView, { props: { items: mockItems, density: "comfortable" } });
    // comfortable density returns py-1.5 gap-2
    expect(body).toContain("py-1.5 gap-2");
  });

  it("handles density spacious mode correctly", () => {
    const { body } = render(TreeView, { props: { items: mockItems, density: "spacious" } });
    // spacious density returns py-2.5 gap-2.5
    expect(body).toContain("py-2.5 gap-2.5");
  });
});

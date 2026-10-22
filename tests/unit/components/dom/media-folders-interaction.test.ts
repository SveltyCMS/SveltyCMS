/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/media-folders-interaction.test.ts
 * @description Real DOM tests for the Media Gallery virtual-folder tree.
 *
 * Mounts the real `media-folders.svelte` against the real folder store and
 * pin store. No component logic is mocked — only the app navigation function
 * is inspected (the router boundary).
 *
 * ### Features:
 * - renders the root and top-level folders
 * - nested folders appear only after the parent is expanded
 * - selecting a folder navigates to `?folderId=…`
 * - search filters the tree
 * - pin/unpin action updates the pinned store
 * - empty state
 * - edit-mode toggle exposes `aria-pressed`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaFolders from "@src/components/media-folders.svelte";
import { goto } from "$app/navigation";
import { mediaFolderTree } from "@src/stores/media-folder-tree.svelte.ts";
import { ui } from "@src/stores/ui-store.svelte.ts";
import { pinnedStore } from "@src/stores/collection-store.svelte";
import { click, renderComponent, settle, typeText } from "./render";

const FOLDERS = [
  { id: "parent", name: "Parent", path: "/parent", parentId: null, order: 0 },
  { id: "child", name: "Child", path: "/parent/child", parentId: "parent", order: 0 },
  { id: "sibling", name: "Sibling", path: "/sibling", parentId: null, order: 1 },
];

const RAW_FOLDERS = FOLDERS.map((f) => ({
  _id: f.id,
  name: f.name,
  path: f.path,
  parentId: f.parentId,
  order: f.order,
}));

const network = vi.hoisted(() => ({ fetchData: [] as unknown[], nested: false }));

function treeNode(target: HTMLElement, id: string): HTMLElement {
  const node = target.querySelector<HTMLElement>(`#treenode-${CSS.escape(id)}`);
  if (!node) throw new Error(`tree node ${id} not rendered`);
  return node;
}

function row(target: HTMLElement, id: string): HTMLElement {
  const node = target.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
  if (!node) throw new Error(`tree row ${id} not rendered`);
  return node;
}

function folderNode(target: HTMLElement, name: string): HTMLElement | undefined {
  return [...target.querySelectorAll<HTMLElement>("[role='treeitem']")].find((node) =>
    node.textContent?.includes(name),
  );
}

function chevron(target: HTMLElement, id: string): Element | null {
  return row(target, id).querySelector('iconify-icon[icon="mdi:chevron-right"]');
}

async function mount(): Promise<ReturnType<typeof renderComponent>> {
  const rendered = renderComponent(MediaFolders);
  await settle();
  await vi.waitFor(() => expect(folderNode(rendered.target, "Parent")).toBeDefined());
  return rendered;
}

beforeEach(() => {
  ui.state.leftSidebar = "full";
  network.fetchData = RAW_FOLDERS;
  network.nested = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            network.nested
              ? { success: true, data: { items: network.fetchData } }
              : { success: true, data: network.fetchData },
          ),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    ),
  );
  mediaFolderTree.folders = FOLDERS;
  mediaFolderTree.isLoading = false;
  mediaFolderTree.error = null;
  mediaFolderTree.hasLoaded = false;
  vi.mocked(goto).mockClear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Media folders tree (client interaction)", () => {
  it("renders the root and top-level folders", async () => {
    const { target, cleanup } = await mount();
    try {
      expect(target.textContent).toContain("Media Root");
      expect(folderNode(target, "Parent")).toBeDefined();
      expect(folderNode(target, "Sibling")).toBeDefined();
      // Nested child is collapsed until Parent expands.
      expect(folderNode(target, "Child")).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("expands a parent and navigates when a folder is selected", async () => {
    const { target, cleanup } = await mount();
    try {
      await click(treeNode(target, "parent"));

      expect(folderNode(target, "Child")).toBeDefined();
      expect(goto).toHaveBeenCalledWith("/mediagallery?folderId=parent");

      await click(treeNode(target, "child"));
      expect(goto).toHaveBeenLastCalledWith("/mediagallery?folderId=child");
    } finally {
      cleanup();
    }
  });

  it("filters the tree by search", async () => {
    const { target, cleanup } = await mount();
    try {
      const search = target.querySelector<HTMLInputElement>("input#media-folders-search");
      expect(search).toBeInTheDocument();

      await typeText(search, "child");
      expect(folderNode(target, "Child")).toBeDefined();
      expect(folderNode(target, "Parent")).toBeUndefined();
      expect(folderNode(target, "Sibling")).toBeUndefined();

      await typeText(search, "");
      expect(folderNode(target, "Parent")).toBeDefined();
      expect(folderNode(target, "Sibling")).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("pins and unpins a folder from its row action", async () => {
    const { target, cleanup } = await mount();
    try {
      const initial = pinnedStore.isPinned("parent");
      const action = row(target, "parent").querySelector<HTMLButtonElement>("button");
      expect(action).not.toBeNull();

      await click(action);
      expect(pinnedStore.isPinned("parent")).toBe(!initial);

      await click(row(target, "parent").querySelector<HTMLButtonElement>("button"));
      expect(pinnedStore.isPinned("parent")).toBe(initial);
    } finally {
      cleanup();
    }
  });

  it("toggles edit mode", async () => {
    const { target, cleanup } = await mount();
    try {
      const toggle = target.querySelector<HTMLButtonElement>(
        "button[aria-label='Toggle Edit Mode']",
      );
      expect(toggle).toHaveAttribute("aria-pressed", "false");

      await click(toggle);
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    } finally {
      cleanup();
    }
  });

  it("renders only the root when no folders exist", async () => {
    network.fetchData = [];
    mediaFolderTree.folders = [];
    const { target, cleanup } = renderComponent(MediaFolders);
    try {
      await vi.waitFor(() => expect(folderNode(target, "Media Root")).toBeDefined());
      expect(folderNode(target, "Parent")).toBeUndefined();
      expect(folderNode(target, "Sibling")).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("only offers the root chevron when there is something to expand", async () => {
    const withFolders = await mount();
    try {
      expect(chevron(withFolders.target, "root")).not.toBeNull();
    } finally {
      withFolders.cleanup();
    }

    network.fetchData = [];
    mediaFolderTree.folders = [];
    mediaFolderTree.hasLoaded = false;
    const empty = renderComponent(MediaFolders);
    try {
      await vi.waitFor(() => expect(folderNode(empty.target, "Media Root")).toBeDefined());
      // Media nodes are always drop targets, but a chevron on an empty root is a
      // dead control — the root row keeps a spacer for icon alignment instead.
      expect(chevron(empty.target, "root")).toBeNull();
    } finally {
      empty.cleanup();
    }
  });

  it("reloads only the tree when a folderCreated event fires", async () => {
    const { target, cleanup } = await mount();
    try {
      expect(folderNode(target, "Brand New")).toBeUndefined();

      network.fetchData = [
        ...RAW_FOLDERS,
        { _id: "new-folder", name: "Brand New", path: "/brand-new", parentId: null, order: 9 },
      ];
      // The gallery page dispatches this after a successful create and does NOT
      // call `refreshAll()` — the sidebar listener is the only refresh path.
      document.dispatchEvent(new CustomEvent("folderCreated"));

      await vi.waitFor(() => expect(folderNode(target, "Brand New")).toBeDefined());
    } finally {
      cleanup();
    }
  });

  it("normalizes a nested items envelope instead of reporting a load error", async () => {
    network.nested = true;
    mediaFolderTree.hasLoaded = false;

    await mediaFolderTree.load();

    expect(mediaFolderTree.error).toBeNull();
    expect(mediaFolderTree.folders.map((folder) => folder.id)).toEqual([
      "parent",
      "child",
      "sibling",
    ]);
  });
});

/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/trash-table-interaction.test.ts
 * @description Real DOM tests for `/config/trash` SmartTableShell adoption.
 *
 * Verifies:
 * - SmartTableShell chrome rendering with headers, rows and restore action
 * - Client-side column sorting
 * - Token-compliant empty state
 * - Restore confirmation dialog flow
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import TrashPage from "@src/routes/(app)/config/trash/+page.svelte";
import { click, renderPage, settle, type RenderedComponent } from "./render";

const h = vi.hoisted(() => ({
  listTrash: vi.fn(),
  restoreTrashItem: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  showConfirm: vi.fn(),
}));

vi.mock("@src/routes/(app)/config/trash/trash-api", () => ({
  listTrash: h.listTrash,
  restoreTrashItem: h.restoreTrashItem,
  unwrapTrashList: (res: { data?: unknown }) => res.data ?? [],
}));
vi.mock("@src/stores/toast.svelte", () => ({ toast: h.toast }));
vi.mock("@utils/modal.svelte", () => ({
  showConfirm: (opts: { title: string; body: string; onConfirm: () => Promise<void> }) => {
    h.showConfirm(opts);
    return opts.onConfirm();
  },
}));

const SAMPLE_ITEMS = [
  {
    _id: "entry-1",
    title: "Bravo Post",
    collectionId: "articles",
    collectionName: "Articles",
    deletedAt: "2026-11-01T10:00:00.000Z",
    deletedBy: "user-1",
  },
  {
    _id: "entry-2",
    title: "Alpha Post",
    collectionId: "blogs",
    collectionName: "Blogs",
    deletedAt: "2026-11-05T12:00:00.000Z",
    deletedBy: "system",
  },
];

describe("Trash page SmartTableShell adoption", () => {
  let rendered: RenderedComponent | null = null;

  beforeEach(() => {
    h.listTrash.mockReset();
    h.restoreTrashItem.mockReset();
    h.toast.success.mockReset();
    h.toast.error.mockReset();
    h.showConfirm.mockReset();
    rendered?.cleanup();
    rendered = null;
  });

  it("renders trash items in SmartTableShell with consistent chrome and testids", async () => {
    rendered = renderPage(TrashPage, { items: SAMPLE_ITEMS });
    await settle();

    const table = rendered.target.querySelector("[data-testid='trash-table']");
    expect(table).not.toBeNull();

    // Default sort is deletedAt desc: entry-2 (Nov 5) should appear before entry-1 (Nov 1)
    const rows = Array.from(rendered.target.querySelectorAll("tbody tr"));
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("Alpha Post");
    expect(rows[1]?.textContent).toContain("Bravo Post");

    // E2E row testids are preserved
    expect(rendered.target.querySelector("[data-testid='trash-row-entry-1']")).not.toBeNull();
    expect(rendered.target.querySelector("[data-testid='trash-row-entry-2']")).not.toBeNull();
  });

  it("sorts rows when column headers are clicked", async () => {
    rendered = renderPage(TrashPage, { items: SAMPLE_ITEMS });
    await settle();

    // Find the Content header button and click it to sort by title ascending
    const buttons = Array.from(rendered.target.querySelectorAll("thead th button"));
    const contentHeader = buttons[0];
    expect(contentHeader).toBeDefined();

    await click(contentHeader);
    await settle();

    let rows = Array.from(rendered.target.querySelectorAll("tbody tr"));
    expect(rows[0]?.textContent).toContain("Alpha Post");
    expect(rows[1]?.textContent).toContain("Bravo Post");

    // Click again to sort descending
    await click(contentHeader);
    await settle();

    rows = Array.from(rendered.target.querySelectorAll("tbody tr"));
    expect(rows[0]?.textContent).toContain("Bravo Post");
    expect(rows[1]?.textContent).toContain("Alpha Post");
  });

  it("renders token-compliant empty state when there are no trashed items", async () => {
    rendered = renderPage(TrashPage, { items: [] });
    await settle();

    expect(rendered.target.querySelector("[data-testid='trash-empty']")).not.toBeNull();
    expect(rendered.target.querySelector("tbody tr")).toBeNull();
  });

  it("triggers restore item with showConfirm modal and refreshes list", async () => {
    h.restoreTrashItem.mockResolvedValue({ success: true });
    h.listTrash.mockResolvedValue({ success: true, data: [SAMPLE_ITEMS[1]] });

    rendered = renderPage(TrashPage, { items: SAMPLE_ITEMS });
    await settle();

    const row1 = rendered.target.querySelector("[data-testid='trash-row-entry-1']");
    const restoreBtn = row1?.querySelector("[data-testid='trash-restore']") as HTMLElement;
    expect(restoreBtn).not.toBeNull();

    await click(restoreBtn);
    await settle();

    expect(h.restoreTrashItem).toHaveBeenCalledWith("articles", "entry-1");
    expect(h.toast.success).toHaveBeenCalled();
  });
});

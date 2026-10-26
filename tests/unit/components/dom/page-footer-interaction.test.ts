/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/page-footer-interaction.test.ts
 * @description Entry metadata footer used when the desktop right sidebar is hidden.
 *
 * Covers:
 * - created/updated timestamps and their authors
 * - revision count from route data
 * - no metadata outside edit/create/modify modes
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import PageFooter from "@src/components/page-footer.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { renderComponent, settle, type RenderedComponent } from "./render";

vi.mock("$app/state", () => ({
  page: {
    data: {
      user: { _id: "u1", username: "editor", email: "editor@example.com" },
      revisions: [{ _id: "r1" }, { _id: "r2" }],
    },
  },
}));

describe("PageFooter entry metadata", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("renders created/updated authors and the revision count in edit mode", async () => {
    collections.setMode("edit");
    collections.setCollectionValue({
      _id: "entry-1",
      createdAt: "2026-01-02T10:00:00.000Z",
      updatedAt: "2026-01-03T11:30:00.000Z",
      createdBy: "alice",
      updatedBy: "bob",
    });

    rendered = renderComponent(PageFooter);
    await settle();

    const text = rendered.target.textContent ?? "";
    expect(text).toContain("alice");
    expect(text).toContain("bob");
    expect(text).toMatch(/Ver\./);
    expect(text).toContain("2");
  });

  it("renders nothing in view mode", async () => {
    collections.setMode("view");
    collections.setCollectionValue({ _id: "entry-1", createdAt: "2026-01-02T10:00:00.000Z" });

    rendered = renderComponent(PageFooter);
    await settle();

    expect(rendered.target.textContent?.trim()).toBe("");
  });
});

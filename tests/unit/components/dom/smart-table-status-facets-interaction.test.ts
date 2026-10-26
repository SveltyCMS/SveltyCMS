/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/smart-table-status-facets-interaction.test.ts
 * @description Real DOM tests for the entry-list status facet chips.
 *
 * Guards the empty-collection case: facet maps often arrive as
 * `{ publish: 0, draft: 0, … }`, and rendering the group for keys-without-entries
 * produced a lone "ALL" chip above an empty table.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import SmartTableStatusFacets from "@components/ui/smart-table/smart-table-status-facets.svelte";
import { click, renderComponent } from "./render";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SmartTableStatusFacets", () => {
  it("renders nothing when every status count is zero", () => {
    const { target, cleanup } = renderComponent(SmartTableStatusFacets, {
      facets: { publish: 0, draft: 0, archive: 0 },
      active: "",
      onSelect: () => {},
    });
    try {
      expect(target.querySelector('[role="group"]')).toBeNull();
      expect(target.textContent?.trim()).toBe("");
    } finally {
      cleanup();
    }
  });

  it("renders the All reset plus chips that actually have entries", () => {
    const { target, cleanup } = renderComponent(SmartTableStatusFacets, {
      facets: { publish: 3, draft: 0 },
      active: "",
      onSelect: () => {},
    });
    try {
      const group = target.querySelector('[role="group"]');
      expect(group).not.toBeNull();
      expect(target.textContent).toMatch(/All/);
      expect(target.textContent).toMatch(/Published/);
      expect(target.textContent).not.toMatch(/Draft/);
    } finally {
      cleanup();
    }
  });

  it("keeps the reset visible while a status filter is active", async () => {
    const onSelect = vi.fn();
    const { target, cleanup } = renderComponent(SmartTableStatusFacets, {
      facets: { publish: 0 },
      active: "publish",
      onSelect,
    });
    try {
      const all = target.querySelector<HTMLButtonElement>('button[aria-label="All statuses"]');
      expect(all).not.toBeNull();
      expect(all).toHaveAttribute("aria-pressed", "false");

      await click(all);
      expect(onSelect).toHaveBeenCalledWith("");
    } finally {
      cleanup();
    }
  });
});

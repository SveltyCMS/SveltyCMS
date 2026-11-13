/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/redirects-pagination-interaction.test.ts
 * @description Regression pin for table pagination wired through `SmartTableShell`.
 *
 * `/config/redirects` binds `currentPage`/`rowsPerPage` to `SmartTableShell`, and
 * the shell passed them one-way to `Pagination`. `Pagination`'s `$bindable`
 * writes therefore stopped at its own copy: the footer showed "page 2" while the
 * table body kept rendering page 1. The shell must bind the pagination
 * bindables so updates reach the consumer.
 *
 * ### Features:
 * - the next-page control advances the rendered table body
 * - page 2 shows the second slice of redirects (not a repeat of page 1)
 */

import { describe, expect, it, vi } from "vitest";
import RedirectsPage from "@src/routes/(app)/config/redirects/+page.svelte";
import { click, renderPage, settle } from "./render";

vi.mock("@src/routes/(app)/config/redirects/redirects.remote", () => ({
  saveRedirect: vi.fn(),
  deleteRedirect: vi.fn(),
}));
vi.mock("@src/components/system/admin-zone.svelte", () => ({ default: () => null }));

const REDIRECTS = Array.from({ length: 15 }, (_, index) => ({
  id: `redirect-${index}`,
  from: `/old-${String(index).padStart(2, "0")}`,
  to: `/new-${index}`,
  type: 301,
  active: true,
  isRegex: false,
}));

function bodyRows(target: HTMLElement): HTMLTableRowElement[] {
  return [...target.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

describe("Redirects table — pagination (client interaction)", () => {
  it("renders the second page after the next-page control is clicked", async () => {
    const rendered = renderPage(RedirectsPage, { redirects: REDIRECTS });

    try {
      await settle();

      const firstPage = bodyRows(rendered.target);
      expect(firstPage).toHaveLength(10);
      expect(firstPage[0].textContent).toContain("/old-00");

      const nextPage = rendered.target.querySelector<HTMLButtonElement>(
        "button[aria-label='Go to next page']",
      );
      expect(nextPage).not.toBeNull();
      await click(nextPage);
      await settle();

      const secondPage = bodyRows(rendered.target);
      expect(secondPage).toHaveLength(5);
      expect(secondPage[0].textContent).toContain("/old-10");
      expect(secondPage[4].textContent).toContain("/old-14");
      expect(rendered.target.textContent).not.toContain("/old-00");
    } finally {
      rendered.cleanup();
    }
  });
});

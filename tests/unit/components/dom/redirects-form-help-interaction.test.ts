/**
 * @file tests/unit/components/dom/redirects-form-help-interaction.test.ts
 * @description Real DOM test for the Add Redirect modal's first-time guidance.
 *
 * The remote functions are mocks (network boundary); the modal, field labels,
 * and tooltip triggers render for real.
 *
 * ### Features:
 * - the "how redirects work" explainer is visible in the modal
 * - each field has its own ? trigger; hovering the label text alone does nothing
 * - examples moved into placeholders so the labels stay short
 */

import { describe, expect, it, vi } from "vitest";
import RedirectsPage from "@src/routes/(app)/config/redirects/+page.svelte";
import { click, renderPage, settle } from "./render";

vi.mock("@src/routes/(app)/config/redirects/redirects.remote", () => ({
  saveRedirect: vi.fn(),
  deleteRedirect: vi.fn(),
}));
vi.mock("@src/components/system/admin-zone.svelte", () => ({ default: () => null }));

function modalOrThrow(target: HTMLElement): HTMLElement {
  const modal = target.querySelector<HTMLElement>("[data-testid='redirects-modal']");
  if (!modal) throw new Error("redirect modal not rendered");
  return modal;
}

describe("Redirect modal onboarding (client interaction)", () => {
  it("explains redirects and attaches a ? tooltip to every field", async () => {
    const rendered = renderPage(RedirectsPage, { redirects: [] });
    try {
      await click(rendered.target.querySelector("[data-testid='redirects-add']"));
      const modal = modalOrThrow(rendered.target);

      const help = modal.querySelector("[data-testid='redirects-help']");
      expect(help?.textContent).toContain("How redirects work");
      expect(help?.textContent).toContain("301 and 308 are permanent");
      expect(help?.textContent).toContain("302 and 307 are temporary");

      // One icon-only trigger per field.
      for (const label of ["From Path", "To Path", "Type", "Status", "Is Regex / Pattern"]) {
        expect(
          modal.querySelector(`button[aria-label='${label}']`),
          `missing ? trigger for ${label}`,
        ).toBeTruthy();
      }

      // The label text is inert: hovering it must not open a tooltip.
      const fromInput = modal.querySelector<HTMLInputElement>("[data-testid='redirect-from']");
      if (!fromInput) throw new Error("from input not rendered");
      const fromLabel = modal.querySelector<HTMLLabelElement>(`label[for='${fromInput.id}']`);
      if (!fromLabel) throw new Error("from label not rendered");
      fromLabel.dispatchEvent(new MouseEvent("mouseenter"));
      await settle();
      expect(document.querySelector("[role='tooltip']")).toBeNull();

      // Hovering the ? trigger opens that field's explanation.
      const trigger = modal.querySelector<HTMLButtonElement>("button[aria-label='From Path']");
      trigger?.parentElement?.dispatchEvent(new MouseEvent("mouseenter"));
      await vi.waitFor(
        () => {
          expect(document.querySelector("[role='tooltip']")?.textContent).toContain(
            "The old URL to match",
          );
        },
        { timeout: 2000 },
      );

      // Examples are placeholders now, keeping the labels short.
      expect(fromInput.getAttribute("placeholder")).toBe("/old-blog");
      const toInput = modal.querySelector<HTMLInputElement>("[data-testid='redirect-to']");
      expect(toInput?.getAttribute("placeholder")).toContain("https://example.com/new");
    } finally {
      rendered.cleanup();
    }
  });
});

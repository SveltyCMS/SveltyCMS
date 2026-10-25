/**
 * @file tests/unit/components/dom/migration-wizard-onboarding-interaction.test.ts
 * @description Real DOM test for the Smart Importer wizard's first-run guidance.
 *
 * The plugin API client is a boundary mock; the wizard, explainer, file card,
 * and tooltip triggers render for real.
 *
 * ### Features:
 * - the "How migration works" explainer is open with the size/CLI guidance
 * - a generic CSV detects as CSV and renders the mapped format
 * - the remove-file close button is a transparent round control
 * - field help is exposed through `?` triggers
 */

import { describe, expect, it, vi } from "vitest";
import MigrationWizard from "@plugins/smart-importer/ui/migration-wizard.svelte";
import { renderComponent, settle } from "./render";

vi.mock("@plugins/smart-importer/ui/migration-form-actions", () => ({
  postDetectAction: vi.fn(async () => ({
    success: true,
    format: "csv",
    estimatedCount: 1,
    fieldMappings: [{ source: "title", target: "title", confidence: 92, type: "text" }],
    contentTypes: [],
  })),
  postDryRunAction: vi.fn(),
  postRollbackAction: vi.fn(),
}));
vi.mock("@src/components/system/admin-zone.svelte", () => ({ default: () => null }));

describe("Migration wizard onboarding (client interaction)", () => {
  it("explains the flow and keeps the per-field help behind ? triggers", async () => {
    const rendered = renderComponent(MigrationWizard);
    try {
      const help = rendered.target.querySelector<HTMLDetailsElement>(
        "[data-testid='migration-how-it-works']",
      );
      if (!help) throw new Error("explainer not rendered");
      expect(help.open).toBe(true);
      expect(help.textContent).toContain("How migration works");
      expect(help.textContent).toContain("15 MB minimum");
      expect(help.textContent).toContain("bun run migrate import");

      // Step-1 help trigger (supported files) is present before any upload.
      expect(
        rendered.target.querySelector("button[aria-label='Help: Supported files']"),
      ).toBeTruthy();

      // Simulate a generic CSV upload; detection is mocked as successful.
      const input = rendered.target.querySelector<HTMLInputElement>("#migration-file-input");
      if (!input) throw new Error("file input not rendered");
      const file = new File(["title,slug\nHello,/hello\n"], "snapshot.csv", {
        type: "text/csv",
      });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await settle();

      await vi.waitFor(
        () => {
          expect(rendered.target.textContent).toContain("CSV / Spreadsheet");
        },
        { timeout: 2000 },
      );

      const remove = rendered.target.querySelector<HTMLButtonElement>(
        "[data-testid='migration-file-remove']",
      );
      if (!remove) throw new Error("remove button not rendered");
      expect(remove.classList.contains("rounded-full")).toBe(true);
      expect(remove.classList.contains("bg-transparent")).toBe(true);
      expect(
        rendered.target.querySelector("button[aria-label='Help: Target Collection']"),
      ).toBeTruthy();
    } finally {
      rendered.cleanup();
    }
  });
});

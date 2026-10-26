/**
 * @file tests/unit/components/dom/automation-onboarding-interaction.test.ts
 * @description Real DOM test for the automation editor's new-user guidance.
 *
 * The plugin admin zone is a boundary mock (it lazy-loads plugin bundles). The
 * editor, its step guard, and the explainer render for real.
 *
 * ### Features:
 * - the "how automations work" explainer is open for a new automation
 * - Next starts disabled with a concrete reason, then follows the trigger type
 * - a manual trigger clears the event requirement and reaches step 2
 * - step 2 shows the empty-operation guidance
 */

import { describe, expect, it, vi } from "vitest";
import AutomationEditor from "@src/routes/(app)/config/automations/[id]/+page.svelte";
import { click, renderPage, settle, typeText } from "./render";

vi.mock("@src/components/system/admin-zone.svelte", () => ({ default: () => null }));

const WAIT = { timeout: 2000 };

function nextButton(target: HTMLElement): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>("[data-testid='automation-next']");
  if (!button) throw new Error("next button not rendered");
  return button;
}

function hint(target: HTMLElement): string {
  return target.querySelector("[data-testid='automation-next-hint']")?.textContent ?? "";
}

describe("Automation editor onboarding (client interaction)", () => {
  it("explains the flow and gates each step with a reason", async () => {
    const rendered = renderPage(AutomationEditor, { isNew: true, flow: null });
    try {
      // Explainers are open for a new automation.
      const help = rendered.target.querySelector<HTMLDetailsElement>(
        "[data-testid='automation-how-it-works']",
      );
      if (!help) throw new Error("help panel not rendered");
      expect(help.open).toBe(true);
      expect(help.textContent).toMatch(/how automations work/i);

      // Empty name → Next disabled with a name hint.
      const name = rendered.target.querySelector<HTMLInputElement>(
        "[data-testid='automation-name']",
      );
      if (!name) throw new Error("name input not rendered");
      expect(nextButton(rendered.target)).toBeDisabled();
      await vi.waitFor(() => expect(hint(rendered.target)).toMatch(/name/i), WAIT);

      // Name present, but the default event trigger has no events.
      await typeText(name, "Notify editors");
      await vi.waitFor(() => expect(hint(rendered.target)).toMatch(/event/i), WAIT);
      expect(nextButton(rendered.target)).toBeDisabled();

      // Manual trigger removes the event requirement.
      await click(rendered.target.querySelector("[data-testid='automation-trigger-manual']"));
      await settle();
      expect(nextButton(rendered.target)).toBeEnabled();
      expect(rendered.target.querySelector("[data-testid='automation-next-hint']")).toBeNull();

      // Step 2 starts with the empty-operation guidance.
      await click(nextButton(rendered.target));
      await vi.waitFor(
        () =>
          expect(
            rendered.target.querySelector("[data-testid='automation-operations-empty']"),
          ).toBeTruthy(),
        WAIT,
      );
      expect(rendered.target.querySelector("[data-testid='automation-add-ops']")).toBeTruthy();
    } finally {
      rendered.cleanup();
    }
  });
});

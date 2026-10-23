/**
 * @vitest-environment node
 * @file tests/unit/components/setup-navigation-a11y.test.ts
 * @description Accessible-name contract for the setup wizard seeding progress bar.
 *
 * `<div role="progressbar">` carried numeric values but no name: the visible
 * "Database Seeding Progress" text was an unrelated sibling, so assistive tech
 * announced an unnamed progress bar. The bar must reference a stable, existing
 * label element (`aria-labelledby`) and expose the current percentage.
 *
 * These assertions run against the SSR output (the wizard is not reachable after
 * setup, so this cannot be an E2E journey).
 */

import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import SetupNavigation from "@src/routes/setup/setup-navigation.svelte";

function renderSeeding(seedingProgress: number): string {
  return render(SetupNavigation, {
    props: {
      currentStep: 1,
      totalSteps: 4,
      canProceed: true,
      isLoading: false,
      isSeeding: true,
      seedingProgress,
      onprev: () => {},
      onnext: () => {},
      oncomplete: () => {},
    },
  }).body;
}

function progressbarTag(html: string): string {
  const match = /<div[^>]*role="progressbar"[^>]*>/.exec(html);
  if (!match) throw new Error("progressbar not rendered");
  return match[0];
}

describe("Setup navigation - seeding progressbar a11y", () => {
  it("exposes a non-empty accessible name from the visible label", () => {
    const body = renderSeeding(42);
    const tag = progressbarTag(body);

    const labelledBy = /aria-labelledby="([^"]+)"/.exec(tag)?.[1];
    expect(labelledBy, "progressbar must reference a label element").toBeTruthy();

    const label = new RegExp(`<span[^>]*id="${labelledBy}"[^>]*>([^<]+)</span>`).exec(body);
    expect(label?.[1]?.trim(), "aria-labelledby must resolve to the visible label").toBe(
      "Database Seeding Progress",
    );
  });

  it("exposes the current seeding value", () => {
    const body = renderSeeding(42);
    const tag = progressbarTag(body);

    expect(tag).toContain('aria-valuenow="42"');
    expect(tag).toContain('aria-valuemin="0"');
    expect(tag).toContain('aria-valuemax="100"');
    expect(body).toContain("42%");
  });
});

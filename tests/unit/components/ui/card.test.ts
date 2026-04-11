/**
 * @vitest-environment node
 * @file tests/unit/components/ui/card.test.ts
 * @description Unit tests for the Svelte 5 Card primitive component.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Card from "@src/components/ui/card.svelte";

describe("Card component (SSR)", () => {
  it("renders basic structure", () => {
    const { body } = render(Card, {});
    expect(body).toContain("card");
    expect(body).toContain("bg-surface-50");
  });

  it("accepts additional classes", () => {
    const { body } = render(Card, { props: { class: "custom-class" } });
    expect(body).toContain("custom-class");
  });
});

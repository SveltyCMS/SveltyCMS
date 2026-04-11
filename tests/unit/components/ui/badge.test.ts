/**
 * @vitest-environment node
 * @file tests/unit/components/ui/badge.test.ts
 * @description Unit tests for the Svelte 5 Badge primitive component.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Badge from "@src/components/ui/badge.svelte";

describe("Badge component (SSR)", () => {
  it("renders correctly with default primary variant", () => {
    const { body } = render(Badge, {});
    expect(body).toContain("preset-filled-primary-500");
    expect(body).toContain("rounded-full");
  });

  it("applies success variant", () => {
    const { body } = render(Badge, { props: { variant: "success" } });
    expect(body).toContain("preset-filled-success-500");
  });
});

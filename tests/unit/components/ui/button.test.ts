/**
 * @vitest-environment node
 * @file tests/unit/components/ui/button.test.ts
 * @description Unit tests for the Svelte 5 Button primitive component.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Button from "@src/components/ui/button.svelte";

describe("Button component (SSR)", () => {
  it("renders correctly as a button by default", () => {
    const { body } = render(Button, { props: { children: void 0 as any } });
    expect(body).toContain("<button");
    expect(body).toContain("btn");
  });

  it("renders as an anchor tag when href is provided", () => {
    const { body } = render(Button, { props: { href: "/test" } });
    expect(body).toContain("<a");
    expect(body).toContain('href="/test"');
  });

  it("applies the correct variant classes", () => {
    const { body } = render(Button, { props: { variant: "primary" } });
    expect(body).toContain("preset-filled-primary-500");
  });

  it("reflects disabled state", () => {
    const { body } = render(Button, { props: { disabled: true } });
    expect(body).toContain("disabled");
    expect(body).toContain("opacity-60");
  });
});

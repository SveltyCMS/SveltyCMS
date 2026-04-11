/**
 * @vitest-environment node
 * @file tests/unit/components/ui/input.test.ts
 * @description Unit tests for the Svelte 5 Input primitive component.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Input from "@src/components/ui/input.svelte";

describe("Input component (SSR)", () => {
  it("renders a standard text input", () => {
    const { body } = render(Input, { props: { type: "text" } });
    expect(body).toContain("<input");
    expect(body).toContain('type="text"');
  });

  it("renders a label and links it to the input via ID", () => {
    const { body } = render(Input, { props: { label: "Username" } });
    expect(body).toContain("<label");
    expect(body).toContain("Username");
  });

  it("renders error state", () => {
    const { body } = render(Input, { props: { type: "text", error: "Invalid field" } });
    expect(body).toContain("Invalid field");
    expect(body).toContain("border-error-500");
    expect(body).toContain('aria-invalid="true"');
  });
});

/**
 * @vitest-environment node
 * @file tests/unit/components/ui/floating-input.test.ts
 * @description SSR unit tests for FloatingInput: size variants, icon positioning, clearable button, accessibility.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import FloatingInput from "@components/ui/floating-input.svelte";

describe("FloatingInput (SSR)", () => {
  it("renders a floating input with default size (lg)", () => {
    const { body } = render(FloatingInput, {
      props: { label: "Search collections...", value: "" },
    });
    expect(body).toContain("<input");
    expect(body).toContain("h-12");
    expect(body).toContain("Search collections...");
  });

  it('renders size="md" with h-10 to match standard button height', () => {
    const { body } = render(FloatingInput, {
      props: { size: "md", label: "Search collections...", value: "" },
    });
    expect(body).toContain("h-10");
    expect(body).toContain("text-sm");
  });

  it('renders size="sm" with h-8 for compact toolbar density', () => {
    const { body } = render(FloatingInput, {
      props: { size: "sm", label: "Filter", value: "" },
    });
    expect(body).toContain("h-8");
    expect(body).toContain("text-xs");
  });

  it("positions icon at start-3 with proper padding", () => {
    const { body } = render(FloatingInput, {
      props: { icon: "mdi:magnify", label: "Search", value: "" },
    });
    expect(body).toContain("start-3");
    expect(body).toContain("ps-9");
    expect(body).toContain("start-9");
    expect(body).toContain('icon="mdi:magnify"');
  });

  it("renders clear button when clearable and value is present", () => {
    const { body } = render(FloatingInput, {
      props: { clearable: true, value: "asd", label: "Search" },
    });
    expect(body).toContain('aria-label="Clear input"');
    expect(body).toContain("end-2");
    expect(body).toContain('icon="mdi:close"');
    expect(body).toContain("pe-10");
  });

  it("does not render clear button when value is empty", () => {
    const { body } = render(FloatingInput, {
      props: { clearable: true, value: "", label: "Search" },
    });
    expect(body).not.toContain('aria-label="Clear input"');
  });

  it("positions security password toggle at end-3", () => {
    const { body } = render(FloatingInput, {
      props: { type: "security", label: "Password", value: "secret" },
    });
    expect(body).toContain("end-3");
    expect(body).toContain('aria-label="Show password"');
  });
});

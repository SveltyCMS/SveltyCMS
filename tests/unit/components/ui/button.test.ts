/**
 * @vitest-environment node
 * @file tests/unit/components/ui/button.test.ts
 * @description SSR tests for Button: verifies server render doesn't crash, client-only content.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Button from "@src/components/ui/button.svelte";

describe("Button (SSR)", () => {
  it("renders without throwing", () => {
    expect(() => render(Button, { props: { children: "Click" } })).not.toThrow();
  });

  it("renders without throwing with href", () => {
    expect(() => render(Button, { props: { href: "/dash", children: "Go" } })).not.toThrow();
  });

  it("renders without throwing with disabled", () => {
    expect(() => render(Button, { props: { disabled: true, children: "Nope" } })).not.toThrow();
  });

  it("renders without throwing with loading", () => {
    expect(() => render(Button, { props: { loading: true, children: "Wait" } })).not.toThrow();
  });

  it("renders without throwing with size lg", () => {
    expect(() => render(Button, { props: { size: "lg", children: "Big" } })).not.toThrow();
  });

  it("renders without throwing with variant outline", () => {
    expect(() => render(Button, { props: { variant: "outline", children: "Out" } })).not.toThrow();
  });

  it("renders without throwing without children", () => {
    expect(() => render(Button, { props: {} })).not.toThrow();
  });
});

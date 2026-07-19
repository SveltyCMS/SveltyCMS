/**
 * @vitest-environment node
 * @file tests/unit/components/ui/input.test.ts
 * @description SSR tests for Input: types, states, ARIA, labels, accessibility.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import InputSsrWrapper from "./input-ssr-wrapper.svelte";

describe("Input (SSR)", () => {
  it("renders a text input", () => {
    const { body } = render(InputSsrWrapper, { props: { type: "text" } });
    expect(body).toContain("<input");
    expect(body).toContain('type="text"');
  });

  it("renders label linked to input", () => {
    const { body } = render(InputSsrWrapper, {
      props: { label: "Username", id: "user" },
    });
    expect(body).toContain("<label");
    expect(body).toContain("Username");
    expect(body).toContain('id="user"');
  });

  it("renders error with full ARIA linkage", () => {
    const { body } = render(InputSsrWrapper, {
      props: { id: "email", error: "Invalid email" },
    });
    expect(body).toContain("Invalid email");
    expect(body).toContain('aria-invalid="true"');
    expect(body).toContain('aria-describedby="email-error"');
    expect(body).toContain('role="alert"');
    expect(body).toContain("border-error");
  });

  it("renders password type", () => {
    const { body } = render(InputSsrWrapper, { props: { type: "password" } });
    expect(body).toContain('type="password"');
  });

  it("handles disabled state", () => {
    const { body } = render(InputSsrWrapper, { props: { disabled: true } });
    expect(body).toContain("disabled");
  });

  it("handles placeholder", () => {
    const { body } = render(InputSsrWrapper, {
      props: { placeholder: "Enter name" },
    });
    expect(body).toContain('placeholder="Enter name"');
  });

  it("handles required field", () => {
    const { body } = render(InputSsrWrapper, {
      props: { required: true, label: "Name" },
    });
    expect(body).toContain("required");
  });
});

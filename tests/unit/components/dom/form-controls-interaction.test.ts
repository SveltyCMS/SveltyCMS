/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/form-controls-interaction.test.ts
 * @description Real DOM interaction tests for Input, Select, and Textarea.
 *
 * These cover the wiring that SSR string assertions cannot see: native value
 * events reaching the bindable prop, change callbacks, and error/ARIA linkage.
 *
 * ### Features:
 * - Input: typing updates the native value and forwards `oninput`
 * - Input: error state links `aria-invalid` + `aria-describedby` to the alert
 * - Select: changing the option fires `onchange` with the new value
 * - Select: disabled + required attributes reach the native control
 * - Textarea: typing updates the value and error linkage works
 */

import { describe, expect, it, vi } from "vitest";
import Input from "@src/components/ui/input.svelte";
import Select from "@src/components/ui/select.svelte";
import Textarea from "@src/components/ui/textarea.svelte";
import { renderComponent, select, typeText } from "./render";

describe("Input (client interaction)", () => {
  it("updates the native value and forwards oninput", async () => {
    const oninput = vi.fn();
    const { target, cleanup } = renderComponent(Input, {
      value: "",
      label: "Username",
      oninput,
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input");
      expect(input).toHaveAccessibleName("Username");

      await typeText(input, "ada");

      expect(input).toHaveValue("ada");
      expect(oninput).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("links an error message to the input", () => {
    const { target, cleanup } = renderComponent(Input, {
      id: "email",
      label: "Email",
      error: "Invalid email",
    });

    try {
      const input = target.querySelector<HTMLInputElement>("input");
      const error = target.querySelector("[role=alert]");

      expect(error).toHaveAttribute("id", "email-error");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", "email-error");
      expect(input).toHaveAccessibleDescription("Invalid email");
    } finally {
      cleanup();
    }
  });
});

describe("Select (client interaction)", () => {
  const options = [
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
  ];

  it("fires onchange with the selected value", async () => {
    const onchange = vi.fn();
    const { target, cleanup } = renderComponent(Select, {
      value: "draft",
      label: "Status",
      options,
      onchange,
    });

    try {
      const selectEl = target.querySelector<HTMLSelectElement>("select");
      expect(selectEl).toHaveAccessibleName("Status");

      await select(selectEl, "published");

      expect(selectEl).toHaveValue("published");
      expect(onchange).toHaveBeenCalledWith("published");
    } finally {
      cleanup();
    }
  });

  it("forwards disabled and required to the native select", () => {
    const { target, cleanup } = renderComponent(Select, {
      value: "",
      label: "Status",
      options,
      disabled: true,
      required: true,
    });

    try {
      const selectEl = target.querySelector<HTMLSelectElement>("select");
      expect(selectEl).toBeDisabled();
      expect(selectEl).toBeRequired();
      expect(selectEl).toHaveAttribute("aria-required", "true");
    } finally {
      cleanup();
    }
  });
});

describe("Textarea (client interaction)", () => {
  it("updates the native value on input", async () => {
    const { target, cleanup } = renderComponent(Textarea, {
      value: "",
      label: "Notes",
      rows: 6,
    });

    try {
      const textarea = target.querySelector<HTMLTextAreaElement>("textarea");
      expect(textarea).toHaveAccessibleName("Notes");
      expect(textarea).toHaveAttribute("rows", "6");

      await typeText(textarea, "Hello\nworld");

      expect(textarea).toHaveValue("Hello\nworld");
    } finally {
      cleanup();
    }
  });

  it("links an error message to the textarea", () => {
    const { target, cleanup } = renderComponent(Textarea, {
      id: "bio",
      label: "Bio",
      error: "Too long",
    });

    try {
      const textarea = target.querySelector<HTMLTextAreaElement>("textarea");
      expect(textarea).toHaveAttribute("aria-invalid", "true");
      expect(textarea).toHaveAttribute("aria-describedby", "bio-error");
      expect(target.querySelector("[role=alert]")).toHaveTextContent("Too long");
    } finally {
      cleanup();
    }
  });
});

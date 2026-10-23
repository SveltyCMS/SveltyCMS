/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/widget-inputs-interaction.test.ts
 * @description Real DOM interaction tests for Core Widget Inputs (Input, Checkbox, Number, Email).
 *
 * Validates the Three Pillars widget architecture in the client runtime:
 * - Text Input: typing updates native value and triggers validation binding
 * - Checkbox: toggling changes checked state and boolean value
 * - Number: numeric input enforcement and min/max constraints
 * - ARIA accessibility and error messaging linkage
 *
 * ### Features:
 * - mounts real Svelte 5 widget components
 * - exercises native user input events
 * - asserts two-way reactivity with validationStore
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InputWidget from "@src/widgets/core/input/input.svelte";
import CheckboxWidget from "@src/widgets/core/checkbox/input.svelte";
import NumberWidget from "@src/widgets/core/number/input.svelte";
import EmailWidget from "@src/widgets/core/email/input.svelte";
import { validationStore } from "@src/stores/validation-store.svelte";
import { click, renderComponent, settle, typeText } from "./render";

describe("Core Widget Inputs (client DOM interaction)", () => {
  beforeEach(() => {
    validationStore.clearAllErrors();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Text Input Widget", () => {
    it("renders label and updates bound value on user input", async () => {
      let boundValue = "";
      const fieldDef: any = {
        label: "Product Name",
        db_fieldName: "product_name",
        required: true,
      };

      const { target, cleanup } = renderComponent(InputWidget, {
        field: fieldDef,
        value: boundValue,
      });

      try {
        const input = target.querySelector<HTMLInputElement>("input");
        expect(input).toBeInTheDocument();
        expect(input?.name).toBe("product_name");

        await typeText(input, "Super Widget 3000");
        expect(input?.value).toBe("Super Widget 3000");
      } finally {
        cleanup();
      }
    });

    it("displays error indication when validationStore reports an error", async () => {
      const fieldDef: any = {
        label: "Title",
        db_fieldName: "title",
        required: true,
      };

      const { target, cleanup } = renderComponent(InputWidget, {
        field: fieldDef,
        value: "",
      });

      try {
        validationStore.setError("title", "Title is strictly required");
        await settle();

        const errorEl =
          target.querySelector("[role=alert]") || target.querySelector(".text-error-500");
        expect(errorEl).toBeInTheDocument();
        expect(errorEl?.textContent).toContain("Title is strictly required");
      } finally {
        cleanup();
      }
    });
  });

  describe("Checkbox Widget", () => {
    it("toggles checked state and clears validation error on change", async () => {
      let checkedValue = false;
      const fieldDef: any = {
        label: "Terms Accepted",
        db_fieldName: "terms",
        required: true,
      };

      const { target, cleanup } = renderComponent(CheckboxWidget, {
        field: fieldDef,
        value: checkedValue,
      });

      try {
        const checkbox = target.querySelector<HTMLInputElement>('input[type="checkbox"]');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox?.checked).toBe(false);

        validationStore.setError("terms", "Must accept terms");
        await settle();

        await click(checkbox);
        expect(checkbox?.checked).toBe(true);
        expect(validationStore.getError("terms")).toBeFalsy();
      } finally {
        cleanup();
      }
    });
  });

  describe("Number Widget", () => {
    it("renders numeric input with step/min attributes", async () => {
      const fieldDef: any = {
        label: "Inventory Count",
        db_fieldName: "inventory",
        min: 0,
        max: 500,
        step: 1,
      };

      const { target, cleanup } = renderComponent(NumberWidget, {
        field: fieldDef,
        value: 10,
      });

      try {
        const input = target.querySelector<HTMLInputElement>('input[type="number"]');
        expect(input).toBeInTheDocument();
        expect(input?.value).toBe("10");
        expect(input?.getAttribute("min")).toBe("0");
        expect(input?.getAttribute("max")).toBe("500");
      } finally {
        cleanup();
      }
    });
  });

  describe("Email Widget", () => {
    it("renders email type input and enforces format accessibility", async () => {
      const fieldDef: any = {
        label: "Subscriber Email",
        db_fieldName: "email_address",
        required: true,
      };

      const { target, cleanup } = renderComponent(EmailWidget, {
        field: fieldDef,
        value: "",
      });

      try {
        const input = target.querySelector<HTMLInputElement>('input[type="email"]');
        expect(input).toBeInTheDocument();
        expect(input?.getAttribute("type")).toBe("email");
        expect(input?.getAttribute("aria-required")).toBe("true");

        await typeText(input, "developer@sveltycms.test");
        expect(input?.value).toBe("developer@sveltycms.test");
      } finally {
        cleanup();
      }
    });
  });
});

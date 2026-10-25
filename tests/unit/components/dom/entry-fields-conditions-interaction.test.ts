/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/entry-fields-conditions-interaction.test.ts
 * @description Real DOM interaction tests for entry Fields showIf and requiredIf conditions.
 *
 * Covers:
 * - Dynamic field visibility: fields with showIf hide/show in DOM based on controlling field.
 * - Dynamic field requirement: fields with requiredIf show/hide required indicator (*) based on condition.
 * - ValidationStore synchronization: requiredIf sets error when empty, clears error when populated.
 * - Stale error cleanup: when controlling field hides a conditionally required field or condition ceases,
 *   stale errors in validationStore are immediately pruned.
 * - Nested condition rules: evaluating boolean AND/OR expressions on form inputs.
 *
 * ### Features:
 * - showIf hides/reveals target field container in real DOM
 * - requiredIf dynamically updates required indicator and validationStore
 * - typing into conditionally required field clears validation error
 * - untrack fix prevents effect_update_depth_exceeded crash
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Component } from "svelte";
import Fields from "@src/components/collection-display/fields.svelte";
import TokenPicker from "@src/components/token-picker.svelte";
import MockWidgetInput from "./mocks/mock-widget-input.svelte";
import { validationStore } from "@src/stores/validation-store.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { activeInput } from "@src/stores/active-input-store.svelte";
import type { Schema } from "@src/content/types";
import { click, renderComponent, settle, typeText } from "./render";

vi.mock("$app/state", () => ({
  page: {
    data: {
      user: { _id: "u1", role: "admin", username: "admin" },
      tenantId: "test-tenant",
    },
  },
}));

vi.mock("$app/env", () => import("./mocks/app-env"));

vi.mock("@widgets/widget-loader-registry", () => ({
  getCachedWidgetInputLoader: () => () => Promise.resolve({ default: MockWidgetInput }),
  prefetchWidgetLoaders: vi.fn(),
  resolveWidgetInputLoader: () => () => Promise.resolve({ default: MockWidgetInput }),
}));

vi.mock("@src/stores/widget-store.svelte", () => ({
  widgets: {
    widgetFunctions: {
      Input: { Name: "Input", Icon: "mdi:form-textbox" },
      Checkbox: { Name: "Checkbox", Icon: "mdi:checkbox-marked" },
    },
    loading: false,
    isLoaded: true,
  },
}));

type LooseComponent = Component<Record<string, unknown>>;
const FieldsComponent = Fields as unknown as LooseComponent;
const TokenPickerComponent = TokenPicker as unknown as LooseComponent;

describe("entry fields showIf and requiredIf DOM interactions", () => {
  let cleanupFn: (() => void) | null = null;

  beforeEach(() => {
    validationStore.clearAllErrors();
  });

  afterEach(() => {
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    validationStore.clearAllErrors();
  });

  it("dynamically toggles visibility of field governed by showIf rule", async () => {
    const schema: Schema = {
      _id: "features_col" as any,
      name: "Features",
      slug: "features",
      fields: [
        {
          db_fieldName: "enable_feature",
          label: "Enable Feature",
          widget: { Name: "Checkbox" } as any,
          required: false,
          translated: false,
        },
        {
          db_fieldName: "feature_name",
          label: "Feature Name",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
          showIf: { field: "enable_feature", operator: "equals", value: true },
        },
      ],
    };

    collections.activeValue = { enable_feature: false };
    const { target, cleanup } = renderComponent(FieldsComponent, {
      collection: schema,
      fields: schema.fields,
    });
    cleanupFn = cleanup;
    await settle();

    // Initially enable_feature is false, so feature_name should NOT be in DOM
    expect(target.querySelector("#field-container-enable_feature")).not.toBeNull();
    expect(target.querySelector("#field-container-feature_name")).toBeNull();

    // Toggle checkbox to true
    const checkbox = target.querySelector<HTMLInputElement>(
      '[data-testid="checkbox-enable_feature"]',
    );
    expect(checkbox).not.toBeNull();
    await click(checkbox);
    await settle();

    // Now feature_name should be visible in DOM
    expect(target.querySelector("#field-container-feature_name")).not.toBeNull();

    // Toggle checkbox back to false
    await click(checkbox);
    await settle();

    // feature_name must be removed from DOM
    expect(target.querySelector("#field-container-feature_name")).toBeNull();
  });

  it("dynamically applies required indicator and validationStore error via requiredIf", async () => {
    const schema: Schema = {
      _id: "accounts_col" as any,
      name: "Accounts",
      slug: "accounts",
      fields: [
        {
          db_fieldName: "account_type",
          label: "Account Type",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
        },
        {
          db_fieldName: "tax_id",
          label: "Tax ID",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
          requiredIf: { field: "account_type", operator: "equals", value: "business" },
        },
      ],
    };

    collections.activeValue = { account_type: "personal", tax_id: "" };
    const { target, cleanup } = renderComponent(FieldsComponent, {
      collection: schema,
      fields: schema.fields,
    });
    cleanupFn = cleanup;
    await settle();

    const taxIdContainer = target.querySelector("#field-container-tax_id");
    expect(taxIdContainer).not.toBeNull();

    // With account_type="personal", tax_id is not required
    expect(taxIdContainer?.querySelector(".text-error-500")).toBeNull();
    expect(validationStore.hasError("tax_id")).toBe(false);

    // Type "business" into account_type input
    const accountTypeInput = target.querySelector<HTMLInputElement>(
      '[data-testid="input-account_type"]',
    );
    expect(accountTypeInput).not.toBeNull();
    await typeText(accountTypeInput, "business");
    await settle();

    // Now requiredIf matches -> asterisk should appear and validationStore has error
    const updatedTaxContainer = target.querySelector("#field-container-tax_id");
    expect(updatedTaxContainer?.querySelector(".text-error-500")).not.toBeNull();
    expect(validationStore.hasError("tax_id")).toBe(true);

    // Fill in tax_id -> error must clear
    const taxIdInput = target.querySelector<HTMLInputElement>('[data-testid="input-tax_id"]');
    expect(taxIdInput).not.toBeNull();
    await typeText(taxIdInput, "US-987654321");
    await settle();

    expect(validationStore.hasError("tax_id")).toBe(false);

    // Clear tax_id again -> error reappears
    await typeText(taxIdInput, "");
    await settle();
    expect(validationStore.hasError("tax_id")).toBe(true);

    // Switch account_type back to "personal" -> condition fails -> error clears
    await typeText(accountTypeInput, "personal");
    await settle();
    expect(validationStore.hasError("tax_id")).toBe(false);
  });

  it("clears stale validationStore errors when a field is hidden by showIf", async () => {
    const schema: Schema = {
      _id: "subscriptions_col" as any,
      name: "Subscriptions",
      slug: "subscriptions",
      fields: [
        {
          db_fieldName: "subscribe_newsletter",
          label: "Subscribe Newsletter",
          widget: { Name: "Checkbox" } as any,
          required: false,
          translated: false,
        },
        {
          db_fieldName: "newsletter_frequency",
          label: "Newsletter Frequency",
          widget: { Name: "Input" } as any,
          required: true,
          translated: false,
          showIf: { field: "subscribe_newsletter", operator: "equals", value: true },
        },
      ],
    };

    // Initially subscribe_newsletter is true, newsletter_frequency is empty -> required error
    collections.activeValue = { subscribe_newsletter: true, newsletter_frequency: "" };
    const { target, cleanup } = renderComponent(FieldsComponent, {
      collection: schema,
      fields: schema.fields,
    });
    cleanupFn = cleanup;
    await settle();

    expect(target.querySelector("#field-container-newsletter_frequency")).not.toBeNull();
    expect(validationStore.hasError("newsletter_frequency")).toBe(true);

    // User unchecks subscribe_newsletter -> newsletter_frequency hides
    const checkbox = target.querySelector<HTMLInputElement>(
      '[data-testid="checkbox-subscribe_newsletter"]',
    );
    expect(checkbox).not.toBeNull();
    await click(checkbox);
    await settle();

    // Field must be removed from DOM AND error in validationStore must be immediately cleared
    expect(target.querySelector("#field-container-newsletter_frequency")).toBeNull();
    expect(validationStore.hasError("newsletter_frequency")).toBe(false);
  });

  it("handles complex nested conditions (and / or) dynamically", async () => {
    const schema: Schema = {
      _id: "eligibility_col" as any,
      name: "Eligibility",
      slug: "eligibility",
      fields: [
        {
          db_fieldName: "country",
          label: "Country",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
        },
        {
          db_fieldName: "age",
          label: "Age",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
        },
        {
          db_fieldName: "parent_consent",
          label: "Parent Consent",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
          requiredIf: {
            and: [
              { field: "country", operator: "equals", value: "US" },
              { field: "age", operator: "lt", value: 18 },
            ],
          },
        },
      ],
    };

    // Country="US", Age="25" -> not required
    collections.activeValue = { country: "US", age: "25", parent_consent: "" };
    const { target, cleanup } = renderComponent(FieldsComponent, {
      collection: schema,
      fields: schema.fields,
    });
    cleanupFn = cleanup;
    await settle();

    expect(validationStore.hasError("parent_consent")).toBe(false);

    // Update age to "15" -> condition satisfied -> parent_consent is required & empty -> error
    const ageInput = target.querySelector<HTMLInputElement>('[data-testid="input-age"]');
    expect(ageInput).not.toBeNull();
    await typeText(ageInput, "15");
    await settle();

    expect(validationStore.hasError("parent_consent")).toBe(true);

    // Update country to "CA" -> condition fails -> error clears
    const countryInput = target.querySelector<HTMLInputElement>('[data-testid="input-country"]');
    expect(countryInput).not.toBeNull();
    await typeText(countryInput, "CA");
    await settle();

    expect(validationStore.hasError("parent_consent")).toBe(false);
  });

  it("opens TokenPicker from field Insert Token button and inserts configured token into field and collection store", async () => {
    activeInput.clear();
    const schema: Schema = {
      _id: "posts_col" as any,
      name: "Posts",
      slug: "posts",
      fields: [
        {
          db_fieldName: "headline",
          label: "Headline",
          widget: { Name: "Input" } as any,
          required: false,
          translated: false,
        },
      ],
    };

    collections.active = schema;
    collections.activeValue = { headline: "" };

    const { target, cleanup } = renderComponent(FieldsComponent, {
      collection: schema,
      fields: schema.fields,
    });
    const picker = renderComponent(TokenPickerComponent);
    cleanupFn = () => {
      cleanup();
      picker.cleanup();
    };
    await settle();

    // TokenPicker should initially be closed
    expect(document.querySelector(".token-window")).toBeNull();

    // Click "Insert token into Headline" button
    const insertTokenBtn = target.querySelector<HTMLButtonElement>(
      'button[aria-label="Insert token into Headline"]',
    );
    expect(insertTokenBtn).not.toBeNull();
    await click(insertTokenBtn);
    await settle();

    // TokenPicker floating window should now be mounted and visible
    const tokenWindow = document.querySelector(".token-window");
    expect(tokenWindow).not.toBeNull();
    expect(tokenWindow?.textContent).toContain("Select Token");
    expect(tokenWindow?.textContent).toContain("Headline");

    // Select a token from the entry category (e.g., "Entry ID" or "Headline")
    const tokenCards = tokenWindow?.querySelectorAll('[role="button"]');
    expect(tokenCards && tokenCards.length > 0).toBe(true);
    await click(tokenCards?.[0] as HTMLElement);
    await settle();

    expect(tokenWindow?.textContent).toContain("Configure Token");

    // Click "Insert Token" button in TokenPicker footer
    const confirmInsertBtn = Array.from(tokenWindow?.querySelectorAll("button") ?? []).find(
      (btn) => btn.textContent?.trim() === "Insert Token",
    );
    expect(confirmInsertBtn).toBeDefined();
    await click(confirmInsertBtn);
    await settle();

    // TokenPicker closes and field + store receive the token syntax
    expect(document.querySelector(".token-window")).toBeNull();
    const headlineInput = target.querySelector<HTMLInputElement>('[data-testid="input-headline"]');
    expect(headlineInput?.value).toMatch(/^\{\{.*\}\}$/);
    expect((collections.activeValue as Record<string, unknown>)?.headline).toMatch(/^\{\{.*\}\}$/);
  });
});

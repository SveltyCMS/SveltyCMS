/**
 * @file tests/unit/routes/system-settings-utils.test.ts
 * @description Unit tests for system-settings pure helpers — field defaults and validation.
 *
 * Regression: number fields must never default to `null` — the settings UI binds
 * `values[field.key]` into <Input value?: string | number | string[]>, and Svelte 5
 * throws `props_invalid_value` when `null` is bound (crashed the security group panel
 * for DBs seeded before SESSION_TTL_HOURS / SESSION_IDLE_HOURS / SESSION_MAX_PER_USER).
 */

import { describe, it, expect } from "vitest";
import {
  defaultFieldValue,
  initializeGroupValues,
  validateSettingField,
} from "../../../src/routes/(app)/config/system-settings/settings-utils";
import type { SettingField } from "../../../src/routes/(app)/config/system-settings/settings-groups";

function numberField(overrides: Partial<SettingField> = {}): SettingField {
  return {
    key: "TEST_NUMBER",
    label: "Test Number",
    type: "number",
    category: "public",
    ...overrides,
  } as SettingField;
}

describe("defaultFieldValue", () => {
  it("defaults number fields to the placeholder (documented default) — never null", () => {
    expect(defaultFieldValue(numberField({ placeholder: "24" }))).toBe(24);
    expect(defaultFieldValue(numberField({ placeholder: "0" }))).toBe(0);
  });

  it("falls back to the field minimum when a number field has no placeholder", () => {
    expect(defaultFieldValue(numberField({ min: 1, max: 86_400 }))).toBe(1);
    expect(defaultFieldValue(numberField({}))).toBe(0);
  });

  it("defaults booleans to false, arrays to [] and strings to ''", () => {
    expect(
      defaultFieldValue({
        key: "B",
        label: "B",
        type: "boolean",
        category: "public",
      } as SettingField),
    ).toBe(false);
    expect(
      defaultFieldValue({
        key: "A",
        label: "A",
        type: "array",
        category: "public",
      } as SettingField),
    ).toEqual([]);
    expect(
      defaultFieldValue({ key: "S", label: "S", type: "text", category: "public" } as SettingField),
    ).toBe("");
  });
});

describe("initializeGroupValues", () => {
  it("keeps loaded values and fills every missing key with a safe default", () => {
    const fields = [
      numberField({ key: "SESSION_TTL_HOURS", placeholder: "24" }),
      numberField({ key: "SESSION_MAX_PER_USER", placeholder: "0" }),
      { key: "SITE_NAME", label: "Site Name", type: "text", category: "public" } as SettingField,
    ];
    const initialized = initializeGroupValues(fields, { SESSION_MAX_PER_USER: 5 });
    expect(initialized.SESSION_TTL_HOURS).toBe(24);
    expect(initialized.SESSION_MAX_PER_USER).toBe(5);
    expect(initialized.SITE_NAME).toBe("");
  });

  it("never leaves a number field undefined or null", () => {
    const initialized = initializeGroupValues([numberField({ placeholder: "0" })], {});
    expect(typeof initialized.TEST_NUMBER).toBe("number");
    expect(initialized.TEST_NUMBER).not.toBeNull();
  });
});

describe("validateSettingField", () => {
  it("enforces min/max for number fields", () => {
    const field = numberField({ min: 0, max: 100 });
    expect(validateSettingField(field, -1)).toMatch(/at least 0/);
    expect(validateSettingField(field, 101)).toMatch(/at most 100/);
    expect(validateSettingField(field, 42)).toBeNull();
  });

  it("flags required fields when unset", () => {
    const field = numberField({ key: "PASSWORD_MIN_LENGTH", required: true });
    expect(validateSettingField(field, null)).toMatch(/required/);
    expect(validateSettingField(field, 8)).toBeNull();
  });
});

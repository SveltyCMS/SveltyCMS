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
import {
  settingsGroups,
  type SettingField,
} from "../../../src/routes/(app)/config/system-settings/settings-groups";

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

/**
 * F16: `category: "private"` settings load from `config/private.ts` on a fresh
 * install, which carries no cache TTLs. With `min: 1` and no placeholder every
 * TTL rendered (and could be saved as) 1 second, silently disabling caching.
 * The documented defaults live in `docs/reference/security/secrets-inventory.mdx`
 * and must match the DB seed (`src/routes/setup/seed.ts`).
 */
describe("cache TTL field defaults", () => {
  const EXPECTED_TTL_DEFAULTS: Record<string, number> = {
    CACHE_TTL_SCHEMA: 600,
    CACHE_TTL_WIDGET: 600,
    CACHE_TTL_THEME: 300,
    CACHE_TTL_CONTENT: 180,
    CACHE_TTL_MEDIA: 300,
    CACHE_TTL_SESSION: 86_400,
    CACHE_TTL_USER: 60,
    CACHE_TTL_API: 300,
  };

  const cacheGroup = settingsGroups.find((group) => group.id === "cache");

  it("documents real seconds — never the `min` of 1", () => {
    expect(cacheGroup).toBeDefined();
    for (const [key, expected] of Object.entries(EXPECTED_TTL_DEFAULTS)) {
      const field = cacheGroup?.fields.find((f) => f.key === key);
      expect(field, `missing ${key}`).toBeDefined();
      expect(field?.placeholder).toBe(String(expected));
      expect(defaultFieldValue(field as SettingField)).toBe(expected);
    }
  });

  it("keeps DB-seeded values authoritative when present", () => {
    const fields = cacheGroup?.fields ?? [];
    const initialized = initializeGroupValues(fields, { CACHE_TTL_SCHEMA: 42 });
    expect(initialized.CACHE_TTL_SCHEMA).toBe(42);
    // Untouched fields still fall back to the documented default, not 1.
    expect(initialized.CACHE_TTL_USER).toBe(60);
  });
});

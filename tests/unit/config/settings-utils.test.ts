/**
 * @file tests/unit/config/settings-utils.test.ts
 * @description Unit tests for system-settings pure helpers (CSRF headers, validation, import).
 */

import { describe, it, expect, vi } from "vitest";
import {
  remoteJsonHeaders,
  defaultFieldValue,
  initializeGroupValues,
  validateSettingField,
  validateAllSettingFields,
  hasEmptyConfigFields,
  hasUnsavedSettingChanges,
  parseImportedGroupJson,
  mergeImportedGroupValues,
} from "../../../src/routes/(app)/config/system-settings/settings-utils";
import type { SettingField } from "../../../src/routes/(app)/config/system-settings/settings-groups";
import { CSRF_TOKEN_COOKIE_NAME, CSRF_TOKEN_HEADER } from "@utils/security/csrf-utils";

function mockCookies(cookies: Record<string, string | undefined>) {
  return {
    get: vi.fn((name: string) => cookies[name]),
  };
}

const sampleFields: SettingField[] = [
  {
    key: "SMTP_HOST",
    label: "SMTP Host",
    description: "Host",
    type: "text",
    category: "private",
    required: true,
  },
  {
    key: "SMTP_USER",
    label: "SMTP User Email",
    description: "User",
    type: "text",
    category: "private",
  },
  {
    key: "CACHE_TTL",
    label: "Cache TTL",
    description: "TTL",
    type: "number",
    category: "private",
    min: 1,
    max: 100,
  },
  {
    key: "ENABLED",
    label: "Enabled",
    description: "Flag",
    type: "boolean",
    category: "public",
  },
  {
    key: "TAGS",
    label: "Tags",
    description: "List",
    type: "array",
    category: "public",
  },
];

describe("remoteJsonHeaders", () => {
  it("always sets Content-Type application/json", () => {
    const headers = remoteJsonHeaders(mockCookies({}));
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("includes X-CSRF-Token from plain csrf_token cookie", () => {
    const headers = remoteJsonHeaders(
      mockCookies({ [CSRF_TOKEN_COOKIE_NAME]: "plain-token-value" }),
    );
    expect(headers[CSRF_TOKEN_HEADER]).toBe("plain-token-value");
  });

  it("prefers __Host-csrf_token over plain cookie", () => {
    const headers = remoteJsonHeaders(
      mockCookies({
        [`__Host-${CSRF_TOKEN_COOKIE_NAME}`]: "host-token",
        [CSRF_TOKEN_COOKIE_NAME]: "plain-token",
      }),
    );
    expect(headers[CSRF_TOKEN_HEADER]).toBe("host-token");
  });

  it("omits CSRF header when no cookie is present", () => {
    const headers = remoteJsonHeaders(mockCookies({}));
    expect(headers[CSRF_TOKEN_HEADER]).toBeUndefined();
  });
});

describe("defaultFieldValue / initializeGroupValues", () => {
  it("defaults by type", () => {
    expect(defaultFieldValue(sampleFields[3])).toBe(false);
    expect(defaultFieldValue(sampleFields[4])).toEqual([]);
    expect(defaultFieldValue(sampleFields[2])).toBeNull();
    expect(defaultFieldValue(sampleFields[0])).toBe("");
  });

  it("fills missing keys from loaded payload", () => {
    const values = initializeGroupValues(sampleFields, {
      SMTP_HOST: "mail.example.com",
      CACHE_TTL: 30,
    });
    expect(values.SMTP_HOST).toBe("mail.example.com");
    expect(values.CACHE_TTL).toBe(30);
    expect(values.ENABLED).toBe(false);
    expect(values.TAGS).toEqual([]);
    expect(values.SMTP_USER).toBe("");
  });
});

describe("validateSettingField", () => {
  it("requires non-empty for required fields", () => {
    expect(validateSettingField(sampleFields[0], "")).toMatch(/required/i);
    expect(validateSettingField(sampleFields[0], "host")).toBeNull();
  });

  it("validates email-like fields", () => {
    expect(validateSettingField(sampleFields[1], "not-an-email")).toMatch(/email/i);
    expect(validateSettingField(sampleFields[1], "user@example.com")).toBeNull();
  });

  it("enforces number min/max", () => {
    expect(validateSettingField(sampleFields[2], 0)).toMatch(/at least/i);
    expect(validateSettingField(sampleFields[2], 101)).toMatch(/at most/i);
    expect(validateSettingField(sampleFields[2], 50)).toBeNull();
  });

  it("runs custom validation when present", () => {
    const field: SettingField = {
      ...sampleFields[0],
      required: false,
      validation: (v) => (v === "bad" ? "Nope" : null),
    };
    expect(validateSettingField(field, "bad")).toBe("Nope");
    expect(validateSettingField(field, "ok")).toBeNull();
  });
});

describe("validateAllSettingFields / hasEmptyConfigFields / unsaved", () => {
  it("collects multiple field errors", () => {
    const errors = validateAllSettingFields(sampleFields, {
      SMTP_HOST: "",
      SMTP_USER: "x",
      CACHE_TTL: 200,
    });
    expect(errors.SMTP_HOST).toBeTruthy();
    expect(errors.SMTP_USER).toBeTruthy();
    expect(errors.CACHE_TTL).toBeTruthy();
  });

  it("detects empty HOST/EMAIL/required config fields", () => {
    expect(
      hasEmptyConfigFields(sampleFields, {
        SMTP_HOST: "",
        SMTP_USER: "a@b.co",
        CACHE_TTL: 1,
        ENABLED: true,
        TAGS: [],
      }),
    ).toBe(true);
    expect(
      hasEmptyConfigFields(sampleFields, {
        SMTP_HOST: "h",
        SMTP_USER: "a@b.co",
        CACHE_TTL: 1,
        ENABLED: true,
        TAGS: [],
      }),
    ).toBe(false);
  });

  it("detects unsaved changes", () => {
    expect(hasUnsavedSettingChanges({ a: 1 }, { a: 1 })).toBe(false);
    expect(hasUnsavedSettingChanges({ a: 1 }, { a: 2 })).toBe(true);
    expect(hasUnsavedSettingChanges({ a: [1] }, { a: [1] })).toBe(false);
  });
});

describe("parseImportedGroupJson / mergeImportedGroupValues", () => {
  const group = { id: "email", fields: sampleFields };

  it("parses nested export format", () => {
    const raw = JSON.stringify({ email: { SMTP_HOST: "smtp.local", ENABLED: true } });
    const result = parseImportedGroupJson(raw, group);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.SMTP_HOST).toBe("smtp.local");
      expect(result.values.ENABLED).toBe(true);
      expect(result.values).not.toHaveProperty("UNKNOWN");
    }
  });

  it("parses flat field object", () => {
    const raw = JSON.stringify({ SMTP_HOST: "h", CACHE_TTL: 9 });
    const result = parseImportedGroupJson(raw, group);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.SMTP_HOST).toBe("h");
      expect(result.values.CACHE_TTL).toBe(9);
    }
  });

  it("rejects invalid JSON and wrong shape", () => {
    expect(parseImportedGroupJson("not-json", group).ok).toBe(false);
    expect(parseImportedGroupJson("[]", group).ok).toBe(false);
    expect(parseImportedGroupJson(JSON.stringify({ other: {} }), group).ok).toBe(false);
  });

  it("filters unknown keys and merges onto current", () => {
    const merged = mergeImportedGroupValues(
      sampleFields,
      initializeGroupValues(sampleFields, { SMTP_HOST: "old" }),
      { SMTP_HOST: "new", EXTRA: "drop" },
    );
    expect(merged.SMTP_HOST).toBe("new");
    expect(merged).not.toHaveProperty("EXTRA");
  });
});

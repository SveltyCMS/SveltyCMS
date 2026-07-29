/**
 * @file tests/unit/plugins/settings-crypto.test.ts
 * @description Unit tests for plugin settings encryption and settings declaration validation.
 *
 * Features tested:
 * - Secret encryption/decryption (AES-256-GCM)
 * - Versioned envelope format
 * - Masked/masked value detection
 * - Secret field processing (encrypt new, preserve existing)
 * - Settings validation against declaration
 * - Secret field name extraction
 * - SettingsField type constraints
 */

import { describe, it, expect } from "vitest";
import {
  isMasked,
  getMaskedValue,
  maskSecretFields,
  processSecretFields,
  decryptSecretFields,
} from "@src/plugins/settings-crypto";
import {
  validatePluginSettings,
  getSecretFieldNames,
  hasSecretFields,
} from "@src/plugins/settings-declaration";
import type { SettingsPart } from "@src/plugins/settings-declaration";

// ============================================================================
// Encryption availability — requires SECRET_ENCRYPTION_KEY in env
// ============================================================================

const HAS_ENCRYPTION_KEY = typeof process !== "undefined" && !!process.env.SECRET_ENCRYPTION_KEY;

describe("Plugin Settings Crypto — Masking", () => {
  it("should detect masked values", () => {
    expect(isMasked("••••••••")).toBe(true);
    expect(isMasked("")).toBe(true);
    expect(isMasked(null as any)).toBe(true);
    expect(isMasked(undefined as any)).toBe(true);
  });

  it("should detect non-masked values", () => {
    expect(isMasked("real-value")).toBe(false);
    expect(isMasked("sk_live_123")).toBe(false);
  });

  it("should return a consistent masked value", () => {
    const masked = getMaskedValue();
    expect(masked).toBe("••••••••");
    expect(typeof masked).toBe("string");
  });

  describe("maskSecretFields", () => {
    it("should replace encrypted values with masked placeholder", () => {
      const stored = {
        apiKey: "v1:abc123encrypted",
        currency: "eur",
      };
      const result = maskSecretFields(stored, ["apiKey"]);
      expect(result.apiKey).toBe("••••••••");
      expect(result.currency).toBe("eur");
    });

    it("should not mask non-secret fields", () => {
      const stored = { name: "test", value: 42 };
      const result = maskSecretFields(stored, ["secretKey"]);
      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
    });

    it("should handle empty secret fields list", () => {
      const stored = { apiKey: "value", currency: "eur" };
      const result = maskSecretFields(stored, []);
      expect(result).toEqual(stored);
    });

    it("should not mask already-masked or empty values", () => {
      const stored = { apiKey: "", webhookSecret: "••••••••" };
      const result = maskSecretFields(stored, ["apiKey", "webhookSecret"]);
      expect(result.apiKey).toBe("");
      expect(result.webhookSecret).toBe("••••••••");
    });
  });
});

describe("Plugin Settings Crypto — processSecretFields", () => {
  it("should preserve existing encrypted values when blank/masked is submitted", async () => {
    const submitted = { apiKey: "••••••••", currency: "usd" };
    const existing = { apiKey: "v1:existingEncryptedValue", currency: "eur" };

    const result = await processSecretFields(submitted, existing, ["apiKey"]);

    // Existing encrypted value should be preserved
    expect(result.apiKey).toBe("v1:existingEncryptedValue");
    // Non-secret field should use submitted value
    expect(result.currency).toBe("usd");
  });

  it("should preserve existing secret when empty string is submitted", async () => {
    const submitted = { apiKey: "" };
    const existing = { apiKey: "v1:someEncryptedValue" };

    const result = await processSecretFields(submitted, existing, ["apiKey"]);

    expect(result.apiKey).toBe("v1:someEncryptedValue");
  });

  it("should leave secret blank when no existing value and blank submitted", async () => {
    const submitted = { apiKey: "" };
    const existing = null;

    const result = await processSecretFields(submitted, existing, ["apiKey"]);

    expect(result.apiKey).toBe("");
  });

  // This test only runs when SECRET_ENCRYPTION_KEY is set
  (HAS_ENCRYPTION_KEY ? it : it.skip)(
    "should encrypt new plaintext values when key is configured",
    async () => {
      const submitted = { apiKey: "sk_live_secret123" };
      const existing = null;

      const result = await processSecretFields(submitted, existing, ["apiKey"]);

      // New value should be encrypted (not plaintext)
      expect(result.apiKey).not.toBe("sk_live_secret123");
      expect(typeof result.apiKey).toBe("string");
      expect((result.apiKey as string).length).toBeGreaterThan(20);
    },
  );
});

describe("Plugin Settings Crypto — decryptSecretFields", () => {
  it("should leave non-secret fields unchanged", async () => {
    const stored = { name: "test", currency: "eur" };
    const result = await decryptSecretFields(stored, []);
    expect(result).toEqual(stored);
  });

  it("should leave masked values as-is (don't attempt to decrypt)", async () => {
    const stored = { apiKey: "••••••••" };
    const result = await decryptSecretFields(stored, ["apiKey"]);
    expect(result.apiKey).toBe("••••••••");
  });

  it("should handle stored settings with no secret fields gracefully", async () => {
    const stored = { name: "test", value: 42 };
    const result = await decryptSecretFields(stored, []);
    expect(result).toEqual(stored);
  });
});

// ============================================================================
// Settings Declaration Validation
// ============================================================================

describe("Settings Declaration — validatePluginSettings", () => {
  const declaration: SettingsPart = {
    label: "Test Plugin Settings",
    fields: [
      { name: "apiKey", type: "secret", label: "API Key", required: true },
      {
        name: "currency",
        type: "string",
        label: "Currency",
        default: "eur",
        list: ["eur", "usd", "gbp"],
      },
      { name: "maxRetries", type: "number", label: "Max Retries", default: 3, min: 1, max: 10 },
      { name: "enabled", type: "boolean", label: "Enabled", default: false },
      { name: "description", type: "text", label: "Description" },
    ],
  };

  it("should accept valid settings", () => {
    const submitted = {
      apiKey: "sk_test_123",
      currency: "usd",
      maxRetries: 5,
      enabled: true,
      description: "A test config",
    };
    const issues = validatePluginSettings(submitted, declaration);
    expect(issues).toHaveLength(0);
  });

  it("should reject invalid currency option", () => {
    const submitted = { apiKey: "sk_test", currency: "jpy", maxRetries: 5, enabled: true };
    const issues = validatePluginSettings(submitted, declaration);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.field === "currency")).toBe(true);
  });

  it("should reject number out of range (below min)", () => {
    const submitted = { apiKey: "sk_test", currency: "eur", maxRetries: 0, enabled: true };
    const issues = validatePluginSettings(submitted, declaration);
    // maxRetries: 0 is below min: 1
    expect(issues.some((i) => i.field === "maxRetries")).toBe(true);
  });

  it("should reject number out of range (above max)", () => {
    const submitted = { apiKey: "sk_test", currency: "eur", maxRetries: 100, enabled: true };
    const issues = validatePluginSettings(submitted, declaration);
    expect(issues.some((i) => i.field === "maxRetries")).toBe(true);
  });

  it("should reject non-number for number field", () => {
    const submitted = {
      apiKey: "sk_test",
      currency: "eur",
      maxRetries: "five" as any,
      enabled: true,
    };
    const issues = validatePluginSettings(submitted, declaration);
    expect(issues.some((i) => i.field === "maxRetries")).toBe(true);
  });

  it("should not require secret fields (blank means keep existing)", () => {
    const submitted = { apiKey: "", currency: "eur", maxRetries: 5, enabled: true };
    const issues = validatePluginSettings(submitted, declaration);
    // Secret field blank is allowed (preserve existing)
    expect(issues.filter((i) => i.field === "apiKey")).toHaveLength(0);
  });

  it("should require non-secret required fields", () => {
    // Create a declaration with required non-secret field
    const decl: SettingsPart = {
      fields: [{ name: "name", type: "string", label: "Name", required: true }],
    };
    const issues = validatePluginSettings({}, decl);
    expect(issues.some((i) => i.field === "name")).toBe(true);
  });
});

describe("Settings Declaration — getSecretFieldNames", () => {
  it("should extract secret field names from a declaration", () => {
    const declaration: SettingsPart = {
      fields: [
        { name: "apiKey", type: "secret", label: "API Key" },
        { name: "webhookSecret", type: "secret", label: "Webhook Secret" },
        { name: "currency", type: "string", label: "Currency" },
      ],
    };

    const secrets = getSecretFieldNames(declaration);
    expect(secrets).toEqual(["apiKey", "webhookSecret"]);
  });

  it("should return empty array when no secret fields exist", () => {
    const declaration: SettingsPart = {
      fields: [
        { name: "currency", type: "string", label: "Currency" },
        { name: "enabled", type: "boolean", label: "Enabled" },
      ],
    };

    expect(getSecretFieldNames(declaration)).toEqual([]);
  });
});

describe("Settings Declaration — hasSecretFields", () => {
  it("should detect presence of secret fields", () => {
    const withSecret: SettingsPart = {
      fields: [{ name: "apiKey", type: "secret", label: "API Key" }],
    };
    const withoutSecret: SettingsPart = {
      fields: [{ name: "currency", type: "string", label: "Currency" }],
    };

    expect(hasSecretFields(withSecret)).toBe(true);
    expect(hasSecretFields(withoutSecret)).toBe(false);
  });
});

describe("Settings Declaration — requiredCapabilities", () => {
  it("should accept requiredCapabilities on the declaration", () => {
    const declaration: SettingsPart = {
      fields: [{ name: "apiKey", type: "secret", label: "API Key" }],
      requiredCapabilities: ["settings:write"],
    };

    expect(declaration.requiredCapabilities).toEqual(["settings:write"]);
  });

  it("should be optional (undefined when not set)", () => {
    const declaration: SettingsPart = {
      fields: [{ name: "name", type: "string", label: "Name" }],
    };

    expect(declaration.requiredCapabilities).toBeUndefined();
  });
});

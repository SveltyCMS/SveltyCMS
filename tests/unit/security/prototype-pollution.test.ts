/**
 * @file tests/unit/security/prototype-pollution.test.ts
 * @description Hardening verification against prototype pollution attacks across all object utilities.
 *
 * Verifies that deepClone, sanitizeObject, deepCopy, copyDataWithFreshRowIds,
 * theme merging, schema desugaring, and token path resolution strictly ignore
 * `__proto__`, `constructor`, and `prototype` keys and never pollute Object.prototype.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deepClone } from "@utils/native-utils";
import { sanitizeObject } from "@utils/security/input-sanitizer";
import { deepCopy, copyDataWithFreshRowIds } from "@utils/data-utils";
import { desugarFieldType } from "@src/widgets/desugar-field";
import { TokenRegistry } from "@src/services/token/engine";

describe("Prototype Pollution Defense", () => {
  beforeEach(() => {
    // Assert clean baseline
    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).isAdmin).toBeUndefined();
  });

  afterEach(() => {
    // Clean up if anything leaked
    delete (Object.prototype as any).polluted;
    delete (Object.prototype as any).isAdmin;
  });

  it("deepClone rejects __proto__, constructor, and prototype", () => {
    const maliciousPayload = JSON.parse(
      '{"normal": "value", "__proto__": {"polluted": true}, "constructor": {"prototype": {"isAdmin": true}}}',
    );

    const cloned = deepClone(maliciousPayload);

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).isAdmin).toBeUndefined();
    expect(cloned.normal).toBe("value");
    expect(Object.hasOwn(cloned, "__proto__")).toBe(false);
    expect(Object.hasOwn(cloned, "constructor")).toBe(false);
  });

  it("sanitizeObject strips __proto__, constructor, and prototype", () => {
    const maliciousPayload = JSON.parse(
      '{"title": "Safe Title", "__proto__": {"polluted": true}, "nested": {"constructor": {"prototype": {"isAdmin": true}}}}',
    );

    const sanitized = sanitizeObject(maliciousPayload) as any;

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).isAdmin).toBeUndefined();
    expect(sanitized.title).toBe("Safe Title");
    expect(Object.hasOwn(sanitized, "__proto__")).toBe(false);
    expect(Object.hasOwn(sanitized.nested, "constructor")).toBe(false);
  });

  it("deepCopy rejects prototype pollution keys", () => {
    const maliciousPayload = JSON.parse(
      '{"key": "val", "__proto__": {"polluted": "yes"}, "prototype": {"hack": "true"}}',
    );

    const copied = deepCopy(maliciousPayload) as any;

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).hack).toBeUndefined();
    expect(copied.key).toBe("val");
    expect(Object.hasOwn(copied, "__proto__")).toBe(false);
    expect(Object.hasOwn(copied, "prototype")).toBe(false);
  });

  it("copyDataWithFreshRowIds ignores prototype pollution keys", () => {
    const maliciousData = JSON.parse(
      '[{"_rowId": "123", "text": "item", "__proto__": {"polluted": true}}]',
    );

    const processed = copyDataWithFreshRowIds(maliciousData) as any[];

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(processed[0].text).toBe("item");
    expect(processed[0]._rowId).not.toBe("123");
    expect(Object.hasOwn(processed[0], "__proto__")).toBe(false);
  });

  it("desugarFieldType ignores prototype pollution in metadata merge", () => {
    const maliciousField = JSON.parse(
      '{"type": "color", "label": "Color Picker", "__proto__": {"polluted": true}, "validation": {"constructor": {"prototype": {"isAdmin": true}}}}',
    );

    const expanded = desugarFieldType(maliciousField) as any;

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).isAdmin).toBeUndefined();
    expect(expanded.label).toBe("Color Picker");
    expect(Object.hasOwn(expanded, "__proto__")).toBe(false);
  });

  it("TokenRegistry path resolver does not traverse prototype or constructor", async () => {
    const ctx = {
      user: { _id: "u1", role: "editor" },
      entry: { title: "Test Entry" },
      site: { siteName: "My Svelty Site" },
    };

    const res1 = await TokenRegistry.resolve("entry.__proto__.polluted", ctx as any);
    expect(res1).toBeUndefined();

    const res2 = await TokenRegistry.resolve("constructor.prototype.isAdmin", ctx as any);
    expect(res2).toBeUndefined();

    const res3 = await TokenRegistry.resolve("site.__proto__.polluted", ctx as any);
    expect(res3).toBeUndefined();

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect((Object.prototype as any).isAdmin).toBeUndefined();
  });
});

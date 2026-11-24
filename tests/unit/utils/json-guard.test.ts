/**
 * @file tests/unit/utils/json-guard.test.ts
 * @description Unit tests for pre-parser JSON depth, key-count, and prototype-pollution guard.
 */

import { describe, expect, it } from "vitest";
import {
  assertSafeJsonObject,
  guardJsonPayload,
  isPrototypePollutionKey,
  JsonGuardError,
} from "../../../src/utils/security/json-guard";

describe("json-guard", () => {
  it("parses valid JSON within limits", () => {
    const result = guardJsonPayload('{"title":"Hello","tags":["a","b"]}');
    expect(result).toEqual({ title: "Hello", tags: ["a", "b"] });
  });

  it("rejects payloads exceeding maxBytes", () => {
    expect(() => guardJsonPayload('{"a":"123456"}', { maxBytes: 5 })).toThrowError(JsonGuardError);
    try {
      guardJsonPayload('{"a":"123456"}', { maxBytes: 5 });
    } catch (err) {
      expect((err as JsonGuardError).code).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  it("rejects payloads exceeding maxDepth", () => {
    const deep = '{"a":{"b":{"c":1}}}';
    expect(() => guardJsonPayload(deep, { maxDepth: 2 })).toThrowError(JsonGuardError);
    try {
      guardJsonPayload(deep, { maxDepth: 2 });
    } catch (err) {
      expect((err as JsonGuardError).code).toBe("MAX_DEPTH_EXCEEDED");
    }
  });

  it("rejects payloads exceeding maxKeys", () => {
    const manyKeys = '{"a":1,"b":2,"c":3}';
    expect(() => guardJsonPayload(manyKeys, { maxKeys: 2 })).toThrowError(JsonGuardError);
    try {
      guardJsonPayload(manyKeys, { maxKeys: 2 });
    } catch (err) {
      expect((err as JsonGuardError).code).toBe("MAX_KEYS_EXCEEDED");
    }
  });

  it("rejects __proto__, constructor, and prototype keys", () => {
    expect(isPrototypePollutionKey("__proto__")).toBe(true);
    expect(isPrototypePollutionKey("constructor")).toBe(true);
    expect(isPrototypePollutionKey("prototype")).toBe(true);
    expect(isPrototypePollutionKey("title")).toBe(false);

    for (const key of ["__proto__", "constructor", "prototype"]) {
      const payload = `{"${key}":{"polluted":true}}`;
      expect(() => guardJsonPayload(payload)).toThrowError(JsonGuardError);
    }
  });

  it("assertSafeJsonObject validates already-parsed objects", () => {
    expect(() => assertSafeJsonObject({ ok: true, nested: { x: 1 } })).not.toThrow();
    expect(() => assertSafeJsonObject({ constructor: { prototype: {} } })).toThrowError(
      JsonGuardError,
    );
  });
});

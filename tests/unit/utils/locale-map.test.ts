/**
 * @file tests/unit/utils/locale-map.test.ts
 * @description Unit tests for locale-map unwrap helpers.
 */

import { describe, expect, it } from "vitest";
import { isLocaleMap, unwrapLocaleLayers } from "@utils/locale-map";

describe("isLocaleMap", () => {
  it("accepts objects whose keys are locale tags", () => {
    expect(isLocaleMap({ en: "Hello", de: "Hallo" })).toBe(true);
    expect(isLocaleMap({ "en-US": "Hello" })).toBe(true);
  });

  it("rejects payloads, arrays, and mixed keys", () => {
    expect(isLocaleMap({ title: "Hello", description: "World" })).toBe(false);
    expect(isLocaleMap(["en"])).toBe(false);
    expect(isLocaleMap({ en: "Hello", title: "Nope" })).toBe(false);
  });
});

describe("unwrapLocaleLayers", () => {
  it("returns primitives unchanged", () => {
    expect(unwrapLocaleLayers("Hello", "en")).toBe("Hello");
    expect(unwrapLocaleLayers(null, "en")).toBeNull();
  });

  it("unwraps a single locale map", () => {
    expect(unwrapLocaleLayers({ en: "Hello", de: "Hallo" }, "de")).toBe("Hallo");
  });

  it("unwraps accidental double-wraps", () => {
    expect(unwrapLocaleLayers({ en: { en: "Hello" } }, "en")).toBe("Hello");
  });

  it("unwraps until a structured payload is reached", () => {
    const payload = { title: "Page", description: "Meta" };
    expect(
      unwrapLocaleLayers({ en: payload }, "en", {
        stop: (current) =>
          Boolean(current && typeof current === "object" && "title" in (current as object)),
      }),
    ).toEqual(payload);
  });

  it("falls back to the first value when the requested lang is empty", () => {
    expect(unwrapLocaleLayers({ en: "", de: "Hallo" }, "en")).toBe("Hallo");
  });
});

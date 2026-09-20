/**
 * @file tests/unit/utils/system-locale.test.ts
 * @description Tests for ISO system-language helpers and RTL html attrs.
 */
import { describe, expect, it } from "vitest";
import { getTextDirection } from "@utils/string";
import {
  BUNDLED_SYSTEM_LOCALES,
  compiledUiLocale,
  isCompiledSystemLocale,
  isIso6391LanguageCode,
  languageBase,
  mergeSystemLanguages,
  systemHtmlAttrs,
} from "@utils/system-locale";

describe("system-locale", () => {
  it("accepts ISO 639-1 codes and rejects junk", () => {
    expect(isIso6391LanguageCode("en")).toBe(true);
    expect(isIso6391LanguageCode("ar")).toBe(true);
    expect(isIso6391LanguageCode("AR")).toBe(true);
    expect(isIso6391LanguageCode("en-US")).toBe(true);
    expect(isIso6391LanguageCode("")).toBe(false);
    expect(isIso6391LanguageCode("english")).toBe(false);
    expect(isIso6391LanguageCode("../x")).toBe(false);
  });

  it("normalizes regional tags to the base language", () => {
    expect(languageBase("ar-SA")).toBe("ar");
    expect(languageBase("EN_US")).toBe("en");
  });

  it("treats bundled catalogs as compiled and unbundled codes as English fallback", () => {
    const bundled = [...BUNDLED_SYSTEM_LOCALES];
    expect(bundled.length).toBeGreaterThan(0);
    for (const code of bundled) {
      expect(isCompiledSystemLocale(code)).toBe(true);
      expect(compiledUiLocale(code)).toBe(code);
    }
    // A code that is deliberately not bundled falls back to the base locale.
    const unbundled = ["ja", "sv", "pt"].find(
      (code) => !(bundled as readonly string[]).includes(code),
    )!;
    expect(isCompiledSystemLocale(unbundled)).toBe(false);
    expect(compiledUiLocale(unbundled)).toBe("en");
  });

  it("merges configured locales with bundled catalogs and dedupes", () => {
    const bundled = [...BUNDLED_SYSTEM_LOCALES];
    const merged = mergeSystemLanguages(["fr", "en", "de", "fr"]);
    // Bundled catalogs keep their order and come first; configured codes append once.
    expect(merged.slice(0, bundled.length)).toEqual(bundled);
    expect(merged).toHaveLength(new Set(merged).size);
    expect(merged.filter((code) => code === "fr")).toHaveLength(1);
  });

  it("sets RTL html attrs via getTextDirection", () => {
    expect(systemHtmlAttrs("ar")).toEqual({ lang: "ar", dir: "rtl" });
    expect(systemHtmlAttrs("he-IL")).toEqual({ lang: "he", dir: "rtl" });
    expect(systemHtmlAttrs("de")).toEqual({ lang: "de", dir: "ltr" });
  });
});

describe("getTextDirection (utils/string)", () => {
  it("returns rtl for Arabic, Hebrew, Persian, Urdu", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    expect(getTextDirection("he")).toBe("rtl");
    expect(getTextDirection("fa")).toBe("rtl");
    expect(getTextDirection("ur")).toBe("rtl");
    expect(getTextDirection("ar-SA")).toBe("rtl");
  });

  it("returns ltr for English and German", () => {
    expect(getTextDirection("en")).toBe("ltr");
    expect(getTextDirection("de")).toBe("ltr");
  });
});

/**
 * @file tests/unit/utils/pluralize.test.ts
 * @description Unit tests for pluralize utility (i18n compliant)
 */

import { describe, expect, it } from "vitest";
import { englishPlural, pluralize } from "@src/utils/string";

describe("internationalized pluralize utility", () => {
  it("handles English (default locale)", () => {
    const appleForms = { one: "apple", other: "apples" };

    expect(pluralize(1, appleForms)).toBe("apple");
    expect(pluralize(2, appleForms)).toBe("apples");
    expect(pluralize(0, appleForms)).toBe("apples");
  });

  it("handles English custom zero", () => {
    const itemForms = { zero: "no items", one: "item", other: "items" };
    expect(pluralize(0, itemForms)).toBe("no items");
    expect(pluralize(1, itemForms)).toBe("item");
  });

  it("handles appended counts", () => {
    const itemForms = { one: "item", other: "items" };
    expect(pluralize(5, itemForms, "en", true)).toBe("5 items");
  });

  it("handles Russian language complexities (one, few, many)", () => {
    // Russian rules:
    // "one" for 1, 21, 31...
    // "few" for 2-4, 22-24...
    // "many" for 0, 5-20, 25-30...
    const appleRu = {
      one: "яблоко",
      few: "яблока",
      many: "яблок",
      other: "яблок",
    };

    expect(pluralize(1, appleRu, "ru-RU")).toBe("яблоко");
    expect(pluralize(2, appleRu, "ru-RU")).toBe("яблока");
    expect(pluralize(3, appleRu, "ru-RU")).toBe("яблока");
    expect(pluralize(5, appleRu, "ru-RU")).toBe("яблок");
    expect(pluralize(11, appleRu, "ru-RU")).toBe("яблок");
    expect(pluralize(21, appleRu, "ru-RU")).toBe("яблоко");
  });

  it("handles Arabic language complexities (zero, one, two, few, many, other)", () => {
    const bookAr = {
      zero: "لا كتب",
      one: "كتاب",
      two: "كتابان",
      few: "كتب",
      many: "كتابًا",
      other: "كتاب",
    };
    // Note Arabic uses 'zero', 'one', 'two', 'few' (3-10), 'many' (11-99), 'other' (100+)
    expect(pluralize(0, bookAr, "ar-SA")).toBe("لا كتب");
    expect(pluralize(1, bookAr, "ar-SA")).toBe("كتاب");
    expect(pluralize(2, bookAr, "ar-SA")).toBe("كتابان");
    expect(pluralize(5, bookAr, "ar-SA")).toBe("كتب");
    expect(pluralize(15, bookAr, "ar-SA")).toBe("كتابًا");
    expect(pluralize(100, bookAr, "ar-SA")).toBe("كتاب");
    expect(pluralize(105, bookAr, "ar-SA")).toBe("كتب");
  });
});

describe("englishPlural (labels without a translated plural form)", () => {
  it("keeps the singular for one item", () => {
    expect(englishPlural("entry", 1)).toBe("entry");
    expect(englishPlural("item", 1)).toBe("item");
  });

  it("pluralises regular and -y nouns", () => {
    expect(englishPlural("item", 2)).toBe("items");
    expect(englishPlural("user", 0)).toBe("users");
    expect(englishPlural("entry", 2)).toBe("entries");
    expect(englishPlural("category", 3)).toBe("categories");
  });

  it("handles sibilant endings", () => {
    expect(englishPlural("class", 2)).toBe("classes");
    expect(englishPlural("match", 2)).toBe("matches");
  });

  it("leaves an already-plural label alone", () => {
    expect(englishPlural("entries", 2)).toBe("entries");
    expect(englishPlural("categories", 3)).toBe("categories");
  });

  it("keeps Latin/Greek -a plurals uninflected (media, criteria, data)", () => {
    // "medias" / "mediae" were both wrong: `media` is already the plural.
    expect(englishPlural("media", 2)).toBe("media");
    expect(englishPlural("Media", 25)).toBe("Media");
    expect(englishPlural("criteria", 3)).toBe("criteria");
    expect(englishPlural("data", 2)).toBe("data");
    // A singular -a noun is not in that family and still takes the -s.
    expect(englishPlural("pizza", 2)).toBe("pizzas");
    expect(englishPlural("encyclopedia", 2)).toBe("encyclopedias");
  });

  it("is tolerant of empty input", () => {
    expect(englishPlural("", 3)).toBe("");
  });
});

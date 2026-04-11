/**
 * @file tests/unit/utils/pluralize.test.ts
 * @description Unit tests for pluralize utility (i18n compliant)
 */

import { describe, expect, it } from "vitest";
import { pluralize } from "@utils/pluralize";

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

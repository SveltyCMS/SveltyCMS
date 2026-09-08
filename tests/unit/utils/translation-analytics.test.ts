/**
 * @file tests/unit/utils/translation-analytics.test.ts
 * @description Unit tests for translation progress scoring and status token generation.
 */

import { describe, expect, it } from "vitest";
import {
  calculateDocumentTranslationSummary,
  calculateLocaleProgress,
  getTranslationStatusToken,
  isFieldTranslatedForLocale,
  type TranslatableFieldSchema,
} from "@utils/translation-analytics";

describe("translation-analytics utils", () => {
  const schema: TranslatableFieldSchema[] = [
    { name: "title", label: "Title", translated: true },
    { name: "content", label: "Content", translated: true },
    { name: "slug", label: "Slug", translated: false },
  ];

  it("identifies field translations correctly across primitive and object structures", () => {
    expect(isFieldTranslatedForLocale("Hello", "en")).toBe(true);
    expect(isFieldTranslatedForLocale({ en: "Hello", de: "Hallo" }, "en")).toBe(true);
    expect(isFieldTranslatedForLocale({ en: "Hello", de: "Hallo" }, "de")).toBe(true);
    expect(isFieldTranslatedForLocale({ en: "Hello", de: "" }, "de")).toBe(false);
    expect(isFieldTranslatedForLocale({ en: "Hello" }, "de")).toBe(false);
    expect(isFieldTranslatedForLocale(null, "de")).toBe(false);
  });

  it("calculates language progress accurately", () => {
    const doc = {
      title: { en: "Welcome", de: "Willkommen" },
      content: { en: "Our Story" }, // missing 'de'
      slug: "welcome-story",
    };

    const enProgress = calculateLocaleProgress(doc, schema, "en");
    expect(enProgress.translated).toBe(2);
    expect(enProgress.total).toBe(2);
    expect(enProgress.percentage).toBe(100);
    expect(enProgress.missingFields).toHaveLength(0);

    const deProgress = calculateLocaleProgress(doc, schema, "de");
    expect(deProgress.translated).toBe(1);
    expect(deProgress.total).toBe(2);
    expect(deProgress.percentage).toBe(50);
    expect(deProgress.missingFields).toEqual(["Content"]);
  });

  it("computes whole-document translation summary across languages", () => {
    const doc = {
      title: { en: "Welcome", de: "Willkommen" },
      content: { en: "Our Story", de: "Unsere Geschichte" },
      slug: "welcome",
    };

    const summary = calculateDocumentTranslationSummary(doc, schema, ["en", "de", "fr"]);
    expect(summary.languages.en.percentage).toBe(100);
    expect(summary.languages.de.percentage).toBe(100);
    expect(summary.languages.fr.percentage).toBe(0);
    expect(summary.isFullyTranslated).toBe(false);
    expect(summary.overallPercentage).toBe(67);
  });

  it("maps percentages to compliant status-shade design tokens", () => {
    expect(getTranslationStatusToken(100).variant).toBe("success");
    expect(getTranslationStatusToken(75).variant).toBe("warning");
    expect(getTranslationStatusToken(40).variant).toBe("tertiary");
    expect(getTranslationStatusToken(0).variant).toBe("error");
  });
});

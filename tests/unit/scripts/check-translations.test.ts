/**
 * @file tests/unit/scripts/check-translations.test.ts
 * @description Pins the locale catalog audit.
 *
 * A missing key is a hard error (the gateway will render an untranslated
 * placeholder), while an extra key or a blank value is a warning. The audit must
 * also pick `en` as the reference whenever it exists, so a locale listing order
 * change cannot silently redefine which catalog is authoritative.
 */

import { describe, expect, it } from "vitest";
import { auditCatalogs, type Catalog } from "../../../scripts/check/check-translations";

describe("auditCatalogs", () => {
  it("passes catalogs with identical keys", () => {
    const audit = auditCatalogs({
      en: { title: "Title", save: "Save" },
      de: { title: "Titel", save: "Speichern" },
    });

    expect(audit.referenceLocale).toBe("en");
    expect(audit.errorCount).toBe(0);
    expect(audit.warningCount).toBe(0);
    expect(audit.issues).toEqual([]);
    expect(audit.keyCounts).toEqual({ en: 2, de: 2 });
  });

  it("reports each missing key as an error", () => {
    const audit = auditCatalogs({
      en: { alpha: "A", beta: "B", gamma: "C" },
      de: { alpha: "A" },
    });

    expect(audit.errorCount).toBe(2);
    expect(audit.issues).toEqual([{ locale: "de", kind: "missing", keys: ["beta", "gamma"] }]);
  });

  it("warns about extra keys without failing the audit", () => {
    const audit = auditCatalogs({
      en: { alpha: "A" },
      de: { alpha: "A", legacy: "Alt" },
    });

    expect(audit.errorCount).toBe(0);
    expect(audit.warningCount).toBe(1);
    expect(audit.issues).toEqual([{ locale: "de", kind: "extra", keys: ["legacy"] }]);
  });

  it("warns about empty and whitespace-only values", () => {
    const audit = auditCatalogs({
      en: { alpha: "A", beta: "B" },
      de: { alpha: "A", beta: "   " },
    });

    expect(audit.errorCount).toBe(0);
    expect(audit.warningCount).toBe(1);
    expect(audit.issues).toEqual([{ locale: "de", kind: "empty", keys: ["beta"] }]);
  });

  it("does not treat a non-string value as an empty translation", () => {
    const german: Catalog = { alpha: "A", nested: { label: "Titel" } };
    const audit = auditCatalogs({ en: { alpha: "A", nested: { label: "Title" } }, de: german });

    expect(audit.issues).toEqual([]);
    expect(audit.warningCount).toBe(0);
  });

  it("falls back to the first locale when en.json is absent", () => {
    const audit = auditCatalogs({
      fr: { alpha: "A", beta: "B" },
      de: { alpha: "A" },
    });

    expect(audit.referenceLocale).toBe("fr");
    expect(audit.errorCount).toBe(1);
    expect(audit.issues).toEqual([{ locale: "de", kind: "missing", keys: ["beta"] }]);
  });

  it("counts every key as extra when the reference catalog is empty", () => {
    const audit = auditCatalogs({ en: {}, de: { alpha: "A" } });

    expect(audit.referenceLocale).toBe("en");
    expect(audit.errorCount).toBe(0);
    expect(audit.issues).toEqual([{ locale: "de", kind: "extra", keys: ["alpha"] }]);
  });

  it("handles an empty catalog map without inventing a reference locale", () => {
    const audit = auditCatalogs({});

    expect(audit.referenceLocale).toBeNull();
    expect(audit.keyCounts).toEqual({});
    expect(audit.issues).toEqual([]);
    expect(audit.errorCount + audit.warningCount).toBe(0);
  });

  it("audits every non-reference locale", () => {
    const audit = auditCatalogs({
      en: { alpha: "A", beta: "B" },
      de: { alpha: "A" },
      fr: { alpha: "A", beta: "B" },
      es: { beta: "B" },
    });

    expect(audit.errorCount).toBe(2);
    expect(audit.issues.map((issue) => issue.locale)).toEqual(["de", "es"]);
  });
});

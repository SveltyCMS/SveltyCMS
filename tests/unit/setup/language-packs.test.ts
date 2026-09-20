/**
 * @file tests/unit/setup/language-packs.test.ts
 * @description EU + Arabic catalogs seed with EN key parity.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTextDirection } from "@utils/string";

const LOCALES = ["en", "de", "fr", "es", "it", "nl", "pl", "ar"] as const;

describe("system language packs", () => {
  it("ships EN/DE plus seeded EU and AR catalogs with matching keys", () => {
    const messagesDir = join(process.cwd(), "src/messages");
    const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8")) as Record<
      string,
      string
    >;
    const enKeys = Object.keys(en).sort();
    expect(enKeys.length).toBeGreaterThan(100);

    for (const locale of LOCALES) {
      const catalog = JSON.parse(
        readFileSync(join(messagesDir, `${locale}.json`), "utf8"),
      ) as Record<string, string>;
      expect(Object.keys(catalog).sort()).toEqual(enKeys);
    }

    const settings = JSON.parse(
      readFileSync(join(process.cwd(), "project.inlang/settings.json"), "utf8"),
    ) as { locales: string[] };
    expect(settings.locales).toEqual([...LOCALES]);
  });

  it("marks Arabic as RTL", () => {
    expect(getTextDirection("ar")).toBe("rtl");
    expect(getTextDirection("fr")).toBe("ltr");
  });
});

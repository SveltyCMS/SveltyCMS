/**
 * @file tests/unit/services/page-resolver-localize.test.ts
 * @description `localizeSitePage` must always hand the renderer strings, even
 * when a persisted page row carries a legacy/nested `body` shape.
 *
 * Regression: `{ en: { title, content } }` made `localizeField` return an
 * object and the render-side sanitizer threw `html.includes is not a function`,
 * which surfaced as a 500 on the site root.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@src/databases/db", () => ({ dbAdapter: null }));
vi.mock("@src/services/sdk", () => ({ LocalCMS: class {} }));

import { localizeSitePage } from "@src/services/site/page-resolver.server";
import type { SitePage } from "@src/services/site/types";

describe("localizeSitePage — body shapes", () => {
  it("keeps a plain localized string", () => {
    const page = localizeSitePage({ body: { en: "<p>Hello</p>", de: "<p>Hallo</p>" } }, "de");
    expect(page.body).toBe("<p>Hallo</p>");
  });

  it("extracts the content field from a legacy nested locale object", () => {
    const page = localizeSitePage(
      { body: { en: { title: "", content: "<p>Nested</p>" } } } as unknown as SitePage,
      "de",
    );
    expect(page.body).toBe("<p>Nested</p>");
  });

  it("falls back to an empty string for non-string values", () => {
    const page = localizeSitePage({ body: { en: 42 } } as unknown as SitePage, "en");
    expect(page.body).toBe("");
  });

  it("tolerates a missing body", () => {
    expect(localizeSitePage({}, "en").body).toBe("");
  });

  it("still sanitizes authored HTML", () => {
    const page = localizeSitePage({ body: "<p>ok</p><script>alert(1)</script>" }, "en");
    expect(page.body).toContain("<p>ok</p>");
    expect(page.body).not.toContain("script");
  });
});

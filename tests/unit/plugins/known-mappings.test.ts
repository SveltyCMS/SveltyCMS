/**
 * @vitest-environment node
 * @file tests/unit/plugins/known-mappings.test.ts
 * @description Unit tests for platform default field mappings.
 */

import { describe, it, expect } from "vitest";
import { getKnownMappingsForFormat, KNOWN_MAPPINGS } from "@plugins/smart-importer/known-mappings";
describe("known-mappings", () => {
  it("returns wordpress mappings", () => {
    const mappings = getKnownMappingsForFormat("wordpress");
    expect(mappings.length).toBeGreaterThan(5);
    expect(mappings.some((m) => m.source === "post_title" && m.target === "title")).toBe(true);
  });

  it("returns empty array for unknown format", () => {
    expect(getKnownMappingsForFormat("unknown-platform")).toEqual([]);
  });

  it("covers free-tier platforms", () => {
    for (const format of ["wordpress", "drupal", "strapi", "directus", "sveltycms"]) {
      expect(KNOWN_MAPPINGS[format]?.length).toBeGreaterThan(0);
    }
  });
});

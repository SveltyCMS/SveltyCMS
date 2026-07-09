/**
 * @file tests/unit/plugins/unified-data-hub/federation-enrichment-utils.test.ts
 * @description Federation enrichment config normalization and validation tests.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeFederationEnrichments,
  validateFederationEnrichment,
} from "@plugins/unified-data-hub/server/federation-enrichment-utils";

describe("federation enrichment utils", () => {
  it("normalizes and deduplicates enrichments", () => {
    const result = normalizeFederationEnrichments([
      { label: "Author", nativeField: "authorId", virtualSlug: "bench-authors" },
      { label: "Author dup", nativeField: "authorId", virtualSlug: "bench-authors" },
      { label: "", nativeField: "x", virtualSlug: "y" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].virtualKeyField).toBe("id");
  });

  it("validates native field and virtual slug", () => {
    const item = {
      label: "Author",
      nativeField: "authorId",
      virtualSlug: "bench-authors",
    };
    expect(validateFederationEnrichment(item, ["authorId"], ["bench-authors"])).toBeNull();
    expect(validateFederationEnrichment(item, ["title"], ["bench-authors"])).toContain("authorId");
    expect(validateFederationEnrichment(item, ["authorId"], ["other"])).toContain("bench-authors");
  });
});

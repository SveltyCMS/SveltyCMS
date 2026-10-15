/**
 * @file tests/unit/multi-tenancy/tenant-normalization.test.ts
 * @description Unit tests for the single canonical "no tenant" representation
 *              (normalizeTenantId) and its use across the path resolvers.
 */

import { describe, expect, it } from "vitest";
import {
  getCollectionDisplayPath,
  getCollectionsPath,
  normalizeTenantId,
} from "@src/utils/tenant.server";

describe("normalizeTenantId", () => {
  it("collapses every empty spelling to null", () => {
    expect(normalizeTenantId(undefined)).toBeNull();
    expect(normalizeTenantId(null)).toBeNull();
    expect(normalizeTenantId("")).toBeNull();
    expect(normalizeTenantId("global")).toBeNull();
  });

  it("passes a real tenant id through unchanged", () => {
    expect(normalizeTenantId("kaz")).toBe("kaz");
    expect(normalizeTenantId("greg_needle")).toBe("greg_needle");
  });

  it("resolves the global collection root the same for null and 'global'", () => {
    expect(getCollectionsPath(null)).toBe(getCollectionsPath("global"));
    expect(getCollectionsPath(undefined)).toBe(getCollectionsPath("global"));
  });

  it("renders the display path without the legacy 'global' segment", () => {
    expect(getCollectionDisplayPath("posts", null)).toBe("config/collections/posts.ts");
    expect(getCollectionDisplayPath("posts", "global")).toBe("config/collections/posts.ts");
    expect(getCollectionDisplayPath("posts", "kaz")).toBe("config/kaz/collections/posts.ts");
  });
});

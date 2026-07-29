/**
 * @file tests/unit/utils/json-path-filter.test.ts
 * @description Unit tests for media gallery JSON path filter helper.
 */
import { describe, expect, it } from "vitest";
import { getByPath, matchesJsonPathFilter, parseJsonPathFilter } from "@utils/json-path-filter";

describe("json-path-filter", () => {
  const sample = {
    filename: "shot.jpg",
    metadata: {
      camera: "Canon EOS",
      iso: 400,
      tags: ["nature", "night"],
      exif: { aperture: 2.8 },
    },
  };

  it("parses single and multi-clause expressions", () => {
    expect(parseJsonPathFilter("metadata.camera = Canon")).toEqual([
      { path: "metadata.camera", op: "eq", value: "Canon" },
    ]);
    expect(parseJsonPathFilter('metadata.camera = "Canon EOS"; metadata.iso > 100')).toHaveLength(
      2,
    );
  });

  it("resolves nested paths and array indices", () => {
    expect(getByPath(sample, "metadata.camera")).toBe("Canon EOS");
    expect(getByPath(sample, "metadata.exif.aperture")).toBe(2.8);
    expect(getByPath(sample, "metadata.tags[0]")).toBe("nature");
    expect(getByPath(sample, "metadata.missing")).toBeUndefined();
  });

  it("matches equality and contains (case-insensitive)", () => {
    expect(matchesJsonPathFilter(sample, "metadata.camera = canon eos")).toBe(true);
    expect(matchesJsonPathFilter(sample, "metadata.camera ~ canon")).toBe(true);
    expect(matchesJsonPathFilter(sample, "metadata.camera != Nikon")).toBe(true);
  });

  it("matches numeric comparisons", () => {
    expect(matchesJsonPathFilter(sample, "metadata.iso >= 400")).toBe(true);
    expect(matchesJsonPathFilter(sample, "metadata.iso > 500")).toBe(false);
    expect(matchesJsonPathFilter(sample, "metadata.exif.aperture < 3")).toBe(true);
  });

  it("AND-combines multi-clause filters", () => {
    expect(matchesJsonPathFilter(sample, "metadata.camera ~ Canon; metadata.iso = 400")).toBe(true);
    expect(matchesJsonPathFilter(sample, "metadata.camera ~ Canon && metadata.iso = 100")).toBe(
      false,
    );
  });

  it("empty / malformed expression does not filter out items", () => {
    expect(matchesJsonPathFilter(sample, "")).toBe(true);
    expect(matchesJsonPathFilter(sample, "not a filter")).toBe(true);
  });
});

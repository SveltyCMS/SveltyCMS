/**
 * @file tests/unit/plugins/editable-website/stega.test.ts
 * @description Unit tests for zero-width steganography marker cleaning utilities.
 */

import { describe, it, expect } from "vitest";
import {
  stegaClean,
  hasStegaMarkers,
  stegaCleanDeep,
  ZWSP,
  ZWNJ,
  ZWJ,
  BOM,
  LRM,
  RLM,
} from "@src/plugins/editable-website/stega";

describe("stegaClean", () => {
  it("removes all zero-width markers from text", () => {
    const dirty = `Hello${ZWSP}World${ZWNJ}Test${ZWJ}BOM${BOM}LRM${LRM}RLM${RLM}!`;
    expect(stegaClean(dirty)).toBe("HelloWorldTestBOMLRMRLM!");
  });

  it("leaves clean strings untouched", () => {
    expect(stegaClean("Clean string without markers")).toBe("Clean string without markers");
    expect(stegaClean("")).toBe("");
  });
});

describe("hasStegaMarkers", () => {
  it("detects when markers are present", () => {
    expect(hasStegaMarkers(`A${ZWSP}B`)).toBe(true);
    expect(hasStegaMarkers(`A${BOM}B`)).toBe(true);
    expect(hasStegaMarkers("Plain string")).toBe(false);
    expect(hasStegaMarkers("")).toBe(false);
  });
});

describe("stegaCleanDeep", () => {
  it("recursively cleans objects, arrays, and primitive strings", () => {
    const input = {
      title: `Article${ZWSP} Title`,
      tags: [`tag${ZWNJ}1`, `tag${ZWJ}2`],
      metadata: {
        description: `Nested${BOM} description`,
        views: 42,
        published: true,
      },
    };

    const output = stegaCleanDeep(input);
    expect(output).toEqual({
      title: "Article Title",
      tags: ["tag1", "tag2"],
      metadata: {
        description: "Nested description",
        views: 42,
        published: true,
      },
    });
  });

  it("preserves Date instances and primitives", () => {
    const now = new Date();
    expect(stegaCleanDeep(now)).toEqual(now);
    expect(stegaCleanDeep(123)).toBe(123);
    expect(stegaCleanDeep(null)).toBeNull();
  });
});

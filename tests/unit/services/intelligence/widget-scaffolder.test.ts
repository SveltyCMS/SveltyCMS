/**
 * @vitest-environment node
 * @file tests/unit/services/intelligence/widget-scaffolder.test.ts
 * @description Unit tests for the AI widget scaffolder output contract.
 *
 * The scaffolder writes into `src/widgets/**`, so its emitted names are gated:
 * `scripts/check-widget-naming.mjs` requires lowercase pillar filenames
 * (`input.svelte` / `display.svelte`) and `widgetNameToFolder(Name) === folder`.
 * Regressions here ship a widget that fails the gate and, on case-sensitive
 * filesystems (Linux/CI), one whose imports do not resolve.
 *
 * Files are written to a throwaway temp directory — never into `src/widgets`.
 */

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generateWidget,
  scaffoldWidget,
  type WidgetScaffoldConfig,
} from "@src/services/intelligence/ai-codegen/widget-scaffolder";
import { widgetNameToFolder } from "@src/widgets/widget-naming";

const BASE_CONFIG: WidgetScaffoldConfig = {
  name: "StarRating",
  label: "Star Rating",
  description: "Five-star rating widget with half-star support",
  icon: "mdi:star",
  fields: [
    { name: "rating", label: "Rating", type: "number", required: true, min: 0, max: 5 },
    { name: "caption", label: "Caption", type: "text", placeholder: "Optional caption" },
  ],
};

let tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-widget-scaffold-"));
  tempDirs.push(dir);
  return dir;
}

describe("widget-scaffolder pillar filenames", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  it("writes kebab-case pillar filenames (no Input.svelte / Display.svelte)", async () => {
    const outputDir = await makeTempDir();
    await generateWidget({ ...BASE_CONFIG, outputDir });

    const written = (await fs.readdir(outputDir)).sort();
    expect(written).toEqual(["display.svelte", "index.ts", "input.svelte"]);
    // Case-sensitive gate: any PascalCase pillar file fails check-widget-naming.mjs
    expect(written.some((file) => /[A-Z]/.test(file))).toBe(false);
  });

  it("references the same lowercase pillar names in the generated @file headers", async () => {
    const outputDir = await makeTempDir();
    const result = await generateWidget({ ...BASE_CONFIG, outputDir });

    expect(result.input).toMatch(/^@file src\/widgets\/core\/star-rating\/input\.svelte$/m);
    expect(result.display).toMatch(/^@file src\/widgets\/core\/star-rating\/display\.svelte$/m);
    expect(result.definition).toContain("@file src/widgets/core/star-rating/index.ts");

    // The bytes on disk must carry the same header as the returned template.
    const writtenInput = await fs.readFile(path.join(outputDir, "input.svelte"), "utf-8");
    const writtenDisplay = await fs.readFile(path.join(outputDir, "display.svelte"), "utf-8");
    expect(writtenInput).toMatch(/^@file src\/widgets\/core\/star-rating\/input\.svelte$/m);
    expect(writtenDisplay).toMatch(/^@file src\/widgets\/core\/star-rating\/display\.svelte$/m);
    expect(result.input).toBe(writtenInput);
    expect(result.display).toBe(writtenDisplay);
  });

  it("keeps Name → folder gated-consistent for acronym names", () => {
    const result = scaffoldWidget({ ...BASE_CONFIG, name: "AIEnrichment" });

    // widgetNameToFolder(Name) === folder is exactly what the naming gate asserts,
    // and it is what the default outputDir is derived from.
    expect(result.outputDir).toBe(path.join("src", "widgets", "core", "ai-enrichment"));
    expect(result.definition).toContain('Name: "AIEnrichment"');
    expect(widgetNameToFolder("AIEnrichment")).toBe("ai-enrichment");
    expect(result.definition).toContain("@file src/widgets/core/ai-enrichment/index.ts");
  });
});

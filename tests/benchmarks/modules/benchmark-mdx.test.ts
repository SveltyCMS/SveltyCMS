/**
 * @file tests/benchmarks/modules/benchmark-mdx.test.ts
 * @description Unit tests for MDX tag discovery — prevents content_* benchmark collisions.
 */
import { test, expect } from "bun:test";
import { discoverTag } from "./benchmark-mdx";

// Use a frozen string slice to replicate precise MDX report layouts
const MOCK_MDX_DOCUMENT = Object.freeze(`
<!-- SCAN_TABLE_START -->
<!-- SCAN_TABLE_END -->
<!-- INCREMENTAL_TABLE_START -->
<!-- INCREMENTAL_TABLE_END -->
<!-- CONTENT_STRESS_TABLE_START -->
<!-- CONTENT_STRESS_TABLE_END -->
<!-- HOOKS_TRACE_TABLE_START -->
<!-- HOOKS_TRACE_TABLE_END -->
<!-- CACHE_EFFICIENCY_TABLE_START -->
<!-- CACHE_EFFICIENCY_TABLE_END -->
`);

test("discoverTag maps content-incremental-reload to explicit INCREMENTAL tag", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/content-incremental-reload.test.ts");
  expect(tag).toBe("INCREMENTAL");
});

test("discoverTag maps content-scale-stress to explicit CONTENT_STRESS tag", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/content-scale-stress.test.ts");
  expect(tag).toBe("CONTENT_STRESS");
});

test("discoverTag maps content-scan to explicit SCAN tag", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/content-scan.test.ts");
  expect(tag).toBe("SCAN");
});

test("discoverTag prefers normalized shortLabel tag over explicit file matching rules", () => {
  const tag = discoverTag(
    MOCK_MDX_DOCUMENT,
    "tests/benchmarks/content-incremental-reload.test.ts",
    "Incremental",
  );
  expect(tag).toBe("INCREMENTAL");
});

test("discoverTag matches dynamic file names via case-insensitive segment exploration loops", () => {
  const tag = discoverTag(
    MOCK_MDX_DOCUMENT,
    "tests/benchmarks/hooks-performance.test.ts",
    "Hooks Trace",
  );
  expect(tag).toBe("HOOKS_TRACE");
});

test("discoverTag matches cache-hit-ratio via explicit CACHE_EFFICIENCY mapping", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/cache-hit-ratio.test.ts");
  expect(tag).toBe("CACHE_EFFICIENCY");
});

test("discoverTag falls back gracefully to null when no structured tokens match the criteria", () => {
  const tag = discoverTag(
    MOCK_MDX_DOCUMENT,
    "tests/benchmarks/unregistered-diagnostic-module.test.ts",
    "UnknownSuite",
  );
  expect(tag).toBeNull();
});

test("discoverTag processes windows-style backslash file paths deterministically without collision", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests\\benchmarks\\content-scan.test.ts");
  expect(tag).toBe("SCAN");
});

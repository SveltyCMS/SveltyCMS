/**
 * @file tests/benchmarks/modules/benchmark-mdx.test.ts
 * @description Unit tests for MDX tag discovery — prevents content_* benchmark collisions.
 */
import { test, expect } from "./benchmark-utils";
import { discoverTag } from "./benchmark-mdx";

const doc = `
<!-- SCAN_TABLE_START -->
<!-- SCAN_TABLE_END -->
<!-- INCREMENTAL_TABLE_START -->
<!-- INCREMENTAL_TABLE_END -->
<!-- CONTENT_STRESS_TABLE_START -->
<!-- CONTENT_STRESS_TABLE_END -->
`;

test("discoverTag maps content-incremental-reload to INCREMENTAL", () => {
  const tag = discoverTag(doc, "tests/benchmarks/content-incremental-reload.test.ts");
  expect(tag).toBe("INCREMENTAL");
});

test("discoverTag maps content-scale-stress to CONTENT_STRESS", () => {
  const tag = discoverTag(doc, "tests/benchmarks/content-scale-stress.test.ts");
  expect(tag).toBe("CONTENT_STRESS");
});

test("discoverTag prefers shortLabel over file prefix", () => {
  const tag = discoverTag(
    doc,
    "tests/benchmarks/content-incremental-reload.test.ts",
    "Incremental",
  );
  expect(tag).toBe("INCREMENTAL");
});

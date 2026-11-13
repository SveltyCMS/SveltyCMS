/**
 * @file tests/unit/scripts/check-bundle-size.test.ts
 * @description Pins the bundle-size gate's classifier.
 *
 * The gate protects two properties that a generic size warning would miss:
 * a static `node:` import kills the whole client chunk, and TipTap/JSON-render
 * must stay out of the chunks that load on every page. The fixtures below keep
 * one case per branch, including the exact-budget boundary (80/25/150 KB).
 */

import { describe, expect, it } from "vitest";
import {
  evaluateChunk,
  findNodeBuiltinImports,
  isAdminShellNode,
  type ChunkInput,
} from "../../../scripts/check/check-bundle-size";

const KiB = 1024;

function chunk(overrides: Partial<ChunkInput> = {}): ChunkInput {
  return {
    // The real SvelteKit shape: the entry directory is a path segment and the
    // basename starts with `app`, not `entry`.
    filePath: "_app/immutable/entry/app.a1b2.js",
    relPath: "_app/immutable/entry/app.a1b2.js",
    size: 40 * KiB,
    content: "const start = () => {};",
    ...overrides,
  };
}

describe("findNodeBuiltinImports", () => {
  it("finds static imports and re-exports but ignores dynamic ones", () => {
    const content = [
      'import { readFile } from "node:fs";',
      'export { join } from"node:path";',
      'import "node:os";',
      'const safe = await import("node:crypto");',
      'const legacy = require("node:util");',
    ].join("\n");

    expect(findNodeBuiltinImports(content)).toEqual(["node:fs", "node:path", "node:os"]);
  });

  it("deduplicates repeated imports of the same builtin", () => {
    expect(findNodeBuiltinImports('import "node:fs"; import "node:fs";')).toEqual(["node:fs"]);
  });
});

describe("isAdminShellNode", () => {
  it("recognizes the compiled (app) layout node on either path separator", () => {
    expect(isAdminShellNode("D:\\repo\\_app\\immutable\\nodes\\7.abc.js", "floating-nav")).toBe(
      true,
    );
    expect(isAdminShellNode("_app/immutable/nodes/7.abc.js", "command-palette")).toBe(true);
  });

  it("rejects chunks outside nodes/ and shell nodes without a marker", () => {
    expect(isAdminShellNode("_app/immutable/chunks/7.js", "floating-nav")).toBe(false);
    expect(isAdminShellNode("_app/immutable/nodes/7.js", "const x = 1;")).toBe(false);
  });
});

describe("evaluateChunk size budgets", () => {
  it("gates the real SvelteKit entry chunk (path segment, not basename)", () => {
    // Regression: the rule used to match the basename only, so
    // `entry/app.<hash>.js` was never size-checked and the 80 KB budget was dead.
    const { issue } = evaluateChunk(
      chunk({ relPath: "_app/immutable/entry/app.a1b2.js", size: 81 * KiB }),
    );

    expect(issue?.reason).toBe("exceeds 80 KB threshold");
  });

  it("accepts an entry chunk exactly at the 80 KB budget", () => {
    expect(evaluateChunk(chunk({ size: 80 * KiB })).issue).toBeNull();
  });

  it("fails an entry chunk above 80 KB", () => {
    const { issue } = evaluateChunk(chunk({ size: 81 * KiB }));

    expect(issue?.reason).toBe("exceeds 80 KB threshold");
    expect(issue?.size).toBe(81);
  });

  it("applies the 25 KB root-layout budget to nodes/0", () => {
    const atBudget = evaluateChunk(
      chunk({ relPath: "_app/immutable/nodes/0.a1b2.js", size: 25 * KiB }),
    );
    const overBudget = evaluateChunk(
      chunk({ relPath: "_app/immutable/nodes/0.a1b2.js", size: 26 * KiB }),
    );

    expect(atBudget.issue).toBeNull();
    expect(overBudget.issue?.reason).toBe("exceeds 25 KB threshold");
  });

  it("applies the 150 KB budget to the admin shell node", () => {
    const shell = chunk({
      filePath: "_app/immutable/nodes/7.a1b2.js",
      relPath: "_app/immutable/nodes/7.a1b2.js",
      size: 151 * KiB,
      content: "const nav = 'left-sidebar';",
    });

    expect(evaluateChunk(shell).issue?.reason).toBe("exceeds 150 KB threshold");
  });

  it("does not size-gate ordinary chunks", () => {
    const { issue, warnings } = evaluateChunk(
      chunk({ relPath: "_app/immutable/chunks/huge.a1b2.js", size: 10_000 * KiB }),
    );

    expect(issue).toBeNull();
    expect(warnings).toEqual([]);
  });
});

describe("evaluateChunk leak detection", () => {
  it("fails any chunk with a static node builtin import", () => {
    const { issue } = evaluateChunk(
      chunk({ content: 'import { join } from "node:path"; export const x = join("a");' }),
    );

    expect(issue?.reason).toContain('imports "node:path"');
    expect(issue?.reason).toContain("CORS-blocked scheme");
  });

  it("fails a banned client marker even in a vendor chunk", () => {
    const { issue } = evaluateChunk(
      chunk({
        relPath: "_app/immutable/chunks/vendor.a1b2.js",
        content: "const render = 'json-render-svelte';",
      }),
    );

    expect(issue?.reason).toContain('contains "json-render-svelte"');
  });

  it("fails TipTap in a lazy chunk's layout but leaves plain chunks alone", () => {
    const layout = evaluateChunk(
      chunk({ relPath: "_app/immutable/chunks/layout.a1b2.js", content: '"@tiptap/core"' }),
    );
    const ordinary = evaluateChunk(
      chunk({ relPath: "_app/immutable/chunks/editor.a1b2.js", content: '"@tiptap/core"' }),
    );

    expect(layout.issue?.reason).toContain("TipTap leaked into critical chunk");
    expect(ordinary.issue).toBeNull();
  });

  it("reports large libraries as warnings without failing the gate", () => {
    const { issue, warnings } = evaluateChunk(
      chunk({ content: "import('ollama'); import('@better-svelte-email/server');" }),
    );

    expect(issue).toBeNull();
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("email preview");
    expect(warnings[1]).toContain("ollama (AI)");
  });
});

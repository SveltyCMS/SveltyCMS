/**
 * @file tests/unit/setup/paraglide-output-structure.test.ts
 * @description Dev, prod build and the CLI must emit the same paraglide structure.
 *
 * The Vite plugin defaults to `locale-modules` in dev and `message-modules` in
 * production, while the CLI defaults to `message-modules`. Running `bun run
 * paraglide` (or a build) against a live dev server then deleted `messages/de.js`
 * that the dev module graph still imported — `Failed to load url ./de.js` and a
 * 500 for every admin page (logged 2026-10-25). Both writers are now pinned.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("paraglide output structure", () => {
  it("pins the CLI script to locale-modules", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.paraglide).toContain("--output-structure locale-modules");
  });

  it("pins the Vite plugin to the same structure", () => {
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    const call = /paraglideVitePlugin\(\{[\s\S]*?\}\)/.exec(vite)?.[0] ?? "";
    expect(call, "paraglideVitePlugin call not found").not.toBe("");
    expect(call).toMatch(/outputStructure:\s*["']locale-modules["']/);
  });
});

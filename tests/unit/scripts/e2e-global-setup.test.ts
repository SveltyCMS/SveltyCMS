/**
 * @file tests/unit/scripts/e2e-global-setup.test.ts
 * @description Pins the Playwright global setup to harness-owned paths.
 *
 * CI failed on `open .../mediaFolder/.gitkeep` because global setup wrote a
 * `.gitkeep` into the developer's live media root, which does not exist on a
 * fresh runner (and must never be touched by tests). These assertions keep the
 * setup on `tests/e2e/.media`, `config/test-database` and `config/test-collections`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { e2eCleanupTargets, requiredE2EDirs } from "../../e2e/global.setup";

const ROOT = join(import.meta.dirname, "../../..");
const toPosix = (value: string): string => value.replaceAll("\\", "/");

describe("e2e global setup paths", () => {
  test("creates only harness-owned directories", () => {
    const dirs = requiredE2EDirs().map(toPosix);

    expect(dirs.some((dir) => dir.endsWith("tests/e2e/.media"))).toBe(true);
    expect(dirs.some((dir) => dir.endsWith("config/test-database"))).toBe(true);
    expect(dirs.some((dir) => dir.endsWith("config/test-collections"))).toBe(true);

    for (const dir of dirs) {
      expect(dir, `live media root must never be created: ${dir}`).not.toMatch(
        /\/mediaFolder(\/|$)/,
      );
      expect(dir, `live collections must never be created: ${dir}`).not.toMatch(
        /\/config\/collections$/,
      );
      expect(dir, `live database dir must never be created: ${dir}`).not.toMatch(
        /\/config\/database$/,
      );
      expect(dir, `compiled collections are off-limits: ${dir}`).not.toContain(
        ".compiledCollections",
      );
      expect(dir, `bootstrap config is off-limits: ${dir}`).not.toContain("private.ts");
    }
  });

  test("cleans only harness-owned database files", () => {
    const targets = e2eCleanupTargets().map(toPosix);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).toContain("/config/test-database/");
      expect(target).not.toContain("/config/database/");
    }
  });

  test("never writes a .gitkeep into the live tree", () => {
    const source = readFileSync(join(ROOT, "tests/e2e/global.setup.ts"), "utf8");

    expect(source).toContain("E2E_MEDIA_FOLDER");
    // The old block wrote `mediaFolder/.gitkeep` without creating the directory,
    // which is the exact CI failure this pins.
    expect(source).not.toContain("gitkeepPath");
    expect(source).not.toContain('join(process.cwd(), "mediaFolder")');
  });
});

/**
 * @file tests/unit/utils/circular-imports.test.ts
 * @description Detects circular imports from utils barrel into utils barrel.
 *
 * Any file under src/utils/ that imports from "@utils/utils" creates a
 * circular reference because the barrel re-exports from all utils files.
 * This test enforces that utils files import directly from sibling files
 * instead of going through the barrel.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

const UTILS_DIR = join(import.meta.dirname, "..", "..", "..", "src", "utils");
const BARREL_PATH = join(UTILS_DIR, "utils.ts");

const BARREL_IMPORT_RE = /from\s+["']@utils\/utils["']/;
const BARREL_EXPORT_RE = /export \* from ["'](\.\/[^"']+)["']/;

function getAllTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...getAllTsFiles(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte.ts"))
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("Circular Import Detection (utils barrel)", () => {
  const barrelDir = dirname(BARREL_PATH);
  const allFiles = getAllTsFiles(UTILS_DIR);
  const barrelExports: string[] = [];

  // Parse the barrel to know what it exports
  try {
    const barrelContent = readFileSync(BARREL_PATH, "utf8");
    const lines = barrelContent.split("\n");
    for (const line of lines) {
      const match = line.match(BARREL_EXPORT_RE);
      if (match) {
        barrelExports.push(match[1]);
      }
    }
  } catch {
    // Barrel not readable
  }

  it("should have no utils file importing from @utils/utils (barrel)", () => {
    const violations: string[] = [];

    for (const file of allFiles) {
      if (file === BARREL_PATH) continue;

      try {
        const content = readFileSync(file, "utf8");
        if (BARREL_IMPORT_RE.test(content)) {
          violations.push(file.replace(UTILS_DIR, ""));
        }
      } catch {
        // File read error — skip
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Found circular imports through @utils/utils barrel:\n${violations.join("\n")}\n\n` +
            "Fix: replace `import { X } from '@utils/utils'` with a direct import " +
            "from the source file, e.g. `import { X } from '@utils/logger'`."
        : undefined,
    ).toHaveLength(0);
  });

  it("should have the barrel exporting expected domain files", () => {
    const required = [
      "./date",
      "./string",
      "./logger",
      "./debounce",
      "./object-utils",
      "./array-utils",
    ];
    for (const exp of required) {
      expect(barrelExports).toContain(exp);
    }
  });

  it("should NOT export known-dead files from barrel", () => {
    const forbidden = ["http/cookie-utils", "sdk/edge-sdk"];
    for (const exp of forbidden) {
      expect(barrelExports).not.toContain(exp);
    }
  });

  it("should have no non-existent barrel exports", () => {
    for (const exp of barrelExports) {
      const resolved = join(barrelDir, exp);
      const withTs = resolved + ".ts";
      const withIndex = join(resolved, "index.ts");
      const withSvelteTs = resolved + ".svelte.ts";

      const found = existsSync(withTs) || existsSync(withIndex) || existsSync(withSvelteTs);

      expect(found, `Barrel export "${exp}" does not resolve to an existing file`).toBe(true);
    }
  });
});

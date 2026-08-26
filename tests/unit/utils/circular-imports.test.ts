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
import { join } from "node:path";

const UTILS_DIR = join(import.meta.dirname, "..", "..", "..", "src", "utils");
const BARREL_PATH = join(UTILS_DIR, "utils.ts");

const BARREL_IMPORT_RE = /from\s+["']@utils\/utils["']/;

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
  const allFiles = getAllTsFiles(UTILS_DIR);

  it("should have completely eliminated the legacy @utils/utils barrel", () => {
    expect(existsSync(BARREL_PATH)).toBe(false);
  });

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
});

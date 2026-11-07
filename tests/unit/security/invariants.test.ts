/**
 * @file tests/unit/security/invariants.test.ts
 * @description Executable security invariants over the real source tree. Each
 * rule names the offending file on failure and documents its allowlist inline.
 *
 * Invariants:
 * - `new Date().toISOString()` must not appear outside the lint gate's
 *   allowlist (AGENTS: use `nowISODateString()`).
 * - `Math.random()` must never appear in security, auth or media utilities.
 * - The `@components/ui` barrel must not be imported anywhere.
 * - Every `+server.ts` / `+page.server.ts` route is owned by a threat-model surface.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_PATH,
  evaluateManifest,
  parseManifest,
  resolveSurfaceFiles,
} from "../../../scripts/security/threat-model-lib";
import { ALLOWED_FILES as DATE_HELPER_ALLOWLIST } from "../../../scripts/lint/lint-date-helpers";

const ROOT = resolve(process.cwd());
const SOURCE_EXTENSIONS = [".ts", ".svelte"];

/**
 * Files allowed to call `new Date().toISOString()` directly: the canonical
 * helper implementation (`src/utils/date.ts`) and the log-file timestamp
 * slicer (`src/utils/logger.server.ts`). The allowlist is imported from the
 * lint gate (`scripts/lint/lint-date-helpers.ts`) so this invariant and the CLI
 * can never diverge; add entries there only after review.
 */

interface Offence {
  path: string;
  count: number;
  lines: number[];
}

/** Counts regex occurrences per file and records the matching line numbers. */
function findOccurrences(files: readonly string[], pattern: RegExp): Offence[] {
  const offences: Offence[] = [];

  for (const file of files) {
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    const matches: number[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const hits = lines[index].match(pattern);
      for (let hit = 0; hit < (hits?.length ?? 0); hit += 1) matches.push(index + 1);
    }
    if (matches.length > 0) offences.push({ path: file, count: matches.length, lines: matches });
  }

  return offences.sort((left, right) => (left.path < right.path ? -1 : 1));
}

function format(offences: readonly Offence[]): string {
  return offences
    .map((offence) => `${offence.path} (${offence.count}x at line ${offence.lines.join(", ")})`)
    .join("\n");
}

/**
 * Finds real barrel imports. The `@components/ui/index.ts` header documents the
 * discouraged form inside a fenced block, so only statements that start a line
 * (after whitespace) or dynamic `import()` calls are counted.
 */
function findBarrelImports(files: readonly string[]): Offence[] {
  const pattern =
    /(?:^|[\r\n]+)[ \t]*import\b[^;]{0,500}?from[ \t]*["']@components\/ui["']|\bimport[ \t]*\([ \t]*["']@components\/ui["'][ \t]*\)/g;
  const offences: Offence[] = [];

  for (const file of files) {
    const content = readFileSync(join(ROOT, file), "utf8");
    const lines: number[] = [];
    for (const match of content.matchAll(pattern)) {
      const before = content.slice(0, match.index ?? 0);
      lines.push((before.match(/\n/g)?.length ?? 0) + 1);
    }
    if (lines.length > 0) offences.push({ path: file, count: lines.length, lines });
  }

  return offences.sort((left, right) => (left.path < right.path ? -1 : 1));
}

function sourceFiles(patterns: readonly string[]): string[] {
  return resolveSurfaceFiles({ paths: [...patterns] }, ROOT).filter((file) =>
    SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)),
  );
}

describe("security invariants", () => {
  it("uses nowISODateString() instead of new Date().toISOString()", () => {
    const files = sourceFiles(["src/**"]).filter((file) => !file.startsWith("src/paraglide/"));
    const offences = findOccurrences(files, /new Date\(\)\.toISOString\(\)/g).filter(
      (offence) => !DATE_HELPER_ALLOWLIST.has(offence.path),
    );

    expect(
      offences,
      `Use nowISODateString() from src/utils/date.ts (AGENTS §1). New violation(s):\n${format(offences)}`,
    ).toEqual([]);
  });

  it("never calls Math.random() in security, auth or media utilities", () => {
    const files = sourceFiles([
      "src/utils/security/**",
      "src/databases/auth/**",
      "src/utils/media/**",
    ]);
    const offences = findOccurrences(files, /Math\.random\s*\(/g);

    expect(
      offences,
      `Security-sensitive randomness must use crypto.getRandomValues()/randomUUID():\n${format(offences)}`,
    ).toEqual([]);
  });

  it("imports UI primitives by module path, never through the @components/ui barrel", () => {
    const files = sourceFiles(["src/**", "tests/**"]);
    const offences = findBarrelImports(files);

    expect(
      offences,
      `Import from @components/ui/<module> instead of the barrel:\n${format(offences)}`,
    ).toEqual([]);
  });

  it("covers every server route with a threat-model surface", () => {
    const manifest = parseManifest(
      JSON.parse(readFileSync(join(ROOT, MANIFEST_PATH), "utf8")) as unknown,
    );
    const evaluation = evaluateManifest(manifest, ROOT);

    expect(
      evaluation.uncovered,
      `Add these files to a surface in ${MANIFEST_PATH}:\n${evaluation.uncovered.join("\n")}`,
    ).toEqual([]);
    expect(evaluation.coverage.percent).toBe(100);
  }, 30_000);
});

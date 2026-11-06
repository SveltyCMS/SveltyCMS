/**
 * @file scripts/lint/lint-live-paths.ts
 * @description Bans static live-config path constants outside the path
 * resolvers, so code reachable from a test cannot mutate developer data.
 *
 * A test or benchmark must resolve `config/collections`, `config/database` and
 * `.compiledCollections` through the test-aware getters (`getCollectionsPath`,
 * `resolveSqlitePath`, `resolveCompiledCollectionsPath`), never the static live
 * constants (`paths.collections`, `paths.database`, `DEFAULT_DATABASE_DIR`).
 * The incident that motivated the rule: an E2E setup run purged live
 * `config/collections/` while writing presets to `config/test-collections/`,
 * deleting the developer's `pages.ts`.
 *
 * The resolvers themselves are the only allowed readers. Comment lines are
 * ignored (documenting the rule is encouraged). Suppress one line with
 * `lint-live-paths: allow` when a deliberate exception is reviewed.
 *
 * Usage:
 *   bun run scripts/lint/lint-live-paths.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - Pure `findLivePathReferences()` core (unit-tested with fixtures)
 * - Comment-aware (line comments, block-doc `*`, Svelte comments)
 * - Resolver allowlist lives in one place
 */

import { readSourceFiles, type SourceFile } from "./lib/source-files";

export interface LivePathOffense {
  file: string;
  line: number;
  match: string;
}

/** The path resolvers own the live constants; everything else resolves via them. */
export const RESOLVER_FILES: ReadonlySet<string> = new Set([
  "src/utils/path-resolver.ts",
  "src/utils/paths.ts",
  "src/utils/tenant.server.ts",
  "src/utils/benchmark-sandbox.ts",
  "src/utils/benchmark-db-purge.ts",
  "src/utils/benchmark-paths.ts",
  "src/utils/benchmark-runtime.ts",
]);

const LIVE_PATH = /\b(?:paths\.(?:collections|database)|DEFAULT_DATABASE_DIR)\b/;

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("<!--")
  );
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-live-paths.test.ts`.
 */
export function findLivePathReferences(files: SourceFile[]): LivePathOffense[] {
  const offenses: LivePathOffense[] = [];

  for (const file of files) {
    if (RESOLVER_FILES.has(file.path)) continue;
    const lines = file.source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (isComment(line)) continue;
      if (line.includes("lint-live-paths: allow")) continue;
      if (lines[index - 1]?.includes("lint-live-paths: allow")) continue;

      const match = LIVE_PATH.exec(line);
      if (match) {
        offenses.push({ file: file.path, line: index + 1, match: match[0] });
      }
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const files = readSourceFiles();

  const offenses = findLivePathReferences(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ live path constants: none outside the resolvers (${files.length} files).`);
    }
    return;
  }

  console.error(`❌ live path constants: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(
      `   ${offense.file}:${offense.line} — ${offense.match}; use the test-aware getter instead.`,
    );
  }
  console.error(
    "\n   Resolve through getCollectionsPath()/resolveSqlitePath()/resolveCompiledCollectionsPath(), or add a reviewed `lint-live-paths: allow` comment.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();

/**
 * @file scripts/lint/lint-duplicate-testids.ts
 * @description Flags a route that passes a `data-testid` to a component which
 * already renders that same id.
 *
 * Playwright's `getByTestId()` runs in strict mode: two matches in one rendered
 * tree fail the test with "resolved to 2 elements". svelte-check cannot see it,
 * because the duplicate crosses a component boundary — a wrapper
 * (`<AdminCard data-testid="media-grid">`) around a child
 * (`media-grid.svelte`, which already owns `data-testid="media-grid"`). That
 * exact shape broke the Media & Dashboard E2E shard.
 *
 * Rule: for every `src/routes/**\/*.svelte`, a literal `data-testid="X"` on a
 * **component** tag (capitalised tag) is an offense when `X` is also declared
 * in a file under `src/components/**` or `src/widgets/**`. Native elements are
 * ignored — wrapping a `<div data-testid>` around a component never duplicates
 * ids, and repeated ids inside a list are a legitimate pattern there.
 *
 * Suppress one line with `testid-allow` (attribute or comment on the tag):
 *
 * ```svelte
 * <!-- testid-allow -->
 * <AdminCard data-testid="media-grid">
 * ```
 *
 * Usage:
 *   bun run scripts/lint/lint-duplicate-testids.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - Pure `findDuplicateTestIds()` core (unit-tested with fixtures)
 * - Quote-aware tag scanner (arrow functions in props stay intact)
 * - `testid-allow` escape hatch, reported in the summary so it cannot hide
 */

import { readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";

export interface SvelteSource {
  /** Project-relative POSIX path, e.g. `src/routes/(app)/x/+page.svelte`. */
  path: string;
  source: string;
}

export interface TestIdOffense {
  declaredIn: string;
  file: string;
  line: number;
  tag: string;
  testId: string;
}

const TESTID_ATTR = /data-testid\s*=\s*(?:"([^"]+)"|'([^']+)')/;
const COMPONENT_ROOTS = ["src/components/", "src/widgets/"];
const ROUTE_ROOT = "src/routes/";

interface ComponentTag {
  attrs: string;
  index: number;
  name: string;
}

/**
 * Collect opening component tags with a quote-aware scan. A naive `[^>]*`
 * regex breaks on `onclick={() => …}`; this walks quotes instead.
 */
function componentTags(source: string): ComponentTag[] {
  const tags: ComponentTag[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start === -1) break;
    const next = source[start + 1];
    if (!next || !/[A-Z]/.test(next)) {
      cursor = start + 1;
      continue;
    }

    let end = start + 1;
    let quote: string | null = null;
    // `{…}` expression attributes contain `>` inside arrow functions, so the
    // tag does not end at the first `>` once a brace block opened.
    let braces = 0;
    for (; end < source.length; end++) {
      const char = source[end];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === "{") {
        braces++;
        continue;
      }
      if (char === "}") {
        braces = Math.max(0, braces - 1);
        continue;
      }
      if (char === ">" && braces === 0) break;
    }

    const raw = source.slice(start + 1, end);
    const nameMatch = /^[A-Za-z][\w.$]*/.exec(raw);
    if (nameMatch) {
      tags.push({
        name: nameMatch[0],
        attrs: raw.slice(nameMatch[0].length),
        index: start,
      });
    }
    cursor = end + 1;
  }

  return tags;
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

/** Literal testids declared by component files (the files a route can wrap). */
function declaredTestIds(files: SvelteSource[]): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  for (const file of files) {
    if (!COMPONENT_ROOTS.some((root) => file.path.startsWith(root))) continue;
    const seen = new Set<string>();
    for (const match of file.source.matchAll(/data-testid\s*=\s*["']([^"']+)["']/g)) {
      const id = match[1];
      if (id && !seen.has(id)) seen.add(id);
    }
    for (const id of seen) {
      const list = declared.get(id);
      if (list) list.push(file.path);
      else declared.set(id, [file.path]);
    }
  }
  return declared;
}

function isAllowed(source: string, tag: ComponentTag): boolean {
  if (tag.attrs.includes("testid-allow")) return true;
  // A comment on the line above the tag also counts.
  const before = source.slice(0, tag.index);
  const previousLine = before.slice(before.lastIndexOf("\n", before.length - 2) + 1);
  return previousLine.includes("testid-allow");
}

/**
 * Pure core — fixtures in `tests/unit/scripts/lint-duplicate-testids.test.ts`.
 */
export function findDuplicateTestIds(files: SvelteSource[]): TestIdOffense[] {
  const declared = declaredTestIds(files);
  const offenses: TestIdOffense[] = [];

  for (const file of files) {
    if (!file.path.startsWith(ROUTE_ROOT)) continue;
    for (const tag of componentTags(file.source)) {
      if (isAllowed(file.source, tag)) continue;
      const testId = TESTID_ATTR.exec(tag.attrs)?.[1] ?? TESTID_ATTR.exec(tag.attrs)?.[2];
      if (!testId) continue;
      const owners = declared.get(testId);
      if (!owners?.length) continue;
      offenses.push({
        file: file.path,
        line: lineOf(file.source, tag.index),
        tag: tag.name,
        testId,
        declaredIn: owners[0],
      });
    }
  }

  return offenses;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function collectSvelteFiles(dir: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectSvelteFiles(full, out);
    else if (entry.name.endsWith(".svelte")) out.push(full);
  }
  return out;
}

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const toPosix = (path: string) => path.replace(/\\/g, "/");
  const files: SvelteSource[] = collectSvelteFiles(join(process.cwd(), "src")).map((full) => ({
    path: toPosix(relative(process.cwd(), full)),
    source: readFileSync(full, "utf8"),
  }));

  const offenses = findDuplicateTestIds(files);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(`✅ data-testid duplicates: none across ${files.length} Svelte files.`);
    }
    return;
  }

  console.error(`❌ data-testid duplicates: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(
      `   ${offense.file}:${offense.line} — <${offense.tag} data-testid="${offense.testId}"> but ${offense.declaredIn} already renders it.`,
    );
  }
  console.error(
    "\n   Rename the wrapper id or add a `testid-allow` comment when the duplicate is intentional.",
  );
  process.exitCode = 1;
}

if (import.meta.main) main();

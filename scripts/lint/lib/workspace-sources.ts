/**
 * @file scripts/lint/lib/workspace-sources.ts
 * @description One in-process read of the `src` tree, shared by every AST gate.
 *
 * The fast-check runner spawns one process per gate, so an in-process cache only
 * helps when several gates run in the same process. `run-ast-gates.ts` and
 * `run-source-lints.ts` use this loader to run their rules over the same
 * `SourceFile` text instead of reading the tree once per rule.
 *
 * Features:
 * - Deterministic sorted path list (stable output and cache keys)
 * - Two views of one tree: the filtered default (no generated Paraglide output,
 *   no `.d.ts` mirrors) and the `inclusive` view the rule-budget ratchet needs
 *   to stay identical to `readSourceFiles()`
 * - `filterWorkspaceSources()` derives the filtered view from an inclusive read,
 *   so a caller that needs both still pays one tree read
 * - Process-local cache keyed by root + view, explicit reset for tests
 */

import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface WorkspaceSourceFile {
  /** Project-relative POSIX path. */
  path: string;
  source: string;
}

export interface WorkspaceSourceOptions {
  /**
   * Include generated Paraglide output and `.d.ts` mirrors. The rule-budget
   * ratchet counts everything `readSourceFiles()` sees, so it opts in.
   */
  inclusive?: boolean;
}

const EXCLUDED_PREFIXES = ["src/paraglide/"];

function isFilteredOut(path: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)) || path.endsWith(".d.ts");
}

/**
 * Every `.ts` / `.svelte` file under `src` that a lint may need to inspect.
 *
 * The default view excludes generated Paraglide modules and `.d.ts` mirrors:
 * neither can contain an executable statement the source rules match. Test
 * files are included so single-file lints keep their original coverage.
 */
export function listWorkspaceSourcePaths(
  root = process.cwd(),
  options: WorkspaceSourceOptions = {},
): string[] {
  const paths = globSync("src/**/*.{ts,svelte}", { cwd: root })
    .map((entry) => entry.replace(/\\/g, "/"))
    .sort();
  return options.inclusive ? paths : paths.filter((path) => !isFilteredOut(path));
}

/** The filtered default view, derived from any already-loaded {@link WorkspaceSourceFile} list. */
export function filterWorkspaceSources(
  files: readonly WorkspaceSourceFile[],
): WorkspaceSourceFile[] {
  return files.filter((file) => !isFilteredOut(file.path));
}

const cache = new Map<string, WorkspaceSourceFile[]>();

function cacheKey(root: string, options: WorkspaceSourceOptions): string {
  return `${root}\u0000${options.inclusive ? "inclusive" : "filtered"}`;
}

/** Reads the workspace once per process per view. Returns the same array on repeat calls. */
export function loadWorkspaceSources(
  root = process.cwd(),
  options: WorkspaceSourceOptions = {},
): WorkspaceSourceFile[] {
  const key = cacheKey(root, options);
  const cached = cache.get(key);
  if (cached) return cached;
  const files = listWorkspaceSourcePaths(root, options).map((relativePath) => ({
    path: relativePath,
    source: readFileSync(join(root, relativePath), "utf8"),
  }));
  cache.set(key, files);
  return files;
}

/** Test isolation hook — the next call re-reads the tree. */
export function clearWorkspaceSourceCache(): void {
  cache.clear();
}

/**
 * @file scripts/lint/lib/workspace-sources.ts
 * @description One in-process read of the `src` tree, shared by every AST gate.
 *
 * The fast-check runner spawns one process per gate, so an in-process cache only
 * helps when several gates run in the same process. `run-ast-gates.ts` uses this
 * loader to run the module-graph linkmap and the tenant-scope lint over the same
 * `SourceFile` text instead of reading the tree twice.
 *
 * Features:
 * - Deterministic sorted path list (stable output and cache keys)
 * - Excludes generated Paraglide output and `.d.ts` mirrors only; test files are
 *   included so single-file lints keep their original coverage
 * - Process-local cache, explicit reset for tests
 */

import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface WorkspaceSourceFile {
  /** Project-relative POSIX path. */
  path: string;
  source: string;
}

const EXCLUDED_PREFIXES = ["src/paraglide/"];

/** Every `.ts` / `.svelte` file under `src` that a lint may need to inspect. */
export function listWorkspaceSourcePaths(root = process.cwd()): string[] {
  return globSync("src/**/*.{ts,svelte}", { cwd: root })
    .map((entry) => entry.replace(/\\/g, "/"))
    .filter(
      (entry) =>
        !EXCLUDED_PREFIXES.some((prefix) => entry.startsWith(prefix)) && !entry.endsWith(".d.ts"),
    )
    .sort();
}

let cachedRoot: string | null = null;
let cachedFiles: WorkspaceSourceFile[] | null = null;

/** Reads the workspace once per process. Returns the same array on repeat calls. */
export function loadWorkspaceSources(root = process.cwd()): WorkspaceSourceFile[] {
  if (cachedRoot === root && cachedFiles) return cachedFiles;
  const files = listWorkspaceSourcePaths(root).map((relativePath) => ({
    path: relativePath,
    source: readFileSync(join(root, relativePath), "utf8"),
  }));
  cachedRoot = root;
  cachedFiles = files;
  return files;
}

/** Test isolation hook — the next call re-reads the tree. */
export function clearWorkspaceSourceCache(): void {
  cachedRoot = null;
  cachedFiles = null;
}

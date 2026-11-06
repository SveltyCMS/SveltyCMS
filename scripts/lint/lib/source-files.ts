/**
 * @file scripts/lint/lib/source-files.ts
 * @description Shared source discovery for the lint scanners: recursive
 * collection of `.ts` and `.svelte` files under `src`, POSIX path
 * normalization, and Svelte `<script>` block extraction with line remapping
 * for AST scans.
 */

import { readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";

export interface SourceFile {
  /** Project-relative POSIX path. */
  path: string;
  source: string;
}

export interface ScriptBlock {
  text: string;
  /** Zero-based line offset of the block inside the original file. */
  lineOffset: number;
}

export function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

export function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectSourceFiles(full, out);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte")) out.push(full);
  }
  return out;
}

/** Reads every `.ts` / `.svelte` file under the project's `src` tree. */
export function readSourceFiles(root = process.cwd()): SourceFile[] {
  return collectSourceFiles(join(root, "src")).map((full) => ({
    path: toPosix(relative(root, full)),
    source: readFileSync(full, "utf8"),
  }));
}

/** `.svelte` files are parsed block-by-block; `.ts` is the whole file. */
export function scriptBlocks(file: SourceFile): ScriptBlock[] {
  if (!file.path.endsWith(".svelte")) {
    return [{ text: file.source, lineOffset: 0 }];
  }

  const blocks: ScriptBlock[] = [];
  for (const match of file.source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const start = match.index ?? 0;
    const openEnd = file.source.indexOf(">", start) + 1;
    blocks.push({
      text: match[1] ?? "",
      lineOffset: file.source.slice(0, openEnd).split("\n").length - 1,
    });
  }
  return blocks;
}

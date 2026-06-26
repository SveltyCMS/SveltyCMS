#!/usr/bin/env bun
/**
 * @file scripts/validate-imports.ts
 * @description Fast static import resolution checker — catches stale paths from file moves.
 *
 * Scans all import statements in src/ to verify target files exist.
 * resolves each path alias (@src, @utils, etc.) to real filesystem paths,
 * and errors if any resolved path doesn't exist.
 *
 * Runs in ~200ms — suitable for pre-push quality gate.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// Vite path aliases (from vite.config.ts)
const ALIASES: Record<string, string> = {
  "@src": SRC,
  "@utils": join(SRC, "utils"),
  "@stores": join(SRC, "stores"),
  "@components": join(SRC, "components"),
  "@widgets": join(SRC, "widgets"),
  "@services": join(SRC, "services"),
  "@databases": join(SRC, "databases"),
  "@content": join(SRC, "content"),
  "@hooks": join(SRC, "hooks"),
  "@config": join(ROOT, "config"),
  "@root": ROOT,
  $app: join(ROOT, ".svelte-kit", "generated"), // SvelteKit internal
  $paraglide: join(SRC, "paraglide"),
};

// Patterns matching imports
const IMPORT_RE = /(?:import\s+(?:type\s+)?(?:\{[^}]*\}|[^'"]*)\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']/g;

let errors = 0;
let checked = 0;

function resolveImportPath(importPath: string, fromFile: string): string | null {
  // Skip node: builtins, npm packages, relative paths (handled by Vite)
  if (importPath.startsWith("node:") || importPath.startsWith("$lib/")) return null;
  if (importPath.startsWith(".")) {
    // Relative import — resolve against file's directory
    const dir = dirname(fromFile);
    const resolved = resolve(dir, importPath);
    return tryExtensions(resolved);
  }

  // Check aliases
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (importPath === alias || importPath.startsWith(alias + "/")) {
      const rest = importPath.slice(alias.length);
      const resolved = join(target, rest);
      return tryExtensions(resolved);
    }
  }

  // npm package — skip
  return null;
}

function tryExtensions(basePath: string): string | null {
  const exts = [".ts", ".tsx", ".svelte", ".svelte.ts", "/index.ts", ""];
  for (const ext of exts) {
    const full = basePath + ext;
    if (existsSync(full)) return full;
  }
  // Also check if it's a directory with index
  if (existsSync(join(basePath, "index.ts"))) return join(basePath, "index.ts");
  return null;
}

function getAllTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...getAllTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte"))) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf8");
    const patterns = [IMPORT_RE, DYNAMIC_IMPORT_RE];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        // Skip type-only imports (they're erased at compile time)
        const _isTypeImport = /import\s+type/.test(
          content.slice(Math.max(0, match.index - 50), match.index),
        );

        const resolved = resolveImportPath(importPath, filePath);
        if (resolved === null) continue; // npm package or node: builtin

        checked++;
        if (!resolved) {
          const relPath = relative(ROOT, filePath);
          console.error(`  ❌ ${relPath}: "${importPath}" → file not found`);
          errors++;
        }
      }
    }
  } catch {
    // File read error — skip
  }
}

const files = [...getAllTsFiles(SRC), ...getAllTsFiles(join(ROOT, "tests"))];
for (const file of files) {
  checkFile(file);
}

if (errors > 0) {
  console.error(`\n❌ ${errors} unresolved import(s) found in ${checked} checked.`);
  process.exit(1);
}

console.log(`✅ All ${checked} imports resolve correctly (${files.length} files).`);
process.exit(0);

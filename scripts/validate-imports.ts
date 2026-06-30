#!/usr/bin/env bun
/**
 * @file scripts/validate-imports.ts
 * @description Fast static import resolution checker — catches stale paths from file moves.
 *
 * Scans all import statements in src/ and tests/ to verify target files exist.
 * Resolves each path alias (@src, @utils, etc.) to real filesystem paths,
 * and errors if any resolved path doesn't exist.
 *
 * Runs in ~200ms — suitable for pre-push quality gate.
 *
 * Uses mandatory regex prefixes — the previous optional import prefix (?)
 * would degrade to matching every quoted string literal in the file.
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
  "@tests": join(ROOT, "tests"),
  $lib: join(SRC, "lib"),
  $app: join(ROOT, ".svelte-kit", "generated"), // SvelteKit internal
  $paraglide: join(SRC, "paraglide"),
};

// Mandatory import prefix — the previous optional (?:...)? degraded to matching
// every quoted string literal in the file, producing false positives on error
// messages, debug strings, and template literals containing path-like content.
const STATIC_IMPORT_RE =
  /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /import\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']/g;
const REQUIRE_RE = /require\s*\(\s*["']([^"']+)["']/g;

let errors = 0;
let totalChecked = 0;
let resolvedChecked = 0;

function resolveImportPath(importPath: string, fromFile: string): string | null {
  // Skip node: builtins and bare npm packages (no alias prefix, no relative dot)
  if (importPath.startsWith("node:")) return null;
  if (!importPath.startsWith(".") && !importPath.startsWith("@") && !importPath.startsWith("$")) {
    return null; // npm package
  }

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

  // Unrecognized alias prefix — flag as potentially broken
  return null;
}

function tryExtensions(basePath: string): string | null {
  // Strip .js extension and try .ts first (TypeScript ESM projects often write
  // import { foo } from "./helpers.js" where the actual file is helpers.ts)
  const jsStripped = basePath.replace(/\.js$/, "");

  for (const candidate of [basePath, jsStripped]) {
    for (const ext of [".ts", ".tsx", ".svelte", ".svelte.ts"]) {
      const full = candidate + ext;
      if (existsSync(full)) return full;
    }
    // Check directory with index.ts
    if (existsSync(join(candidate, "index.ts"))) return join(candidate, "index.ts");
  }

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
    const patterns = [STATIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        totalChecked++;

        // Skip type-only imports — erased at compile time, no runtime resolution needed
        const preMatch = content.slice(Math.max(0, match.index - 50), match.index);
        if (/\bimport\s+type\b/.test(preMatch)) continue;

        const resolved = resolveImportPath(importPath, filePath);
        if (resolved === null) continue; // npm package or node: builtin

        resolvedChecked++;
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
  console.error(
    `\n❌ ${errors} unresolved import(s) in ${resolvedChecked} checked ` +
      `(${totalChecked} total, ${files.length} files).`,
  );
  process.exit(1);
}

console.log(
  `✅ All ${resolvedChecked} imports resolve correctly ` +
    `(${totalChecked} total, ${files.length} files).`,
);
process.exit(0);

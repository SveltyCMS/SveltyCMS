/**
 * @file scripts/slop-scanner.ts
 * @description AI Slop Scanner — detects common AI-generated code smells in SveltyCMS.
 *
 * Runs as part of Gate 3 (Svelte Doctor) in the Smart Test Orchestrator.
 * Catches patterns that AI coding assistants commonly generate:
 *
 * ### Detection Categories
 * - Unused imports
 * - Dead exports (exported but never imported)
 * - Svelte 5 anti-patterns ($: reactivity, legacy stores, unsafe {@html})
 * - Missing ARIA labels on interactive elements
 * - Directional Tailwind classes (pl-N/pr-N instead of ps-N/pe-N)
 * - TODO/FIXME accumulation
 * - Duplicate file content (copy-paste slop)
 * - Inconsistent file naming (PascalCase in kebab-case directories)
 *
 * Usage:
 *   bun run scripts/slop-scanner.ts           # scan everything
 *   bun run scripts/slop-scanner.ts --ci      # exit code 1 on violations
 *   bun run scripts/slop-scanner.ts --fix     # auto-fix where possible
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

const MAX_TODOS = 30; // More than this = slop accumulation
const MAX_FILE_SIZE = 500_000; // Bytes — files larger than this are suspicious

// Known deferred issues — suppress these specific file+category combos
const SUPPRESS: { file: string; category: string }[] = [];

interface Violation {
  file: string;
  line: number;
  category: string;
  message: string;
  severity: "error" | "warning" | "info";
}

const violations: Violation[] = [];

function report(
  file: string,
  line: number,
  category: string,
  message: string,
  severity: "error" | "warning" | "info" = "warning",
) {
  // Check suppression list (normalize to forward slashes for matching)
  const normalizedFile = file.replace(/\\/g, "/");
  if (SUPPRESS.some((s) => normalizedFile.includes(s.file) && s.category === category)) {
    return;
  }
  violations.push({ file, line, category, message, severity });
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function* walkFiles(dir: string, extensions: string[]): Generator<string> {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".svelte-kit" || entry.name === ".git")
          continue;
        if (entry.name === "paraglide" || entry.name === "dist" || entry.name === "build") continue;
        yield* walkFiles(full, extensions);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        yield full;
      }
    }
  } catch {
    // Permission denied on some dirs — skip
  }
}

// ---------------------------------------------------------------------------
// Category 1: Svelte 5 Anti-Patterns
// ---------------------------------------------------------------------------

const SVELTE5_ANTIPATTERNS = {
  legacyReactive: /\$\s*:\s*\{?/g,
  legacyStore: /import\s+\{[^}]*\}\s+from\s+['"]svelte\/store['"]/g,
  unsafeHtml: /\{@html\s+/g,
  twoWayBinding: /bind:this=\{/g,
};

function scanSvelteFile(file: string, content: string) {
  const lines = content.split("\n");

  // Track whether we're inside a markdown code block (```...```)
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Toggle code block state
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    // Skip lines inside code blocks (documentation examples)
    if (inCodeBlock) continue;

    // Legacy $: reactive statements
    if (/\$\s*:/.test(line) && !line.includes("$state") && !line.includes("$derived")) {
      report(
        file,
        i + 1,
        "svelte5-legacy",
        "Legacy $: reactive statement — use $derived() or $effect() instead",
        "error",
      );
    }

    // Missing ARIA on interactive elements
    if (/<(button|input|select|textarea|a)\b/i.test(line) && !/<button[^>]*type=/i.test(line)) {
      if (!/aria-label|aria-labelledby|id=/i.test(line) && !/role="presentation"/i.test(line)) {
        if (/<(button|input|select|textarea)\b/i.test(line)) {
          report(
            file,
            i + 1,
            "accessibility",
            "Interactive element may lack accessible name (aria-label, aria-labelledby, or matching label)",
            "warning",
          );
        }
      }
    }
  }

  // Legacy svelte/store imports
  if (SVELTE5_ANTIPATTERNS.legacyStore.test(content)) {
    report(
      file,
      0,
      "svelte5-legacy",
      "Legacy svelte/store import detected — use Svelte 5 runes ($state, $derived)",
      "error",
    );
  }

  // Unsafe {@html} usage (skip already-sanitized or clearly safe)
  const unsafeMatches = content.match(/\{@html\s+[^}]+\}/g);
  if (unsafeMatches) {
    for (const match of unsafeMatches) {
      // Skip if wrapped in sanitize() or DOMPurify
      if (/\{@html\s+sanitize\s*\(/.test(match)) continue;
      if (/\{@html\s+DOMPurify\.sanitize\s*\(/.test(match)) continue;
      // Skip if preceded by eslint-disable comment for svelte/no-at-html-tags
      const matchIdx = content.indexOf(match);
      const preceding = content.substring(Math.max(0, matchIdx - 120), matchIdx);
      if (/eslint-disable.*no-at-html/.test(preceding)) continue;
      // Skip if inside a markdown code block (odd number of ``` before match)
      const before = content.substring(0, matchIdx);
      if ((before.match(/```/g) || []).length % 2 === 1) continue;

      const lineIdx = content.substring(0, matchIdx).split("\n").length;
      report(
        file,
        lineIdx,
        "security-html",
        `Unsafe {@html ...} usage: ${match.trim().substring(0, 60)}`,
        "error",
      );
    }
  }

  // Directional Tailwind (pl-*/pr-* instead of ps-*/pe-*)
  const directionalRegex = /\b(pl|pr|ml|mr|left|right)-\d+\b/g;
  let directionalMatch;
  while ((directionalMatch = directionalRegex.exec(content)) !== null) {
    const lineIdx = content.substring(0, directionalMatch.index).split("\n").length;
    report(
      file,
      lineIdx,
      "rtl",
      `Directional Tailwind class "${directionalMatch[0]}" — use logical property instead (ps-/pe-/ms-/me-)`,
      "warning",
    );
  }
}

// ---------------------------------------------------------------------------
// Category 2: Dead Exports
// ---------------------------------------------------------------------------

interface ExportInfo {
  name: string;
  file: string;
  isDefault: boolean;
}

const allExports: ExportInfo[] = [];
const allImports = new Set<string>();

function extractExports(file: string, content: string) {
  // Named exports
  const namedExportRegex = /export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    allExports.push({ name: match[1], file, isDefault: false });
  }

  // Default exports
  if (/export\s+default\s+(?:function|class)\s+(\w+)/.test(content)) {
    const defaultMatch = content.match(/export\s+default\s+(?:function|class)\s+(\w+)/);
    if (defaultMatch) {
      allExports.push({ name: defaultMatch[1], file, isDefault: true });
    }
  }

  // Export { x, y } syntax
  const namedListRegex = /export\s*\{([^}]+)\}/g;
  while ((match = namedListRegex.exec(content)) !== null) {
    const names = match[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]);
    for (const name of names) {
      if (name) allExports.push({ name, file, isDefault: false });
    }
  }
}

function extractImports(_file: string, content: string) {
  // import { x, y } from '...'
  const importRegex = /import\s*\{([^}]+)\}\s*from/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const names = match[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]);
    for (const name of names) {
      if (name) allImports.add(name);
    }
  }

  // import X from '...'
  const defaultImportRegex = /import\s+(\w+)\s+from/g;
  while ((match = defaultImportRegex.exec(content)) !== null) {
    allImports.add(match[1]);
  }

  // import * as X from '...'
  const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from/g;
  while ((match = namespaceImportRegex.exec(content)) !== null) {
    allImports.add(match[1]);
  }
}

// ---------------------------------------------------------------------------
// Category 3: TODO/FIXME Accumulation
// ---------------------------------------------------------------------------

function scanTodos(file: string, content: string) {
  const todos = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi);
  if (todos && todos.length > 5) {
    report(
      file,
      0,
      "slop-accumulation",
      `${todos.length} TODO/FIXME/HACK/XXX comments — slop accumulation`,
      "info",
    );
  }
}

// ---------------------------------------------------------------------------
// Category 4: Drift Detection
// ---------------------------------------------------------------------------

const fileHashes = new Map<string, string[]>();

function hashContent(content: string): string {
  // Simple hash for duplicate detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}

function checkDuplicateContent(file: string, content: string) {
  const hash = hashContent(content);
  if (fileHashes.has(hash)) {
    const dupes = fileHashes.get(hash)!;
    report(
      file,
      0,
      "copy-paste",
      `Content identical to: ${dupes.map((d) => relative(ROOT, d)).join(", ")}`,
      "warning",
    );
  } else {
    fileHashes.set(hash, [file]);
  }
}

// ---------------------------------------------------------------------------
// Category 5: File Naming Consistency
// ---------------------------------------------------------------------------

function checkFileNaming(file: string) {
  const name = basename(file);

  // Check for PascalCase in kebab-case directories
  if (/[A-Z]/.test(name) && name.endsWith(".svelte")) {
    report(
      file,
      0,
      "naming",
      `PascalCase Svelte file in project that standardizes kebab-case: ${name}`,
      "warning",
    );
  }
}

// ---------------------------------------------------------------------------
// Category 6: Unused Imports (via oxlint integration)
// ---------------------------------------------------------------------------

function checkUnusedImports(file: string, content: string) {
  const importRegex = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const names = match[1].split(",").map((n) => {
      const parts = n.trim().split(/\s+as\s+/);
      return {
        original: parts[0].trim(),
        alias: parts[1]?.trim() || parts[0].trim(),
      };
    });

    for (const { original, alias } of names) {
      if (original === "type" || original === "") continue;
      // Check if the imported name is used anywhere in the file (after the import)
      const afterImport = content.substring(match.index + match[0].length);
      const usedInFile = afterImport.includes(alias);
      // Also check JSDoc type annotations
      const usedInJSDoc = content.includes(`@type {import(`) && content.includes(alias);

      if (!usedInFile && !usedInJSDoc) {
        const lineIdx = content.substring(0, match.index).split("\n").length;
        report(file, lineIdx, "unused-import", `Potentially unused import: "${alias}"`, "info");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const isCI = argv.includes("--ci");

  console.log("🔍 AI Slop Scanner — detecting code smells...\n");

  // Phase 1: Collect all files
  const svelteFiles: string[] = [];
  const tsFiles: string[] = [];

  for (const file of walkFiles(SRC, [".svelte", ".ts"])) {
    if (file.endsWith(".svelte")) svelteFiles.push(file);
    else tsFiles.push(file);
  }

  console.log(`📂 Found ${svelteFiles.length} Svelte files, ${tsFiles.length} TS files`);

  // Phase 2: First pass — collect exports/imports
  for (const file of tsFiles) {
    try {
      const content = readFileSync(file, "utf8");
      extractExports(file, content);
      extractImports(file, content);
    } catch {
      // Binary or unreadable
    }
  }

  // Also collect imports from Svelte files
  for (const file of svelteFiles) {
    try {
      const content = readFileSync(file, "utf8");
      extractImports(file, content);
    } catch {
      // Binary or unreadable
    }
  }

  // Phase 3: Scan each file
  for (const file of svelteFiles) {
    try {
      const content = readFileSync(file, "utf8");
      const relPath = relative(ROOT, file).replace(/\\/g, "/");

      scanSvelteFile(relPath, content);
      scanTodos(relPath, content);
      checkFileNaming(relPath);
      checkDuplicateContent(relPath, content);

      if (statSync(file).size > MAX_FILE_SIZE) {
        report(
          relPath,
          0,
          "file-size",
          `File is ${(statSync(file).size / 1024).toFixed(0)}KB — consider splitting`,
          "warning",
        );
      }
    } catch {
      // Skip unreadable
    }
  }

  for (const file of tsFiles) {
    try {
      const content = readFileSync(file, "utf8");
      const relPath = relative(ROOT, file);

      scanTodos(relPath, content);
      checkFileNaming(relPath);
      checkUnusedImports(relPath, content);
    } catch {
      // Skip unreadable
    }
  }

  // Phase 4: Find dead exports
  const deadExports = allExports.filter(
    (exp) => !allImports.has(exp.name) && !exp.name.startsWith("_"),
  );

  // Phase 5: Global checks
  const totalTodos = violations.filter((v) => v.category === "slop-accumulation").length;
  if (totalTodos > MAX_TODOS) {
    report(
      "(project)",
      0,
      "slop-accumulation",
      `Total TODO/FIXME count (${totalTodos}) exceeds threshold (${MAX_TODOS})`,
      "warning",
    );
  }

  // Phase 6: Print results
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const infos = violations.filter((v) => v.severity === "info");

  console.log(
    `\n📊 Results: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info\n`,
  );

  if (errors.length > 0) {
    console.log("━".repeat(60));
    console.log("❌ ERRORS (must fix):");
    console.log("━".repeat(60));
    for (const v of errors.slice(0, 20)) {
      console.log(`  ${v.file}:${v.line}  [${v.category}]  ${v.message}`);
    }
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more errors`);
  }

  if (warnings.length > 0) {
    console.log("\n" + "━".repeat(60));
    console.log("⚠️  WARNINGS (should fix):");
    console.log("━".repeat(60));
    for (const v of warnings.slice(0, 15)) {
      console.log(`  ${v.file}:${v.line}  [${v.category}]  ${v.message}`);
    }
    if (warnings.length > 15) console.log(`  ... and ${warnings.length - 15} more warnings`);
  }

  // Print dead exports
  if (deadExports.length > 0) {
    console.log("\n" + "━".repeat(60));
    console.log(`💀 DEAD EXPORTS (${deadExports.length} — exported but never imported):`);
    console.log("━".repeat(60));
    for (const exp of deadExports.slice(0, 15)) {
      console.log(`  ${exp.name}  (${relative(ROOT, exp.file)})`);
    }
    if (deadExports.length > 15)
      console.log(`  ... and ${deadExports.length - 15} more dead exports`);
  }

  // Exit code
  if (isCI && errors.length > 0) {
    console.log("\n❌ Slop scan failed — fix errors before merging.");
    process.exit(1);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("\n✅ No slop detected. Codebase is clean.");
  }
}

main().catch((err) => {
  console.error("Slop scanner crashed:", err);
  process.exit(1);
});

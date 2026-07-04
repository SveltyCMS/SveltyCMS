/**
 * @file scripts/slop-scanner.ts
 * @description Smart Svelte 5 + Accessibility + RTL + Quality scanner with safe autofix.
 *
 * Focuses on critical items oxlint doesn't cover natively:
 * - Svelte 5 legacy reactivity detection (warns on $: patterns)
 * - Svelte legacy store warnings
 * - Directional Tailwind property conversions to Logical Properties (autofixable)
 * - Accessibility missing-label assertions on interactive elements
 * - Unsanitized {@html} expression risk evaluations with nested brace support
 * - Dynamic brace-balanced {#each} block key constraint validations
 * - Duplicate content duplication flags
 * - Scans TS/JS files for TODOs, naming, and duplicate content slop
 * - Supports dynamic `.slop-suppress.json` loading for granular error overrides
 *
 * Usage:
 * bun run scripts/slop-scanner.ts                 # Check all files
 * bun run scripts/slop-scanner.ts --fix           # Check + safe autofix
 * bun run scripts/slop-scanner.ts --strict        # Fail-closed (exits 1 on error)
 * bun run scripts/slop-scanner.ts --files file.svelte # Check target file(s)
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { globSync } from "glob";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = join(import.meta.dirname, "..");
const MAX_FILE_SIZE = 400_000;
const MAX_TODOS_PER_FILE = 6;
const SUPPRESS_FILE = join(ROOT, ".slop-suppress.json");

// Suppressed files/categories to suppress known legacy exceptions
const SUPPRESS: { file: string; category: string }[] = [];

/**
 * Dynamically loads exceptions from local config file if present.
 * Prevents codebase noise on legacy or generated assets.
 */
async function loadSuppressions() {
  if (existsSync(SUPPRESS_FILE)) {
    try {
      const data = await fs.readFile(SUPPRESS_FILE, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        SUPPRESS.push(...parsed);
      }
    } catch {
      console.warn("⚠️  Could not parse local suppression list .slop-suppress.json");
    }
  }
}

interface Violation {
  file: string;
  line: number;
  category: string;
  message: string;
  severity: "error" | "warning" | "info";
  fixable?: boolean;
}

const violations: Violation[] = [];
let fixedFiles = 0;

function report(
  file: string,
  line: number,
  category: string,
  message: string,
  severity: "error" | "warning" | "info" = "warning",
  fixable = false,
) {
  const nf = file.replace(/\\/g, "/");
  if (SUPPRESS.some((s) => nf.includes(s.file) && s.category === category)) return;

  violations.push({
    file: nf,
    line,
    category,
    message,
    severity,
    fixable,
  });
}

// RTL Logical Properties Mapping — only entries matched by dirRegex below
const RTL_MAP: Record<string, string> = {
  pl: "ps",
  pr: "pe",
  ml: "ms",
  mr: "me",
  left: "start",
  right: "end",
  "text-left": "text-start",
  "text-right": "text-end",
  "border-l": "border-s",
  "border-r": "border-e",
  "rounded-l": "rounded-s",
  "rounded-r": "rounded-e",
  "divide-x": "divide-x",
  "divide-x-reverse": "divide-x-reverse",
  "space-x": "space-x",
  "space-x-reverse": "space-x-reverse",
};

async function scanSvelteFile(relPath: string, content: string, shouldFix: boolean) {
  const cleanContent = content.replace(/<!--([\s\S]*?)-->/g, (m) =>
    "\n".repeat((m.match(/\n/g) || []).length),
  );

  const lines = cleanContent.split("\n");
  const fixedLines = [...lines];
  let fileWasModified = false;

  let inCodeBlock = false;
  let inScriptBlock = false;
  let inStyleBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Detect script/style blocks — handles multi-line opening tags like <script\n lang="ts">
    if (/<script\b/i.test(trimmed)) inScriptBlock = true;
    if (/<\/script>/i.test(trimmed)) inScriptBlock = false;
    if (/<style\b/i.test(trimmed)) inStyleBlock = true;
    if (/<\/style>/i.test(trimmed)) inStyleBlock = false;

    // Also catch script/style blocks that open across line boundaries
    if (!inScriptBlock && !inStyleBlock) {
      // Look ahead up to 2 lines for a multi-line <script or <style opening tag
      const windowLines = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
      if (/<script\b[^>]*$/i.test(windowLines) && !/<\/script>/i.test(windowLines)) {
        inScriptBlock = true;
      }
      if (/<style\b[^>]*$/i.test(windowLines) && !/<\/style>/i.test(windowLines)) {
        inStyleBlock = true;
      }
    }

    // === Legacy $: reactivity (Svelte 5) — detection only, NO auto-fix ===
    // Flag ALL $: patterns inside script blocks — the negative lookahead on rune
    // keywords (e.g. $state) is removed because it produces false-negatives on
    // lines like `$: x = state(0).value` where `state` is not a Svelte rune.
    if (inScriptBlock && /\$\s*:/.test(line)) {
      report(relPath, i + 1, "svelte5-legacy", "Legacy $: reactivity — migrate to runes", "error");
    }

    if (inScriptBlock || inStyleBlock) continue;

    // === Accessibility ===
    const tagMatch = line.match(/<(button|input|select|textarea|a)\b([^>]*)/i);
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();
      const attrs = tagMatch[2];

      if (/^[A-Z]/.test(tagMatch[1])) continue; // Skip custom elements

      // Bypass hidden inputs natively
      if (tagName === "input" && /type\s*=\s*["']?hidden["']?/i.test(attrs)) {
        continue;
      }

      // Only scan the opening tag's attribute string for accessible names —
      // the previous 25-line lookahead would match aria-label from sibling
      // elements and suppress legitimate warnings.
      const hasAccessibleName =
        /(aria-label|aria-labelledby|title|id\s*=)/i.test(attrs) ||
        ((tagName === "a" || tagName === "button") &&
          /[a-zA-Z0-9\u00C0-\u017F]/.test(line.replace(/<[^>]*>/g, "").trim())) ||
        false;

      // Separately check for wrapping <label for="id"> pattern
      if (!hasAccessibleName && tagName === "input" && /id\s*=\s*["']([^"']+)["']/i.test(attrs)) {
        const inputId = attrs.match(/id\s*=\s*["']([^"']+)["']/i)?.[1];
        if (inputId) {
          // Check if any nearby line contains <label for="inputId">
          const nearby = lines.slice(Math.max(0, i - 3), i).join(" ");
          if (
            new RegExp(
              `<label\\b[^>]*for\\s*=\\s*["']${inputId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
              "i",
            ).test(nearby)
          ) {
            continue; // Has wrapping label — skip
          }
        }
      }

      if (!hasAccessibleName) {
        report(
          relPath,
          i + 1,
          "accessibility",
          `Interactive <${tagName}> may lack accessible name`,
          "warning",
        );
      }
    }

    // === RTL / Logical Properties ===
    // Updated to include divide-x and space-x variants that were in RTL_MAP
    // but not matched by the previous dirRegex pattern.
    const dirRegex =
      /(?:^|[\s"'`])(pl|pr|ml|mr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right|divide-x|divide-x-reverse|space-x|space-x-reverse)(-reverse|-\[[^\]]+\]|-\d+|)(?=[\s"'`]|$)/g;

    let m: RegExpExecArray | null;
    while ((m = dirRegex.exec(line)) !== null) {
      const prefix = m[1];
      const suffix = m[2];
      const full = prefix + suffix;

      // Skip bare words like "left"/"right" that are not Tailwind classes
      const requiresSuffix = ["pl", "pr", "ml", "mr", "left", "right"];
      if (requiresSuffix.includes(prefix) && !suffix) continue;

      // divide-x/space-x variants with modifiers (-reverse) are informational
      // since logical property equivalents don't exist in Tailwind v4 yet
      if (["divide-x", "divide-x-reverse", "space-x", "space-x-reverse"].includes(prefix)) {
        report(relPath, i + 1, "rtl", `"${full}" → consider logical equivalent`, "warning", true);
        continue; // No safe autofix available
      }

      report(relPath, i + 1, "rtl", `"${full}" → use logical property`, "warning", true);

      if (shouldFix && RTL_MAP[prefix] !== full) {
        const newClass = RTL_MAP[prefix] + suffix;
        const escaped = full.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?<=^|[\\s"'\`])${escaped}(?=[\\s"'\`]|$)|\\b${escaped}\\b`, "g");

        const newLine = fixedLines[i].replace(regex, newClass);
        if (newLine !== fixedLines[i] && lines[i] === line) {
          fixedLines[i] = newLine;
          fileWasModified = true;
        }
      }
    }
  }

  // === Global checks ===
  if (/from\s+["']svelte\/store["']/.test(content)) {
    report(relPath, 0, "svelte5-legacy", "Legacy svelte/store import — migrate to runes", "error");
  }

  // Secure nested-brace parsing for {@html}
  // Strip markdown code blocks first — {@html} in documentation is not code
  const contentNoCodeBlocks = content.replace(/```[\s\S]*?```/g, (m) =>
    "\n".repeat((m.match(/\n/g) || []).length),
  );
  for (const m of contentNoCodeBlocks.matchAll(/\{@html\s+((?:[^{}]|\{[^{}]*\})+)\}/g)) {
    const expr = m[1].trim();
    if (
      !/sanitize|DOMPurify|escape|safeHtml|marked|he\.|parseMD|getDisplayValue|getStatusText|getFieldComponentHtml/i.test(
        expr,
      )
    ) {
      const lineNo = contentNoCodeBlocks.substring(0, m.index!).split("\n").length;
      report(relPath, lineNo, "security", `Unsafe {@html} without sanitization`, "error");
    }
  }

  // Svelte 5 {#each} key validation (skip code blocks)
  for (const m of contentNoCodeBlocks.matchAll(/\{#each\s+((?:[^{}]|\{[^{}]*\})+)\}/g)) {
    const eachBody = m[1].trim();
    const hasAs = /\bas\b/.test(eachBody);
    if (hasAs && !eachBody.endsWith(")")) {
      const lineNo = contentNoCodeBlocks.substring(0, m.index!).split("\n").length;
      report(
        relPath,
        lineNo,
        "svelte-quality",
        "Consider adding a key context (e.g., (item.id)) to {#each} block",
        "warning",
      );
    }
  }

  // Write file out safely if changes were made
  if (shouldFix && fileWasModified) {
    const fixedContentString = fixedLines.join("\n");
    if (fixedContentString !== content) {
      await fs.writeFile(join(ROOT, relPath), fixedContentString, "utf8");
      fixedFiles++;
      console.log(`🛠️  Fixed Svelte properties in: ${relPath}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Other Checks
// ---------------------------------------------------------------------------
function scanTodos(relPath: string, content: string) {
  const matches = content.match(/(?:\/\/|\/\*)\s*(TODO|FIXME|HACK|XXX)/gi) || [];
  if (matches.length >= MAX_TODOS_PER_FILE) {
    report(relPath, 0, "maintenance", `${matches.length} TODO/FIXME comments`, "info");
  }
}

function checkFileNaming(relPath: string) {
  const file = basename(relPath);
  if (file.startsWith("+")) return; // Route files are exempt from generic naming rules
  if (/[A-Z]/.test(file) && relPath.endsWith(".svelte")) {
    report(relPath, 0, "naming", "Use kebab-case for .svelte files", "warning");
  }
}

const contentCache = new Map<string, string[]>();

function checkDuplicateContent(relPath: string, content: string) {
  const norm = content
    .replace(/\s+/g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .slice(0, 4000);

  if (norm.length < 400) return;

  if (contentCache.has(norm)) {
    const existing = contentCache.get(norm)!;
    report(relPath, 0, "copy-paste", `Very similar content to: ${existing.join(", ")}`, "warning");
    // FIX: append current file to cache so subsequent near-duplicates are also flagged
    existing.push(relPath);
  } else {
    contentCache.set(norm, [relPath]);
  }
}

// ---------------------------------------------------------------------------
// Main Router
// ---------------------------------------------------------------------------
async function main() {
  await loadSuppressions();

  const argv = process.argv.slice(2);
  const shouldFix = argv.includes("--fix");
  const isStrict = argv.includes("--strict");
  const filesIdx = argv.indexOf("--files");
  const targetFiles = filesIdx !== -1 ? argv.slice(filesIdx + 1) : null;

  console.log("🔍 Svelte Quality Scanner (Smart + Autofix)\n");

  const svelteFiles: string[] = [];
  const tsFiles: string[] = [];

  if (targetFiles?.length) {
    for (const f of targetFiles) {
      const isAbsolute = f.startsWith("/") || /^[A-Za-z]:[\\/]/.test(f);
      const full = isAbsolute ? f : join(ROOT, f);
      if (existsSync(full)) {
        if (f.endsWith(".svelte")) svelteFiles.push(full);
        else if (f.endsWith(".ts") || f.endsWith(".js")) tsFiles.push(full);
      }
    }
  } else {
    const allFiles = globSync("src/**/*.{svelte,ts,js}", {
      cwd: ROOT,
      ignore: [
        "**/node_modules/**",
        "**/.svelte-kit/**",
        "**/paraglide/**",
        "**/dist/**",
        "**/build/**",
      ],
      absolute: true,
    });
    for (const f of allFiles) {
      if (f.endsWith(".svelte")) svelteFiles.push(f);
      else tsFiles.push(f);
    }
  }

  console.log(`📂 Scanning ${svelteFiles.length} Svelte + ${tsFiles.length} TS/JS files...\n`);

  // Scan Svelte Files
  await Promise.all(
    svelteFiles.map(async (file) => {
      try {
        const content = await fs.readFile(file, "utf8");
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        await scanSvelteFile(rel, content, shouldFix);
        scanTodos(rel, content);
        checkFileNaming(rel);
        checkDuplicateContent(rel, content);

        const size = (await fs.stat(file)).size;
        if (size > MAX_FILE_SIZE && !file.endsWith(".d.ts")) {
          report(rel, 0, "file-size", `Large file (${(size / 1024).toFixed(0)}KB)`, "warning");
        }
      } catch {
        console.warn(`⚠️  Could not process Svelte file: ${file}`);
      }
    }),
  );

  // Scan TS/JS Files
  await Promise.all(
    tsFiles.map(async (file) => {
      try {
        const content = await fs.readFile(file, "utf8");
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        scanTodos(rel, content);
        checkFileNaming(rel);
        checkDuplicateContent(rel, content);

        const size = (await fs.stat(file)).size;
        if (size > MAX_FILE_SIZE && !file.endsWith(".d.ts")) {
          report(rel, 0, "file-size", `Large file (${(size / 1024).toFixed(0)}KB)`, "warning");
        }
      } catch {
        console.warn(`⚠️  Could not process TS/JS file: ${file}`);
      }
    }),
  );

  // Summary Report
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const infos = violations.filter((v) => v.severity === "info");

  console.log(
    `\n📊 Results: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos`,
  );
  if (shouldFix) console.log(`🛠️  Autofixed ${fixedFiles} file(s)`);

  if (errors.length) {
    console.log("\n❌ ERRORS:");
    errors.forEach((v) => console.log(`  ${v.file}:${v.line} [${v.category}] ${v.message}`));
  }

  if (warnings.length) {
    console.log("\n⚠️  WARNINGS:");
    warnings
      .slice(0, 25)
      .forEach((v) => console.log(`  ${v.file}:${v.line} [${v.category}] ${v.message}`));
    if (warnings.length > 25) console.log(`  ... +${warnings.length - 25} more`);
  }

  if (isStrict && (errors.length > 0 || warnings.length > 0)) {
    console.log(`
❌ Strict mode failed with ${errors.length} errors and ${warnings.length} warnings.`);
    console.log("Fix all issues before pushing. Perfect code only.\n");
    process.exit(1);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("\n✅ Clean! No issues found.");
  } else if (errors.length === 0) {
    console.log("\n⚠️  Only warnings — review recommended.");
  }
}

main().catch((err) => {
  console.error("Scanner crashed:", err);
  process.exit(1);
});

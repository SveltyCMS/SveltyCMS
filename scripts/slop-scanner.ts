/**
 * @file scripts/slop-scanner.ts
 * @description Custom Svelte 5 / accessibility / RTL / naming / slop checks.
 * General linting (unused imports, TS rules, etc.) is handled by oxlint.
 * This scanner focuses on what oxlint doesn't cover well.
 *
 * Usage:
 *   bun run scripts/slop-scanner.ts              # full scan
 *   bun run scripts/slop-scanner.ts --fix        # auto-fix RTL classes
 *   bun run scripts/slop-scanner.ts --strict     # exit 1 on any violation
 *   bun run scripts/slop-scanner.ts --files src/routes/+page.svelte
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const MAX_FILE_SIZE = 500_000;
const MAX_TODOS_PER_FILE = 5;

const SUPPRESS: { file: string; category: string }[] = [];

interface Violation {
  file: string;
  line: number;
  category: string;
  message: string;
  severity: "error" | "warning" | "info";
  fixable?: boolean;
}

const violations: Violation[] = [];

function report(
  file: string,
  line: number,
  category: string,
  message: string,
  severity: "error" | "warning" | "info" = "warning",
  fixable = false,
) {
  const nf = file.replace(/\\/g, "/");
  if (SUPPRESS.some((s) => nf.includes(s.file) && s.category === category))
    return;
  violations.push({ file, line, category, message, severity, fixable });
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------
function* walkFiles(dir: string, extensions: string[]): Generator<string> {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          [
            "node_modules",
            ".svelte-kit",
            ".git",
            "paraglide",
            "dist",
            "build",
          ].includes(entry.name)
        )
          continue;
        yield* walkFiles(full, extensions);
      } else if (extensions.some((e) => entry.name.endsWith(e))) {
        yield full;
      }
    }
  } catch {
    /* skip */
  }
}

// ---------------------------------------------------------------------------
// RTL Mapping
// ---------------------------------------------------------------------------
const RTL_MAP: Record<string, string> = {
  pl: "ps",
  pr: "pe",
  ml: "ms",
  mr: "me",
  left: "start",
  right: "end",
  "border-l": "border-s",
  "border-r": "border-e",
  "rounded-l": "rounded-s",
  "rounded-r": "rounded-e",
  "text-left": "text-start",
  "text-right": "text-end",
};

// ---------------------------------------------------------------------------
// Core Svelte scanning
// ---------------------------------------------------------------------------
function scanSvelteFile(relPath: string, content: string, shouldFix: boolean) {
  const lines = content.split("\n");
  let inCodeBlock = false;
  let fixed = content;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Legacy $: reactivity
    if (
      /\$\s*:(?!.*(\$state|\$derived|\$effect|\$props|\$bindable))/.test(line)
    ) {
      report(
        relPath,
        i + 1,
        "svelte5-legacy",
        "Legacy $: — use $derived() / $effect() instead",
        "error",
      );
    }

    // Accessibility — interactive elements without accessible names
    const tagMatch = line.match(/<(button|input|select|textarea|a)\b/i);
    if (tagMatch) {
      // Skip Svelte components (PascalCase tags)
      const afterLt = line.slice(line.indexOf("<") + 1, line.indexOf("<") + 10);
      if (/^[A-Z]/.test(afterLt)) continue;
      const combined = lines.slice(i, Math.min(i + 10, lines.length)).join(" ");
      if (
        !/(aria-label|aria-labelledby|id\s*=|for\s*=|role\s*=)/i.test(combined)
      ) {
        report(
          relPath,
          i + 1,
          "accessibility",
          "Interactive element may lack accessible name (aria-label or id)",
          "warning",
        );
      }
    }

    // Directional Tailwind → logical properties
    const dirRegex =
      /(?:^|\s)(pl|pr|ml|mr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)(?=-\d|\[|\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = dirRegex.exec(line)) !== null) {
      const cls = m[0].trim();
      report(
        relPath,
        i + 1,
        "rtl",
        `"${cls}" → use logical properties (ps-/pe-/ms-/me-/start-/end-)`,
        "warning",
        true,
      );
      if (shouldFix) {
        for (const [from, to] of Object.entries(RTL_MAP)) {
          if (cls.startsWith(from)) {
            const newCls = cls.replace(from, to);
            const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            fixed = fixed.replace(new RegExp(`\\b${escaped}\\b`, "g"), newCls);
            break;
          }
        }
      }
    }
  }

  // Legacy svelte/store import
  if (/from\s+["']svelte\/store["']/.test(content)) {
    report(
      relPath,
      0,
      "svelte5-legacy",
      "Legacy svelte/store — migrate to Svelte 5 runes",
      "error",
    );
  }

  // Unsafe {@html} without sanitization
  for (const m of content.matchAll(/\{@html\s+([^}]+?)\}/g)) {
    const expr = m[1].trim();
    if (
      /sanitize|DOMPurify|escape|safeHtml|marked\.|he\.|parseMD|getDisplayValue|getStatusText|getFieldComponentHtml|userContent|body/i.test(
        expr,
      )
    )
      continue;
    const lineNo = content.substring(0, m.index!).split("\n").length;
    report(
      relPath,
      lineNo,
      "security-html",
      `Unsafe {@html ${expr.slice(0, 50)}...}`,
      "error",
    );
  }

  // Apply RTL fixes
  if (shouldFix && fixed !== content) {
    writeFileSync(join(ROOT, relPath), fixed, "utf8");
    console.log(` ✅ Fixed RTL: ${relPath}`);
  }
}

// ---------------------------------------------------------------------------
// Other checks
// ---------------------------------------------------------------------------
function scanTodos(relPath: string, content: string) {
  const matches = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi);
  if (matches && matches.length >= MAX_TODOS_PER_FILE) {
    report(
      relPath,
      0,
      "slop-accumulation",
      `${matches.length} TODO/FIXME comments`,
      "info",
    );
  }
}

const dupeMap = new Map<string, string[]>();

function checkDuplicateContent(relPath: string, content: string) {
  const norm = content
    .replace(/\s+/g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .slice(0, 5000);

  if (norm.length < 300) return;
  if (dupeMap.has(norm)) {
    report(
      relPath,
      0,
      "copy-paste",
      `Highly similar content to: ${dupeMap.get(norm)!.join(", ")}`,
      "warning",
    );
  } else {
    dupeMap.set(norm, [relPath]);
  }
}

function checkFileNaming(relPath: string) {
  if (/[A-Z]/.test(basename(relPath)) && relPath.endsWith(".svelte")) {
    report(
      relPath,
      0,
      "naming",
      "Prefer kebab-case for .svelte files",
      "warning",
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const isStrict = argv.includes("--strict");
  const shouldFix = argv.includes("--fix");
  const filesIdx = argv.indexOf("--files");
  const targetFiles = filesIdx !== -1 ? argv.slice(filesIdx + 1) : null;

  console.log("🔍 Slop Scanner — Svelte-specific & AI-slop checks\n");

  const svelteFiles: string[] = [];
  const tsFiles: string[] = [];

  if (targetFiles?.length) {
    for (const f of targetFiles) {
      const full = join(ROOT, f);
      if (existsSync(full)) {
        (f.endsWith(".svelte") ? svelteFiles : tsFiles).push(full);
      }
    }
  } else {
    for (const f of walkFiles(SRC, [".svelte", ".ts", ".js"])) {
      (f.endsWith(".svelte") ? svelteFiles : tsFiles).push(f);
    }
  }

  console.log(
    `📂 Scanning ${svelteFiles.length} Svelte + ${tsFiles.length} TS/JS files\n`,
  );

  // Svelte files
  for (const file of svelteFiles) {
    try {
      const content = readFileSync(file, "utf8");
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      scanSvelteFile(rel, content, shouldFix);
      scanTodos(rel, content);
      checkFileNaming(rel);
      checkDuplicateContent(rel, content);
      if (statSync(file).size > MAX_FILE_SIZE) {
        report(
          rel,
          0,
          "file-size",
          `Large file (${(statSync(file).size / 1024).toFixed(0)}KB)`,
          "warning",
        );
      }
    } catch (e) {
      console.warn(`⚠️ Could not read ${file}`);
    }
  }

  // TS files
  for (const file of tsFiles) {
    try {
      const content = readFileSync(file, "utf8");
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      scanTodos(rel, content);
      checkFileNaming(rel);
      checkDuplicateContent(rel, content);
    } catch {
      /* skip */
    }
  }

  // Summary
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const infos = violations.filter((v) => v.severity === "info");

  console.log(
    `📊 Results: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos\n`,
  );

  if (errors.length) {
    console.log("━".repeat(60) + "\n❌ ERRORS:\n" + "━".repeat(60));
    errors
      .slice(0, 30)
      .forEach((v) =>
        console.log(` ${v.file}:${v.line} [${v.category}] ${v.message}`),
      );
    if (errors.length > 30) console.log(` ... +${errors.length - 30} more`);
  }

  if (warnings.length) {
    console.log("\n" + "━".repeat(60) + "\n⚠️ WARNINGS:\n" + "━".repeat(60));
    warnings
      .slice(0, 20)
      .forEach((v) =>
        console.log(` ${v.file}:${v.line} [${v.category}] ${v.message}`),
      );
    if (warnings.length > 20) console.log(` ... +${warnings.length - 20} more`);
  }

  if (shouldFix) console.log("\n🛠️  RTL auto-fixes applied where possible.");

  if (isStrict && errors.length > 0) {
    console.log(`\n❌ Strict mode failed — ${errors.length} errors found.`);
    process.exit(1);
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("\n✅ No slop detected. Clean!");
  } else if (errors.length === 0) {
    console.log(`\n⚠️  Only warnings — review above.`);
  }
}

main().catch((err) => {
  console.error("Slop scanner crashed:", err);
  process.exit(1);
});

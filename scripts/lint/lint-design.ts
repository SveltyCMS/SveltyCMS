/**
 * @file scripts/lint/lint-design.ts
 * @description Unified design system linter for SveltyCMS.
 *
 * Combines:
 * 1. Dead/legacy class detection (Skeleton `variant-*`, range tokens `-600-300`, misspelled `preset-outline-*`)
 * 2. Tailwind v4 preset token resolution (verifies every `preset-*-*` class resolves to CSS or `@source inline` safelist)
 * 3. Dynamic color preset safelist verification (Tailwind JIT coverage for dynamic interpolations)
 * 4. AdminCard prop guard (enforces `--admin-*` inline token contract by blocking `variant` / `preset` on `<AdminCard>`)
 *
 * Usage:
 *   bun run scripts/lint/lint-design.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, relative } from "node:path";

interface Offense {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

const root = process.cwd();
const argv = process.argv.slice(2);
const QUIET =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  argv.includes("--quiet") ||
  argv.includes("--ci");

const CSS_FILES = ["src/app.css", "src/utilities.css"];
const SCAN_EXT = new Set([".svelte", ".ts", ".js"]);

// ── 1. DEAD / LEGACY CLASS PATTERNS ──────────────────────────────────────────

const DEAD_CLASS_PATTERNS = [
  {
    regex: /\bpreset-outline-(?:surface|primary|secondary|tertiary|success|warning|error)\b/g,
    reason: "Misspelled preset: use 'preset-outlined-*' (with 'ed') instead.",
  },
  {
    regex: /\bpreset-outline\b(?!d)/g,
    reason: "Incomplete preset utility: use 'preset-outlined-surface-500' instead.",
  },
  {
    regex:
      /\bvariant-(?:filled|soft|ringed|glass|primary|secondary|tertiary|surface|success|warning|error)\b/g,
    reason: "Legacy Skeleton variant class has no matching CSS rules in Tailwind v4.",
  },
  {
    regex:
      /\b(?:bg|text|border|ring|divide|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|placeholder)-(?:surface|primary|secondary|tertiary|success|warning|error)-\d{2,3}-\d{3}\b/g,
    reason:
      "Legacy Skeleton range token (e.g. '-600-300' = light/dark pair) has no CSS rules in Tailwind v4. Use an explicit pair: 'text-surface-600 dark:text-surface-300'.",
  },
];

// ── 2. PRESET TOKEN RESOLUTION HELPERS ───────────────────────────────────────

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]*)\}/);
  if (!match) return [pattern];
  const [token, body] = match;
  return body.split(",").flatMap((option) => expandBraces(pattern.replace(token, option.trim())));
}

function collectDefinedPresets(): Set<string> {
  const defined = new Set<string>();
  for (const file of CSS_FILES) {
    const full = join(root, file);
    if (!existsSync(full)) continue;
    const css = readFileSync(full, "utf8");

    // @utility preset-filled-primary-500 { ... }
    for (const m of css.matchAll(/@utility\s+([A-Za-z0-9_-]+)/g)) defined.add(m[1]);

    // plain class selectors: .preset-custom { ... }
    for (const m of css.matchAll(/^\s*\.([A-Za-z0-9_-]+)\s*[,{]/gm)) defined.add(m[1]);

    // @source inline("preset-{filled,tonal}-{primary,error}-500")
    for (const m of css.matchAll(/@source\s+inline\(\s*["']([^"']+)["']\s*\)/g)) {
      for (const name of expandBraces(m[1])) defined.add(name.replace(/^dark:/, ""));
    }
  }
  return defined;
}

function* walkDir(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".svelte-kit" ||
        entry.name === "paraglide"
      )
        continue;
      yield* walkDir(full);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (SCAN_EXT.has(ext)) yield full;
    }
  }
}

// ── 3. RUN UNIFIED LINT ──────────────────────────────────────────────────────

function runDesignLint(): void {
  const definedPresets = collectDefinedPresets();
  const deadClassOffenses: Offense[] = [];
  const unresolvedPresetOffenses: Array<{ file: string; line: number; name: string }> = [];
  const cardViolations: string[] = [];

  // `AdminCard` must omit `variant`/`preset` so the `--admin-*` token path applies
  const ADMINCARD_EXEMPT = new Set(["design-system-preview.svelte"]);
  const ADMINCARD_RE = /<AdminCard\b[^>]*>/g;

  // Verify dynamic color recipes
  const DYNAMIC_COLORS = [
    "primary",
    "secondary",
    "tertiary",
    "success",
    "warning",
    "error",
    "surface",
  ];
  const DYNAMIC_REQUIRED: string[] = [];
  for (const color of DYNAMIC_COLORS) {
    DYNAMIC_REQUIRED.push(
      `preset-filled-${color}-500`,
      `preset-outlined-${color}-500`,
      `preset-ghost-${color}-500`,
      `preset-tonal-${color}`,
    );
  }
  const missingDynamic = DYNAMIC_REQUIRED.filter((n) => !definedPresets.has(n));

  for (const file of walkDir(join(root, "src"))) {
    if (file.endsWith(".css") || file.includes("lint-design")) continue;

    const relPath = relative(root, file)
      .replace(/^[/\\]/, "")
      .replaceAll("\\", "/");
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");

    // AdminCard check (svelte files only)
    if (file.endsWith(".svelte") && !ADMINCARD_EXEMPT.has(basename(file))) {
      for (const m of content.matchAll(ADMINCARD_RE)) {
        const tag = m[0];
        if (!/\bvariant=/.test(tag) && !/\bpreset=/.test(tag)) continue;
        const lineNum = content.slice(0, m.index).split("\n").length;
        const attr = [
          /\bvariant=["'{]?[\w-]+["'}]*/.exec(tag),
          /\bpreset=["'{]?[\w-]+["'}]*/.exec(tag),
        ]
          .filter(Boolean)
          .map((x) => x![0])
          .join(" ");
        cardViolations.push(`${relPath}:${lineNum}  ${attr}`);
      }
    }

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();
      // Skip comment lines
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
        return;
      }

      // Check dead class patterns
      for (const pattern of DEAD_CLASS_PATTERNS) {
        if (pattern.regex.test(lineText)) {
          deadClassOffenses.push({
            file: relPath,
            line: lineNum,
            snippet: trimmed,
            reason: pattern.reason,
          });
        }
      }

      // Check unresolved preset-*-* tokens (preset-recipe-hue[-shade])
      for (const m of lineText.matchAll(/\bpreset-[a-z]+-[a-z0-9-]+/g)) {
        const name = m[0];
        if (name.includes("$")) continue;
        if (definedPresets.has(name)) continue;
        unresolvedPresetOffenses.push({ file: relPath, line: lineNum, name });
      }
    });
  }

  let hasError = false;

  // Report dead classes
  if (deadClassOffenses.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Found ${deadClassOffenses.length} dead or invalid CSS class occurrence(s):\n`,
    );
    for (const o of deadClassOffenses) {
      console.error(`  ${o.file}:${o.line}`);
      console.error(`    Snippet: ${o.snippet}`);
      console.error(`    Reason:  ${o.reason}\n`);
    }
  }

  // Report unresolved presets
  if (unresolvedPresetOffenses.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Found ${unresolvedPresetOffenses.length} reference(s) to undefined preset classes:\n`,
    );
    for (const o of unresolvedPresetOffenses) {
      console.error(
        `  ${o.file}:${o.line} — '${o.name}' is not defined in app.css or utilities.css`,
      );
    }
  }

  // Report AdminCard violations
  if (cardViolations.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Found ${cardViolations.length} AdminCard prop violation(s) (omit variant/preset):`,
    );
    for (const v of cardViolations) console.error(`    ${v}`);
  }

  // Report missing dynamic definitions
  if (missingDynamic.length > 0) {
    hasError = true;
    console.error(`\n❌ Missing dynamic color recipes in safelist: ${missingDynamic.join(", ")}`);
  }

  if (hasError) {
    process.exit(1);
  }

  if (!QUIET) {
    console.log(
      `✅ Design lint OK — ${definedPresets.size} preset utilities defined, 0 dead classes, 0 card violations.`,
    );
  }
}

runDesignLint();

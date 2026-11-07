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
 * The pure `findDesignViolations()` core takes the sources and the two Tailwind
 * entry stylesheets as input, so `scripts/check/run-source-lints.ts` can run it
 * over the shared workspace read instead of this script reading the tree again.
 *
 * Usage:
 *   bun run scripts/lint/lint-design.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - Pure `findDesignViolations()` core (four violation groups, no disk access)
 * - `loadDesignCssSources()` / CLI walker for the standalone run
 * - Same report text and exit behaviour as before the extraction
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

export interface DesignSourceFile {
  /** Project-relative POSIX path, e.g. `src/routes/login/+page.svelte`. */
  path: string;
  source: string;
}

export interface DesignOffense {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

export interface DesignUnresolvedPreset {
  file: string;
  line: number;
  name: string;
}

export interface DesignCardViolation {
  file: string;
  line: number;
  /** The offending `variant` / `preset` attributes, e.g. `variant="filled"`. */
  attribute: string;
}

export interface DesignLintResult {
  ok: boolean;
  definedPresetCount: number;
  deadClassOffenses: DesignOffense[];
  unresolvedPresetOffenses: DesignUnresolvedPreset[];
  cardViolations: DesignCardViolation[];
  missingDynamic: string[];
}

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

function collectDefinedPresets(cssSources: readonly DesignSourceFile[]): Set<string> {
  const defined = new Set<string>();
  for (const file of cssSources) {
    const css = file.source;

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

/** Reads the two Tailwind entry stylesheets that define the preset tokens. */
export function loadDesignCssSources(root = process.cwd()): DesignSourceFile[] {
  const sources: DesignSourceFile[] = [];
  for (const path of CSS_FILES) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    sources.push({ path, source: readFileSync(full, "utf8") });
  }
  return sources;
}

/** Reads every `src/**\/*.{svelte,ts,js}` file for the standalone CLI. */
export function loadDesignSources(root = process.cwd()): DesignSourceFile[] {
  return [...walkDir(join(root, "src"))].map((full) => ({
    path: relative(root, full)
      .replace(/^[/\\]/, "")
      .replaceAll("\\", "/"),
    source: readFileSync(full, "utf8"),
  }));
}

// ── 3. RUN UNIFIED LINT ──────────────────────────────────────────────────────

/**
 * Pure core — returns the same four violation groups the standalone script
 * reports. `sources` is `src/**\/*.{svelte,ts,js}` (Paraglide output excluded);
 * `cssSources` supplies the `preset-*` token definitions.
 */
export function findDesignViolations(
  sources: readonly DesignSourceFile[],
  cssSources: readonly DesignSourceFile[] = [],
): DesignLintResult {
  // The patterns are module-level and global; zero the scan cursor so repeated
  // in-process calls (the aggregated gate) start every run from position 0.
  for (const pattern of DEAD_CLASS_PATTERNS) pattern.regex.lastIndex = 0;

  const definedPresets = collectDefinedPresets(cssSources);
  const deadClassOffenses: DesignOffense[] = [];
  const unresolvedPresetOffenses: DesignUnresolvedPreset[] = [];
  const cardViolations: DesignCardViolation[] = [];

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

  for (const file of sources) {
    if (file.path.endsWith(".css") || file.path.includes("lint-design")) continue;

    const relPath = file.path;
    const content = file.source;
    const lines = content.split("\n");

    // AdminCard check (svelte files only)
    if (file.path.endsWith(".svelte") && !ADMINCARD_EXEMPT.has(basename(file.path))) {
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
        cardViolations.push({ file: relPath, line: lineNum, attribute: attr });
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

  return {
    ok:
      deadClassOffenses.length === 0 &&
      unresolvedPresetOffenses.length === 0 &&
      cardViolations.length === 0 &&
      missingDynamic.length === 0,
    definedPresetCount: definedPresets.size,
    deadClassOffenses,
    unresolvedPresetOffenses,
    cardViolations,
    missingDynamic,
  };
}

// ── 4. CLI ───────────────────────────────────────────────────────────────────

function reportDesignLint(result: DesignLintResult): boolean {
  let hasError = false;

  // Report dead classes
  if (result.deadClassOffenses.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Found ${result.deadClassOffenses.length} dead or invalid CSS class occurrence(s):\n`,
    );
    for (const o of result.deadClassOffenses) {
      console.error(`  ${o.file}:${o.line}`);
      console.error(`    Snippet: ${o.snippet}`);
      console.error(`    Reason:  ${o.reason}\n`);
    }
  }

  // Report unresolved presets
  if (result.unresolvedPresetOffenses.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Found ${result.unresolvedPresetOffenses.length} reference(s) to undefined preset classes:\n`,
    );
    for (const o of result.unresolvedPresetOffenses) {
      console.error(
        `  ${o.file}:${o.line} — '${o.name}' is not defined in app.css or utilities.css`,
      );
    }
  }

  // Report AdminCard violations
  if (result.cardViolations.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Found ${result.cardViolations.length} AdminCard prop violation(s) (omit variant/preset):`,
    );
    for (const v of result.cardViolations) {
      console.error(`    ${v.file}:${v.line}  ${v.attribute}`);
    }
  }

  // Report missing dynamic definitions
  if (result.missingDynamic.length > 0) {
    hasError = true;
    console.error(
      `\n❌ Missing dynamic color recipes in safelist: ${result.missingDynamic.join(", ")}`,
    );
  }

  return hasError;
}

function main(): void {
  const quiet =
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.argv.includes("--quiet") ||
    process.argv.includes("--ci");

  const result = findDesignViolations(loadDesignSources(), loadDesignCssSources());

  if (reportDesignLint(result)) {
    process.exit(1);
  }

  if (!quiet) {
    console.log(
      `✅ Design lint OK — ${result.definedPresetCount} preset utilities defined, 0 dead classes, 0 card violations.`,
    );
  }
}

if (import.meta.main) main();

/**
 * @file scripts/lint/lint-css-tokens.ts
 * @description Proves the design tokens a component references can actually exist at runtime.
 *
 * Two failures are invisible to `tsc` and to a snapshot test, and both shipped:
 *
 * 1. **Unemitted palette** — Tailwind v4 only emits the theme variables a
 *    generated utility references. A `@theme { --color-… }` block therefore
 *    drops every shade that is only reached through `var()` indirection (theme
 *    recipes, inline `style="fill: var(--color-tertiary-500)"`, the image
 *    editor's local aliases). `@theme static` emits the whole block. The
 *    2026-11-13 audit found eight transparent categories from this.
 * 2. **Undefined token** — `var(--color-primary)` when the palette only defines
 *    `--color-primary-500`. The browser silently falls back, so the page renders
 *    with an inherited colour instead of the intended one. Found in the public
 *    site publisher's nav hover.
 *
 * Scope is deliberately the `--color-*` namespace: it is the design-token
 * surface with a fixed, enumerated definition list. Component-local scratch
 * variables (`--editor-*`, `--mc-*`, `--progress`, …) are set inline at runtime
 * and cannot be verified statically.
 *
 * Dynamic references (`var(--color-${shade}-500)`, or a name ending in `-` that
 * is concatenated) are skipped — there is no literal token to resolve.
 *
 * Usage:
 *   bun run scripts/lint/lint-css-tokens.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toPosix } from "./lib/source-files";
import type { SourceFile } from "./lib/source-files";

export interface CssTokenOffense {
  file: string;
  line: number;
  token: string;
  reason: string;
}

/** Stylesheets that declare theme tokens. Mirrors `lint-design`'s CSS_FILES. */
export const TOKEN_CSS_FILES: readonly string[] = ["src/app.css", "src/utilities.css"];

const COLOR_DEFINITION = /(--color-[a-z0-9-]+)\s*:/g;
const COLOR_REFERENCE = /var\(\s*(--color[a-z0-9-]*)/g;
const THEME_BLOCK = /@theme\b([^{]*)\{/g;
/** A resolvable name has a dash-terminated prefix and at least one segment. */
const COMPLETE_TOKEN = /^--color-[a-z0-9-]+$/;

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor++) {
    if (source.charCodeAt(cursor) === 10) line++;
  }
  return line;
}

/** A fragment (`var(--color-${shade}-500)`, `--color-primary-`) has no literal to resolve. */
function isCompleteToken(token: string): boolean {
  return !token.endsWith("-") && COMPLETE_TOKEN.test(token);
}

/** Every `--color-*` name declared in the given stylesheets. */
export function collectColorTokens(css: readonly SourceFile[]): Map<string, string> {
  const declared = new Map<string, string>();
  for (const file of css) {
    for (const match of file.source.matchAll(COLOR_DEFINITION)) {
      const token = match[1];
      if (!declared.has(token)) declared.set(token, file.path);
    }
  }
  return declared;
}

/**
 * `@theme` blocks that declare a color ramp without the `static` modifier.
 *
 * Non-static blocks are only safe for tokens every consumer reaches through a
 * generated utility; the palette is reached through `var()` indirection, so the
 * whole ramp must be emitted.
 */
export function findNonStaticThemeBlocks(css: readonly SourceFile[]): CssTokenOffense[] {
  const offenses: CssTokenOffense[] = [];

  for (const file of css) {
    for (const match of file.source.matchAll(THEME_BLOCK)) {
      const modifiers = match[1] ?? "";
      if (/\bstatic\b/.test(modifiers)) continue;

      const openBrace = (match.index ?? 0) + match[0].length - 1;
      let depth = 0;
      let closeBrace = file.source.length;
      for (let cursor = openBrace; cursor < file.source.length; cursor++) {
        const char = file.source[cursor];
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) {
            closeBrace = cursor;
            break;
          }
        }
      }

      const body = file.source.slice(openBrace, closeBrace);
      const firstColor = /--color-[a-z0-9-]+\s*:/.exec(body);
      if (!firstColor) continue;

      offenses.push({
        file: file.path,
        line: lineOf(file.source, match.index ?? 0),
        token: firstColor[0].slice(0, -1).trim(),
        reason:
          "color ramp declared in a non-static @theme block is not always emitted — use `@theme static`",
      });
    }
  }

  return offenses;
}

/** `var(--color-…)` references no stylesheet (or the same file) declares. */
export function findUndefinedColorTokens(
  files: readonly SourceFile[],
  css: readonly SourceFile[],
): CssTokenOffense[] {
  const declared = collectColorTokens(css);
  const offenses: CssTokenOffense[] = [];

  for (const file of files) {
    // A component may define its tokens in a scoped `<style>` block or, like the
    // static publisher, in the same template literal it renders.
    const localDefinitions = new Set(
      [...file.source.matchAll(COLOR_DEFINITION)].map((match) => match[1]),
    );

    for (const match of file.source.matchAll(COLOR_REFERENCE)) {
      const token = match[1];
      if (!isCompleteToken(token)) continue;
      if (declared.has(token) || localDefinitions.has(token)) continue;

      offenses.push({
        file: file.path,
        line: lineOf(file.source, match.index ?? 0),
        token,
        reason: `var(${token}) is not declared in ${TOKEN_CSS_FILES.join(" or ")} — the browser falls back silently`,
      });
    }
  }

  return offenses;
}

/** Both rules over one workspace view. */
export function findCssTokenOffenses(
  files: readonly SourceFile[],
  css: readonly SourceFile[],
): CssTokenOffense[] {
  return [...findNonStaticThemeBlocks(css), ...findUndefinedColorTokens(files, css)];
}

export function loadTokenCssSources(root = process.cwd()): SourceFile[] {
  const sources: SourceFile[] = [];
  for (const path of TOKEN_CSS_FILES) {
    const full = join(root, path);
    if (!existsSync(full)) continue;
    sources.push({ path, source: readFileSync(full, "utf8") });
  }
  return sources;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(svelte|ts|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const root = process.cwd();
  const files = walk(join(root, "src")).map((full) => ({
    path: toPosix(full.slice(root.length + 1)),
    source: readFileSync(full, "utf8"),
  }));
  const css = loadTokenCssSources(root);
  const offenses = findCssTokenOffenses(files, css);

  if (offenses.length === 0) {
    if (!quiet) {
      console.log(
        `✅ CSS tokens: ${collectColorTokens(css).size} color tokens emitted and resolvable (${files.length} files).`,
      );
    }
    return;
  }

  console.error(`❌ CSS token drift: ${offenses.length}`);
  for (const offense of offenses) {
    console.error(`   ${offense.file}:${offense.line} — ${offense.reason}`);
  }
  process.exitCode = 1;
}

if (import.meta.main) main();

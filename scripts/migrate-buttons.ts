#!/usr/bin/env bun
/**
 * @file scripts/migrate-buttons.ts
 * @description
 * Migrates raw <button class="btn ..."> elements to native <Button variant="..."> components.
 *
 * Handles:
 * - preset-filled-*, preset-outlined-*, preset-tonal-*, preset-ghost-* → variant prop
 * - btn-sm / btn-lg → size prop
 * - btn-icon buttons → keeps layout classes, adds p-0! min-w-0
 * - class:opacity-50 (invalid on components) → removed (Button handles via disabled)
 * - Adding import if not already present
 * - Skipping files with scoped CSS that redefines .btn
 *
 * Usage:
 *   bun run scripts/migrate-buttons.ts            # transform in place
 *   bun run scripts/migrate-buttons.ts --dry-run  # preview only
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const isDryRun = process.argv.includes("--dry-run");
const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");

// ─── Files to skip ───────────────────────────────────────────────────────────
// These use scoped <style> blocks that define their own .btn rules,
// or are the Button component itself.
const SKIP_CONTAINS: string[] = [
  "components/ui/button.svelte",
  "image-editor/widgets/rotate/controls.svelte",
  "image-editor/widgets/watermark/controls.svelte",
  "image-editor/widgets/zoom/controls.svelte",
  "image-editor/widgets/focal-point/controls.svelte",
];

// ─── Variant detection (order matters — most specific first) ──────────────────
const VARIANT_RULES: [RegExp, string][] = [
  [/preset-filled-error|variant-filled-error/i, "error"],
  [/preset-filled-warning|variant-filled-warning/i, "warning"],
  [/preset-filled-success/i, "success"],
  [/preset-filled-tertiary/i, "tertiary"],
  [/preset-filled-secondary/i, "secondary"],
  [/preset-filled-surface/i, "surface"],
  [/preset-filled-primary|variant-filled-primary/i, "primary"],
  [/preset-outlined-error/i, "error"],
  [/preset-outlined-warning/i, "warning"],
  [/preset-outlined-primary/i, "primary"],
  [/preset-outlined-tertiary/i, "tertiary"],
  [/preset-outlined/i, "outline"],
  [/preset-tonal-error/i, "error"],
  [/preset-tonal-warning/i, "warning"],
  [/preset-tonal-success/i, "success"],
  [/preset-tonal-primary/i, "primary"],
  [/preset-tonal-tertiary/i, "tertiary"],
  [/preset-tonal-surface/i, "surface"],
  [/preset-tonal/i, "surface"],
  [/preset-ghost-error/i, "ghost"],
  [/preset-ghost/i, "ghost"],
  [/variant-ghost-surface|variant-ghost/i, "ghost"],
  [/variant-ringed/i, "outline"],
  [/variant-soft/i, "surface"],
];

function detectVariant(cls: string): string {
  for (const [re, v] of VARIANT_RULES) {
    if (re.test(cls)) return v;
  }
  if (/btn-icon/.test(cls)) return "ghost";
  return "outline";
}

function detectSize(cls: string): string | null {
  if (/\bbtn-sm\b/.test(cls)) return "sm";
  if (/\bbtn-lg\b/.test(cls)) return "lg";
  if (/\bbtn-xl\b/.test(cls)) return "xl";
  return null;
}

// Classes the Button component internalises — strip them from the class prop
const STRIP_RES: RegExp[] = [
  /\bbtn(?:-sm|-md|-lg|-xl|-icon(?:-sm)?)?\b/g,
  /\bpreset-(?:filled|outlined|tonal|ghost)-[\w-]+\b/g,
  /\bvariant-(?:filled|outlined|ghost|tonal|ringed|soft)-[\w-]+\b/g,
  /\bcursor-pointer\b/g,
  /\bcursor-not-allowed\b/g,
  /\bdisabled:opacity-\d+\b/g,
  /\bdisabled:cursor-not-allowed\b/g,
  /\bactive:scale-\[[\d.]+\]\b/g,
  /\binline-flex\b/g,
  /\bfont-bold\b/g,
  /\btracking-tight\b/g,
  /\btransition-colors\b/g,
  /\bduration-200\b/g,
];

function stripBtnClasses(cls: string): string {
  let s = cls;
  for (const re of STRIP_RES) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ").trim();
}

// ─── Tag parser ───────────────────────────────────────────────────────────────

interface BtnTag {
  start: number;
  end: number; // exclusive — points past '>'
  attrs: string; // content between '<button' and '>'
}

/** Find all <button…> opening tags via a character-level parser that handles nested braces/quotes. */
function findButtonTags(content: string): BtnTag[] {
  const results: BtnTag[] = [];
  let i = 0;

  while (i < content.length) {
    const idx = content.indexOf("<button", i);
    if (idx === -1) break;

    // Ensure it is truly <button (not <button-foo or inside </button>)
    const ch = content[idx + 7];
    if (ch && /[\w-]/.test(ch)) {
      i = idx + 1;
      continue;
    }

    // Walk to the closing '>' of the opening tag
    let j = idx + 7;
    let inDouble = false;
    let inSingle = false;
    let braceDepth = 0;

    while (j < content.length) {
      const c = content[j];
      if (inDouble) {
        if (c === '"') inDouble = false;
      } else if (inSingle) {
        if (c === "'") inSingle = false;
      } else if (braceDepth > 0) {
        if (c === "{") braceDepth++;
        else if (c === "}") braceDepth--;
      } else {
        if (c === '"') inDouble = true;
        else if (c === "'") inSingle = true;
        else if (c === "{") braceDepth++;
        else if (c === ">") break;
      }
      j++;
    }

    if (j < content.length && content[j] === ">") {
      results.push({ start: idx, end: j + 1, attrs: content.slice(idx + 7, j) });
    }
    i = idx + 1;
  }

  return results;
}

/** Returns true if the given position sits inside a <script> or <style> block. */
function inScriptOrStyle(content: string, pos: number): boolean {
  for (const tag of ["<script", "<style"] as const) {
    const start = content.lastIndexOf(tag, pos);
    if (start === -1) continue;
    const closeTag = tag === "<script" ? "</script>" : "</style>";
    const close = content.indexOf(closeTag, start);
    if (close === -1 || close > pos) return true;
  }
  return false;
}

// ─── Attribute transformation ─────────────────────────────────────────────────

function transformTag(tag: BtnTag): string | null {
  const { attrs } = tag;

  // Skip if dynamic class expression: class={...}  (needs manual attention)
  if (/\bclass=\{/.test(attrs)) return null;

  const classMatch = attrs.match(/\bclass="([^"]*)"/);
  const classStr = classMatch ? classMatch[1] : "";

  // If it has custom non-preset classes and no btn/preset class, leave it alone
  if (
    classStr &&
    !classStr.includes("btn") &&
    !classStr.includes("preset-") &&
    !classStr.includes("variant-")
  ) {
    return null;
  }

  const isIconOnly = /btn-icon/.test(classStr);
  const variant = detectVariant(classStr);
  const size = detectSize(classStr);
  const remaining = stripBtnClasses(classStr);

  // Build new attrs — strip original class attr, add variant/size/class
  let newAttrs = attrs
    // Remove existing class="..."
    .replace(/\s*\bclass="[^"]*"/, "")
    // Remove class: directives (invalid on Svelte components)
    .replace(/\s*\bclass:[a-zA-Z][\w-]*=\{[^}]*\}/g, "");

  // Inject variant
  newAttrs = ` variant="${variant}"${newAttrs}`;

  // Inject size (only for non-default)
  if (size) newAttrs += ` size="${size}"`;

  // Residual classes — for icon-only buttons ensure tight layout helpers
  let finalClass = remaining;
  if (isIconOnly && !finalClass.includes("p-0")) {
    finalClass = `p-0! min-w-0 ${finalClass}`.trim();
  }
  if (finalClass) newAttrs += ` class="${finalClass}"`;

  return `<Button${newAttrs}>`;
}

// ─── Import injection ─────────────────────────────────────────────────────────

function addImport(content: string): string {
  if (
    content.includes("from '@components/ui/button.svelte'") ||
    content.includes('from "@components/ui/button.svelte"')
  )
    return content;

  const scriptMatch = content.match(/<script[^>]*>/);
  if (!scriptMatch || scriptMatch.index === undefined) return content;

  const scriptBodyStart = scriptMatch.index + scriptMatch[0].length;
  const scriptBody = content.slice(scriptBodyStart, content.indexOf("</script>", scriptBodyStart));

  // Insert after the last import statement
  const imports = [...scriptBody.matchAll(/^import .+;$/gm)];
  if (imports.length > 0) {
    const last = imports[imports.length - 1];
    if (last.index !== undefined) {
      const pos = scriptBodyStart + last.index + last[0].length;
      return (
        content.slice(0, pos) +
        "\n\timport Button from '@components/ui/button.svelte';" +
        content.slice(pos)
      );
    }
  }

  // No imports yet — insert right after opening <script> tag
  return (
    content.slice(0, scriptBodyStart) +
    "\n\timport Button from '@components/ui/button.svelte';" +
    content.slice(scriptBodyStart)
  );
}

// ─── Per-file processing ──────────────────────────────────────────────────────

interface Result {
  changed: boolean;
  skipped: boolean;
  manual: string[]; // patterns that need human attention
  transformed: number;
}

function processFile(filePath: string): Result {
  const rel = relative(ROOT, filePath).replace(/\\/g, "/");

  // Skip list
  if (SKIP_CONTAINS.some((s) => rel.includes(s)))
    return { changed: false, skipped: true, manual: [], transformed: 0 };

  const original = readFileSync(filePath, "utf-8");
  if (!/<button[\s>]/.test(original))
    return { changed: false, skipped: false, manual: [], transformed: 0 };

  // Skip files whose <style> block redefines .btn (scoped custom toolbars)
  const styleBlock = original.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (styleBlock && /^\s*\.btn\s*\{/m.test(styleBlock[1])) {
    return {
      changed: false,
      skipped: true,
      manual: [`${rel}: has scoped .btn CSS`],
      transformed: 0,
    };
  }

  const tags = findButtonTags(original);
  const manual: string[] = [];
  const txs: Array<{ start: number; end: number; text: string }> = [];

  for (const tag of tags) {
    if (inScriptOrStyle(original, tag.start)) continue;

    const transformed = transformTag(tag);
    if (transformed === null) {
      manual.push(tag.attrs.slice(0, 120).replace(/\n/g, " ").trim());
      continue;
    }
    txs.push({ start: tag.start, end: tag.end, text: transformed });
  }

  if (txs.length === 0) return { changed: false, skipped: false, manual, transformed: 0 };

  // Apply opening-tag transformations in reverse so positions stay valid
  txs.sort((a, b) => b.start - a.start);

  // --- Step 1: Find all </button> closing tags ---
  // We need to pair them with their corresponding opening tags that were converted.
  // Strategy: for each converted opening tag, find its matching </button> via a
  // simple nesting depth tracker, then record its position for replacement.

  // Build the full list of button open tags (including skipped ones) with depth info
  const allTags = findButtonTags(original);
  const convertedStarts = new Set(txs.map((t) => t.start));

  // Walk through all buttons to find matching </button> for the converted ones
  const closeTagReplacements: Array<{ start: number; end: number }> = [];

  for (const openTag of allTags) {
    if (!convertedStarts.has(openTag.start)) continue;
    if (inScriptOrStyle(original, openTag.start)) continue;

    // Find matching </button> starting from after this opening tag
    let depth = 1;
    let j = openTag.end;
    while (j < original.length && depth > 0) {
      const nextOpen = original.indexOf("<button", j);
      const nextClose = original.indexOf("</button>", j);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        j = nextOpen + 7;
      } else {
        depth--;
        if (depth === 0) {
          closeTagReplacements.push({ start: nextClose, end: nextClose + 9 }); // '</button>'.length === 9
        }
        j = nextClose + 9;
      }
    }
  }

  // Apply all transformations (opening + closing) in reverse order
  const allReplacements: Array<{ start: number; end: number; text: string }> = [
    ...txs.map((t) => ({ start: t.start, end: t.end, text: t.text })),
    ...closeTagReplacements.map((c) => ({ start: c.start, end: c.end, text: "</Button>" })),
  ];
  allReplacements.sort((a, b) => b.start - a.start);

  let content = original;
  for (const r of allReplacements) {
    content = content.slice(0, r.start) + r.text + content.slice(r.end);
  }

  // Add import
  content = addImport(content);

  const changed = content !== original;
  if (changed && !isDryRun) {
    writeFileSync(filePath, content, "utf-8");
  }

  return { changed, skipped: false, manual, transformed: txs.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const glob = new Bun.Glob("**/*.svelte");
const files = [...glob.scanSync({ cwd: SRC, absolute: true })];

let changedCount = 0;
let skippedCount = 0;
let totalTransformed = 0;
const manualFiles: Record<string, string[]> = {};

for (const file of files.sort()) {
  const r = processFile(file);
  if (r.skipped) {
    skippedCount++;
    continue;
  }
  if (r.changed) {
    changedCount++;
    totalTransformed += r.transformed;
    if (!isDryRun) console.log(`✅ ${relative(SRC, file)} (+${r.transformed})`);
  }
  if (r.manual.length > 0) {
    manualFiles[relative(SRC, file)] = r.manual;
  }
}

console.log(`\n${"─".repeat(60)}`);
if (isDryRun) console.log("DRY RUN — no files written");
console.log(`✅  Files changed:   ${changedCount}`);
console.log(`🔀  Tags converted:  ${totalTransformed}`);
console.log(`⏭️   Files skipped:   ${skippedCount}`);
console.log(`⚠️   Need manual:     ${Object.keys(manualFiles).length} files`);

if (Object.keys(manualFiles).length > 0) {
  console.log("\n⚠️  Manual review required (dynamic class or complex patterns):");
  for (const [file, items] of Object.entries(manualFiles)) {
    console.log(`\n  📄 ${file}`);
    for (const item of items) {
      console.log(`     - ${item}`);
    }
  }
}

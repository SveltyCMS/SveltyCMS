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
 * bun run scripts/slop-scanner.ts --strict        # Fail-closed (exits 1 on error/warning)
 * bun run scripts/slop-scanner.ts --files file.svelte # Check target file(s)
 */

import { existsSync, globSync } from "node:fs";
import fs from "node:fs/promises";
import { basename, isAbsolute, join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = join(import.meta.dirname, "..");
const MAX_FILE_SIZE = 400_000;
const MAX_TODOS_PER_FILE = 6;
const SUPPRESS_FILE = join(ROOT, ".slop-suppress.json");
/** Print cap per section (raise via SLOP_PRINT_CAP for full inventories). */
const PRINT_CAP = Math.max(0, Number(process.env.SLOP_PRINT_CAP ?? 25) || 25);

// Suppressed files/categories to suppress known legacy exceptions
const SUPPRESS: { file: string; category: string }[] = [];

/** Directory names that are generated output or dependencies and must be skipped. */
const EXCLUDED_SEGMENTS = new Set(["node_modules", ".svelte-kit", "paraglide", "dist", "build"]);

/**
 * Returns true when a path points into a generated/dependency directory.
 *
 * Matches on whole path segments (never substrings) so feature directories whose
 * names merely *contain* an excluded word — e.g. `collectionbuilder/` or
 * `workflow-builder.svelte` — are still scanned, while real `build/`/`dist/`
 * output trees are skipped.
 */
export function isExcludedPath(pathLike: string | URL): boolean {
  const normalized = String(pathLike).replace(/\\/g, "/");
  return normalized.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

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

export interface Violation {
  file: string;
  line: number;
  category: string;
  message: string;
  severity: "error" | "warning" | "info";
  fixable?: boolean;
}

/** Valid Button variants per the component API. */
const VALID_BUTTON_VARIANTS = new Set([
  "primary",
  "secondary",
  "tertiary",
  "surface",
  "success",
  "warning",
  "error",
  "ghost",
  "outline",
]);

const violations: Violation[] = [];
let fixedFiles = 0;

/**
 * Records a violation. `sink` lets callers (e.g. `scanSvelteContent` for unit
 * tests) receive their own isolated violation list instead of the process-wide
 * `violations` array — repeated calls must never leak into each other.
 * Suppression entries may use `"category": "*"` to silence a whole file.
 */
function report(
  file: string,
  line: number,
  category: string,
  message: string,
  severity: "error" | "warning" | "info" = "warning",
  fixable = false,
  sink: Violation[] = violations,
) {
  const nf = file.replace(/\\/g, "/");
  if (
    SUPPRESS.some((s) => nf.includes(s.file) && (s.category === category || s.category === "*"))
  ) {
    return;
  }

  sink.push({
    file: nf,
    line,
    category,
    message,
    severity,
    fixable,
  });
}

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

/** Escapes regex metacharacters in user-derived strings. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces matched regions with newlines so line numbers stay stable. */
function blankOut(match: string): string {
  return "\n".repeat((match.match(/\n/g) || []).length);
}

/** Matches a line that opens a function, callback, effect, or event-handler body. */
const FUNCTION_SCOPE_RE =
  /(?:\bfunction\b|=>\s*\{|\bon\w*\s*[=(:]|\bonMount\b|\bonDestroy\b|\bbeforeUpdate\b|\bafterUpdate\b|\b\$effect\b)/;

/**
 * True when the line at `lineIdx` (0-based) sits inside a function/callback body.
 *
 * Walks upward with brace-depth accounting: unmatched `}` on a nearer line cancel
 * openers found further up, so a *closed* sibling function above a render-scope ID
 * never leaks its scope into the ID. Unlike a fixed look-back window this stays
 * correct for IDs generated inside long event handlers (created per call) while
 * still flagging top-level render-scope IDs.
 */
function isInsideFunctionScope(lines: string[], lineIdx: number): boolean {
  let pendingClosers = 0;
  for (let j = lineIdx - 1; j >= 0; j--) {
    const line = lines[j];
    // Walk the line right-to-left so a `}` cancels the opener to its left on the
    // same line before that opener is considered as an enclosing-block candidate.
    for (let k = line.length - 1; k >= 0; k--) {
      const ch = line[k];
      if (ch === "}") {
        pendingClosers++;
      } else if (ch === "{") {
        if (pendingClosers > 0) {
          pendingClosers--;
        } else if (FUNCTION_SCOPE_RE.test(line)) {
          return true;
        }
        // Unmatched non-function opener (if/for/try/object literal) — keep
        // walking outward, an enclosing function may still wrap it.
      }
    }
  }
  return false;
}

/**
 * Finds the end (`>`) of an opening tag inside `region`, skipping `>`
 * characters inside quoted attribute values and inside `{…}` expressions
 * (arrow functions like `onclick={() => …}`). Returns -1 when unbalanced.
 */
function findTagEnd(region: string, tagStart: number): number {
  let quote: string | null = null;
  let braceDepth = 0;
  for (let k = tagStart; k < region.length; k++) {
    const ch = region[k];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (ch === ">" && braceDepth === 0) {
      return k;
    }
  }
  return -1;
}

/**
 * Finds the index of the `}` matching the `{` at `open`, honouring nesting.
 * Returns -1 when unbalanced. Brace-matching (not single-level regexes) so
 * nested objects/functions inside `{@html …}` and `{#each …}` parse correctly.
 */
function matchBrace(content: string, open: number): number {
  let depth = 0;
  for (let i = open; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extracts `<script>…</script>` bodies with their start offsets. Code fences
 * are blanked first so script examples in documentation don't count as code.
 * The stripped string (same newline layout as the input) is returned too so
 * callers can turn body-relative offsets into file-relative line numbers.
 */
function extractScriptBodies(content: string): {
  stripped: string;
  bodies: { body: string; start: number }[];
} {
  const stripped = content.replace(/```[\s\S]*?```/g, blankOut);
  const bodies: { body: string; start: number }[] = [];
  for (const m of stripped.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    bodies.push({ body: m[1], start: m.index! + m[0].indexOf(">") + 1 });
  }
  return { stripped, bodies };
}

// ---------------------------------------------------------------------------
// RTL / Logical Properties
// ---------------------------------------------------------------------------

// Logical-property mapping for classes detected by RTL_RE below.
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
  "rounded-tl": "rounded-ts",
  "rounded-tr": "rounded-te",
  "rounded-bl": "rounded-bs",
  "rounded-br": "rounded-be",
  "float-left": "float-start",
  "float-right": "float-end",
  "clear-left": "clear-start",
  "clear-right": "clear-end",
  "scroll-pl": "scroll-ps",
  "scroll-pr": "scroll-pe",
  "scroll-ml": "scroll-ms",
  "scroll-mr": "scroll-me",
};

/** Bare words that only count as Tailwind classes when a size suffix follows. */
const RTL_REQUIRED_SUFFIX = new Set([
  "pl",
  "pr",
  "ml",
  "mr",
  "left",
  "right",
  "float-left",
  "float-right",
  "clear-left",
  "clear-right",
  "scroll-pl",
  "scroll-pr",
  "scroll-ml",
  "scroll-mr",
  "rounded-tl",
  "rounded-tr",
  "rounded-bl",
  "rounded-br",
]);

/** Complete classes that may also take a size suffix (`border-l`, `border-l-2`). */
const RTL_OPTIONAL_SUFFIX = [
  "text-left",
  "text-right",
  "border-l",
  "border-r",
  "rounded-l",
  "rounded-r",
  "divide-x",
  "space-x",
];

/** Full tokens (no safe logical autofix in Tailwind v4 yet). */
const RTL_INFO = new Set(["divide-x", "divide-x-reverse", "space-x", "space-x-reverse"]);

const RTL_ALT = [
  "divide-x-reverse",
  "space-x-reverse",
  ...RTL_REQUIRED_SUFFIX,
  ...RTL_OPTIONAL_SUFFIX,
]
  .sort((a, b) => b.length - a.length)
  .join("|");

const RTL_SUFFIX_PART = "-(?:\\[[^\\]]+\\]|\\d+(?:\\.\\d+)?|\\d+\\/\\d+|auto|full|px|0|reverse)";

/** Boundary char classes shared by RTL_RE and the autofix regex. */
const RTL_BOUNDARY_BEFORE = "[\\s\"'`:]";
const RTL_BOUNDARY_AFTER = "[\\s\"'`]";

/**
 * Matches a directional Tailwind token with:
 * - variant chains (`sm:hover:pl-4`) and negative signs (`-ml-2`),
 * - size suffixes (`pl-4`, `left-[3px]`, `rounded-tl-xl`),
 * - boundaries limited to whitespace/quotes/backticks/colons so prose words
 *   (`left` in "align left") never match (they require a suffix).
 */
const RTL_RE = new RegExp(
  `(?<=^|${RTL_BOUNDARY_BEFORE})(-?)(${RTL_ALT})(${RTL_SUFFIX_PART})?(?=${RTL_BOUNDARY_AFTER}|$)`,
  "g",
);

// ---------------------------------------------------------------------------
// Svelte file scan
// ---------------------------------------------------------------------------

async function scanSvelteFile(
  relPath: string,
  content: string,
  shouldFix: boolean,
  sink: Violation[] = violations,
) {
  const cleanContent = content.replace(/<!--([\s\S]*?)-->/g, blankOut);

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
      report(
        relPath,
        i + 1,
        "svelte5-legacy",
        "Legacy $: reactivity — migrate to runes",
        "error",
        false,
        sink,
      );
    }

    if (inScriptBlock || inStyleBlock) continue;

    // === Accessibility ===
    const tagMatch = line.match(/<(button|input|select|textarea|a)\b/i);
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();
      if (/^[A-Z]/.test(tagMatch[1])) continue; // Skip custom elements

      // Build the opening-tag region dynamically: extend it until the tag end
      // is found (brace/quote aware — cn() class templates and arrow-fn attrs
      // span many lines), capped at 30 lines.
      let region = "";
      let tagEndIdx = -1;
      for (let n = 8; n <= 30; n += 8) {
        region = lines.slice(i, Math.min(i + n, lines.length)).join("\n");
        tagEndIdx = findTagEnd(region, tagMatch.index!);
        if (tagEndIdx !== -1) break;
      }
      if (tagEndIdx === -1) continue; // malformed tag — skip

      const attrs = region.slice(tagMatch.index! + 1 + tagName.length, tagEndIdx);
      // For visible text: extend past the tag end until the closing tag
      // appears (icon+text anchors span ~15 lines with multi-line svg paths).
      let rest = region.slice(tagEndIdx + 1);
      const closeTagRe = new RegExp(`</${tagName}>`, "i");
      for (let n = 12; n <= 40 && !closeTagRe.test(rest); n += 8) {
        rest = lines
          .slice(i, Math.min(i + n, lines.length))
          .join("\n")
          .slice(tagEndIdx + 1);
      }

      // Decorative/hidden elements need no accessible name
      if (/aria-hidden\s*=\s*["'](?:true|1)["']/i.test(attrs)) continue;
      if (/role\s*=\s*["'](?:presentation|none)["']/i.test(attrs)) continue;
      // Bypass hidden inputs natively
      if (tagName === "input" && /type\s*=\s*["']?hidden["']?/i.test(attrs)) continue;

      // Only the opening tag's attributes may provide an accessible name —
      // `id=` alone is NOT a name (it needs a matching <label for>).
      let hasAccessibleName = /(?:aria-label|aria-labelledby|title)\s*=/i.test(attrs);

      // Visible text inside the element (a/button/textarea)
      if (
        !hasAccessibleName &&
        (tagName === "a" || tagName === "button" || tagName === "textarea")
      ) {
        const visible = (rest.split(closeTagRe)[0] ?? "").replace(/<[^>]*>/g, "");
        if (/[a-zA-Z0-9\u00C0-\u017F]/.test(visible)) hasAccessibleName = true;
      }

      // Label association for form controls: <label for="id"> or a wrapping label
      if (!hasAccessibleName && tagName !== "a" && tagName !== "button") {
        const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
        if (idMatch) {
          const prev = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
          if (
            new RegExp(`<label\\b[^>]*for\\s*=\\s*["']${escapeRegExp(idMatch[1])}["']`, "i").test(
              prev,
            )
          ) {
            hasAccessibleName = true;
          }
        }
        if (!hasAccessibleName) {
          // Wrapping <label>…<control>…</label> heuristic
          const prev = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
          const next = lines.slice(i, Math.min(i + 9, lines.length)).join("\n");
          if (/<label\b/i.test(prev) && /<\/label>/i.test(next)) hasAccessibleName = true;
        }
      }

      if (!hasAccessibleName) {
        report(
          relPath,
          i + 1,
          "accessibility",
          `Interactive <${tagName}> may lack accessible name`,
          "warning",
          false,
          sink,
        );
      }
    }

    // === Invalid Button variant detection ===
    const btnVariantMatch = line.match(/<Button\b[^>]*variant\s*=\s*["']([^"']+)["']/i);
    if (btnVariantMatch) {
      const variant = btnVariantMatch[1].trim();
      if (!VALID_BUTTON_VARIANTS.has(variant)) {
        report(
          relPath,
          i + 1,
          "component",
          `Invalid Button variant "${variant}" — use one of: ${[...VALID_BUTTON_VARIANTS].join(", ")}`,
          "error",
          true,
          sink,
        );
        if (shouldFix) {
          // Map common invalid variants to valid ones
          const FIX_MAP: Record<string, string> = {
            destructive: "error",
            danger: "error",
            info: "secondary",
            link: "ghost",
            text: "ghost",
          };
          const fixed = FIX_MAP[variant] || "primary";
          fixedLines[i] = fixedLines[i].replace(
            new RegExp(`(variant\\s*=\\s*["'])${escapeRegExp(variant)}(["'])`, "i"),
            `$1${fixed}$2`,
          );
          fileWasModified = true;
        }
      }
    }

    // === RTL / Logical Properties ===
    let rm: RegExpExecArray | null;
    RTL_RE.lastIndex = 0;
    while ((rm = RTL_RE.exec(line)) !== null) {
      const sign = rm[1] ?? "";
      const key = rm[2];
      const suffix = rm[3] ?? "";
      const full = sign + key + suffix;

      // Skip bare words like "left"/"right" that are not Tailwind classes
      if (RTL_REQUIRED_SUFFIX.has(key) && !suffix) continue;

      if (RTL_INFO.has(key)) {
        // `divide-x`/`space-x` combined with the rtl:-reverse variant on the
        // same element is the sanctioned RTL pairing (no logical equivalent
        // exists in Tailwind v4) — skip reporting it.
        if (new RegExp(`rtl:${escapeRegExp(key)}(?:-reverse)?`, "i").test(line)) continue;
        report(
          relPath,
          i + 1,
          "rtl",
          `"${full}" → consider logical equivalent`,
          "warning",
          true,
          sink,
        );
        continue; // No safe autofix available
      }

      report(relPath, i + 1, "rtl", `"${full}" → use logical property`, "warning", true, sink);

      if (shouldFix) {
        const logical = RTL_MAP[key] + suffix;
        // Optional sign so a line mixing `ml-2` and `-ml-2` heals both.
        const fixRe = new RegExp(
          `(^|${RTL_BOUNDARY_BEFORE})-?${escapeRegExp(key + suffix)}(?=${RTL_BOUNDARY_AFTER}|$)`,
          "g",
        );
        const before = fixedLines[i];
        fixedLines[i] = fixedLines[i].replace(
          fixRe,
          (_m, boundary, s) => `${boundary}${s ?? ""}${logical}`,
        );
        if (fixedLines[i] !== before) fileWasModified = true;
      }
    }
  }

  // === Global checks — computed from dedicated extractions, never from the
  // leftover inScriptBlock state of the last loop iteration ===

  // Svelte 5 script-block checks (script bodies extracted once, brace-safe)
  const { stripped, bodies: scriptBodies } = extractScriptBodies(content);

  for (const { body, start } of scriptBodies) {
    // File-relative line number for a body-relative offset
    const fileLine = (idx: number) => stripped.slice(0, start + idx).split("\n").length;
    // Legacy createEventDispatcher — Svelte 5 uses callback props
    for (const m of body.matchAll(/\bcreateEventDispatcher\b/g)) {
      report(
        relPath,
        fileLine(m.index!),
        "svelte5-legacy",
        "createEventDispatcher is legacy — migrate to callback props",
        "error",
        false,
        sink,
      );
    }
    // Legacy export let — Svelte 5 uses the $props() rune
    for (const m of body.matchAll(/^\s*export\s+let\s+[\w$]+\b/gm)) {
      report(
        relPath,
        fileLine(m.index!),
        "svelte5-legacy",
        "export let is legacy — migrate to the $props() rune",
        "error",
        false,
        sink,
      );
    }
    // goto() for navigation — prefer <a data-preload> (predictive preloading).
    // Exempt: URL-sync (options object), post-action redirects (the enclosing
    // function awaits before navigating), commented-out examples, and calls
    // with an inline `slop:suppress` justification comment.
    if (!relPath.includes("hooks") && !relPath.includes("utils")) {
      const bodyNoComments = body.replace(/\/\*[\s\S]*?\*\//g, blankOut).replace(/\/\/.*$/gm, "");
      const bodyLines = body.split("\n"); // original body — comments intact
      for (const m of bodyNoComments.matchAll(/\bgoto\s*\(/g)) {
        const gotoLine = bodyNoComments.slice(0, m.index!).split("\n").length;
        const stmt = bodyNoComments.slice(m.index!, m.index! + 300);
        if (/await\s+goto\s*\(/.test(stmt)) continue;
        // options object = URL-sync/post-action redirect (`{…}` tolerates
        // `${}` interpolations inside template-literal URLs)
        if (/goto\s*\([\s\S]{0,200}?,\s*\{/.test(stmt)) continue;
        const prevComment = bodyLines.slice(Math.max(0, gotoLine - 3), gotoLine - 1).join("\n");
        if (/slop:suppress/.test(prevComment)) continue;
        // Post-action redirect: an await between the enclosing function start
        // and the goto means navigation follows a completed action.
        let awaitBefore = false;
        for (let j = gotoLine - 2; j >= Math.max(0, gotoLine - 50); j--) {
          const t = (bodyLines[j] ?? "").trim();
          if (/^(?:export\s+)?(?:async\s+)?function\s+\w+/.test(t)) break; // function start
          if (/\bawait\b/.test(t)) awaitBefore = true;
        }
        if (awaitBefore) continue;
        report(
          relPath,
          fileLine(m.index!),
          "preloading",
          "goto() used for navigation — prefer <a data-preload> for speculative preloading",
          "warning",
          false,
          sink,
        );
      }
    }
  }

  if (/from\s+["']svelte\/store["']/.test(content)) {
    report(
      relPath,
      0,
      "svelte5-legacy",
      "Legacy svelte/store import — migrate to runes",
      "error",
      false,
      sink,
    );
  }

  if (/from\s+["']\$app\/stores["']/.test(content)) {
    report(
      relPath,
      0,
      "svelte5-legacy",
      "Legacy $app/stores import — migrate to $app/state runes",
      "error",
      false,
      sink,
    );
  }

  // === Svelte 5 SSR / Hydration ID & Date Localization safety ===
  if (relPath.endsWith(".svelte")) {
    // Generic: any render-scope crypto.randomUUID() causes SSR/hydration
    // mismatch. Runs on comment-stripped content (doc comments describing the
    // API must not flag) and exempts IDs generated per interaction:
    // - inside a function/event/lifecycle context (created on call, not render)
    // - inside a browser-guard block (typeof localStorage/window, navigator)
    const uuidLines = cleanContent.split("\n");
    for (const m of cleanContent.matchAll(/\bcrypto\.randomUUID\s*\(/g)) {
      const lineNo = cleanContent.slice(0, m.index!).split("\n").length;
      const lineText = uuidLines[lineNo - 1] ?? "";
      // A same-line opener/event handler (e.g. `onclick={() => crypto.randomUUID()}`).
      const sameLineScoped =
        /(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|\)\s*=>\s*\{|\bon\w*\s*[=(:])/.test(
          lineText,
        );
      // A browser guard in the immediate vicinity means the ID is client-only.
      const guarded = uuidLines
        .slice(Math.max(0, lineNo - 13), lineNo - 1)
        .some((l) =>
          /if\s*\([^)]*(?:typeof\s+(?:localStorage|window|document)|\bbrowser\b|\bnavigator\b)/.test(
            l,
          ),
        );
      if (sameLineScoped || guarded || isInsideFunctionScope(uuidLines, lineNo - 1)) continue;
      if (/\bon\w*\s*[=(]/.test(lineText)) continue;
      report(
        relPath,
        lineNo,
        "ssr-hydration",
        "crypto.randomUUID() at render scope causes SSR/hydration mismatch — use Svelte 5 $props.id() rune",
        "error",
        false,
        sink,
      );
    }

    for (const m of content.matchAll(
      /\.(?:toLocaleDateString|toLocaleTimeString|toLocaleString)\s*\(\s*(?:undefined)?\s*\)/g,
    )) {
      const lineNo = content.slice(0, m.index!).split("\n").length;
      report(
        relPath,
        lineNo,
        "date-localization",
        "Unpinned toLocaleDateString/toLocaleString causes SSR/client hydration mismatch — use formatDate, formatDateTime, or formatTime from @utils/format-date",
        "warning",
        false,
        sink,
      );
    }
  }

  // === @apply directive misuse (Tailwind v4: only in base layer) ===
  // Evaluated against the comment-stripped file — the previous guard only ran
  // when the file contained ANY block comment, silently skipping everything else.
  if (!relPath.includes("app.css")) {
    const noComments = content
      .replace(/```[\s\S]*?```/g, blankOut)
      .replace(/\/\*[\s\S]*?\*\//g, blankOut);
    for (const m of noComments.matchAll(/@apply\s+[^;{]+;/g)) {
      const lineNo = noComments.slice(0, m.index!).split("\n").length;
      report(
        relPath,
        lineNo,
        "tailwind",
        "@apply outside app.css — use inline utilities",
        "warning",
        false,
        sink,
      );
    }
  }

  // Code fences blanked once — reused by {@html} and {#each} below
  const contentNoCodeBlocks = content.replace(/```[\s\S]*?```/g, blankOut);

  // Brace-matched {@html} — nested objects/functions no longer break parsing
  for (const m of contentNoCodeBlocks.matchAll(/\{@html\b/g)) {
    const close = matchBrace(contentNoCodeBlocks, m.index!);
    if (close === -1) continue;
    const expr = contentNoCodeBlocks.slice(m.index! + 6, close).trim();
    if (
      !/sanitize|DOMPurify|escape|safeHtml|marked|he\.|parseMD|parseMarkdown|getDisplayValue|getStatusText|getFieldComponentHtml/i.test(
        expr,
      )
    ) {
      const lineNo = contentNoCodeBlocks.slice(0, m.index!).split("\n").length;
      report(
        relPath,
        lineNo,
        "security",
        `Unsafe {@html} without sanitization`,
        "error",
        false,
        sink,
      );
    }
  }

  // Brace-matched {#each} key validation — a key exists iff the header ends
  // with a trailing (…) group, regardless of destructuring or nested braces.
  for (const m of contentNoCodeBlocks.matchAll(/\{#each\b/g)) {
    const close = matchBrace(contentNoCodeBlocks, m.index!);
    if (close === -1) continue;
    const header = contentNoCodeBlocks.slice(m.index! + 1, close); // "#each items as x (x.id)"
    const body = header.replace(/^#each\s+/, "");
    if (!/\bas\b/.test(body)) continue;
    const keyed = /\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/.test(body);
    if (!keyed) {
      const lineNo = contentNoCodeBlocks.slice(0, m.index!).split("\n").length;
      report(
        relPath,
        lineNo,
        "svelte-quality",
        "Consider adding a key context (e.g., (item.id)) to {#each} block",
        "warning",
        false,
        sink,
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

/**
 * Duplicate-content check. Called as a sequential post-pass over ALL files
 * (never from inside a parallel file loop) — the cache order is deterministic
 * and every file is compared against every earlier file, so near-copies
 * cannot slip through a read/write race.
 */
function checkDuplicateContent(relPath: string, content: string, cache: Map<string, string[]>) {
  const norm = content
    .replace(/\s+/g, " ")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim()
    .slice(0, 4000);

  if (norm.length < 400) return;

  const existing = cache.get(norm);
  if (existing) {
    report(relPath, 0, "copy-paste", `Very similar content to: ${existing.join(", ")}`, "warning");
    existing.push(relPath);
  } else {
    cache.set(norm, [relPath]);
  }
}

/** Exported for unit tests — returns an isolated violation list (no shared state). */
export async function scanSvelteContent(relPath: string, content: string): Promise<Violation[]> {
  const sink: Violation[] = [];
  await scanSvelteFile(relPath, content, false, sink);
  return sink;
}

// ---------------------------------------------------------------------------
// Security Architecture Checks
// ---------------------------------------------------------------------------

/** Patterns that indicate insecure architectural choices (not secret leaks). */
const SECURITY_ARCH_PATTERNS: {
  pattern: RegExp;
  category: string;
  message: string;
  severity: Violation["severity"];
}[] = [
  {
    pattern: /"Access-Control-Allow-Origin":\s*request\.headers\.get\("Origin"\)/,
    category: "cors-reflection",
    message: "CORS reflects Origin header with credentials — use origin allowlist instead",
    severity: "error",
  },
  {
    pattern: /DEFAULT_ALLOWED_MIME\s*=\s*\/\^\\(image\|video\|audio\|application\\)/,
    category: "broad-mime",
    message: "MIME allowlist is too broad — restrict to explicit types (no application/*)",
    severity: "error",
  },
  {
    pattern: /createHash\("(?:sha256|md5|sha1)"\)\.update\((?:key|secret|token)\)/i,
    category: "fast-hash-secret",
    message: "Fast hash used for API key/token storage — use HMAC with server secret",
    severity: "error",
  },
  {
    pattern: /\(isProduction\s*&&\s*!isBenchmark\)/,
    category: "introspection-bypass",
    message: "GraphQL introspection gated on benchmark flags — block unconditionally in prod",
    severity: "error",
  },
  {
    pattern: /user\._id\s*===\s*["']system["']\s*&&\s*password\s*===/,
    category: "backdoor",
    message: "Hardcoded password comparison for system user — potential auth backdoor",
    severity: "error",
  },
  {
    pattern: /request\.clone\(\)/,
    category: "body-double-clone",
    message: "Request body cloned — verify size limits are enforced to prevent OOM",
    severity: "info",
  },
];

function scanSecurityPatterns(relPath: string, content: string) {
  if (content.includes("slop:suppress")) return;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    for (const { pattern, category, message, severity } of SECURITY_ARCH_PATTERNS) {
      if (pattern.test(trimmed)) {
        report(relPath, i + 1, category, message, severity);
      }
    }
  }
}

/**
 * Detects raw SQL built from interpolated identifiers without validation.
 * Matches template literals that construct DML/DDL statements where an
 * identifier is interpolated directly (e.g. `INSERT INTO "${name}"`).
 *
 * Drizzle's explicit sql.raw()/sql.identifier()/sql.join() helpers and nested
 * parameterized sql`` templates are treated as sanctioned and skipped.
 * The check is keyword-aware so plain template literals (CSS classes, log
 * messages, toast strings) are NOT flagged — unlike naive "raw SQL" heuristics
 * that produce false positives on every backtick string.
 */
function scanRawSqlRisk(relPath: string, content: string) {
  if (content.includes("slop:suppress")) return;
  const hasIdentifierGuard =
    /\b(?:SAFE_IDENTIFIER|SAFE_IDENT|isSafeIdentifier|validateIdentifier|assertSafeIdentifier|assertSafeSqlIdentifier|assertSqlIdentifier|assertIdentifier|quoteIdentifier|quoteMariaIdentifier|escapeSqlIdentifier|getTableName)\b/.test(
      content,
    ) || /\[\^?A-Za-z_\]\[\^?A-Za-z0-9_\]/.test(content);
  if (hasIdentifierGuard) return;
  // Strip markdown code blocks and HTML comments — SQL examples in docs are not code
  const contentNoCodeBlocks = content
    .replace(/```[\s\S]*?```/g, blankOut)
    .replace(/<!--([\s\S]*?)-->/g, blankOut);
  const lines = contentNoCodeBlocks.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    const line = lines[i];
    if (!line.includes("`") || !line.includes("${")) continue;
    // SQL statement position: backtick followed by an uppercase SQL DML/DDL verb.
    // Case-sensitive so English verbs ("Select", "Update") in UI strings don't match.
    if (
      !/`\s*(?:INSERT(?:\s+(?:OR\s+IGNORE|INTO))?|UPDATE|DELETE\s+FROM|CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|SELECT)\b/.test(
        line,
      )
    ) {
      continue;
    }
    // Tagged-template literals (pg client tags like raw`...`, pool`...`, sql`...`)
    // bind interpolations as parameters — they are NOT string interpolation.
    if (/(?:^|[^\w.])(?:raw|sql|pool|client|query|db|conn|connection)\s*`/.test(line)) {
      continue;
    }
    let flagged = false;
    for (const m of line.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = m[1].trim();
      if (!expr) continue;
      // Sanctioned Drizzle helpers + nested parameterized templates
      if (/\bsql\.(?:raw|identifier|join)\s*\(/.test(expr)) continue;
      if (/\bsql\s*`/.test(expr)) continue;
      // Identifier escaping (e.g. `name.replace(/"/g, '""')` or an esc*/escape helper)
      // is a valid guard
      if (/\.replace\s*\(/.test(expr)) continue;
      if (/\b(?:esc|escape|escId|escSql|quote)\w*\s*\(/.test(expr)) continue;
      flagged = true;
      break;
    }
    if (flagged) {
      report(
        relPath,
        i + 1,
        "security",
        "Raw SQL with interpolated identifier without validation — use sql.identifier() or validate against /^[A-Za-z_][A-Za-z0-9_]*$/",
        "warning",
      );
    }
  }
}

/**
 * Client-side security consistency checks for Svelte/TS files:
 * 1. Mutating fetch() to /api without an X-CSRF-Token header.
 * 2. new RegExp() built from interpolated input without escaping.
 *
 * Server-only files (hooks/api/databases/services, *.server.ts) are skipped
 * for the CSRF check — server-to-server calls don't require CSRF tokens.
 */
function scanClientSecurityPatterns(relPath: string, content: string) {
  if (content.includes("slop:suppress")) return;
  const isServerSide =
    /(^|\/)(?:api|hooks|databases|services)\//.test(relPath) ||
    /\.(?:server|remote|ws)\.(?:ts|js)$/.test(relPath);

  const contentNoCodeBlocks = content.replace(/```[\s\S]*?```/g, blankOut);

  // ── Mutating fetch() without X-CSRF-Token header ──
  if (!isServerSide) {
    for (const m of contentNoCodeBlocks.matchAll(/fetch\s*\(\s*([`'"])\/api\/[^`'"]*\1/g)) {
      // Window covers method + headers of the call (multi-line fetch bodies),
      // plus a backward lookahead so headers built just before the fetch count
      const start = Math.max(0, m.index! - 200);
      const window = contentNoCodeBlocks.slice(start, m.index! + 400);
      const methodMatch = window.match(/method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i);
      if (!methodMatch) continue; // GET or no explicit method — not a mutation
      if (methodMatch[1].toUpperCase() === "GET") continue;
      // Sanctioned helpers (fetchApi / clientJsonHeaders) attach the token themselves
      if (/X-CSRF-Token|clientJsonHeaders|fetchApi\s*\(/i.test(window)) continue;
      const lineNo = contentNoCodeBlocks.substring(0, m.index!).split("\n").length;
      report(
        relPath,
        lineNo,
        "security",
        `Mutating fetch(${methodMatch[1]}) without X-CSRF-Token header — use fetchApi() or include the token`,
        "warning",
      );
    }
  }

  // ── new RegExp() from interpolated input (regex injection / ReDoS footgun) ──
  for (const m of contentNoCodeBlocks.matchAll(/new\s+RegExp\s*\(\s*`([^`]*\$\{[^}]*\}[^`]*)`/g)) {
    const statement = m[0];
    const lineNo = contentNoCodeBlocks.substring(0, m.index!).split("\n").length;
    // Include the surrounding lines — the escape call often lives nearby
    const splitLines = contentNoCodeBlocks.split("\n");
    const window =
      (splitLines[lineNo - 6] ?? "") +
      "\n" +
      (splitLines[lineNo - 5] ?? "") +
      "\n" +
      (splitLines[lineNo - 4] ?? "") +
      "\n" +
      (splitLines[lineNo - 3] ?? "") +
      "\n" +
      (splitLines[lineNo - 2] ?? "") +
      "\n" +
      (splitLines[lineNo - 1] ?? "") +
      "\n" +
      statement;
    // Escaped input (escape helper, $& replace, inline backslash-escaped
    // interpolation, or inline esc()/escape() helper call) is fine. The helper
    // may also be used earlier in the file.
    const escapeSignal =
      /escapeRegExp|escapeRegex|\breplace\s*\([^;]*\$&|\\\$\{/.test(window) ||
      /(?:^|[^\w.])(?:esc|escape)\s*\(/.test(window) ||
      /\b(?:escapeRegex|escapeRegExp)\b/.test(contentNoCodeBlocks);
    if (escapeSignal) {
      continue;
    }
    // Interpolated all-caps constants (TAG_PATTERN, MAX_LEN, ...) are
    // compile-time values, not user input
    if (/\$\{\s*[A-Z_][A-Z0-9_]*\s*\}/.test(statement)) {
      continue;
    }
    report(
      relPath,
      lineNo,
      "security",
      "new RegExp() built from interpolated input — escape regex metacharacters to avoid injection/ReDoS",
      "warning",
    );
  }
}

/**
 * BUG-01 guard: manual `collection_${id}` / "collection_" + physical-name
 * prefixes silently break for hyphenated collection ids ("blog-posts" →
 * collection_blog-posts instead of the canonical collection_blogposts). The
 * canonical helper is `collectionTableName()` from
 * @src/databases/core/collection-name — every manual construction is a
 * latent wrong-table bug. The defining file itself is exempt.
 */
function scanCollectionTableNameRisk(relPath: string, content: string) {
  if (content.includes("slop:suppress")) return;
  if (relPath.endsWith("core/collection-name.ts")) return;
  const re = /`collection_\$\{|["']collection_["']\s*\+/g;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    // Registry-key cleanups (tableRegistry.delete of the `collection_<raw>`
    // variant) are legitimate — they delete cache keys, not query tables.
    if (trimmed.includes("tableRegistry")) continue;
    re.lastIndex = 0;
    if (re.test(trimmed)) {
      report(
        relPath,
        i + 1,
        "collection-table-name",
        "Manual `collection_${…}` physical table name — use collectionTableName() (BUG-01: hyphenated ids map to the wrong table)",
        "warning",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Whole-program dead-export heuristic ("exported but never referenced")
// ---------------------------------------------------------------------------

/**
 * Cross-file "exported but never referenced" scan over src/ only — test files
 * do NOT count as usage (a symbol that only exists in a test mock is dead).
 *
 * Regex-based on purpose so the scanner stays a fast text pass: top-level
 * exported symbols (`export function/const/class` and `export { foo }`) are
 * registered only when the name is distinctive (camelCase hump + ≥6 chars),
 * which filters out generic verbs (get/set/connect/…). Candidates that are
 * referenced **only** by tests/docs are reported separately as
 * `export-surface` (public/test API inventory) instead of drowning the
 * actionable `unused-export` set — measured before the split: 135 of 159
 * candidates were test/doc-referenced API, only 24 were referenced nowhere.
 * Class methods are deliberately NOT scanned (their `this.`-style usage was the
 * main false-positive source).
 */
function classifyExportReference(refs: {
  inSrcScripts: boolean;
  inTests: boolean;
  inDocs: boolean;
  ownCount: number;
}): "used" | "export-surface" | "unused-export" {
  if (refs.inSrcScripts || refs.ownCount > 1) return "used";
  if (refs.inTests || refs.inDocs) return "export-surface";
  return "unused-export";
}

async function readGlob(glob: string): Promise<string> {
  let out = "";
  for (const f of globSync(glob, {
    cwd: ROOT,
    exclude: (p) => String(p).includes("node_modules") || String(p).includes(".svelte-kit"),
  })) {
    try {
      out += await fs.readFile(join(ROOT, f), "utf8");
    } catch {
      /* unreadable — skip */
    }
  }
  return out;
}
async function scanUnusedExports(tsFiles: string[], svelteFiles: string[]) {
  // Reference set = src + scripts (the config-cli and other scripts are
  // production callers of src exports). Candidates are registered from src
  // only — scripts are callers, never dead-code sources here.
  const contents = new Map<string, string>();
  const srcRel = new Set<string>();
  for (const file of tsFiles) srcRel.add(relative(ROOT, file).replace(/\\/g, "/"));
  for (const file of svelteFiles) srcRel.add(relative(ROOT, file).replace(/\\/g, "/"));

  const scriptFiles = globSync("scripts/**/*.{ts,js}", {
    cwd: ROOT,
    exclude: (p) => String(p).includes("node_modules"),
  }).map((f) => (isAbsolute(f) ? f : join(ROOT, f)));

  for (const file of [...tsFiles, ...svelteFiles, ...scriptFiles]) {
    if (file.endsWith(".d.ts")) continue;
    try {
      contents.set(relative(ROOT, file).replace(/\\/g, "/"), await fs.readFile(file, "utf8"));
    } catch {
      /* unreadable — skip */
    }
  }

  const candidates = new Map<string, { file: string; line: number }>();
  const register = (rel: string, content: string, name: string) => {
    if (name.length < 6 || !/[a-z][A-Z]/.test(name)) return; // distinctive camelCase only
    if (candidates.has(name)) return; // first definition wins
    const idx = content.indexOf(name);
    const line = idx >= 0 ? content.slice(0, idx).split("\n").length : 0;
    candidates.set(name, { file: rel, line });
  };

  for (const [rel, content] of contents) {
    if (!srcRel.has(rel)) continue; // scripts are reference-only
    // Glob-loaded surfaces (widgets/plugins are picked up via import.meta.glob,
    // so their symbol names never appear as text) and type-only API areas are
    // not dead-code candidates.
    if (
      rel.startsWith("src/widgets/custom/") ||
      rel.startsWith("src/plugins/") ||
      rel.startsWith("src/types/")
    ) {
      continue;
    }
    // Runtime symbols only — exported types/interfaces are API contracts
    // (cheap and often intentionally public); dead runtime code is the cost.
    for (const m of content.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      register(rel, content, m[1]);
    }
    // Re-export statements: `export { foo }` / `export { foo as bar }` — a
    // re-export bridge that no consumer references is exactly the legacy
    // compat code this project forbids, so it is a candidate like any export.
    for (const m of content.matchAll(/^export\s*\{([^}]*)\}\s*;?/gm)) {
      for (const spec of m[1].split(",")) {
        const name = spec
          .trim()
          .split(/\s+as\s+/)[0]
          .trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) register(rel, content, name);
      }
    }
  }

  const testsContent = await readGlob("tests/**/*.{ts,js}");
  const docsContent = await readGlob("docs/**/*.{mdx,md}");

  for (const [name, { file, line }] of candidates) {
    const escaped = escapeRegExp(name);
    const needle = new RegExp(`\\b${escaped}\\b`);
    const needleGlobal = new RegExp(`\\b${escaped}\\b`, "g");
    let referenced = false;
    let ownCount = 0;
    for (const [rel, content] of contents) {
      if (rel === file) {
        ownCount = (content.match(needleGlobal) || []).length;
        continue;
      }
      if (needle.test(content)) {
        referenced = true;
        break;
      }
    }
    // Only a BARE definition is dead: one occurrence in its own file and zero
    // elsewhere. Exports used internally by their module (recursive helpers,
    // exported diagnostics called from the same file) are skipped.
    const inTests = needle.test(testsContent);
    const inDocs = needle.test(docsContent);
    const verdict = classifyExportReference({
      inSrcScripts: referenced,
      inTests,
      inDocs,
      ownCount,
    });
    if (verdict === "used") continue;

    if (verdict === "export-surface") {
      const where = [inTests ? "tests" : null, inDocs ? "docs" : null].filter(Boolean).join(" + ");
      report(
        file,
        line,
        "export-surface",
        `"${name}" is referenced by ${where} only — public/test surface, keep or document (not dead code)`,
        "info",
      );
    } else {
      report(
        file,
        line,
        "unused-export",
        `"${name}" is exported but referenced nowhere in src/scripts/tests/docs — dead-code candidate`,
        "info",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Bundle-lean rules + cross-module hygiene (lean-out plan enforcement)
// ---------------------------------------------------------------------------

/** Heavy packages that must stay behind a dynamic `import()` (lean-out plan §1). */
const HEAVY_STATIC_IMPORT_DENYLIST = new Set([
  "lodash",
  "lodash.memoize",
  "maplibre-gl",
  "shiki",
  "@aws-sdk/client-s3",
  "@aws-sdk/client-ses",
]);

/** Resolves a module specifier to its package name (scope-aware). */
function packageNameOf(specifier: string): string {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return "";
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * Flags heavy dependencies imported statically. They belong behind
 * `await import()` so they stay out of the route/component entry bundle —
 * the cheapest lever from the lean-out plan that no linter owns.
 */
function scanHeavyStaticImports(relPath: string, content: string) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*import\s+(?:type\s+)?(?:[^"'`]*?\bfrom\s+)?["']([^"']+)["']/);
    if (!m) continue;
    const pkg = packageNameOf(m[1]);
    if (!HEAVY_STATIC_IMPORT_DENYLIST.has(pkg)) continue;
    if (/slop:suppress/.test(lines.slice(Math.max(0, i - 2), i).join("\n"))) continue;
    report(
      relPath,
      i + 1,
      "heavy-static-import",
      `Static import of "${pkg}" — load it via dynamic import() (or keep it server-side) to stay out of the entry bundle`,
      "warning",
    );
  }
}

/**
 * Flags eager `import.meta.glob(..., { eager: true })`: eager globs inline every
 * matched module into the importing chunk, which silently defeats code-splitting
 * (relevant for the marketplace installer and widget/plugin glob surfaces).
 */
function scanEagerGlobs(relPath: string, content: string) {
  const lines = content.split("\n");
  for (const m of content.matchAll(/import\.meta\.glob\s*\(/g)) {
    const window = content.slice(m.index!, m.index! + 400);
    if (!/eager\s*:\s*true/.test(window)) continue;
    const lineNo = content.slice(0, m.index!).split("\n").length;
    if (/slop:suppress/.test(lines.slice(Math.max(0, lineNo - 3), lineNo).join("\n"))) continue;
    report(
      relPath,
      lineNo,
      "eager-glob",
      "import.meta.glob({ eager: true }) inlines every match into this chunk — prefer a lazy glob (or add a slop:suppress note with the reason)",
      "warning",
    );
  }
}

/** Distinctive top-level runtime export names (camelCase hump, ≥6 chars). */
function exportedRuntimeNames(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(m[1]);
  }
  for (const m of content.matchAll(/^export\s*\{([^}]*)\}\s*;?/gm)) {
    for (const spec of m[1].split(",")) {
      const name = spec
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return [...names].filter((n) => n.length >= 6 && /[a-z][A-Z]/.test(n));
}

/**
 * Reports the same distinctive export name coming from several modules.
 * Glob/plugin surfaces and the 4 DB adapters are excluded on purpose: their
 * repeated names (`createWidget`, `insertMany`, …) are contract symmetry, not
 * a naming collision. In app code a duplicate name is how `detectAnomalies`
 * ended up meaning two unrelated things.
 */
function scanDuplicateExportNames(entries: { rel: string; content: string }[]) {
  const byName = new Map<string, string[]>();
  for (const { rel, content } of entries) {
    if (
      rel.startsWith("src/databases/") ||
      rel.startsWith("src/widgets/") ||
      rel.startsWith("src/plugins/") ||
      // Dashboard widgets are a glob surface: every entry legitimately exports
      // the same contract names (`widgetMeta`, `load`, …).
      rel.startsWith("src/routes/(app)/dashboard/widgets/") ||
      rel.startsWith("src/routes/api/graphql/")
    ) {
      continue;
    }
    for (const name of exportedRuntimeNames(content)) {
      const list = byName.get(name);
      if (!list) byName.set(name, [rel]);
      else if (list[list.length - 1] !== rel) list.push(rel);
    }
  }
  for (const [name, files] of byName) {
    if (files.length < 2) continue;
    // Two very different causes: a module that imports a name only to re-export
    // it is a compat bridge (AGENTS.md §1 forbids gratuitous ones — legitimate
    // only when that module IS the documented import path, e.g.
    // `@utils/format-date`). Independent definitions are plain duplication.
    const bridge = files.filter((rel) => {
      const content = entries.find((e) => e.rel === rel)?.content ?? "";
      // NOTE: `\b` belongs to the bare-name alternative only — after `}` it can
      // never match (`}` and whitespace are both non-word characters).
      return new RegExp(`import\\s+(?:type\\s+)?(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name}\\b)`).test(
        content,
      );
    });
    const kind =
      bridge.length > 0
        ? "re-export bridge — keep only if this module is the documented import path (AGENTS.md §1)"
        : "duplicate definition";
    report(
      files[1],
      0,
      "duplicate-export-name",
      `"${name}" is exported by ${files.length} modules (${files.slice(0, 3).join(", ")}${files.length > 3 ? ", …" : ""}) — ${kind}`,
      "info",
    );
  }
}

/**
 * Adapter surface parity for the standalone-adapter workstream: compares the
 * export surfaces of the four `adapter-core.ts` files and reports asymmetries
 * as inventory (the shared adapter contract itself is enforced by tsc).
 */
function scanAdapterParity(entries: { rel: string; content: string }[]) {
  const ADAPTERS = ["sqlite", "postgresql", "mariadb", "mongodb"];
  const surfaces = new Map<string, Set<string>>();
  for (const db of ADAPTERS) {
    const rel = `src/databases/${db}/adapter-core.ts`;
    const entry = entries.find((e) => e.rel === rel);
    if (!entry) {
      report(rel, 0, "adapter-parity", `Missing adapter-core.ts for ${db}`, "info");
      continue;
    }
    // The class name legitimately differs per adapter — drop it from the diff.
    surfaces.set(
      db,
      new Set(exportedRuntimeNames(entry.content).filter((n) => !n.endsWith("AdapterCore"))),
    );
  }
  const union = new Set<string>();
  for (const set of surfaces.values()) for (const n of set) union.add(n);
  for (const [db, set] of surfaces) {
    const missing = [...union].filter((n) => !set.has(n));
    if (missing.length === 0) continue;
    report(
      `src/databases/${db}/adapter-core.ts`,
      0,
      "adapter-parity",
      `${missing.length} export(s) present in other adapters but not in ${db}: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}`,
      "info",
    );
  }
}

/**
 * Leftover reasoning-voice comments ("Let's use…", "If I'm in…", "Actually,").
 * They are the textual fingerprint of half-finished generation/refactoring: the
 * code below them is usually correct, the reasoning above it is noise that ages
 * into misinformation. Inventory only (info) — rewording is a human judgement.
 */
const REASONING_COMMENT_RE =
  /\b(?:Let's|Let me|I think|I'll|probably because|seems like|unlikely|Actually,|Wait,|Hmm\b|not sure (?:if|whether))/;

function scanReasoningComments(relPath: string, content: string) {
  const lines = content.split("\n");
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")) continue;
    if (/slop:suppress|\.mdx|https?:\/\//.test(t)) continue;
    if (REASONING_COMMENT_RE.test(t)) hits.push(i + 1);
  }
  if (hits.length === 0) return;
  report(
    relPath,
    hits[0],
    "reasoning-comment",
    `${hits.length} leftover reasoning-voice comment(s) (first at line ${hits[0]}) — state the intent or delete`,
    "info",
  );
}

async function main() {
  await loadSuppressions();

  const argv = process.argv.slice(2);
  const shouldFix = argv.includes("--fix");
  const isStrict = argv.includes("--strict");
  // `--files` consumes positional args up to the next flag — `--strict` after
  // a file list is a flag, never a filename.
  const filesIdx = argv.indexOf("--files");
  let targetFiles: string[] | null = null;
  if (filesIdx !== -1) {
    targetFiles = [];
    for (let i = filesIdx + 1; i < argv.length; i++) {
      if (argv[i].startsWith("--")) break;
      targetFiles.push(argv[i]);
    }
  }

  console.log("🔍 Svelte Quality Scanner (Smart + Autofix)\n");

  const svelteFiles: string[] = [];
  const tsFiles: string[] = [];

  if (targetFiles?.length) {
    for (const f of targetFiles) {
      const absolute = f.startsWith("/") || /^[A-Za-z]:[\\/]/.test(f);
      const full = absolute ? f : join(ROOT, f);
      if (existsSync(full)) {
        if (f.endsWith(".svelte")) svelteFiles.push(full);
        else if (f.endsWith(".ts") || f.endsWith(".js")) tsFiles.push(full);
      }
    }
  } else {
    const allFiles = globSync("src/**/*.{svelte,ts,js}", {
      cwd: ROOT,
      exclude: (p) => isExcludedPath(p),
    }).map((f) => (isAbsolute(f) ? f : join(ROOT, f)));
    for (const f of allFiles) {
      if (f.endsWith(".svelte")) svelteFiles.push(f);
      else tsFiles.push(f);
    }
  }

  console.log(`📂 Scanning ${svelteFiles.length} Svelte + ${tsFiles.length} TS/JS files...\n`);

  // Read everything up front so the duplicate-content post-pass can compare
  // every file against every earlier file in deterministic order (no
  // Promise.all read/write race on the comparison cache).
  const entries: { file: string; rel: string; content: string; isSvelte: boolean }[] = [];
  for (const file of [...svelteFiles, ...tsFiles]) {
    try {
      entries.push({
        file,
        rel: relative(ROOT, file).replace(/\\/g, "/"),
        content: await fs.readFile(file, "utf8"),
        isSvelte: file.endsWith(".svelte"),
      });
    } catch {
      console.warn(`⚠️  Could not read file: ${file}`);
    }
  }

  for (const { file, rel, content, isSvelte } of entries) {
    try {
      if (isSvelte) await scanSvelteFile(rel, content, shouldFix);
      scanTodos(rel, content);
      checkFileNaming(rel);
      scanSecurityPatterns(rel, content);
      scanRawSqlRisk(rel, content);
      scanClientSecurityPatterns(rel, content);
      scanCollectionTableNameRisk(rel, content);
      scanHeavyStaticImports(rel, content);
      scanEagerGlobs(rel, content);
      scanReasoningComments(rel, content);

      const size = Buffer.byteLength(content, "utf8");
      if (size > MAX_FILE_SIZE && !file.endsWith(".d.ts")) {
        report(rel, 0, "file-size", `Large file (${(size / 1024).toFixed(0)}KB)`, "warning");
      }
    } catch {
      console.warn(`⚠️  Could not process file: ${file}`);
    }
  }

  // Sequential duplicate-content post-pass (deterministic ordering)
  const duplicateCache = new Map<string, string[]>();
  for (const { rel, content } of entries) {
    checkDuplicateContent(rel, content, duplicateCache);
  }

  // Cross-module checks (need the full file set)
  scanDuplicateExportNames(entries);
  scanAdapterParity(entries);

  await scanUnusedExports(tsFiles, svelteFiles);

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
      .slice(0, PRINT_CAP)
      .forEach((v) => console.log(`  ${v.file}:${v.line} [${v.category}] ${v.message}`));
    if (warnings.length > PRINT_CAP) console.log(`  ... +${warnings.length - PRINT_CAP} more`);
  }

  if (infos.length) {
    const surfaces = infos.filter((v) => v.category === "export-surface").length;
    const dead = infos.filter((v) => v.category === "unused-export").length;
    console.log(
      `\nℹ️  INFOS:${dead ? ` ${dead} dead-code candidate(s)` : ""}${surfaces ? `${dead ? "," : ""} ${surfaces} test/doc-only export(s)` : ""}`,
    );
    infos
      .slice(0, PRINT_CAP)
      .forEach((v) => console.log(`  ${v.file}:${v.line} [${v.category}] ${v.message}`));
    if (infos.length > PRINT_CAP) console.log(`  ... +${infos.length - PRINT_CAP} more`);
  }

  if (isStrict && (errors.length > 0 || warnings.length > 0)) {
    console.log(`
❌ Strict mode failed with ${errors.length} errors and ${warnings.length} warnings.`);
    console.log("Fix all issues before pushing. Perfect code only.\n");
    process.exit(1);
  }

  if (errors.length === 0 && warnings.length === 0) {
    const dead = infos.filter((v) => v.category === "unused-export").length;
    const surfaces = infos.filter((v) => v.category === "export-surface").length;
    console.log(
      `\n✅ Clean! No issues found.${dead || surfaces ? ` (${dead} dead-code candidate(s), ${surfaces} test/doc-only export(s) — info only)` : ""}`,
    );
  } else if (errors.length === 0) {
    console.log("\n⚠️  Only warnings — review recommended.");
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Scanner crashed:", err);
    process.exit(1);
  });
}

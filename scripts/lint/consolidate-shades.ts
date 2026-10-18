/**
 * @file scripts/lint/consolidate-shades.ts
 * @description Codemod and drift-guard that enforces the SveltyCMS status-shade contract
 * across src/. Fixes shade drift ("too many different reds") while keeping the
 * accent ramps (error/success/warning/tertiary/primary/secondary/surface).
 *
 * CONTRACT (see docs/contributing/style-guide-gui.mdx → Status-shade contract):
 *   - subtle wash bg  = {hue}-500/10  (light)  + {hue}-900/20 (dark)
 *   - accent text     = {hue}-500     (light)  + {hue}-400    (dark)
 *   - emphasis text   = {hue}-600     (light)  + {hue}-400    (dark)
 *   - soft border     = {hue}-500/30  (light)  + {hue}-500/40 (dark)
 *
 * Migrations applied:
 *   bg-hue-50 | bg-hue-100 | bg-hue-500/5 | bg-hue-500/15  -> bg-hue-500/10
 *   bg-hue-900/30 | /40                                     -> bg-hue-900/20
 *   bg-hue-950 (solid) -> bg-hue-500/10 ; bg-hue-950/N -> bg-hue-900/N
 *   text-hue-700 | -800 (light)          -> text-hue-600
 *   dark:text-hue-200 | -300             -> dark:text-hue-400   (skipped when the
 *                                                               class string also
 *                                                               carries a solid fill)
 *   border-hue-200 | -300                -> border-hue-500/30
 *   border-hue-700 | -800 | -900         -> border-hue-500/40
 *   border-hue-400 (light)               -> border-hue-500
 *   border-hue-500/undefined             -> border-hue-500/30
 *   Legacy Tailwind hues red/rose/amber/orange/yellow/green/emerald/blue are
 *   remapped to error/warning/success/tertiary (any property, any shade).
 *
 * Usage:
 *   bun run scripts/lint/consolidate-shades.ts --check   # drift guard (exit 1 on drift)
 *   bun run scripts/lint/consolidate-shades.ts --dry     # preview only, no writes
 *   bun run scripts/lint/consolidate-shades.ts           # apply the fixes in place
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DRY = process.argv.includes("--dry");
const CHECK = process.argv.includes("--check");
const ROOT = fileURLToPath(new URL("../../src", import.meta.url));

const EXCLUDED = new Set([
  "highlighted-text.svelte",
  "restart-required-banner.svelte",
  "image-editor-modal.svelte",
  "dropdown.svelte",
  "drop-down.svelte",
  "app.css",
]);

const HUE_MAP: Record<string, string> = {
  red: "error",
  rose: "error",
  amber: "warning",
  orange: "warning",
  yellow: "warning",
  green: "success",
  emerald: "success",
  blue: "tertiary",
};

const CONTRACT = new Set([
  "primary",
  "secondary",
  "tertiary",
  "success",
  "warning",
  "error",
  "surface",
]);

const EDGE = "(-[slrbtxy])";
// prefix boundary → variants (dark:, hover:, class:…) → prop (+border edge) → hue → shade → /alpha
const TOKEN_RE = new RegExp(
  `(^|[\\s"'(\\[{:=])((?:[\\w-]*:)*)(bg|text|border|ring|from|to|via|outline|stroke|fill|decoration)${EDGE}?-(red|rose|amber|orange|yellow|green|emerald|blue|error|success|warning|tertiary|primary|secondary|surface)-(\\d{2,3})(?:/([0-9.]+))?(?=[\\s"'(\\[{:=)}!;]|$)`,
  "g",
);

// Literal `"text"` used as a hue (e.g. `text-text-400`)
const TEXT_TEXT_RE = new RegExp(
  `(^|[\\s"'(\\[{:=])((?:[\\w-]*:)*)text-text-(\\d{2,3})(?:/([0-9.]+))?(?=[\\s"'(\\[{:=)}!;]|$)`,
  "g",
);

// `bg-surface-800` / `dark:bg-surface-800` advisory count
const SURFACE_800_RE = /(^|[\\s"'(\\[{:=])(?:dark:)?bg-surface-800(?!\d)(?!\/)/g;

const changes: string[] = [];
const textTextViolations: string[] = [];
let surface800Count = 0;
let filesChanged = 0;

function hasSolidFill(line: string, hue: string): boolean {
  const re = new RegExp(`(?:^|[\\s:(])bg-${hue}-[5-8]\\d\\d(?![\\d/])|preset-filled-${hue}-500`);
  return re.test(line);
}

function transformToken(
  prefix: string,
  variants: string,
  prop: string,
  edge: string | undefined,
  hue: string,
  shade: string,
  alpha: string | undefined,
  directive: boolean,
): string {
  const newHue = HUE_MAP[hue] ?? hue;
  if (!CONTRACT.has(newHue)) {
    return `${prefix}${variants}${prop}${edge ?? ""}-${hue}-${shade}${alpha ? `/${alpha}` : ""}`;
  }
  const isDark = variants.includes("dark:");
  const emit = (cls: string) => `${prefix}${variants}${cls}`;

  const introducesSlash = (cls: string) => /\/[0-9]/.test(cls);

  switch (prop) {
    case "bg": {
      if (shade === "50") {
        const out = emit(`bg-${newHue}-500/${alpha ?? "10"}`);
        if (directive && introducesSlash(out))
          return emit(`bg-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`);
        return out;
      }
      if (shade === "100") {
        const out = emit(`bg-${newHue}-500/10`);
        if (directive && introducesSlash(out)) return emit(`bg-${newHue}-${shade}`);
        return out;
      }
      if (shade === "500" && (alpha === "5" || alpha === "15")) {
        const out = emit(`bg-${newHue}-500/10`);
        if (directive && introducesSlash(out)) return emit(`bg-${newHue}-500/${alpha}`);
        return out;
      }
      if (shade === "900" && (alpha === "30" || alpha === "40")) {
        const out = emit(`bg-${newHue}-900/20`);
        if (directive && introducesSlash(out)) return emit(`bg-${newHue}-900/${alpha}`);
        return out;
      }
      if (shade === "950") {
        const out = emit(alpha ? `bg-${newHue}-900/${alpha}` : `bg-${newHue}-500/10`);
        if (directive && introducesSlash(out))
          return emit(`bg-${newHue}-950${alpha ? `/${alpha}` : ""}`);
        return out;
      }
      return emit(`bg-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`);
    }
    case "text": {
      if (isDark) {
        if (shade === "200" || shade === "300") return emit(`text-${newHue}-400`);
        return emit(`text-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`);
      }
      if (shade === "700" || shade === "800") return emit(`text-${newHue}-600`);
      return emit(`text-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`);
    }
    case "border": {
      const b = `border${edge ?? ""}`;
      const soft = (cls: string) => {
        if (directive && introducesSlash(cls))
          return emit(`${b}-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`);
        return cls;
      };
      if (alpha === "undefined") return soft(emit(`${b}-${newHue}-500/30`));
      if (shade === "200" || shade === "300") return soft(emit(`${b}-${newHue}-500/30`));
      if (shade === "700" || shade === "800" || shade === "900")
        return soft(emit(`${b}-${newHue}-500/40`));
      if (shade === "400" && !isDark) return emit(`${b}-${newHue}-500`);
      return emit(`${b}-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`);
    }
    default:
      return `${prefix}${variants}${prop}${edge ?? ""}-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`;
  }
}

function processFile(file: string): void {
  const base = file.split(/[\\/]/).pop() || "";
  if (EXCLUDED.has(base)) return;
  const original = readFileSync(file, "utf8");
  const lines = original.split("\n");
  const rel = file.replace(ROOT, "").replace(/\\/g, "/");
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(TEXT_TEXT_RE)) {
      textTextViolations.push(`${rel}:${i + 1}  ${m[0].trim()}`);
    }
    for (const m of lines[i].matchAll(SURFACE_800_RE)) {
      if (m[0].includes("bg-surface-800")) surface800Count++;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const solidBgs = new Set<string>();
    for (const h of CONTRACT) if (hasSolidFill(line, h)) solidBgs.add(h);

    const next = line.replace(TOKEN_RE, (m, prefix, variants, prop, edge, hue, shade, alpha) => {
      const mapped = HUE_MAP[hue] ?? hue;
      if (!CONTRACT.has(mapped)) return m;
      const isDark = variants.includes("dark:");
      if (isDark && prop === "text" && (shade === "200" || shade === "300") && solidBgs.has(mapped))
        return m;
      if (
        !isDark &&
        prop === "text" &&
        (shade === "700" || shade === "800") &&
        solidBgs.has(mapped)
      )
        return m;
      const out = transformToken(
        prefix,
        variants,
        prop,
        edge,
        hue,
        shade,
        alpha,
        variants.includes("class:"),
      );
      if (out !== m) {
        changes.push(
          `${file.replace(ROOT, "").replace(/\\/g, "/")}:${i + 1}  ${m.trim()}  →  ${out.trim()}`,
        );
      }
      return out;
    });

    if (next !== line) {
      lines[i] = next;
      changed = true;
    }
  }

  if (changed) {
    filesChanged++;
    if (!DRY) writeFileSync(file, lines.join("\n"));
  }
}

function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry.startsWith("node_modules") || entry.startsWith(".")) continue;
      walk(full);
    } else if (/\.(svelte|ts|js|css)$/.test(entry)) {
      processFile(full);
    }
  }
}

walk(ROOT);

if (CHECK) {
  let failed = false;

  if (changes.length > 0) {
    failed = true;
    console.log(
      `[check] ${changes.length} tokens violate the status-shade contract across ${filesChanged} files:`,
    );
    console.log(changes.join("\n"));
    console.log("Run `bun run scripts/consolidate-shades.ts` to apply the fixes.");
  }

  if (textTextViolations.length > 0) {
    failed = true;
    console.log(
      `\n[check] ${textTextViolations.length} legacy \`text-text-{shade}\` class(es) — \`text\` is not a valid hue:`,
    );
    console.log(textTextViolations.join("\n"));
    console.log("  → replace with the correct surface hue (e.g. text-surface-400).");
  }

  if (failed) process.exit(1);

  if (surface800Count > 0) {
    console.log(
      `\n[advisory] ${surface800Count} \`bg-surface-800\` / \`dark:bg-surface-800\` solid surface fills detected.`,
    );
    console.log(
      "  This is the accepted dark surface across the codebase (known wider cleanup) — not gated.",
    );
  }

  console.log("status shades: OK — no contract drift found");
  process.exit(0);
}

if (DRY) {
  console.log(`[dry] ${changes.length} token replacements across ${filesChanged} files`);
} else {
  console.log(`[applied] ${changes.length} token replacements across ${filesChanged} files`);
}
if (changes.length > 0) console.log(changes.join("\n"));

/**
 * @file scripts/consolidate-shades.mjs
 * @description One-time codemod that enforces the SveltyCMS status-shade contract
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
 * Files with deliberate solid-fill "dark text on amber" / "light text on error
 * toast" patterns are skipped and hand-tuned afterwards (see EXCLUDED).
 *
 * Usage:
 *   bun run scripts/consolidate-shades.mjs --check   # drift guard (exit 1 on drift) —
 *                                                    # wired into `bun run check`
 *   bun run scripts/consolidate-shades.mjs --dry     # preview only, no writes
 *   bun run scripts/consolidate-shades.mjs           # apply the fixes in place
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const CHECK = process.argv.includes("--check");
const ROOT = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const EXCLUDED = new Set([
  "highlighted-text.svelte",
  "restart-required-banner.svelte",
  "image-editor-modal.svelte",
  "dropdown.svelte",
  "drop-down.svelte",
  // src/app.css holds the canonical preset recipe utilities (preset-tonal-*,
  // preset-outlined-*, preset-ghost-*, preset-soft-surface). Their emphasis
  // steps (text-{hue}-700 / dark:text-{hue}-200/300) are intentionally tuned
  // for contrast on washes and are exempted from auto-consolidation by owner
  // decision — the guard must report other files only and never rewrite this
  // recipe file back to the default steps.
  "app.css",
]);

const HUE_MAP = {
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

const changes = [];
let filesChanged = 0;

function hasSolidFill(line, hue) {
  const re = new RegExp(`(?:^|[\\s:(])bg-${hue}-[5-8]\\d\\d(?![\\d/])|preset-filled-${hue}-500`);
  return re.test(line);
}

function transformToken(prefix, variants, prop, edge, hue, shade, alpha, directive) {
  const newHue = HUE_MAP[hue] ?? hue;
  if (!CONTRACT.has(newHue))
    return `${prefix}${variants}${prop}${edge}-${hue}-${shade}${alpha ? `/${alpha}` : ""}`;
  const isDark = variants.includes("dark:");
  const emit = (cls) => `${prefix}${variants}${cls}`;

  // Svelte `class:` directive names cannot contain `/` (e.g. `class:bg-error-500/10`
  // is a parse error). In directive context only apply slash-free transforms —
  // legacy-hue remaps and text-shade steps; washes/borders stay untouched and are
  // rewritten by hand as `class={cond ? 'bg-…-500/10' : ''}` instead.
  const introducesSlash = (cls) => /\/[0-9]/.test(cls);

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
      const soft = (cls) => {
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
      // legacy-hue remap only (rings/gradients/strokes keep their shade)
      return `${prefix}${variants}${prop}${edge ?? ""}-${newHue}-${shade}${alpha ? `/${alpha}` : ""}`;
  }
}

function processFile(file) {
  const base = file.split(/[\\/]/).pop();
  if (EXCLUDED.has(base)) return;
  const original = readFileSync(file, "utf8");
  const lines = original.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const solidBgs = new Set();
    for (const h of CONTRACT) if (hasSolidFill(line, h)) solidBgs.add(h);

    const next = line.replace(
      TOKEN_RE,
      (m, prefix, variants, prop, edge, hue, shade, alpha, _offset, _str) => {
        const mapped = HUE_MAP[hue] ?? hue;
        if (!CONTRACT.has(mapped)) return m;
        const isDark = variants.includes("dark:");
        // skip dark text-shade consolidation when this class string carries a solid fill
        if (
          isDark &&
          prop === "text" &&
          (shade === "200" || shade === "300") &&
          solidBgs.has(mapped)
        )
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
      },
    );

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

function walk(dir) {
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
  if (changes.length > 0) {
    console.log(
      `[check] ${changes.length} tokens violate the status-shade contract across ${filesChanged} files:`,
    );
    console.log(changes.join("\n"));
    console.log("Run `bun run scripts/consolidate-shades.mjs` to apply the fixes.");
    process.exit(1);
  }
  console.log("status shades: OK — no contract drift found");
  process.exit(0);
}

if (DRY) {
  console.log(`[dry] ${changes.length} token replacements across ${filesChanged} files`);
} else {
  console.log(`[applied] ${changes.length} token replacements across ${filesChanged} files`);
}
console.log(changes.join("\n"));

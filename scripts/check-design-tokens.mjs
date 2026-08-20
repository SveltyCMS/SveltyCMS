/**
 * @file scripts/check-design-tokens.mjs
 * @description Fail the build when a component references a design-system class
 * that no longer resolves to any CSS.
 *
 * WHY THIS EXISTS
 * ---------------
 * Tailwind v4 has no config file and no error for an unknown class. A typo
 * (`preset-outline-surface-500` for `preset-outlin*ed*-surface-500`), a missing
 * shade (`preset-filled-warning` instead of `-500`), or a leftover Skeleton
 * class (`variant-soft-primary`) all compile perfectly and then render as an
 * element with no background, no border and no colour. Nothing fails, nothing
 * warns — the page just quietly looks wrong, and only on the one screen that
 * uses it.
 *
 * That is how the CMS ended up with borderless theme toggles, three identical
 * media-library tabs and unstyled licence buttons. This check makes that class
 * of bug loud instead of silent.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. Every `preset-*` class used in src/ is defined as an @utility in
 *      app.css / utilities.css, OR covered by an `@source inline(...)` safelist.
 *   2. No `variant-*` (Skeleton.dev) classes remain — the migration is done.
 *
 * Dynamic names built by concatenation (`preset-tonal-${color}`) are resolved
 * against the safelist patterns rather than skipped, because those are exactly
 * the ones Tailwind purges.
 *
 * Exit 1 on any failure.
 *
 * Usage: bun run scripts/check-design-tokens.mjs [--quiet]
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const argv = process.argv.slice(2);
const QUIET =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  argv.includes("--quiet") ||
  argv.includes("--ci");

const CSS_FILES = ["src/app.css", "src/utilities.css"];
const SRC_DIR = "src";
const SCAN_EXT = new Set([".svelte", ".ts", ".js"]);

/** Expand a brace pattern: "a-{b,c}-{1,2}" → ["a-b-1","a-b-2","a-c-1","a-c-2"] */
function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]*)\}/);
  if (!match) return [pattern];
  const [token, body] = match;
  return body.split(",").flatMap((option) => expandBraces(pattern.replace(token, option.trim())));
}

function collectDefined() {
  const defined = new Set();
  for (const file of CSS_FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const css = fs.readFileSync(full, "utf8");

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

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "paraglide") continue;
      yield* walk(full);
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const defined = collectDefined();
const failures = [];
const legacy = [];

for (const file of walk(path.join(root, SRC_DIR))) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    // Skeleton leftovers
    for (const m of line.matchAll(
      /(?<![a-zA-Z0-9_-])variant-(?:filled|soft|ghost|ringed|glass|outlined|tonal)-[a-z0-9-]+/g,
    )) {
      legacy.push(`${rel}:${i + 1}  ${m[0]}`);
    }
    // preset-* references. Skip template holes (`preset-tonal-${color}`) —
    // those are validated by the safelist, not by the literal.
    for (const m of line.matchAll(/\bpreset-[a-z]+-[a-z0-9-]+/g)) {
      const name = m[0];
      if (name.includes("$")) continue;
      if (defined.has(name)) continue;
      failures.push(`${rel}:${i + 1}  ${name}`);
    }
  });
}

// Components that build class names dynamically must have every combination
// safelisted, or Tailwind purges the ones that never appear literally.
const DYNAMIC_COLORS = [
  "primary",
  "secondary",
  "tertiary",
  "success",
  "warning",
  "error",
  "surface",
];
const DYNAMIC_REQUIRED = [];
for (const color of DYNAMIC_COLORS) {
  DYNAMIC_REQUIRED.push(
    `preset-filled-${color}-500`,
    `preset-outlined-${color}-500`,
    `preset-ghost-${color}-500`,
    `preset-tonal-${color}`,
  );
}
const missingDynamic = DYNAMIC_REQUIRED.filter((n) => !defined.has(n));

let failed = false;

if (failures.length) {
  failed = true;
  console.error(
    `\n✖ ${failures.length} reference(s) to a preset class that is not defined anywhere:`,
  );
  for (const f of failures) console.error(`    ${f}`);
  console.error("  → check the spelling and the shade suffix against the matrix in src/app.css");
}

if (legacy.length) {
  failed = true;
  console.error(`\n✖ ${legacy.length} leftover Skeleton.dev variant-* class(es):`);
  for (const f of legacy) console.error(`    ${f}`);
  console.error("  → map to the preset equivalent (variant-soft-x → preset-tonal-x, etc.)");
}

if (missingDynamic.length) {
  failed = true;
  console.error(
    `\n✖ ${missingDynamic.length} preset(s) reachable from a component prop but not defined/safelisted:`,
  );
  for (const f of missingDynamic) console.error(`    ${f}`);
  console.error("  → Alert/Badge/Card accept these colours; an undefined one renders unstyled");
}

if (failed) {
  console.error("\ndesign tokens: FAIL\n");
  process.exit(1);
}

if (!QUIET) {
  console.log(
    `design tokens: OK — ${defined.size} classes defined, no dead references, no variant-* left`,
  );
} else {
  console.log("design tokens: OK");
}

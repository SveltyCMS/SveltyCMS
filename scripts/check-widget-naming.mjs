/**
 * @file scripts/check-widget-naming.mjs
 * @description Verify core + custom (+ marketplace) widget naming.
 *
 * CI / quiet mode: summary + failures only (CI=true or --quiet / --ci).
 * Local default: per-item status lines for full visibility.
 *
 * Exit 1 when any hard failure is found.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const argv = process.argv.slice(2);
const QUIET =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  argv.includes("--quiet") ||
  argv.includes("--ci") ||
  process.env.CI_QUIET === "1" ||
  process.env.CI_QUIET === "true";

// Load TS naming module via bun when available; fallback: inline dual of rules
async function loadNaming() {
  try {
    const mod = await import(pathToFileURL(path.join(root, "src/widgets/widget-naming.ts")).href);
    return mod;
  } catch {
    // Minimal inline mirror if import fails under node
    const widgetNameToFolder = (n) =>
      n
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
    const FOLDER_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
    const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;
    const validateWidgetNaming = (folder, declaredName, tier = "custom") => {
      const errors = [];
      const warnings = [];
      if (!folder || !FOLDER_RE.test(folder)) {
        errors.push(`bad folder ${folder}`);
      }
      let name = (declaredName && String(declaredName).trim()) || "";
      if (!name) errors.push("missing Name");
      else if (!NAME_RE.test(name)) errors.push(`bad Name ${name}`);
      if (name && folder && FOLDER_RE.test(folder) && NAME_RE.test(name)) {
        const expected = widgetNameToFolder(name);
        if (expected !== folder) {
          const msg = `Name ${name} → ${expected} but folder is ${folder}`;
          if (tier === "core") warnings.push(msg);
          else errors.push(msg);
        }
      }
      return { ok: errors.length === 0 && !!name && !!folder, name, folder, errors, warnings };
    };
    return { widgetNameToFolder, validateWidgetNaming };
  }
}

const { widgetNameToFolder, validateWidgetNaming } = await loadNaming();

function scan(tier) {
  const dir = path.join(root, "src/widgets", tier);
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = entry.name;
    const indexPath = path.join(dir, folder, "index.ts");
    if (!fs.existsSync(indexPath)) {
      rows.push({
        tier,
        folder,
        name: null,
        ok: false,
        errors: ["missing index.ts"],
        warnings: [],
      });
      continue;
    }
    const src = fs.readFileSync(indexPath, "utf8");
    const m = src.match(/Name:\s*["']([^"']+)["']/);
    const name = m ? m[1] : null;
    const v = validateWidgetNaming(folder, name, tier);
    rows.push({
      tier,
      folder,
      name: name || "(missing)",
      mapped: name ? widgetNameToFolder(name) : "",
      ok: v.ok,
      errors: v.errors,
      warnings: v.warnings,
    });
  }
  return rows;
}

const all = [...scan("core"), ...scan("custom"), ...scan("marketplace")];
const bad = all.filter((r) => !r.ok);
const warn = all.filter((r) => r.ok && r.warnings.length);
const okCount = all.filter((r) => r.ok).length;

console.log(
  `widget-naming: TOTAL ${all.length}  OK ${okCount}  FAIL ${bad.length}  WARN ${warn.length}`,
);

function printRow(r) {
  const status = !r.ok ? "FAIL" : r.warnings.length ? "WARN" : "OK";
  console.log(
    `${status.padEnd(5)} ${r.tier.padEnd(12)} ${r.folder.padEnd(18)} Name=${String(r.name).padEnd(16)} maps→${r.mapped || "-"}`,
  );
  for (const e of r.errors || []) console.error(`      error: ${e}`);
  for (const w of r.warnings || []) console.warn(`      warn:  ${w}`);
}

if (QUIET) {
  // Failures + warnings only — collapse green noise in CI
  for (const r of bad) printRow(r);
  for (const r of warn) printRow(r);
  if (bad.length === 0 && warn.length === 0) {
    console.log("widget-naming: all packages OK");
  }
} else {
  for (const r of all) printRow(r);
}

// Exit non-zero on any hard failure so CI/pre-commit gates actually enforce naming
process.exit(bad.length ? 1 : 0);

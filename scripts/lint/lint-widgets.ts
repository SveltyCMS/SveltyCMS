/**
 * @file scripts/lint/lint-widgets.ts
 * @description Unified widget linter for SveltyCMS.
 *
 * Combines:
 * 1. Widget naming and three-pillar contract (index.ts, input.svelte, display.svelte)
 * 2. Widget accessibility drift guard (WCAG 2.4.7/2.4.13 outline & cursor-pointer rules)
 * 3. Dashboard marketplace widget packages (widget.json manifest, readme.mdx, index.svelte)
 *
 * Usage:
 *   bun run scripts/lint/lint-widgets.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { validateWidgetNaming } from "@src/widgets/widget-naming";

const root = process.cwd();
const argv = process.argv.slice(2);
const QUIET =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  argv.includes("--quiet") ||
  argv.includes("--ci") ||
  process.env.CI_QUIET === "1" ||
  process.env.CI_QUIET === "true";

// ── 1. WIDGET NAMING & THREE-PILLAR CONTRACT ─────────────────────────────────

interface NamingFinding {
  path: string;
  kind: "error" | "warning";
  message: string;
}

function checkWidgetNamingAndPillars(): NamingFinding[] {
  const findings: NamingFinding[] = [];
  const tiers = [
    { dir: join(root, "src/widgets/core"), tier: "core" as const },
    { dir: join(root, "src/widgets/custom"), tier: "custom" as const },
  ];

  for (const { dir, tier } of tiers) {
    if (!existsSync(dir)) continue;
    for (const folder of readdirSync(dir)) {
      const full = join(dir, folder);
      // Skip files like widget-header.svelte
      if (!existsSync(full) || !readdirSync(full, { withFileTypes: true }).some(() => true))
        continue;

      const indexPath = join(full, "index.ts");
      if (!existsSync(indexPath)) {
        findings.push({ path: relative(root, full), kind: "error", message: "missing index.ts" });
        continue;
      }

      // Check pillar files
      const inputPath = join(full, "input.svelte");
      const displayPath = join(full, "display.svelte");
      if (!existsSync(inputPath)) {
        findings.push({
          path: relative(root, full),
          kind: "error",
          message: "missing input.svelte",
        });
      }
      if (!existsSync(displayPath)) {
        findings.push({
          path: relative(root, full),
          kind: "error",
          message: "missing display.svelte",
        });
      }

      // Extract declared widget Name from index.ts
      const indexSrc = readFileSync(indexPath, "utf8");
      const nameMatch = indexSrc.match(/\bName\s*:\s*["']([^"']+)["']/);
      const declaredName = nameMatch ? nameMatch[1] : undefined;

      const result = validateWidgetNaming(folder, declaredName, tier);
      for (const err of result.errors) {
        findings.push({ path: relative(root, full), kind: "error", message: err });
      }
      for (const warn of result.warnings) {
        findings.push({ path: relative(root, full), kind: "warning", message: warn });
      }
    }
  }

  return findings;
}

// ── 2. WIDGET ACCESSIBILITY DRIFT GUARD ──────────────────────────────────────

const RULE_A_MESSAGE =
  "cursor-pointer on a non-link element — pointer is reserved for links (accessibility.mdx)";
const RULE_B_MESSAGE =
  "outline-none/outline-0 without a ring alternative — add a focus-visible ring (WCAG 2.4.7/2.4.13)";

const FORM_CONTROLS = new Set(["input", "textarea", "select"]);

function* classAttrs(text: string): Generator<{ content: string; start: number }> {
  const re = /(?<![A-Za-z0-9_])class\s*=/g;
  for (const m of text.matchAll(re)) {
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    const q = text[i];
    if (q !== '"' && q !== "'" && q !== "`") continue;
    let j = i + 1;
    let brace = 0;
    while (j < text.length) {
      const c = text[j];
      if (q === "`") {
        if (c === "$" && text[j + 1] === "{") {
          brace += 1;
          j += 2;
          continue;
        }
        if (c === "}" && brace > 0) {
          brace -= 1;
          j += 1;
          continue;
        }
        if (c === "`" && brace === 0) break;
      } else if (c === q) break;
      j += 1;
    }
    if (text[j] !== q) continue;
    yield { content: text.slice(i + 1, j), start: i };
  }
}

function ownerTag(text: string, attrStart: number): string | null {
  const before = text.slice(0, attrStart);
  const lastCommentOpen = before.lastIndexOf("<!--");
  const lastCommentClose = before.lastIndexOf("-->");
  if (lastCommentOpen > lastCommentClose) return null;
  const seg = before.slice(before.lastIndexOf(">") + 1);
  const tags = [...seg.matchAll(/<\s*\/?\s*([A-Za-z][\w-]*)/g)];
  if (tags.length === 0) return null;
  return tags[tags.length - 1][1];
}

function lineCol(text: string, offset: number): { line: number; col: number } {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

export interface A11yFinding {
  file: string;
  line: number;
  col: number;
  rule: "A" | "B";
  tag: string;
  message: string;
}

/**
 * Pure function: audit markup for widget accessibility rules.
 */
export function auditWidgetA11y(text: string, label = "<snippet>"): A11yFinding[] {
  const findings: A11yFinding[] = [];
  for (const attr of classAttrs(text)) {
    const tag = ownerTag(text, attr.start);
    if (!tag) continue;
    const tagLower = tag.toLowerCase();
    if (/\bcursor-pointer\b/.test(attr.content) && tagLower !== "a") {
      findings.push({
        file: label,
        ...lineCol(text, attr.start),
        rule: "A",
        tag,
        message: RULE_A_MESSAGE,
      });
    }
    const isRawTag = /^[a-z]/.test(tag);
    if (isRawTag && !FORM_CONTROLS.has(tagLower)) {
      const hasOutlineRemoval = /\boutline-(?:none|0)\b/.test(attr.content);
      const hasRing = /\bring-(?!0\b|offset\b)/.test(attr.content);
      if (hasOutlineRemoval && !hasRing) {
        findings.push({
          file: label,
          ...lineCol(text, attr.start),
          rule: "B",
          tag,
          message: RULE_B_MESSAGE,
        });
      }
    }
  }
  return findings;
}

function checkWidgetA11y(): { totalFiles: number; findings: A11yFinding[] } {
  const allFindings: A11yFinding[] = [];
  let totalFiles = 0;

  function walkSvelte(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkSvelte(full);
      } else if (entry.name.endsWith(".svelte")) {
        totalFiles++;
        const text = readFileSync(full, "utf8");
        const rel = relative(root, full).replaceAll("\\", "/");
        allFindings.push(...auditWidgetA11y(text, rel));
      }
    }
  }

  walkSvelte(join(root, "src/widgets"));
  return { totalFiles, findings: allFindings };
}

// ── 3. DASHBOARD WIDGET PACKAGES ─────────────────────────────────────────────

interface DashboardPackageFinding {
  pkg: string;
  message: string;
}

function checkDashboardWidgetPackages(): DashboardPackageFinding[] {
  const findings: DashboardPackageFinding[] = [];
  const widgetsDir = join(root, "src/routes/(app)/dashboard/widgets");
  if (!existsSync(widgetsDir)) return findings;

  const REQUIRED_FIELDS = [
    "id",
    "name",
    "icon",
    "version",
    "type",
    "author",
    "license",
    "component",
    "defaultSize",
    "sveltycms",
  ];

  for (const entry of readdirSync(widgetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = entry.name;
    const dir = join(widgetsDir, pkg);

    const manifestPath = join(dir, "widget.json");
    if (!existsSync(manifestPath)) {
      findings.push({ pkg, message: "missing widget.json" });
      continue;
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      for (const field of REQUIRED_FIELDS) {
        if (manifest[field] === undefined || manifest[field] === null || manifest[field] === "") {
          findings.push({ pkg, message: `widget.json missing required field '${field}'` });
        }
      }
      if (manifest.id && manifest.id !== pkg) {
        findings.push({
          pkg,
          message: `widget.json id '${manifest.id}' does not match folder '${pkg}'`,
        });
      }
    } catch {
      findings.push({ pkg, message: "invalid JSON in widget.json" });
    }

    const readmePath = join(dir, "readme.mdx");
    if (!existsSync(readmePath)) {
      findings.push({ pkg, message: "missing required readme.mdx" });
    }

    const svelteFiles = readdirSync(dir).filter((f) => f.endsWith(".svelte"));
    if (!svelteFiles.includes("index.svelte")) {
      findings.push({ pkg, message: "missing index.svelte component" });
    }
  }

  return findings;
}

// ── 4. RUN ALL CHECKS ────────────────────────────────────────────────────────

function run(): void {
  let failed = false;

  // 1. Naming & pillars
  const namingFindings = checkWidgetNamingAndPillars();
  const namingErrors = namingFindings.filter((f) => f.kind === "error");
  const namingWarnings = namingFindings.filter((f) => f.kind === "warning");

  if (namingErrors.length > 0) {
    failed = true;
    console.error(`\n❌ Widget naming errors (${namingErrors.length}):`);
    for (const f of namingErrors) console.error(`  ${f.path}: ${f.message}`);
  }
  if (!QUIET && namingWarnings.length > 0) {
    console.warn(`\n⚠️  Widget naming warnings (${namingWarnings.length}):`);
    for (const f of namingWarnings) console.warn(`  ${f.path}: ${f.message}`);
  }

  // 2. A11y
  const a11yResult = checkWidgetA11y();
  if (a11yResult.findings.length > 0) {
    failed = true;
    console.error(`\n❌ Widget a11y drift violations (${a11yResult.findings.length}):`);
    for (const f of a11yResult.findings) {
      console.error(`  ${f.file}:${f.line}:${f.col} [${f.rule}] <${f.tag}> ${f.message}`);
    }
  }

  // 3. Dashboard packages
  const pkgFindings = checkDashboardWidgetPackages();
  if (pkgFindings.length > 0) {
    failed = true;
    console.error(`\n❌ Dashboard widget package errors (${pkgFindings.length}):`);
    for (const f of pkgFindings) console.error(`  ${f.pkg}: ${f.message}`);
  }

  if (failed) process.exit(1);

  if (!QUIET) {
    console.log(
      `✅ Widget lint OK — naming, 3-pillar contracts, a11y (${a11yResult.totalFiles} files), and marketplace manifests clean.`,
    );
  }
}

// Only execute when run directly via CLI (not when imported in unit tests)
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/lint-widgets.ts")) {
  run();
}

#!/usr/bin/env bun
/**
 * @file scripts/ci-report-playwright.ts
 * @description Smart CI reporter for Playwright runs.
 *
 * Writes a compact, actionable GITHUB_STEP_SUMMARY:
 * - passed / failed / flaky / skipped counts
 * - failed test titles + first error line
 * - fix hints by error class (session, 500, timeout, selector)
 * - optional preview.log tail on failure
 *
 * Emits GitHub annotations (::error) for each failed test (capped).
 *
 * Usage:
 *   bun run scripts/ci-report-playwright.ts --label="E2E — Config" \
 *     --json=tests/playwright-results.json --preview=preview.log
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function arg(name: string, fallback = ""): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const label = arg("label", "Playwright");
const jsonPath = arg("json", join(ROOT, "tests", "playwright-results.json"));
const previewPath = arg("preview", join(ROOT, "preview.log"));
const maxFailures = Number.parseInt(arg("max-failures", "25"), 10) || 25;
const maxPreviewLines = Number.parseInt(arg("preview-lines", "40"), 10) || 40;

type SpecResult = {
  title: string;
  fullTitle: string;
  file?: string;
  status: string;
  error?: string;
  project?: string;
};

type Parsed = {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  timedOut: number;
  interrupted: number;
  failures: SpecResult[];
};

function walkSuites(node: any, trail: string[], out: SpecResult[], project?: string): void {
  if (!node) return;
  const title = typeof node.title === "string" ? node.title : "";
  const nextTrail = title ? [...trail, title] : trail;
  const proj = node.projectName || project;

  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) {
      const tests = Array.isArray(spec.tests) ? spec.tests : [];
      for (const t of tests) {
        const results = Array.isArray(t.results) ? t.results : [];
        // Prefer last result (retry outcome)
        const last = results[results.length - 1];
        const status = (last?.status || t.status || "unknown") as string;
        const errMsg =
          last?.error?.message ||
          last?.errors
            ?.map((e: any) => e?.message)
            .filter(Boolean)
            .join("\n") ||
          t.error?.message ||
          "";
        const fullTitle = [...nextTrail, spec.title || t.title || "untitled"]
          .filter(Boolean)
          .join(" › ");
        out.push({
          title: spec.title || t.title || "untitled",
          fullTitle,
          file: spec.file || node.file,
          status,
          error: String(errMsg).slice(0, 800),
          project: proj,
        });
      }
    }
  }

  if (Array.isArray(node.suites)) {
    for (const s of node.suites) walkSuites(s, nextTrail, out, proj);
  }
}

function parsePlaywrightJson(raw: string): Parsed {
  const data = JSON.parse(raw);
  const specs: SpecResult[] = [];
  const suites = data.suites || [];
  for (const s of suites) walkSuites(s, [], specs);

  // Also handle flat stats if present
  const stats = data.stats || {};
  let passed = 0;
  let failed = 0;
  let flaky = 0;
  let skipped = 0;
  let timedOut = 0;
  let interrupted = 0;
  const failures: SpecResult[] = [];

  for (const s of specs) {
    switch (s.status) {
      case "passed":
      case "expected":
        passed++;
        break;
      case "flaky":
        flaky++;
        passed++; // ultimately green
        break;
      case "skipped":
        skipped++;
        break;
      case "timedOut":
        timedOut++;
        failed++;
        failures.push(s);
        break;
      case "interrupted":
        interrupted++;
        failed++;
        failures.push(s);
        break;
      case "failed":
      case "unexpected":
        failed++;
        failures.push(s);
        break;
      default:
        // unknown — count as fail if error present
        if (s.error) {
          failed++;
          failures.push(s);
        }
        break;
    }
  }

  // Prefer official stats when available (more accurate with projects)
  if (typeof stats.expected === "number") {
    passed = (stats.expected || 0) + (stats.flaky || 0);
    failed = (stats.unexpected || 0) + (stats.flaky === undefined ? 0 : 0);
    // stats.unexpected = failed tests
    failed = stats.unexpected || failed;
    flaky = stats.flaky || flaky;
    skipped = stats.skipped || skipped;
  }

  return { passed, failed, flaky, skipped, timedOut, interrupted, failures };
}

function hintForError(error: string): string {
  const e = error.toLowerCase();
  if (/auth_sessions|storage.?state|session cookie|redirect.*login|\/login/.test(e)) {
    return "→ Session/auth: check e2e-prep admin.json cookies, testing API login Set-Cookie, ORIGIN=http://127.0.0.1:4173";
  }
  if (/500|internal error|system error|cold.?boot|not ready|idle/.test(e)) {
    return "→ Server 500: download preview-log artifact; check middleware/load + DB ready after archive restore";
  }
  if (/timeout|exceeded|waiting for/.test(e)) {
    return "→ Timeout: selector missing or slow UI; prefer testid + seed via /api/testing; avoid soft-skip";
  }
  if (/tobevisible|locator|strict mode|element\(s\) not found/.test(e)) {
    return "→ Selector: use data-testid; confirm page shell rendered (not login/500)";
  }
  if (/net::err|econnrefused|connection refused/.test(e)) {
    return "→ Server down: wait-on / trap killed preview; check PORT 4173 and build/index.js";
  }
  if (/csrf|403|forbidden/.test(e)) {
    return "→ Authz/CSRF: use fetchApi / testing headers; verify ENDPOINT_PERMISSIONS";
  }
  return "→ See HTML report artifact + trace on first retry";
}

function tailFile(path: string, lines: number): string {
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  const all = text.split(/\r?\n/);
  return all.slice(-lines).join("\n");
}

function writeSummary(md: string): void {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (p) {
    appendFileSync(p, md, "utf8");
  } else {
    console.log(md);
  }
}

function annotate(failures: SpecResult[]): void {
  let n = 0;
  for (const f of failures) {
    if (n >= 15) break;
    const file = f.file || "tests/e2e";
    const msg = f.error.split("\n")[0]?.slice(0, 200) || f.status;
    // GitHub workflow command
    console.log(`::error file=${file},title=${f.title}::${msg}`);
    n++;
  }
}

function main(): number {
  if (!existsSync(jsonPath)) {
    const md = `## ${label}\n\n⚠️ No Playwright JSON report at \`${jsonPath}\`.\n\n`;
    writeSummary(md);
    console.warn(`[ci-report-playwright] missing ${jsonPath}`);
    return 0; // don't fail the reporter itself
  }

  let parsed: Parsed;
  try {
    // Strip UTF-8 BOM if present (Windows / some writers)
    const raw = readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
    parsed = parsePlaywrightJson(raw);
  } catch (err: any) {
    writeSummary(`## ${label}\n\n❌ Failed to parse Playwright JSON: ${err.message}\n\n`);
    return 0;
  }

  const total =
    parsed.passed + parsed.failed + parsed.skipped ||
    parsed.passed + parsed.failed + parsed.flaky + parsed.skipped;
  const icon = parsed.failed > 0 ? "❌" : "✅";

  let md = `## ${icon} ${label}\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| ✅ Passed | ${parsed.passed} |\n`;
  md += `| ❌ Failed | ${parsed.failed} |\n`;
  if (parsed.flaky) md += `| ⚠️ Flaky (recovered) | ${parsed.flaky} |\n`;
  if (parsed.skipped) md += `| ⏭️ Skipped | ${parsed.skipped} |\n`;
  if (parsed.timedOut) md += `| ⏱️ Timed out | ${parsed.timedOut} |\n`;
  md += `| **Total reported** | ${total} |\n\n`;

  if (parsed.failures.length === 0) {
    md += `_All tests green for this job._\n\n`;
    writeSummary(md);
    // Machine-readable for aggregation
    const outDir = join(ROOT, "tests", "test-results");
    try {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        join(outDir, `playwright-summary-${label.replace(/[^\w.-]+/g, "_")}.json`),
        JSON.stringify({ label, ...parsed, failures: [] }),
        "utf8",
      );
    } catch {
      /* ignore */
    }
    return 0;
  }

  md += `<details open><summary>❌ Failures (${Math.min(parsed.failures.length, maxFailures)} shown)</summary>\n\n`;
  md += `| Test | Error | Fix hint |\n|------|-------|----------|\n`;
  for (const f of parsed.failures.slice(0, maxFailures)) {
    const err = (f.error || f.status).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160);
    const hint = hintForError(f.error || "").replace(/\|/g, "\\|");
    const title = f.fullTitle.replace(/\|/g, "\\|").slice(0, 120);
    md += `| \`${title}\` | ${err} | ${hint} |\n`;
  }
  if (parsed.failures.length > maxFailures) {
    md += `\n_… +${parsed.failures.length - maxFailures} more — see HTML report artifact_\n`;
  }
  md += `\n</details>\n\n`;

  md += `### How to debug\n\n`;
  md += `1. Download artifact **playwright-report-*** for this job (HTML + traces on retry).\n`;
  md += `2. Download **preview-log-*** if errors mention 500 / connection refused.\n`;
  md += `3. Local: \`PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173 bun x playwright test --project=chromium --grep="..."\`\n\n`;

  const previewTail = tailFile(previewPath, maxPreviewLines);
  if (previewTail && parsed.failed > 0) {
    md += `<details><summary>📋 preview.log (last ${maxPreviewLines} lines)</summary>\n\n\`\`\`\n`;
    md += previewTail.slice(0, 6000);
    md += `\n\`\`\`\n</details>\n\n`;
  }

  writeSummary(md);
  annotate(parsed.failures);

  try {
    const outDir = join(ROOT, "tests", "test-results");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, `playwright-summary-${label.replace(/[^\w.-]+/g, "_")}.json`),
      JSON.stringify({
        label,
        passed: parsed.passed,
        failed: parsed.failed,
        flaky: parsed.flaky,
        skipped: parsed.skipped,
        failures: parsed.failures.slice(0, maxFailures).map((f) => ({
          title: f.fullTitle,
          file: f.file,
          error: f.error?.slice(0, 400),
          hint: hintForError(f.error || ""),
        })),
      }),
      "utf8",
    );
  } catch {
    /* ignore */
  }

  return 0;
}

process.exit(main());

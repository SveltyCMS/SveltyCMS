/**
 * @file tests/benchmark./modules/benchmark-mdx.ts
 * @description MDX report file operations — read, write sections, update labels.
 *
 * ### Concurrency
 * Uses a simple file-based mutex to prevent parallel writes to the same MDX file.
 * SQLite handles its own concurrency via WAL mode.
 */
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Per-Dimension Budgets (used by analysis module)
// ─────────────────────────────────────────────────────────────

export const PER_DIMENSION_BUDGETS: Record<
  string,
  Record<string, { budget: number; desc: string }>
> = {
  sqlite: {
    cold_avg: { budget: 5000, desc: "Cold start avg latency (ms)" },
    warm_avg: { budget: 2, desc: "Warm request avg latency (ms)" },
    warm_p95: { budget: 10, desc: "Warm request p95 latency (ms)" },
    crud_avg: { budget: 80, desc: "CRUD operation avg (ms)" },
    cache_hit: { budget: 0.5, desc: "Cache hit latency (ms)" },
    cache_miss: { budget: 15, desc: "Cache miss + DB fallback (ms)" },
    concurrency: { budget: 50, desc: "Concurrent p95 under load (ms)" },
  },
  postgresql: {
    cold_avg: { budget: 3000, desc: "Cold start avg latency (ms)" },
    warm_avg: { budget: 2, desc: "Warm request avg latency (ms)" },
    warm_p95: { budget: 8, desc: "Warm request p95 latency (ms)" },
    crud_avg: { budget: 30, desc: "CRUD operation avg (ms)" },
    cache_hit: { budget: 0.5, desc: "Cache hit latency (ms)" },
    cache_miss: { budget: 10, desc: "Cache miss + DB fallback (ms)" },
    concurrency: { budget: 30, desc: "Concurrent p95 under load (ms)" },
  },
  mariadb: {
    cold_avg: { budget: 3500, desc: "Cold start avg latency (ms)" },
    warm_avg: { budget: 2, desc: "Warm request avg latency (ms)" },
    warm_p95: { budget: 10, desc: "Warm request p95 latency (ms)" },
    crud_avg: { budget: 40, desc: "CRUD operation avg (ms)" },
    cache_hit: { budget: 0.5, desc: "Cache hit latency (ms)" },
    cache_miss: { budget: 12, desc: "Cache miss + DB fallback (ms)" },
    concurrency: { budget: 40, desc: "Concurrent p95 under load (ms)" },
  },
  mongodb: {
    cold_avg: { budget: 3500, desc: "Cold start avg latency (ms)" },
    warm_avg: { budget: 2, desc: "Warm request avg latency (ms)" },
    warm_p95: { budget: 10, desc: "Warm request p95 latency (ms)" },
    crud_avg: { budget: 40, desc: "CRUD operation avg (ms)" },
    cache_hit: { budget: 0.5, desc: "Cache hit latency (ms)" },
    cache_miss: { budget: 12, desc: "Cache miss + DB fallback (ms)" },
    concurrency: { budget: 40, desc: "Concurrent p95 under load (ms)" },
  },
};

// ─────────────────────────────────────────────────────────────
// Simple file mutex for MDX writes
// ─────────────────────────────────────────────────────────────

const _mdxLocks = new Set<string>();

function acquireMdxLock(docPath: string, timeoutMs = 5000): boolean {
  const start = Date.now();
  while (_mdxLocks.has(docPath)) {
    if (Date.now() - start > timeoutMs) return false;
    // Busy-wait (bun test runs sequentially per file, contention is rare)
  }
  _mdxLocks.add(docPath);
  return true;
}

function releaseMdxLock(docPath: string): void {
  _mdxLocks.delete(docPath);
}

// ─────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDbType(): string {
  return typeof process !== "undefined"
    ? process.env.DB_TYPE || "sqlite"
    : "sqlite";
}

export function getDocPath(): string {
  const dbType = getDbType();
  return path.resolve(
    process.cwd(),
    "docs/project/benchmarks",
    `benchmark_${dbType.replace("-", "_")}.mdx`,
  );
}

/** Utility slugify for tag matching. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
}

/** Matrix-aligned tag slug from shortLabel (see scripts/benchmark-matrix/reporting.ts). */
export function shortLabelToTag(shortLabel: string): string {
  return shortLabel
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .toUpperCase();
}

/** Explicit test-file → tag map — prevents `content_*` prefix collisions. */
const TEST_FILE_TO_TAG: Record<string, string> = {
  "content-incremental-reload": "INCREMENTAL",
  "content-scale-stress": "CONTENT_STRESS",
  "content-scan": "SCAN",
  "entry-edit-hydration": "EDIT_HYDRATE",
  "cold-start-phased": "COLD_START",
  "truth-latency": "TRUTH_AUDIT",
  "hooks-performance": "HOOKS_TRACE",
  "cache-hit-ratio": "CACHE_EFFICIENCY",
  "client-journey": "JOURNEY",
  "state-machine-transition": "STATE_MACHINE",
};

function tagExistsInDoc(doc: string, tag: string): boolean {
  return doc.includes(`<!-- ${tag}_TABLE_START -->`);
}

/** Discover which TABLE tag in the MDX matches the given test file. */
export function discoverTag(
  doc: string,
  testFile: string,
  shortLabel?: string,
): string | null {
  const fileBase = path
    .basename(testFile)
    .replace(/\.test\.(ts|js)$/i, "")
    .replace(/\.(ts|js)$/i, "");

  if (shortLabel) {
    const fromLabel = shortLabelToTag(shortLabel);
    if (tagExistsInDoc(doc, fromLabel)) return fromLabel;
  }

  const explicit = TEST_FILE_TO_TAG[fileBase];
  if (explicit && tagExistsInDoc(doc, explicit)) return explicit;

  const base = fileBase.replace(/-/g, "_");
  const key = (shortLabel || fileBase).toLowerCase().replace(/[^a-z0-9]/g, "");

  const tagRx = /<!-- (\w+)_TABLE_START -->/g;
  let m: RegExpExecArray | null;
  while ((m = tagRx.exec(doc)) !== null) {
    const t = m[1].toLowerCase();
    if (key.includes(t) || t.includes(key) || base.includes(t)) {
      return m[1];
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Atomic MDX Write Helper
// ─────────────────────────────────────────────────────────────

/** Write to temp file first, then rename into place — prevents half-written reports. */
function atomicWrite(docPath: string, content: string): void {
  // Clean up stale temp files from previous crashes
  const dir = path.dirname(docPath);
  const base = path.basename(docPath);
  const staleFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(base + ".tmp."));
  for (const sf of staleFiles) {
    try {
      fs.unlinkSync(path.join(dir, sf));
    } catch {
      /* best-effort */
    }
  }

  const tmpPath = docPath + ".tmp." + Date.now();
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, docPath);
}

// ─────────────────────────────────────────────────────────────
// MDX Write Operations
// ─────────────────────────────────────────────────────────────

/* findSectionPosition removed — writeTruthTable now updates ALL occurrences via loop */

/** Write the truth table between TABLE_START / TABLE_END. Returns the tag name. */
export function writeTruthTable(
  table: string,
  testFile: string,
  shortLabel?: string,
): string | null {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return null;
  if (!acquireMdxLock(docPath)) return null;

  try {
    let doc = fs.readFileSync(docPath, "utf8");
    const tag = discoverTag(doc, testFile, shortLabel);
    if (!tag) return null;

    const START = `<!-- ${tag}_TABLE_START -->`;
    const END = `<!-- ${tag}_TABLE_END -->`;

    const block = [
      "<!-- INSIGHT_PLACEHOLDER -->",
      "",
      "```text",
      table,
      "```",
      "",
      "<!-- SUMMARY_PLACEHOLDER -->",
    ].join("\n");

    // Update ALL occurrences of START/END to ensure both the main
    // section and educational section get the latest data
    let startIdx = 0;
    let replaced = false;
    while (true) {
      const pos = doc.indexOf(START, startIdx);
      if (pos < 0) break;
      const endIdx = doc.indexOf(END, pos + START.length);
      if (endIdx < 0) break;

      doc =
        doc.slice(0, pos) +
        START +
        "\n" +
        block +
        "\n" +
        doc.slice(endIdx + END.length);
      replaced = true;
      startIdx = pos + START.length + block.length + 1;
    }

    if (!replaced) return null;

    atomicWrite(docPath, doc);
    return tag;
  } catch (err: any) {
    if (
      process.env.LOG_LEVEL === "debug" ||
      process.env.BENCHMARK_DEBUG === "true"
    ) {
      console.error(`[MDX Debug] writeTruthTable failed:`, err);
    }
    return null;
  } finally {
    releaseMdxLock(docPath);
  }
}

export function writeSummary(
  summaryTable: string,
  testFile: string,
  tag?: string | null,
  shortLabel?: string,
): void {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return;
  if (!acquireMdxLock(docPath)) return;

  try {
    let doc = fs.readFileSync(docPath, "utf8");
    const resolvedTag = tag || discoverTag(doc, testFile, shortLabel);
    if (!resolvedTag) return;

    const END = `<!-- ${resolvedTag}_TABLE_END -->`;
    const summaryBlock = ["```text", summaryTable, "```"].join("\n");

    // Replace ALL SUMMARY_PLACEHOLDER occurrences globally (simple, no position-shift bugs)
    const placeholder = "<!-- SUMMARY_PLACEHOLDER -->";
    if (doc.includes(placeholder)) {
      doc = doc.split(placeholder).join(summaryBlock);
    } else {
      // Fallback: insert before each END tag
      doc = doc.split(END).join(summaryBlock + "\n" + END);
    }

    atomicWrite(docPath, doc);
  } catch (err: any) {
    if (
      process.env.LOG_LEVEL === "debug" ||
      process.env.BENCHMARK_DEBUG === "true"
    ) {
      console.error(`[MDX Debug] writeSummary failed:`, err);
    }
  } finally {
    releaseMdxLock(docPath);
  }
}

export function writeTrendAndInsight(
  trendLabel: string,
  insight: string,
  testFile: string,
  tag?: string | null,
  shortLabel?: string,
): void {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return;
  if (!acquireMdxLock(docPath)) return;

  try {
    let doc = fs.readFileSync(docPath, "utf8");
    const resolvedTag = tag || discoverTag(doc, testFile, shortLabel);
    if (!resolvedTag) return;

    const START_MARKER = `<!-- ${resolvedTag}_TABLE_START -->`;
    const END = `<!-- ${resolvedTag}_TABLE_END -->`;
    const insightBlock = "\n> " + insight + "\n";

    // ── Update only the heading inside this specific section block ──
    const startPos = doc.indexOf(START_MARKER);
    const endPos = doc.indexOf(END);

    if (startPos >= 0 && endPos > startPos) {
      let section = doc.slice(startPos, endPos);
      const headingRx = /^###\s+\u{1F3F7}.+$/mu;
      const hMatch = section.match(headingRx);
      if (hMatch) {
        const oldLine = hMatch[0];
        const hPos = section.indexOf(oldLine);
        // Append last-run timestamp to trend label
        const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
        const labelWithTs = `${trendLabel} (${ts})`;
        // Replace the icon + any text after it with our trend label
        const newLine = oldLine.replace(
          /(?:\u26AA|\u{1F7E2}|\u{1F7E1}|\u{1F7E0}|\u{1F534})\s*(?:\u2014\s*)?.*$/u,
          labelWithTs,
        );
        section =
          section.slice(0, hPos) +
          newLine +
          section.slice(hPos + oldLine.length);
        doc = doc.slice(0, startPos) + section + doc.slice(endPos);
      }
    }

    // Replace INSIGHT_PLACEHOLDER in ALL occurrences
    const insightPlaceholder = "<!-- INSIGHT_PLACEHOLDER -->";
    if (doc.includes(insightPlaceholder)) {
      doc = doc.split(insightPlaceholder).join(insightBlock);
    } else {
      // Fallback: insert before each END tag
      doc = doc.split(END).join(insightBlock + "\n" + END);
    }

    atomicWrite(docPath, doc);
  } catch (err: any) {
    if (
      process.env.LOG_LEVEL === "debug" ||
      process.env.BENCHMARK_DEBUG === "true"
    ) {
      console.error(`[MDX Debug] writeTrendAndInsight failed:`, err);
    }
  } finally {
    releaseMdxLock(docPath);
  }
}

/** Update the Executive Summary section. */
export function writeExecutiveSummary(
  testName: string,
  trendLabel: string,
  isPartial: boolean,
): void {
  try {
    const docPath = getDocPath();
    if (!fs.existsSync(docPath)) return;
    if (!acquireMdxLock(docPath)) return;

    let doc = fs.readFileSync(docPath, "utf8");
    const marker = "## \u{1F4CA} Executive Summary";
    if (!doc.includes(marker)) {
      releaseMdxLock(docPath);
      return;
    }

    // Remove pending placeholder
    doc = doc.replace(
      "\n> \u23F3 Pending \u2014 run benchmarks to populate.\n",
      "\n",
    );

    // Add partial watermark
    if (isPartial && !doc.includes("Partial update")) {
      const now = new Date().toISOString().slice(0, 10);
      const db = getDbType();
      const watermark =
        "\n> \u{1F4CB} **Partial update**: `" +
        testName +
        "` / " +
        db.toUpperCase() +
        " / " +
        now +
        " — run full matrix for complete results.\n";
      doc = doc.replace(marker, marker + watermark);
    }

    // Upsert test alert
    const existingRx = new RegExp(
      "> \\*\\*" + escapeRegex(testName) + "\\*\\*:.*\\n",
    );
    if (existingRx.test(doc)) {
      doc = doc.replace(
        existingRx,
        "> **" + testName + "**:" + trendLabel + "\n",
      );
    } else {
      const alert = "\n> **" + testName + "**:" + trendLabel + "\n";
      doc = doc.replace(marker, marker + alert);
    }

    atomicWrite(docPath, doc);
    releaseMdxLock(docPath);
  } catch {
    /* best-effort */
  }
}

// ─────────────────────────────────────────────────────────────
// Report Rebuilder — compact summary from section data
// ─────────────────────────────────────────────────────────────

interface SectionStatus {
  name: string;
  icon: string;
  detail: string;
  runs: number;
  lastRun: string;
  pending: boolean;
}

/**
 * Parse a single `### 🏷️` trend heading line into structured data.
 *
 * Supports formats:
 *   ### 🏷️ Name 🔴 avg +86% p95 +81% rps -49% (14 runs)
 *   ### 🏷️ Name 🟢 avg 1.1ms | stable (3 runs) (2026-06-28 18:00:00)
 *   ### 🏷️ Name ⚪ — baseline established (1 run)
 *   ### 🏷️ Name ⚪ stable at 0.1ms (±0.0ms) (2 runs) (2026-06-28 18:44:55)
 */
function parseTrendHeading(line: string): SectionStatus {
  const pending = line.includes("Pending");

  // Icon regex — matches ⚪ 🟢 🟠 🔴
  const iconRx = /([\u{26AA}\u{1F7E2}\u{1F7E1}\u{1F534}])/u;
  const iconMatch = line.match(iconRx);
  const icon = iconMatch ? iconMatch[1] : "⏳";

  // Clean tag emoji prefix (matches both 🏷️ with or without Variation Selector)
  const cleanLine = line.replace(/^###\s+\u{1F3F7}\s*/u, "").trim();

  // Split by any status circle emoji to extract name
  const parts = cleanLine.split(/[\u{26AA}\u{1F7E2}\u{1F7E1}\u{1F534}]/u);
  const name = parts[0]?.trim() ?? "Unknown Test";

  // Detail: everything after the icon up to the optional outer timestamp
  const detailRx =
    /[\u{26AA}\u{1F7E2}\u{1F7E1}\u{1F534}]\s+(.+?)(?:\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\))?$/u;
  const detailMatch = line.match(detailRx);
  const detail = detailMatch ? detailMatch[1].trim() : icon;

  // Run count: extract "(N runs)" or "(N run)" from the detail
  const runRx = /\((\d+)\s+run[s]?\)/;
  const runMatch = detail.match(runRx);
  const runs = runMatch ? parseInt(runMatch[1], 10) : 0;

  // Outer timestamp at end of line
  const tsRx = /\((\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\)$/;
  const tsMatch = line.match(tsRx);
  const lastRun = tsMatch ? tsMatch[1] : "-";

  return { name, icon, detail, runs, lastRun, pending };
}

export function rebuildSummary(_dbLabel: string): void {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return;
  if (!acquireMdxLock(docPath)) return;

  try {
    let doc = fs.readFileSync(docPath, "utf8");

    // Parse all ### 🏷️ headings
    const sections: SectionStatus[] = [];
    const headingRx = /^###\s+\u{1F3F7}.+/gmu;
    let m: RegExpExecArray | null;
    while ((m = headingRx.exec(doc)) !== null) {
      const line = m[0];
      sections.push(parseTrendHeading(line));
    }

    // Determine run mode
    const isMatrix =
      typeof process !== "undefined" && process.env.BENCHMARK_MATRIX === "1";

    // Timestamp from most recent section, or now
    const latestTs = sections.reduce((latest, s) => {
      if (s.lastRun !== "-" && s.lastRun > latest) return s.lastRun;
      return latest;
    }, "");
    const displayTs =
      latestTs || new Date().toISOString().replace("T", " ").slice(0, 19);

    // Group sections
    const regressions = sections.filter((s) => s.icon === "\u{1F534}"); // 🔴
    const stable = sections.filter(
      (s) => s.icon === "\u{1F7E2}" || s.icon === "\u{1F7E1}", // 🟢 or 🟠
    );
    const baselines = sections.filter((s) => s.icon === "\u{26AA}"); // ⚪
    const pending = sections.filter((s) => s.pending);

    const total = sections.length;
    const recorded = sections.filter((s) => !s.pending).length;
    const skippedCount = pending.length;

    // Build the new summary block
    let summary = "";
    if (isMatrix) {
      summary += `\n## 📊 Latest Performance Audit (Mode: FULL MATRIX — ${displayTs})\n\n`;
    } else {
      summary += `\n## 📊 Latest Performance Audit (Mode: MIXED — ${displayTs})\n\n`;
      summary += `> ⚠️ **Note:** This report contains a combination of the last Full Matrix Run and recent surgical developer hot-fixes.\n\n`;
    }
    summary += `**Status:** ${recorded}/${total} tests recorded`;
    if (skippedCount > 0) summary += ` · ${skippedCount} skipped`;
    summary += `\n\n`;

    // ── Needs Attention (🔴) ──
    if (regressions.length > 0) {
      summary += `### ⚠️ Needs Attention\n\n`;
      summary += `| Metric | Status | Detail |\n`;
      summary += `|--------|--------|--------|\n`;
      for (const s of regressions) {
        const detailClean = s.detail.replace(/\((\d+)\s+run[s]?\)/, "").trim();
        summary += `| ${s.name} | 🔴 | ${detailClean} (${s.runs} run${s.runs !== 1 ? "s" : ""}) |\n`;
      }
      summary += `\n`;
    }

    // ── Stable Tests (🟢 / 🟠) ──
    if (stable.length > 0) {
      summary += `### ✅ Stable Tests\n\n`;
      summary += `| Metric | Status | Detail |\n`;
      summary += `|--------|--------|--------|\n`;
      for (const s of stable) {
        const detailClean = s.detail.replace(/\((\d+)\s+run[s]?\)/, "").trim();
        const iconLabel = s.icon === "\u{1F7E1}" ? "🟠" : "🟢";
        summary += `| ${s.name} | ${iconLabel} | ${detailClean} (${s.runs} run${s.runs !== 1 ? "s" : ""}) |\n`;
      }
      summary += `\n`;
    }

    // ── First Run / Baseline (⚪) ──
    if (baselines.length > 0) {
      summary += `### ⚪ First Run (Baseline)\n\n`;
      summary += `| Metric | Status | Detail |\n`;
      summary += `|--------|--------|--------|\n`;
      for (const s of baselines) {
        const detailClean = s.detail.replace(/\((\d+)\s+run[s]?\)/, "").trim();
        summary += `| ${s.name} | ⚪ | ${detailClean} (${s.runs} run${s.runs !== 1 ? "s" : ""}) |\n`;
      }
      summary += `\n`;
    }

    // Insert/replace between SUMMARY_START and SUMMARY_END
    const sm = "<!-- SUMMARY_START -->";
    const se = "<!-- SUMMARY_END -->";
    if (doc.includes(sm)) {
      const start = doc.indexOf(sm);
      const end = doc.indexOf(se, start);
      if (end > start)
        doc = doc.slice(0, start + sm.length) + "\n" + summary + doc.slice(end);
    } else {
      const h2 = doc.indexOf("\n## ");
      if (h2 > 0)
        doc =
          doc.slice(0, h2) +
          "\n" +
          sm +
          "\n" +
          summary +
          se +
          "\n" +
          doc.slice(h2);
    }

    atomicWrite(docPath, doc);
  } catch (err: any) {
    if (
      process.env.LOG_LEVEL === "debug" ||
      process.env.BENCHMARK_DEBUG === "true"
    ) {
      console.error(`[MDX Debug] rebuildSummary failed:`, err);
    }
  } finally {
    releaseMdxLock(docPath);
  }
}

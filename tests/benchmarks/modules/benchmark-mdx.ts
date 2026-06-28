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

/** Find the correct tag occurrence — prefer the one after BENCHMARK_END (educational section). */
function findSectionPosition(doc: string, tag: string): { idx: number } | null {
  const START = `<!-- ${tag}_TABLE_START -->`;
  const BENCH_END = "<!-- BENCHMARK_END -->";
  let benchEnd = -1;
  let searchFrom = 0;
  while (true) {
    const next = doc.indexOf(BENCH_END, searchFrom);
    if (next < 0) break;
    benchEnd = next;
    searchFrom = next + BENCH_END.length;
  }

  // Collect all occurrences
  const starts: number[] = [];
  let idx = 0;
  while ((idx = doc.indexOf(START, idx)) !== -1) {
    starts.push(idx);
    idx += START.length;
  }
  if (starts.length === 0) return null;

  // Prefer the one after BENCHMARK_END (educational section)
  if (benchEnd > 0) {
    const eduStart = starts.find((s) => s > benchEnd);
    if (eduStart !== undefined) return { idx: eduStart };
  }

  // Fall back to first occurrence
  return { idx: starts[0] };
}

/** Write the truth table between TABLE_START / TABLE_END. Returns the tag name. */
export function writeTruthTable(
  table: string,
  testFile: string,
  shortLabel?: string,
): string | null {
  try {
    const docPath = getDocPath();
    if (!fs.existsSync(docPath)) return null;

    if (!acquireMdxLock(docPath)) return null;

    let doc = fs.readFileSync(docPath, "utf8");
    const tag = discoverTag(doc, testFile, shortLabel);
    if (!tag) {
      releaseMdxLock(docPath);
      return null;
    }

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

    if (!replaced) {
      releaseMdxLock(docPath);
      return null;
    }

    atomicWrite(docPath, doc);
    releaseMdxLock(docPath);
    return tag;
  } catch {
    return null;
  }
}

/** Append summary table before TABLE_END in ALL occurrences. */
export function writeSummary(
  summaryTable: string,
  testFile: string,
  tag?: string | null,
  shortLabel?: string,
): void {
  try {
    const docPath = getDocPath();
    if (!fs.existsSync(docPath)) return;
    if (!acquireMdxLock(docPath)) return;

    let doc = fs.readFileSync(docPath, "utf8");
    const resolvedTag = tag || discoverTag(doc, testFile, shortLabel);
    if (!resolvedTag) {
      releaseMdxLock(docPath);
      return;
    }

    const START = `<!-- ${resolvedTag}_TABLE_START -->`;
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
    releaseMdxLock(docPath);
  } catch {
    /* best-effort */
  }
}

/** Update the \uD83C\uDFF7 label and append insight before TABLE_END in ALL occurrences. */
export function writeTrendAndInsight(
  trendLabel: string,
  insight: string,
  testFile: string,
  tag?: string | null,
  shortLabel?: string,
): void {
  try {
    const docPath = getDocPath();
    if (!fs.existsSync(docPath)) return;
    if (!acquireMdxLock(docPath)) return;

    let doc = fs.readFileSync(docPath, "utf8");
    const resolvedTag = tag || discoverTag(doc, testFile, shortLabel);
    if (!resolvedTag) {
      releaseMdxLock(docPath);
      return;
    }

    const START = `<!-- ${resolvedTag}_TABLE_START -->`;
    const END = `<!-- ${resolvedTag}_TABLE_END -->`;
    const insightBlock = "\n> " + insight + "\n";

    // Update the ### \uD83C\uDFF7 label in ALL section headings
    const headingRx = new RegExp(
      `(### \\ud83c\\udff7\\s+)[^\n]+(?=\\n[\\s\\S]*?${escapeRegex(START)})`,
      "gi",
    );
    doc = doc.replace(headingRx, `$1${trendLabel}`);

    // Replace INSIGHT_PLACEHOLDER in ALL occurrences
    const insightPlaceholder = "<!-- INSIGHT_PLACEHOLDER -->";
    if (doc.includes(insightPlaceholder)) {
      doc = doc.split(insightPlaceholder).join(insightBlock);
    } else {
      // Fallback: insert before each END tag
      doc = doc.split(END).join(insightBlock + "\n" + END);
    }

    atomicWrite(docPath, doc);
    releaseMdxLock(docPath);
  } catch {
    /* best-effort */
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

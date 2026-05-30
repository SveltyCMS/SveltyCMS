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
  return typeof process !== "undefined" ? process.env.DB_TYPE || "sqlite" : "sqlite";
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

/** Discover which TABLE tag in the MDX matches the given test file. */
export function discoverTag(doc: string, testFile: string, shortLabel?: string): string | null {
  const base = path.basename(testFile, path.extname(testFile)).replace(/-/g, "_");
  const key = (shortLabel || base).toLowerCase().replace(/[^a-z0-9]/g, "");

  const tagRx = /<!-- (\w+)_TABLE_START -->/g;
  let m: RegExpExecArray | null;
  while ((m = tagRx.exec(doc)) !== null) {
    const t = m[1].toLowerCase();
    if (
      key.includes(t) ||
      t.includes(key) ||
      base.includes(t) ||
      t.split("_")[0] === base.split("_")[0]
    ) {
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
  const benchEnd = doc.indexOf("<!-- BENCHMARK_END -->");

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

    const pos = findSectionPosition(doc, tag);
    if (!pos) {
      releaseMdxLock(docPath);
      return null;
    }

    const START = `<!-- ${tag}_TABLE_START -->`;
    const END = `<!-- ${tag}_TABLE_END -->`;
    const endIdx = doc.indexOf(END, pos.idx);
    if (endIdx < 0) {
      releaseMdxLock(docPath);
      return null;
    }

    const block = [
      "```text",
      table,
      "```",
      "",
      "<!-- SUMMARY_PLACEHOLDER -->",
      "<!-- INSIGHT_PLACEHOLDER -->",
    ].join("\n");

    doc = doc.slice(0, pos.idx) + START + "\n" + block + "\n" + doc.slice(endIdx);

    atomicWrite(docPath, doc);
    releaseMdxLock(docPath);
    return tag;
  } catch {
    return null;
  }
}

/** Append summary table before TABLE_END. */
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

    const END = `<!-- ${resolvedTag}_TABLE_END -->`;
    if (!doc.includes(END)) {
      releaseMdxLock(docPath);
      return;
    }

    const summaryBlock = ["```text", summaryTable, "```"].join("\n");

    if (doc.includes("<!-- SUMMARY_PLACEHOLDER -->")) {
      doc = doc.replace("<!-- SUMMARY_PLACEHOLDER -->", summaryBlock);
    } else {
      doc = doc.replace(END, "\n" + summaryBlock + "\n" + END);
    }

    atomicWrite(docPath, doc);
    releaseMdxLock(docPath);
  } catch {
    /* best-effort */
  }
}

/** Update the ### 🏷️ label and append insight before TABLE_END. */
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

    // Find the correct tag position (prefer educational section)
    const pos = findSectionPosition(doc, resolvedTag);
    if (!pos) {
      releaseMdxLock(docPath);
      return;
    }

    // Update the ### 🏷️ label (before the correct TABLE_START)
    const before = doc.slice(0, pos.idx);
    const li = before.lastIndexOf("### " + "\u{1F3F7}");
    if (li > 0) {
      const le = doc.indexOf("\n", li);
      const old = doc.slice(li, le);
      const newHeading = old.replace(/\u26AA \u2014.*$/, trendLabel);
      doc = doc.slice(0, li) + newHeading + doc.slice(le);
    }

    // Replace INSIGHT_PLACEHOLDER or append before END
    const END = `<!-- ${resolvedTag}_TABLE_END -->`;
    const insightBlock = "\n> " + insight;

    if (doc.includes("<!-- INSIGHT_PLACEHOLDER -->")) {
      doc = doc.replace("<!-- INSIGHT_PLACEHOLDER -->", insightBlock);
    } else if (doc.includes(END)) {
      doc = doc.replace(END, insightBlock + "\n" + END);
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
    doc = doc.replace("\n> \u23F3 Pending \u2014 run benchmarks to populate.\n", "\n");

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
    const existingRx = new RegExp("> \\*\\*" + escapeRegex(testName) + "\\*\\*:.*\\n");
    if (existingRx.test(doc)) {
      doc = doc.replace(existingRx, "> **" + testName + "**:" + trendLabel + "\n");
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

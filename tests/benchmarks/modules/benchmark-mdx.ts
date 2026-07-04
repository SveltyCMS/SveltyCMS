/**
 * @file tests/benchmarks/modules/benchmark-mdx.ts
 * @description MDX report file operations — zone-scoped writes, shell generation, summary rebuild.
 *
 * ### Zones (single source of truth per layer)
 * - `EXECUTIVE_*` — matrix-owned pass/fail + latency matrix (one H2 "Latest")
 * - `LATEST_HEADER_MARKER` — replace anchor for the single Latest H2 (never append)
 * - `LEDGER_MARKERS` — deterministic START/END pairs inside each `*_TABLE_*` block
 * - `EXECUTIVE_MARKERS` — partial watermark + per-run alert slots (replace, never append)
 * - `SUMMARY_*` — compact derived tables (no duplicate H2)
 * - `LEDGER_*` — one `<!-- SECTION:TAG:START/END -->` pair per test (`deduplicateLedgerSections`)
 * - Legacy `*_TABLE_*` pairs are read for migration; new writes emit `SECTION:*` only
 * - `EDUCATIONAL_*` — static metadata (no TABLE tags)
 * - `EXECUTIVE_FIX_NOTES_*` — fix overlays / phase notes (top of EXECUTIVE, never inline in LEDGER)
 * - `CHANGELOG_*` — deprecated; content hoisted to `EXECUTIVE_FIX_NOTES_*` on commit
 *
 * ### Concurrency
 * Uses a simple file-based mutex to prevent parallel writes to the same MDX file.
 */
import fs from "node:fs";
import path from "node:path";
import {
  LEDGER_DIMENSION_ORDER,
  mapSectionToDimension,
  type LedgerDimension,
} from "./benchmark-dimensions";

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
  return getDocPathForDb(getDbType());
}

/** Resolve per-DB benchmark MDX path (`sqlite`, `postgresql-redis`, `sqlite_redis`, …). */
export function getDocPathForDb(dbKey: string): string {
  return path.resolve(
    process.cwd(),
    "docs/project/benchmarks",
    `benchmark_${dbKey.replace("-", "_")}.mdx`,
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
  "database-performance": "DB_RAW_P95",
  "transaction-acid": "ACID",
  "cache-performance": "CACHE",
  "rest-api-performance": "REST",
};

/** Canonical per-test ledger markers — `<!-- SECTION:API_LATENCY:START -->`. */
export function buildSectionMarkers(tag: string): { start: string; end: string } {
  return {
    start: `<!-- SECTION:${tag}:START -->`,
    end: `<!-- SECTION:${tag}:END -->`,
  };
}

/** @deprecated Legacy `*_TABLE_*` markers — read-only fallback during migration. */
export function buildLegacyTableMarkers(tag: string): { start: string; end: string } {
  return {
    start: `<!-- ${tag}_TABLE_START -->`,
    end: `<!-- ${tag}_TABLE_END -->`,
  };
}

/** Prefer SECTION markers when present; otherwise fall back to legacy TABLE pair. */
export function resolveTagMarkers(tag: string, scope: string): { start: string; end: string } {
  const section = buildSectionMarkers(tag);
  if (scope.includes(section.start)) return section;
  return buildLegacyTableMarkers(tag);
}

/** Wrap inner ledger body with canonical SECTION markers. */
export function wrapSectionBlock(tag: string, inner: string): string {
  const { start, end } = buildSectionMarkers(tag);
  const body = inner.startsWith("\n") ? inner : `\n${inner}\n`;
  return `${start}${body}${end}`;
}

const SECTION_PAIR_RX = /<!-- SECTION:([\w]+):START -->[\s\S]*?<!-- SECTION:\1:END -->\n?/g;

/** Tags with `SECTION:TAG:START` but no matching `SECTION:TAG:END` after it. */
export function findUnclosedSectionTags(scope: string): string[] {
  const unclosed: string[] = [];
  const startRx = /<!-- SECTION:([\w]+):START -->/g;
  let m: RegExpExecArray | null;
  while ((m = startRx.exec(scope)) !== null) {
    const tag = m[1]!;
    const endMarker = buildSectionMarkers(tag).end;
    const afterStart = m.index! + m[0].length;
    if (scope.indexOf(endMarker, afterStart) < 0) unclosed.push(tag);
  }
  return unclosed;
}

function tagExistsInDoc(doc: string, tag: string): boolean {
  const section = buildSectionMarkers(tag);
  const legacy = buildLegacyTableMarkers(tag);
  return doc.includes(section.start) || doc.includes(legacy.start);
}

/** Dimension group markers inside LEDGER — four nested `<details>` rollups. */
export function buildDimensionMarkers(dimension: string): { start: string; end: string } {
  const key = dimension.toUpperCase();
  return {
    start: `<!-- LEDGER_DIMENSION:${key}:START -->`,
    end: `<!-- LEDGER_DIMENSION:${key}:END -->`,
  };
}

let _tagSectionMap: Map<string, string> | null = null;

/** Resolve benchmark script `section` for a ledger tag (for dimension grouping). */
export function getSectionForTag(tag: string): string {
  if (!_tagSectionMap) {
    _tagSectionMap = new Map<string, string>();
    try {
      const { BENCHMARK_SCRIPTS } =
        require("../../../scripts/benchmark-matrix/benchmark-scripts") as {
          BENCHMARK_SCRIPTS: Array<{ shortLabel: string; section: string }>;
        };
      for (const script of BENCHMARK_SCRIPTS) {
        _tagSectionMap.set(shortLabelToTag(script.shortLabel), script.section);
      }
    } catch {
      /* optional in isolated unit tests */
    }
  }
  return _tagSectionMap.get(tag) ?? "baseline";
}

function ledgerTrendArrow(deltaPct: number): string {
  if (deltaPct > 5) return "\u2197\uFE0F";
  if (deltaPct < -5) return "\u2198\uFE0F";
  return "\u27A1\uFE0F";
}

/** Parse first avg ms value from an ASCII truth table. */
export function parseAvgMsFromAsciiTable(table: string): number {
  const m = table.match(/│\s+([\d.]+)\s+ms/i) || table.match(/([\d.]+)\s+ms/i);
  return m ? parseFloat(m[1]!) : 0;
}

/** Refresh `<summary>` line on a collapsed ledger inner block. */
export function patchCollapsedLedgerSummary(
  inner: string,
  opts: {
    avgMs: number;
    icon: string;
    trendLabel: string;
    deltaPct?: number;
  },
): string {
  if (!isCollapsedLedgerInner(inner)) return inner;
  const avg = opts.avgMs > 0 ? `${opts.avgMs.toFixed(3)}ms` : "\u23F3 pending";
  const arrow = ledgerTrendArrow(opts.deltaPct ?? 0);
  return inner.replace(
    /(<summary>)([\s\S]*?)(<\/summary>)/,
    (_m, open: string, content: string, close: string) => {
      const labelMatch = content.match(/<strong>[\s\S]*?<\/strong>/);
      const linkMatch = content.match(/<a href="[^"]+">source<\/a>/);
      const label = labelMatch?.[0] ?? "<strong>\u{1F3F7}\uFE0F Benchmark</strong>";
      const link = linkMatch?.[0] ?? "";
      const sep = link ? " \u00B7 " : "";
      return `${open}${label} \u00B7 ${opts.icon} ${avg} \u00B7 ${arrow} ${opts.trendLabel}${sep}${link}${close}`;
    },
  );
}

/** Wrap per-test SECTION blocks into four dimension `<details>` groups. */
export function assembleDimensionGroupedLedger(
  preamble: string,
  sectionBlocks: Array<{ tag: string; inner: string }>,
): string {
  const grouped = new Map<LedgerDimension, string[]>();
  for (const dim of LEDGER_DIMENSION_ORDER) grouped.set(dim, []);

  for (const { tag, inner } of sectionBlocks) {
    const dim = mapSectionToDimension(getSectionForTag(tag));
    grouped.get(dim)!.push(wrapSectionBlock(tag, inner));
  }

  const parts: string[] = [preamble.trimEnd()];
  for (const dim of LEDGER_DIMENSION_ORDER) {
    const blocks = grouped.get(dim)!;
    if (blocks.length === 0) continue;
    const { start, end } = buildDimensionMarkers(dim);
    const body = [
      `<details id="ledger-dimension-${dim.toLowerCase()}">`,
      `<summary><strong>${dim}</strong> \u00B7 ${blocks.length} tests</summary>`,
      "",
      blocks.join("\n\n"),
      "",
      "</details>",
    ].join("\n");
    parts.push(start, body, end);
  }
  return `${parts.join("\n\n")}\n`;
}

/** Collect ledger tag ids in document order (SECTION preferred over duplicate legacy). */
export function collectLedgerTagsInOrder(ledger: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const markerRx = /<!-- (?:SECTION:([\w]+):START|(\w+)_TABLE_START) -->/g;
  let m: RegExpExecArray | null;
  while ((m = markerRx.exec(ledger)) !== null) {
    const tag = m[1] || m[2]!;
    if (!seen.has(tag)) {
      seen.add(tag);
      ordered.push(tag);
    }
  }
  return ordered;
}

/** Discover which TABLE tag in the MDX matches the given test file. */
export function discoverTag(doc: string, testFile: string, shortLabel?: string): string | null {
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

  const tagRx = /<!-- (?:SECTION:([\w]+):START|(\w+)_TABLE_START) -->/g;
  let m: RegExpExecArray | null;
  while ((m = tagRx.exec(doc)) !== null) {
    const tagName = m[1] || m[2]!;
    const t = tagName.toLowerCase();
    if (key.includes(t) || t.includes(key) || base.includes(t)) {
      return tagName;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Report zones — writers MUST scope to LEDGER / SUMMARY / EXECUTIVE
// ─────────────────────────────────────────────────────────────

export const ZONE_MARKERS = {
  executive: ["<!-- EXECUTIVE_START -->", "<!-- EXECUTIVE_END -->"] as const,
  summary: ["<!-- SUMMARY_START -->", "<!-- SUMMARY_END -->"] as const,
  ledger: ["<!-- LEDGER_START -->", "<!-- LEDGER_END -->"] as const,
  educational: ["<!-- EDUCATIONAL_START -->", "<!-- EDUCATIONAL_END -->"] as const,
  changelog: ["<!-- CHANGELOG_START -->", "<!-- CHANGELOG_END -->"] as const,
  metadata: ["<!-- METADATA_START -->", "<!-- METADATA_END -->"] as const,
  benchmark: ["<!-- BENCHMARK_START -->", "<!-- BENCHMARK_END -->"] as const,
} as const;

/** Deterministic replace anchors inside each ledger `*_TABLE_*` block. */
export const LEDGER_MARKERS = {
  trendHeading: "<!-- LEDGER_TREND_HEADING -->",
  insight: ["<!-- LEDGER_INSIGHT_START -->", "<!-- LEDGER_INSIGHT_END -->"] as const,
  truth: ["<!-- LEDGER_TRUTH_START -->", "<!-- LEDGER_TRUTH_END -->"] as const,
  runSummary: ["<!-- LEDGER_RUN_SUMMARY_START -->", "<!-- LEDGER_RUN_SUMMARY_END -->"] as const,
} as const;

/** Deterministic replace anchors inside EXECUTIVE (never append orphan lines). */
export const EXECUTIVE_MARKERS = {
  fixNotes: ["<!-- EXECUTIVE_FIX_NOTES_START -->", "<!-- EXECUTIVE_FIX_NOTES_END -->"] as const,
  partialWatermark: "<!-- EXECUTIVE_PARTIAL_WATERMARK -->",
  alerts: ["<!-- EXECUTIVE_ALERTS_START -->", "<!-- EXECUTIVE_ALERTS_END -->"] as const,
} as const;

const EXECUTIVE_FIX_NOTES_PLACEHOLDER = [
  "### \u{1F4DD} Fix Overlays",
  "",
  "> [!NOTE]",
  "> Phase notes and remediation entries appear here after matrix or surgical runs.",
].join("\n");

/** Blockquotes / prose that must live in EXECUTIVE fix-notes, not inline in LEDGER. */
const STRAY_NARRATIVE_RX = [
  /^>\s*\*\*[^*]*(?:Fix Applied|fix applied)[^*]*\*\*[^\n]*(?:\n(?:>[^\n]*)*)*/gmu,
  /^>\s*\*\*(?:Round \d+|Phase \d+)[^*]*\*\*[^\n]*(?:\n(?:>[^\n]*)*)*/gmu,
  /^Long narrative of the sprint[^\n]+/gmu,
] as const;

/** Deterministic replace anchors inside SUMMARY (run overlay vs history tables). */
export const SUMMARY_MARKERS = {
  runOverlay: ["<!-- SUMMARY_RUN_OVERLAY_START -->", "<!-- SUMMARY_RUN_OVERLAY_END -->"] as const,
  historyTables: ["<!-- SUMMARY_HISTORY_START -->", "<!-- SUMMARY_HISTORY_END -->"] as const,
} as const;

const EXECUTIVE_PARTIAL_RX = new RegExp(
  `${escapeRegex(EXECUTIVE_MARKERS.partialWatermark)}\\s*\\n(?:[^\\n]*\\n)?`,
  "m",
);

/** Ensure EXECUTIVE body contains deterministic marker anchors. */
export function ensureExecutiveMarkers(executive: string): string {
  let body = executive.trimEnd();
  if (!body.includes(EXECUTIVE_MARKERS.fixNotes[0])) {
    const [fixStart, fixEnd] = EXECUTIVE_MARKERS.fixNotes;
    const fixSlot = `\n${fixStart}\n${EXECUTIVE_FIX_NOTES_PLACEHOLDER}\n${fixEnd}\n`;
    const headingIdx = body.indexOf(LATEST_AUDIT_HEADING);
    if (headingIdx >= 0) {
      const afterHeading = headingIdx + LATEST_AUDIT_HEADING.length;
      body = body.slice(0, afterHeading) + fixSlot + body.slice(afterHeading);
    } else {
      body += fixSlot;
    }
  }
  if (!body.includes(EXECUTIVE_MARKERS.partialWatermark)) {
    body += `\n\n${EXECUTIVE_MARKERS.partialWatermark}\n`;
  }
  if (!body.includes(EXECUTIVE_MARKERS.alerts[0])) {
    body += `\n${EXECUTIVE_MARKERS.alerts[0]}\n${EXECUTIVE_MARKERS.alerts[1]}\n`;
  }
  return body;
}

/** Replace EXECUTIVE fix-notes slot (D: narrative at top, never inline in LEDGER). */
export function patchExecutiveFixNotes(executive: string, fixBody: string): string {
  const body = ensureExecutiveMarkers(executive);
  return (
    replaceBetweenMarkers(
      body,
      EXECUTIVE_MARKERS.fixNotes[0],
      EXECUTIVE_MARKERS.fixNotes[1],
      fixBody,
    ) ?? body
  );
}

function extractStrayNarrativeBlocks(scope: string): { cleaned: string; notes: string[] } {
  const notes: string[] = [];
  let cleaned = scope;
  for (const rx of STRAY_NARRATIVE_RX) {
    cleaned = cleaned.replace(rx, (match) => {
      const trimmed = match.trim();
      if (trimmed) notes.push(trimmed);
      return "";
    });
  }
  return { cleaned: cleaned.replace(/\n{3,}/g, "\n\n").trimEnd(), notes };
}

function isPlaceholderFixNotes(body: string): boolean {
  const trimmed = body.trim();
  return (
    !trimmed ||
    trimmed === EXECUTIVE_FIX_NOTES_PLACEHOLDER ||
    /^###\s+\u{1F4DD}\s+Fix Overlays\s*$/u.test(trimmed) ||
    /^>\s*Phase notes and remediation entries appear here/i.test(trimmed)
  );
}

function mergeFixNoteBodies(existing: string, incoming: string[]): string {
  const blocks = new Set<string>();
  const push = (raw: string) => {
    let t = raw.trim();
    if (!t || isPlaceholderFixNotes(t)) return;
    t = t.replace(/^###\s+\u{1F4DD}\s+Fix Overlays\s*\n+/u, "").trim();
    if (t) blocks.add(t);
  };
  push(existing);
  for (const note of incoming) push(note);
  if (blocks.size === 0) return EXECUTIVE_FIX_NOTES_PLACEHOLDER;
  return `### \u{1F4DD} Fix Overlays\n\n${[...blocks].join("\n\n")}`;
}

/**
 * D: Hoist stray fix/narrative markdown from LEDGER (and legacy CHANGELOG) into EXECUTIVE fix-notes.
 */
export function relocateStrayNarrativeToExecutive(doc: string): string {
  const collected: string[] = [];
  let result = doc;

  const [ls, le] = ZONE_MARKERS.ledger;
  const ledger = extractZone(result, ls, le);
  if (ledger) {
    const { cleaned, notes } = extractStrayNarrativeBlocks(ledger);
    collected.push(...notes);
    if (notes.length > 0) {
      const replaced = replaceZone(result, ls, le, cleaned);
      if (replaced) result = replaced;
    }
  }

  const [cs, ce] = ZONE_MARKERS.changelog;
  const changelog = extractZone(result, cs, ce);
  if (changelog && !isPlaceholderFixNotes(changelog)) {
    collected.push(changelog.trim());
    const replaced = replaceZone(result, cs, ce, EXECUTIVE_FIX_NOTES_PLACEHOLDER);
    if (replaced) result = replaced;
  }

  if (collected.length === 0) return result;

  const [execStart, execEnd] = ZONE_MARKERS.executive;
  const executive = extractZone(result, execStart, execEnd);
  if (executive === null) return result;

  const [fixStart, fixEnd] = EXECUTIVE_MARKERS.fixNotes;
  const existingFix =
    extractZone(executive, fixStart, fixEnd)?.trim() ?? EXECUTIVE_FIX_NOTES_PLACEHOLDER;
  const merged = mergeFixNoteBodies(existingFix, collected);
  const patched = patchExecutiveFixNotes(executive, merged);
  const replaced = replaceZone(result, execStart, execEnd, patched);
  return replaced ?? result;
}

/** Replace partial-watermark slot — pass `null` to clear the line. */
export function patchExecutivePartialWatermark(
  executive: string,
  watermark: string | null,
): string {
  let body = ensureExecutiveMarkers(executive);
  const block =
    watermark === null
      ? `${EXECUTIVE_MARKERS.partialWatermark}\n`
      : `${EXECUTIVE_MARKERS.partialWatermark}\n${watermark}\n`;
  return EXECUTIVE_PARTIAL_RX.test(body)
    ? body.replace(EXECUTIVE_PARTIAL_RX, block)
    : `${body}\n\n${block}`;
}

/** Replace EXECUTIVE alerts slot (never append orphan alert lines). */
export function patchExecutiveAlerts(executive: string, alertsBody: string): string {
  const body = ensureExecutiveMarkers(executive);
  return (
    replaceBetweenMarkers(
      body,
      EXECUTIVE_MARKERS.alerts[0],
      EXECUTIVE_MARKERS.alerts[1],
      alertsBody,
    ) ?? body
  );
}

/** Ensure SUMMARY body contains deterministic marker anchors (C: two isolated slots). */
export function ensureSummaryMarkers(summary: string): string {
  let body = summary.trimEnd();
  if (!body.includes(SUMMARY_MARKERS.runOverlay[0])) {
    body += [
      "",
      SUMMARY_MARKERS.runOverlay[0],
      "### Current Run Summary",
      "> Only tests that ran in THIS invocation. Populated after `BENCHMARK_RECORD=1` or matrix run.",
      SUMMARY_MARKERS.runOverlay[1],
    ].join("\n");
  }
  if (!body.includes(SUMMARY_MARKERS.historyTables[0])) {
    body += [
      "",
      SUMMARY_MARKERS.historyTables[0],
      "### Historical Trends",
      "> Sparklines only — link to `history.sqlite` for full run tables.",
      SUMMARY_MARKERS.historyTables[1],
    ].join("\n");
  }
  return body;
}

/** Replace one SUMMARY marker slot inside the zone body. */
export function patchSummarySlot(
  summary: string,
  slot: keyof typeof SUMMARY_MARKERS,
  content: string,
): string {
  const body = ensureSummaryMarkers(summary);
  const [start, end] = SUMMARY_MARKERS[slot];
  return replaceBetweenMarkers(body, start, end, content) ?? body;
}

/** @deprecated Use `LEDGER_MARKERS.insight[0]` — upgraded on write. */
export const INSIGHT_PLACEHOLDER = "<!-- INSIGHT_PLACEHOLDER -->";

/** @deprecated Use `LEDGER_MARKERS.runSummary[0]` — upgraded on write. */
export const SUMMARY_PLACEHOLDER = "<!-- SUMMARY_PLACEHOLDER -->";

/** Replace anchor — writers swap the H2 on this marker, never append a second header. */
export const LATEST_HEADER_MARKER = "<!-- LATEST_AUDIT_HEADER -->";

/** Canonical H2 — must appear exactly once, immediately after `LATEST_HEADER_MARKER`. */
export const LATEST_AUDIT_HEADING = "## \u{1F4CA} Latest Performance Audit";

const LATEST_AUDIT_RX = /^## \u{1F4CA} Latest Performance Audit[^\n]*/gmu;
const LATEST_MARKER_BLOCK_RX = new RegExp(
  `${escapeRegex(LATEST_HEADER_MARKER)}\\s*\\n##[^\\n]*\\n?`,
  "m",
);

function resolveLatestH2Line(body: string, suffix?: string): string {
  if (suffix !== undefined && suffix !== "") {
    return suffix.trimStart().startsWith("##")
      ? suffix.trim()
      : `${LATEST_AUDIT_HEADING} ${suffix.trim()}`;
  }
  const anchored = body.match(LATEST_MARKER_BLOCK_RX)?.[0];
  if (anchored) {
    const line = anchored.match(/^##[^\n]*/m)?.[0];
    if (line) return line;
  }
  return body.match(LATEST_AUDIT_RX)?.[0] ?? LATEST_AUDIT_HEADING;
}

function buildLatestHeaderBlock(h2Line: string): string {
  return `${LATEST_HEADER_MARKER}\n${h2Line}\n`;
}

/** Count replace-anchor markers (expect exactly 1 inside EXECUTIVE). */
export function countLatestAuditMarkers(doc: string): number {
  return doc.split(LATEST_HEADER_MARKER).length - 1;
}

/** Count duplicate "Latest Performance Audit" H2s (CI guard). */
export function countLatestAuditHeadings(doc: string): number {
  return (doc.match(LATEST_AUDIT_RX) || []).length;
}

/**
 * Replace the single canonical Latest header block — never append a second copy.
 * Anchored at `LATEST_HEADER_MARKER`; legacy bodies without the marker are upgraded.
 */
export function replaceLatestAuditHeading(body: string, suffix?: string): string {
  const h2Line = resolveLatestH2Line(body, suffix);
  const newBlock = buildLatestHeaderBlock(h2Line);

  if (body.includes(LATEST_HEADER_MARKER)) {
    if (LATEST_MARKER_BLOCK_RX.test(body)) {
      return body.replace(LATEST_MARKER_BLOCK_RX, newBlock);
    }
    return body.replace(LATEST_HEADER_MARKER, newBlock.trimEnd());
  }

  const rest = body.replace(LATEST_AUDIT_RX, "").trimStart();
  return rest ? `${newBlock}\n${rest}` : newBlock;
}

function scrubLatestArtifacts(chunk: string): string {
  return chunk
    .replace(new RegExp(`${escapeRegex(LATEST_HEADER_MARKER)}\\s*\\n`, "g"), "")
    .replace(LATEST_AUDIT_RX, "");
}

/** Remove stray Latest markers/H2s outside the EXECUTIVE zone (delete, do not stack). */
export function stripLatestOutsideExecutive(doc: string): string {
  const collapse = (text: string) => text.replace(/\n{3,}/g, "\n\n");

  const [execStart, execEnd] = ZONE_MARKERS.executive;
  const execBegin = doc.indexOf(execStart);
  const execFinish = doc.indexOf(execEnd);
  if (execBegin < 0 || execFinish <= execBegin) {
    let out = scrubLatestArtifacts(doc);
    const headings = [...out.matchAll(LATEST_AUDIT_RX)];
    if (headings.length > 1) {
      for (let i = 1; i < headings.length; i++) {
        out = out.replace(headings[i]![0], "");
      }
    }
    return collapse(out);
  }

  const before = doc.slice(0, execBegin);
  const executive = doc.slice(execBegin, execFinish + execEnd.length);
  const after = doc.slice(execFinish + execEnd.length);

  return collapse(scrubLatestArtifacts(before) + executive + scrubLatestArtifacts(after));
}

/** Extract content between zone markers (exclusive of markers). */
export function extractZone(doc: string, startMarker: string, endMarker: string): string | null {
  const start = doc.indexOf(startMarker);
  if (start < 0) return null;
  const end = doc.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return null;
  return doc.slice(start + startMarker.length, end);
}

/** Replace content between zone markers; returns null if markers missing. */
export function replaceZone(
  doc: string,
  startMarker: string,
  endMarker: string,
  body: string,
): string | null {
  const start = doc.indexOf(startMarker);
  if (start < 0) return null;
  const end = doc.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return null;
  const normalized = body.startsWith("\n") ? body : `\n${body}\n`;
  return doc.slice(0, start + startMarker.length) + normalized + doc.slice(end);
}

/** Replace inner content between a START/END marker pair within a scope. */
export function replaceBetweenMarkers(
  scope: string,
  startMarker: string,
  endMarker: string,
  body: string,
): string | null {
  const start = scope.indexOf(startMarker);
  if (start < 0) return null;
  const end = scope.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return null;
  const normalized = body.startsWith("\n") ? body : `\n${body}\n`;
  return scope.slice(0, start + startMarker.length) + normalized + scope.slice(end);
}

const TREND_HEADING_RX = /<!-- LEDGER_TREND_HEADING -->\s*\n###[^\n]*\n/;
const COLLAPSED_LEDGER_RX = /<details[\s>]/i;
const STRAY_TREND_HEADING_BLOCK_RX = /<!-- LEDGER_TREND_HEADING -->\s*\n###[^\n]*\n\n?/g;

/** True when ledger inner uses progressive-disclosure `<details>` wrapper. */
export function isCollapsedLedgerInner(inner: string): boolean {
  return COLLAPSED_LEDGER_RX.test(inner);
}

/** Remove legacy flat trend headings that sit outside `<details>` blocks. */
export function stripStrayTrendHeadings(inner: string): string {
  if (!isCollapsedLedgerInner(inner)) return inner;
  const detailsIdx = inner.search(COLLAPSED_LEDGER_RX);
  if (detailsIdx <= 0) {
    return inner.replace(STRAY_TREND_HEADING_BLOCK_RX, "").trimStart();
  }
  const prefix = inner.slice(0, detailsIdx).replace(STRAY_TREND_HEADING_BLOCK_RX, "").trimEnd();
  const suffix = inner.slice(detailsIdx);
  return prefix ? `${prefix}\n\n${suffix}` : suffix;
}

/** Upgrade legacy placeholder-only ledger blocks to marker pairs. */
export function normalizeLedgerTagInner(inner: string): string {
  let normalized = stripStrayTrendHeadings(inner.trim());
  const collapsed = isCollapsedLedgerInner(normalized);

  if (
    !collapsed &&
    normalized.includes(LEDGER_MARKERS.truth[0]) &&
    normalized.includes(LEDGER_MARKERS.insight[0])
  ) {
    return normalized;
  }

  if (normalized.includes(INSIGHT_PLACEHOLDER) && !normalized.includes(LEDGER_MARKERS.insight[0])) {
    normalized = normalized.replace(
      INSIGHT_PLACEHOLDER,
      `${LEDGER_MARKERS.insight[0]}\n> ⏳ Pending\n${LEDGER_MARKERS.insight[1]}`,
    );
  }

  if (
    normalized.includes(SUMMARY_PLACEHOLDER) &&
    !normalized.includes(LEDGER_MARKERS.runSummary[0])
  ) {
    normalized = normalized.replace(
      SUMMARY_PLACEHOLDER,
      `${LEDGER_MARKERS.runSummary[0]}\n${LEDGER_MARKERS.runSummary[1]}`,
    );
  }

  if (!normalized.includes(LEDGER_MARKERS.truth[0])) {
    const withoutPairs = normalized
      .replace(
        new RegExp(
          `${escapeRegex(LEDGER_MARKERS.insight[0])}[\\s\\S]*?${escapeRegex(LEDGER_MARKERS.insight[1])}`,
          "m",
        ),
        "",
      )
      .replace(
        new RegExp(
          `${escapeRegex(LEDGER_MARKERS.runSummary[0])}[\\s\\S]*?${escapeRegex(LEDGER_MARKERS.runSummary[1])}`,
          "m",
        ),
        "",
      )
      .replace(TREND_HEADING_RX, "")
      .trim();

    if (collapsed) {
      normalized = [
        `<details id="section-pending">`,
        `<summary><strong>🏷️ Pending</strong> · ⏳ pending · ➡️ baseline</summary>`,
        "",
        LEDGER_MARKERS.truth[0],
        withoutPairs || "> ⏳ Pending — run benchmarks to populate.",
        LEDGER_MARKERS.truth[1],
        "",
        "</details>",
      ].join("\n");
    } else {
      normalized = [
        LEDGER_MARKERS.trendHeading,
        "### 🏷️ Pending",
        "",
        LEDGER_MARKERS.insight[0],
        "> ⏳ Pending",
        LEDGER_MARKERS.insight[1],
        "",
        LEDGER_MARKERS.truth[0],
        withoutPairs || "> ⏳ Pending — run benchmarks to populate.",
        LEDGER_MARKERS.truth[1],
        "",
        LEDGER_MARKERS.runSummary[0],
        LEDGER_MARKERS.runSummary[1],
      ].join("\n");
    }
  }

  if (!collapsed && !normalized.includes(LEDGER_MARKERS.trendHeading)) {
    normalized = `${LEDGER_MARKERS.trendHeading}\n### 🏷️ Pending\n\n${normalized}`;
  }

  return stripStrayTrendHeadings(normalized);
}

/** Re-normalize every ledger section inner (strips stray flat headings after surgical writes). */
export function normalizeLedgerZone(doc: string): string {
  const ledger = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]);
  if (!ledger) return doc;

  let rebuilt = ledger;
  const tags = collectLedgerTagsInOrder(ledger);
  for (const tag of tags) {
    const block = extractFirstTagBlock(rebuilt, tag);
    if (!block) continue;
    const inner = extractTagInner(block, tag);
    const cleaned = normalizeLedgerTagInner(inner);
    if (cleaned === inner) continue;
    const bounds = findLedgerTagBounds(doc, tag);
    if (!bounds) continue;
    doc = replaceLedgerTagContent(doc, tag, cleaned) ?? doc;
    rebuilt = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]) ?? rebuilt;
  }
  return doc;
}

/** Default inner body for a ledger tag — all deterministic markers, empty slots. */
export function buildLedgerTagInner(opts?: {
  trendHeading?: string;
  insight?: string;
  truth?: string;
  runSummary?: string;
}): string {
  return [
    LEDGER_MARKERS.trendHeading,
    opts?.trendHeading ?? "### 🏷️ ⏳ Pending",
    "",
    LEDGER_MARKERS.insight[0],
    opts?.insight ?? "> ⏳ Pending — run benchmarks to populate.",
    LEDGER_MARKERS.insight[1],
    "",
    LEDGER_MARKERS.truth[0],
    opts?.truth ?? "> ⏳ Pending — run benchmarks to populate.",
    LEDGER_MARKERS.truth[1],
    "",
    LEDGER_MARKERS.runSummary[0],
    opts?.runSummary ?? "",
    LEDGER_MARKERS.runSummary[1],
  ].join("\n");
}

/** Replace one marker-governed slot inside a ledger tag (never append). */
export function patchLedgerTag(
  doc: string,
  tag: string,
  patch: {
    trendHeading?: string;
    insight?: string;
    truth?: string;
    runSummary?: string;
  },
): string | null {
  const bounds = findLedgerTagBounds(doc, tag);
  if (!bounds) return null;

  let inner = doc.slice(bounds.start + bounds.startMarker.length, bounds.end);
  inner = normalizeLedgerTagInner(inner);

  if (patch.trendHeading !== undefined) {
    if (isCollapsedLedgerInner(inner)) {
      const label = patch.trendHeading.replace(/^###\s*[\u{1F3F7}]?\s*/u, "").trim();
      inner = inner.replace(
        /(<summary>)([\s\S]*?)(<\/summary>)/,
        (_m, open: string, content: string, close: string) => {
          const parts = content.split(" · ");
          if (parts.length >= 4) {
            parts[3] = ` ${label}`;
            return `${open}${parts.join(" · ")}${close}`;
          }
          return `${open}${content}${close}`;
        },
      );
    } else {
      const block = `${LEDGER_MARKERS.trendHeading}\n${patch.trendHeading}\n`;
      inner = TREND_HEADING_RX.test(inner)
        ? inner.replace(TREND_HEADING_RX, block)
        : `${block}\n${inner}`;
    }
  }

  if (patch.insight !== undefined) {
    const next = replaceBetweenMarkers(
      inner,
      LEDGER_MARKERS.insight[0],
      LEDGER_MARKERS.insight[1],
      patch.insight,
    );
    if (next) inner = next;
  }

  if (patch.truth !== undefined) {
    const next = replaceBetweenMarkers(
      inner,
      LEDGER_MARKERS.truth[0],
      LEDGER_MARKERS.truth[1],
      patch.truth,
    );
    if (next) inner = next;
  }

  if (patch.runSummary !== undefined) {
    const next = replaceBetweenMarkers(
      inner,
      LEDGER_MARKERS.runSummary[0],
      LEDGER_MARKERS.runSummary[1],
      patch.runSummary,
    );
    if (next) inner = next;
  }

  return replaceLedgerTagContent(doc, tag, inner);
}

/** Document slice used for tag discovery — prefers LEDGER, falls back to full doc. */
export function getTagDiscoveryScope(doc: string): string {
  return extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]) ?? doc;
}

export interface TagBounds {
  start: number;
  end: number;
  startMarker: string;
  endMarker: string;
}

/** First tag pair inside LEDGER (SECTION or legacy TABLE). */
export function findLedgerTagBounds(doc: string, tag: string): TagBounds | null {
  const ledgerStart = doc.indexOf(ZONE_MARKERS.ledger[0]);
  const ledgerEnd = doc.indexOf(ZONE_MARKERS.ledger[1]);
  const searchFrom = ledgerStart >= 0 && ledgerEnd > ledgerStart ? ledgerStart : 0;
  const searchTo = ledgerStart >= 0 && ledgerEnd > ledgerStart ? ledgerEnd : doc.length;
  const ledgerSlice = doc.slice(searchFrom, searchTo);
  const { start: startMarker, end: endMarker } = resolveTagMarkers(tag, ledgerSlice);

  const start = doc.indexOf(startMarker, searchFrom);
  if (start < 0 || start >= searchTo) return null;
  const end = doc.indexOf(endMarker, start + startMarker.length);
  if (end < 0 || end >= searchTo) return null;

  return { start, end, startMarker, endMarker };
}

const TABLE_PAIR_RX = /<!-- (\w+)_TABLE_START -->[\s\S]*?<!-- \1_TABLE_END -->\n?/g;

/** Extract the first SECTION or legacy TABLE block for `tag`. */
export function extractFirstTagBlock(scope: string, tag: string): string | null {
  const section = buildSectionMarkers(tag);
  let startMarker = section.start;
  let endMarker = section.end;
  let start = scope.indexOf(startMarker);
  if (start < 0) {
    const legacy = buildLegacyTableMarkers(tag);
    startMarker = legacy.start;
    endMarker = legacy.end;
    start = scope.indexOf(startMarker);
  }
  if (start < 0) return null;
  const end = scope.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return null;
  return scope.slice(start, end + endMarker.length);
}

/** Extract inner body from a SECTION or legacy TABLE block. */
export function extractTagInner(block: string, tag: string): string {
  const { start, end } = resolveTagMarkers(tag, block);
  const innerStart = block.indexOf(start);
  const innerEnd = block.indexOf(end);
  if (innerStart < 0 || innerEnd <= innerStart) return block.trim();
  return block.slice(innerStart + start.length, innerEnd).trim();
}

/** Count SECTION + legacy TABLE occurrences of a tag inside LEDGER. */
export function countTagInLedger(doc: string, tag: string): number {
  const ledger = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]) ?? "";
  let count = 0;
  for (const marker of [buildSectionMarkers(tag).start, buildLegacyTableMarkers(tag).start]) {
    let pos = 0;
    while ((pos = ledger.indexOf(marker, pos)) >= 0) {
      count++;
      pos += marker.length;
    }
  }
  return count;
}

/** Return tag names that appear more than once inside LEDGER. */
export function findDuplicateLedgerTags(doc: string): string[] {
  const ledger = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]) ?? "";
  const seen = new Map<string, number>();
  const markerRx = /<!-- (?:SECTION:([\w]+):START|(\w+)_TABLE_START) -->/g;
  let m: RegExpExecArray | null;
  while ((m = markerRx.exec(ledger)) !== null) {
    const tag = m[1] || m[2]!;
    seen.set(tag, (seen.get(tag) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([tag]) => tag);
}

function stripLedgerSectionPairs(chunk: string): string {
  return chunk.replace(SECTION_PAIR_RX, "").replace(TABLE_PAIR_RX, "");
}

/** Remove dimension group markup from ledger preamble (prevents marker accumulation on re-dedupe). */
export function stripLedgerDimensionMarkup(preamble: string): string {
  let cleaned = preamble.replace(/<!-- LEDGER_DIMENSION:[A-Z]+:(?:START|END) -->\n?/g, "");
  cleaned = cleaned.replace(/<details id="ledger-dimension-[^"]+">[\s\S]*?<\/details>\n?/g, "");
  cleaned = cleaned.replace(
    /<details id="ledger-dimension-[^"]+">\s*\n<summary>[\s\S]*?<\/summary>\s*\n?/g,
    "",
  );
  return cleaned.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * B. Deduplicate per-test sections — one `*_TABLE_*` pair per tag in LEDGER;
 * strip live TABLE tags from EDUCATIONAL and other zones.
 */
export function deduplicateLedgerSections(doc: string): string {
  const [ls, le] = ZONE_MARKERS.ledger;
  const ledger = extractZone(doc, ls, le);

  let result = doc;

  if (ledger) {
    const orderedTags = collectLedgerTagsInOrder(ledger);
    const firstTag = ledger.search(/<!-- (?:SECTION:[\w]+:START|\w+_TABLE_START) -->/);
    const rawPreamble = firstTag >= 0 ? ledger.slice(0, firstTag) : "";
    const preamble = stripLedgerDimensionMarkup(rawPreamble);
    const sectionBlocks = orderedTags
      .map((tag) => {
        const block = extractFirstTagBlock(ledger, tag);
        if (!block) return null;
        return { tag, inner: extractTagInner(block, tag) };
      })
      .filter((b): b is { tag: string; inner: string } => Boolean(b));

    const rebuilt = assembleDimensionGroupedLedger(preamble, sectionBlocks);
    const replaced = replaceZone(result, ls, le, rebuilt);
    if (replaced) result = replaced;
  }

  const [es, ee] = ZONE_MARKERS.educational;
  const educational = extractZone(result, es, ee);
  if (educational) {
    const cleaned = stripLedgerSectionPairs(educational);
    const replaced = replaceZone(result, es, ee, cleaned);
    if (replaced) result = replaced;
  }

  const ledgerStart = result.indexOf(ls);
  const ledgerEnd = result.indexOf(le);
  if (ledgerStart >= 0 && ledgerEnd > ledgerStart) {
    const before = result.slice(0, ledgerStart + ls.length);
    const ledgerBody = result.slice(ledgerStart + ls.length, ledgerEnd);
    const after = result.slice(ledgerEnd);
    result = before + ledgerBody + stripLedgerSectionPairs(after);
    const beforeLedger = result.slice(0, ledgerStart);
    result = stripLedgerSectionPairs(beforeLedger) + result.slice(ledgerStart);
  } else {
    result = stripLedgerSectionPairs(result);
  }

  return result.replace(/\n{3,}/g, "\n\n");
}

/** Persist MDX with zone hygiene: dedupe ledger tags + single Latest header + narrative hoist. */
function commitMdxDocument(doc: string): string {
  return stripLatestOutsideExecutive(
    relocateStrayNarrativeToExecutive(normalizeLedgerZone(deduplicateLedgerSections(doc))),
  );
}

/** Replace a ledger section block — preserves position, migrates legacy TABLE markers to SECTION. */
export function replaceLedgerTagContent(doc: string, tag: string, inner: string): string | null {
  const bounds = findLedgerTagBounds(doc, tag);
  if (!bounds) return null;
  const normalized = normalizeLedgerTagInner(inner.trim());
  const body = normalized.startsWith("\n") ? normalized : `\n${normalized}\n`;
  const { start: secStart, end: secEnd } = buildSectionMarkers(tag);
  const newBlock = `${secStart}${body}${secEnd}`;
  return doc.slice(0, bounds.start) + newBlock + doc.slice(bounds.end + bounds.endMarker.length);
}

/**
 * Find `SECTION:TAG` (or legacy TABLE pair) and replace its interior.
 * Inserts a single new block only when the tag is absent — never stacks duplicates.
 */
export function upsertLedgerSection(doc: string, tag: string, inner: string): string {
  const bounds = findLedgerTagBounds(doc, tag);
  if (bounds) {
    return replaceLedgerTagContent(doc, tag, inner) ?? doc;
  }

  const [_, le] = ZONE_MARKERS.ledger;
  const ledgerEndIdx = doc.indexOf(le);
  if (ledgerEndIdx < 0) return doc;

  const normalized = normalizeLedgerTagInner(inner.trim());
  const insertion = `\n${wrapSectionBlock(tag, normalized)}\n`;
  return doc.slice(0, ledgerEndIdx) + insertion + doc.slice(ledgerEndIdx);
}

/** Patch benchmark zones in place — LEDGER sections must be updated via `upsertLedgerSection`. */
export function patchBenchmarkZones(
  doc: string,
  zones: {
    executive?: string;
    summary?: string;
    infrastructure?: string;
    metadata?: string;
    trailing?: string;
  },
): string {
  let result = doc;
  const [execS, execE] = ZONE_MARKERS.executive;
  const [sumS, sumE] = ZONE_MARKERS.summary;
  const [ledS, ledE] = ZONE_MARKERS.ledger;
  const [benchE] = [ZONE_MARKERS.benchmark[1]];

  if (zones.executive !== undefined) {
    const body = ensureExecutiveMarkers(replaceLatestAuditHeading(zones.executive.trim()));
    const next = replaceZone(result, execS, execE, body);
    if (next) result = next;
  }

  if (zones.summary !== undefined) {
    const next = replaceZone(result, sumS, sumE, zones.summary);
    if (next) result = next;
  }

  if (zones.infrastructure !== undefined) {
    const summaryEnd = result.indexOf(sumE);
    const ledgerStart = result.indexOf(ledS);
    if (summaryEnd >= 0 && ledgerStart > summaryEnd) {
      const band = zones.infrastructure.startsWith("\n")
        ? zones.infrastructure
        : `\n${zones.infrastructure}\n`;
      result = result.slice(0, summaryEnd + sumE.length) + band + result.slice(ledgerStart);
    }
  }

  if (zones.metadata !== undefined) {
    const [metaS, metaE] = ZONE_MARKERS.metadata;
    const next = replaceZone(result, metaS, metaE, zones.metadata);
    if (next) result = next;
  }

  if (zones.trailing !== undefined) {
    const ledgerEnd = result.indexOf(ledE);
    if (ledgerEnd >= 0) {
      const insertAt = ledgerEnd + ledE.length;
      const metaStart = result.indexOf(ZONE_MARKERS.metadata[0], insertAt);
      const benchEnd = result.indexOf(benchE);
      const endAt =
        metaStart > insertAt ? metaStart : benchEnd > insertAt ? benchEnd : result.length;
      const band = zones.trailing.startsWith("\n") ? zones.trailing : `\n${zones.trailing}\n`;
      result = result.slice(0, insertAt) + band + result.slice(endAt);
    }
  }

  return commitMdxDocument(result);
}

/** Discover tag using LEDGER scope first. */
export function discoverTagInLedger(
  doc: string,
  testFile: string,
  shortLabel?: string,
): string | null {
  const scope = getTagDiscoveryScope(doc);
  return discoverTag(scope, testFile, shortLabel);
}

// ─────────────────────────────────────────────────────────────
// Atomic MDX Write Helper
// ─────────────────────────────────────────────────────────────

/** Persist committed MDX document (zone hygiene + narrative hoist). */
export function writeMdxDocument(docPath: string, doc: string): void {
  if (!acquireMdxLock(docPath)) return;
  try {
    atomicWrite(docPath, commitMdxDocument(doc));
  } finally {
    releaseMdxLock(docPath);
  }
}

/** Write to temp file first, then rename into place — prevents half-written reports. */
function atomicWrite(docPath: string, content: string): void {
  // Clean up stale temp files from previous crashes
  const dir = path.dirname(docPath);
  const base = path.basename(docPath);
  const staleFiles = fs.readdirSync(dir).filter((f) => f.startsWith(base + ".tmp."));
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

/** Write truth table + refresh collapsed `<summary>` (surgical path parity with matrix). */
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
    const tag = discoverTagInLedger(doc, testFile, shortLabel);
    if (!tag) return null;

    const truth = ["```text", table, "```"].join("\n");
    const avgMs = parseAvgMsFromAsciiTable(table);
    const bounds = findLedgerTagBounds(doc, tag);
    let inner = "";
    if (bounds) {
      const block = doc.slice(bounds.start, bounds.end + bounds.endMarker.length);
      inner = extractTagInner(block, tag);
      const patched = replaceBetweenMarkers(
        inner,
        LEDGER_MARKERS.truth[0],
        LEDGER_MARKERS.truth[1],
        truth,
      );
      if (patched) inner = patched;
    } else {
      inner = normalizeLedgerTagInner(truth);
    }
    inner = patchCollapsedLedgerSummary(inner, {
      avgMs,
      icon: avgMs > 0 ? "\u{1F7E2}" : "\u26AA",
      trendLabel: avgMs > 0 ? "recorded (awaiting trend)" : "pending",
      deltaPct: 0,
    });
    doc = upsertLedgerSection(doc, tag, inner);
    atomicWrite(docPath, commitMdxDocument(doc));
    return tag;
  } catch (err: any) {
    if (process.env.LOG_LEVEL === "debug" || process.env.BENCHMARK_DEBUG === "true") {
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
    const resolvedTag = tag || discoverTagInLedger(doc, testFile, shortLabel);
    if (!resolvedTag) return;

    const runSummary = ["```text", summaryTable, "```"].join("\n");
    const updated = patchLedgerTag(doc, resolvedTag, { runSummary });
    if (!updated) return;

    atomicWrite(docPath, commitMdxDocument(updated));
  } catch (err: any) {
    if (process.env.LOG_LEVEL === "debug" || process.env.BENCHMARK_DEBUG === "true") {
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
    const resolvedTag = tag || discoverTagInLedger(doc, testFile, shortLabel);
    if (!resolvedTag) return;

    const hasTs = /\(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)/.test(trendLabel);
    const labelWithTs = hasTs
      ? trendLabel
      : `${trendLabel} (${new Date().toISOString().replace("T", " ").slice(0, 19)})`;
    const trendHeading = `### \u{1F3F7}\uFE0F ${labelWithTs}`;
    const insightBody = `> ${insight}`;

    const updated = patchLedgerTag(doc, resolvedTag, {
      trendHeading,
      insight: insightBody,
    });
    if (!updated) return;

    atomicWrite(docPath, commitMdxDocument(updated));
  } catch (err: any) {
    if (process.env.LOG_LEVEL === "debug" || process.env.BENCHMARK_DEBUG === "true") {
      console.error(`[MDX Debug] writeTrendAndInsight failed:`, err);
    }
  } finally {
    releaseMdxLock(docPath);
  }
}

/** Update the EXECUTIVE zone (matrix-owned pass/fail + alerts). */
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
    const [execStart, execEnd] = ZONE_MARKERS.executive;
    let executive = extractZone(doc, execStart, execEnd);

    if (executive === null) {
      releaseMdxLock(docPath);
      return;
    }

    executive = executive.replace(/\n> \u23F3 Pending[^\n]*\n/g, "\n");

    if (isPartial) {
      const now = new Date().toISOString().slice(0, 10);
      const db = getDbType();
      executive = patchExecutivePartialWatermark(
        executive,
        `> \u{1F4CB} **Partial update**: \`${testName}\` / ${db.toUpperCase()} / ${now} — run full matrix for complete results.`,
      );
    } else {
      executive = patchExecutivePartialWatermark(executive, null);
    }

    const alertMarker = `<!-- EXECUTIVE_ALERT:${slugify(testName)} -->`;
    const alertLine = `> **${testName}**:${trendLabel}`;
    const alertBlock = `${alertMarker}\n${alertLine}\n`;
    let alerts =
      extractZone(executive, EXECUTIVE_MARKERS.alerts[0], EXECUTIVE_MARKERS.alerts[1]) ?? "";

    if (alerts.includes(alertMarker)) {
      alerts = alerts.replace(
        new RegExp(`${escapeRegex(alertMarker)}\\s*\\n>[^\\n]*\\n`, "m"),
        alertBlock,
      );
    } else {
      alerts = alerts.trim() ? `${alerts.trimEnd()}\n${alertBlock}` : alertBlock;
    }

    executive = patchExecutiveAlerts(executive, alerts);

    const replaced = replaceZone(doc, execStart, execEnd, executive);
    if (replaced) doc = replaced;

    atomicWrite(docPath, commitMdxDocument(doc));
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
  severe?: boolean;
}

const SEVERITY_RANK: Record<string, number> = {
  "\u{1F534}": 4,
  "\u{1F7E1}": 3,
  "\u{1F7E2}": 2,
  "\u{26AA}": 1,
  "\u23F3": 0,
};

function normalizeSectionName(name: string): string {
  return name
    .replace(/[\uFE0F\u200D]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function severityRank(icon: string): number {
  return SEVERITY_RANK[icon] ?? 0;
}

/** Ledger slice for parsing — prefers LEDGER zone, falls back to detailed ledger H2. */
export function getLedgerParseScope(doc: string): string {
  const ledger = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]);
  if (ledger) return ledger;

  const ledgerH2 = doc.indexOf("## \u{1F52C} Detailed Performance Ledger");
  if (ledgerH2 < 0) return getTagDiscoveryScope(doc);

  const benchEnd = doc.indexOf(ZONE_MARKERS.benchmark[1], ledgerH2);
  return doc.slice(ledgerH2, benchEnd > ledgerH2 ? benchEnd : doc.length);
}

function _dedupeSections(sections: SectionStatus[]): SectionStatus[] {
  const byName = new Map<string, SectionStatus>();
  for (const section of sections) {
    const key = normalizeSectionName(section.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, section);
      continue;
    }
    const existingRank = severityRank(existing.icon);
    const nextRank = severityRank(section.icon);
    if (
      nextRank > existingRank ||
      (nextRank === existingRank && section.lastRun > existing.lastRun)
    ) {
      byName.set(key, section);
    }
  }
  return [...byName.values()];
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
function _parseTrendHeading(line: string): SectionStatus {
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

/** Write or replace fix-overlay markdown in the EXECUTIVE fix-notes slot. */
export function writeExecutiveFixNote(noteMarkdown: string, docPath?: string): void {
  const resolved = docPath ?? getDocPath();
  if (!fs.existsSync(resolved)) return;
  if (!acquireMdxLock(resolved)) return;

  try {
    const doc = fs.readFileSync(resolved, "utf8");
    const [execStart, execEnd] = ZONE_MARKERS.executive;
    const executive = extractZone(doc, execStart, execEnd);
    if (executive === null) return;

    const [fixStart, fixEnd] = EXECUTIVE_MARKERS.fixNotes;
    const existing = extractZone(executive, fixStart, fixEnd)?.trim() ?? "";
    const body = mergeFixNoteBodies(existing, [noteMarkdown.trim()]);
    const patched = patchExecutiveFixNotes(executive, body);
    const replaced = replaceZone(doc, execStart, execEnd, patched);
    if (replaced) atomicWrite(resolved, commitMdxDocument(replaced));
  } finally {
    releaseMdxLock(resolved);
  }
}

/** Replace EXECUTIVE zone body — sole owner of `LATEST_AUDIT_HEADING`. */
export function writeExecutiveZone(body: string, headingSuffix?: string): void {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return;
  if (!acquireMdxLock(docPath)) return;

  try {
    const doc = fs.readFileSync(docPath, "utf8");
    const [es, ee] = ZONE_MARKERS.executive;
    const normalized = replaceLatestAuditHeading(body, headingSuffix);
    const replaced = replaceZone(doc, es, ee, normalized);
    if (replaced) {
      atomicWrite(docPath, commitMdxDocument(replaced));
    }
  } finally {
    releaseMdxLock(docPath);
  }
}

export interface BenchmarkZoneContent {
  executive: string;
  summary?: string;
  infrastructure?: string;
  ledger: string;
  trailing?: string;
}

/** Assemble BENCHMARK inner content with zone boundaries. */
export function assembleBenchmarkBlock(content: BenchmarkZoneContent): string {
  const summary =
    content.summary ?? "\n> \u23F3 Pending \u2014 derived tables populate after benchmark runs.\n";
  const executive = replaceLatestAuditHeading(content.executive.trimStart());
  let block = `\n<!-- EXECUTIVE_START -->\n${executive.trimStart()}\n<!-- EXECUTIVE_END -->\n\n`;
  block += `<!-- SUMMARY_START -->${summary.startsWith("\n") ? summary : `\n${summary}`}\n<!-- SUMMARY_END -->\n\n`;
  if (content.infrastructure) block += `${content.infrastructure}\n\n`;
  block += `<!-- LEDGER_START -->\n${content.ledger.trimStart()}\n<!-- LEDGER_END -->\n`;
  if (content.trailing) block += `\n${content.trailing}\n`;
  return block;
}

/** Replace the full BENCHMARK block; enforces single Latest H2 via strip pass. */
export function replaceBenchmarkBlock(doc: string, content: BenchmarkZoneContent): string {
  const [benchStart, benchEnd] = ZONE_MARKERS.benchmark;
  const inner = assembleBenchmarkBlock(content);
  let next: string;
  if (doc.includes(benchStart) && doc.includes(benchEnd)) {
    next = doc.replace(
      /<!-- BENCHMARK_START -->[\s\S]*?<!-- BENCHMARK_END -->/,
      `${benchStart}${inner}${benchEnd}`,
    );
  } else {
    next = `${doc}\n${benchStart}${inner}${benchEnd}`;
  }
  return commitMdxDocument(next);
}

function writeSummarySlot(
  slot: keyof typeof SUMMARY_MARKERS,
  body: string,
  docPath = getDocPath(),
): void {
  if (!fs.existsSync(docPath)) return;
  if (!acquireMdxLock(docPath)) return;

  try {
    const doc = fs.readFileSync(docPath, "utf8");
    const [sm, se] = ZONE_MARKERS.summary;
    const existing = extractZone(doc, sm, se) ?? "";
    const normalized = patchSummarySlot(ensureSummaryMarkers(existing), slot, body);
    const replaced = replaceZone(doc, sm, se, normalized);
    if (replaced) {
      atomicWrite(docPath, commitMdxDocument(replaced));
    }
  } finally {
    releaseMdxLock(docPath);
  }
}

/** C: Replace **Current Run** slot only (`SUMMARY_RUN_OVERLAY_*`). */
export function writeSummaryRunOverlay(body: string, docPath?: string): void {
  writeSummarySlot("runOverlay", body, docPath ?? getDocPath());
}

/** C: Replace **Historical Archive** slot only (`SUMMARY_HISTORY_*`). */
export function writeSummaryHistoryArchive(body: string, docPath?: string): void {
  writeSummarySlot("historyTables", body, docPath ?? getDocPath());
}

/** @deprecated Use `writeSummaryRunOverlay()` — replaces Current Run slot only. */
export function writeSummaryZone(body: string): void {
  writeSummaryRunOverlay(body);
}

/**
 * @deprecated Disabled — executive rollups replace append-only Needs Attention tables.
 * Hoists stray narrative only; never writes SUMMARY tables.
 */
export function rebuildSummary(_dbLabel: string): void {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return;
  if (!acquireMdxLock(docPath)) return;
  try {
    const doc = fs.readFileSync(docPath, "utf8");
    atomicWrite(docPath, commitMdxDocument(doc));
  } finally {
    releaseMdxLock(docPath);
  }
}

// ─────────────────────────────────────────────────────────────
// Report shell generation — clean MDX without duplicate tags
// ─────────────────────────────────────────────────────────────

export interface LedgerScriptMeta {
  path: string;
  label: string;
  shortLabel: string;
  desc: string;
  strategy?: string;
  section?: string;
}

export interface ReportShellOptions {
  dbKey: string;
  title: string;
  adapterName: string;
  order?: number;
  scripts: LedgerScriptMeta[];
  codePathPrefix?: string;
}

function isScriptApplicable(script: LedgerScriptMeta, dbKey: string): boolean {
  const isSql = dbKey.includes("sqlite") || dbKey.includes("postgres") || dbKey.includes("mariadb");
  const strategy = script.strategy ?? "all";
  return (
    strategy === "all" ||
    (strategy === "sql" && isSql) ||
    (strategy === "once" && dbKey === "sqlite")
  );
}

function buildLedgerEntry(script: LedgerScriptMeta): string {
  const tag = shortLabelToTag(script.shortLabel);
  const relativePath = `../../../${script.path.replace(/\\/g, "/")}`;
  const collapsed = [
    `<details id="section-${tag.toLowerCase()}">`,
    `<summary><strong>\u{1F3F7}\uFE0F ${script.label}</strong> \u00B7 \u23F3 pending \u00B7 \u27A1\uFE0F baseline \u00B7 <a href="${relativePath}">source</a></summary>`,
    "",
    LEDGER_MARKERS.truth[0],
    `> \u23F3 Pending \u2014 ${script.desc}`,
    LEDGER_MARKERS.truth[1],
    "",
    "</details>",
  ].join("\n");
  return [buildSectionMarkers(tag).start, collapsed, buildSectionMarkers(tag).end, ""].join("\n");
}

/** Generate a clean per-DB MDX report shell with zone boundaries and one tag pair per test. */
export function buildReportShell(options: ReportShellOptions): string {
  const {
    dbKey,
    title,
    adapterName,
    order = 5,
    scripts,
    codePathPrefix = dbKey.replace("_redis", "").replace("-redis", ""),
  } = options;
  const fileKey = dbKey.replace("-", "_");
  const today = new Date().toISOString().split("T")[0];
  const applicable = scripts.filter((s) => isScriptApplicable(s, dbKey));
  const sectionBlocks = applicable.map((script) => ({
    tag: shortLabelToTag(script.shortLabel),
    inner: extractTagInner(buildLedgerEntry(script), shortLabelToTag(script.shortLabel)),
  }));
  const ledgerPreamble = `## \u{1F52C} Full benchmark ledger (${applicable.length} modules)

Expand dimension groups, then any row, for ASCII truth tables. Executive summary above shows pass/fail and issues only.`;
  const ledgerBody = assembleDimensionGroupedLedger(ledgerPreamble, sectionBlocks);

  return `---
description: "Database performance benchmarks with trend analysis and competitive context."
path: docs/project/benchmarks/benchmark_${fileKey}.mdx
title: ${title}
order: ${order}
icon: "mdi:speedometer"
author: SveltyCMS Team
created: ${today}
updated: ${today}
tags:
  - benchmark
  - performance
  - ${codePathPrefix}
---

# \u{1F680} ${adapterName} Performance Ledger

> [!NOTE] Competitive comparisons based on publicly available documentation as of June 2026. All SveltyCMS metrics self-measured via \`bun test tests/benchmarks/\`.

> [!IMPORTANT]
> **Console-only by default.** Use \`BENCHMARK_RECORD=1\` to write results to this report.
>
> \`\`\`bash
> BENCHMARK_RECORD=1 bun test tests/benchmarks/auth-performance.test.ts
> \`\`\`
>
> The full matrix runner (\`bun run scripts/benchmark-matrix/index.ts --sql\`) always records.

<!-- BENCHMARK_START -->

<!-- EXECUTIVE_START -->
${LATEST_HEADER_MARKER}
${LATEST_AUDIT_HEADING}

${EXECUTIVE_MARKERS.fixNotes[0]}
${EXECUTIVE_FIX_NOTES_PLACEHOLDER}
${EXECUTIVE_MARKERS.fixNotes[1]}

> \u23F3 Pending \u2014 run full matrix to populate executive summary.

${EXECUTIVE_MARKERS.partialWatermark}

${EXECUTIVE_MARKERS.alerts[0]}
${EXECUTIVE_MARKERS.alerts[1]}

<!-- EXECUTIVE_END -->

<!-- SUMMARY_START -->

${SUMMARY_MARKERS.runOverlay[0]}
### Current Run Summary
> Only tests that ran in THIS invocation. Populated after \`BENCHMARK_RECORD=1\` or matrix run.
${SUMMARY_MARKERS.runOverlay[1]}

${SUMMARY_MARKERS.historyTables[0]}
### Historical Trends
> Sparklines only — link to \`history.sqlite\` for full run tables.
${SUMMARY_MARKERS.historyTables[1]}

<!-- SUMMARY_END -->

<!-- LEDGER_START -->

${ledgerBody}
<!-- LEDGER_END -->

<!-- METADATA_START -->

> \u23F3 Host environment populates after matrix run.

<!-- METADATA_END -->

<!-- BENCHMARK_END -->
`;
}

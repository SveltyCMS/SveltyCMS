/**
 * @file tests/benchmarks/modules/benchmark-mdx.test.ts
 * @description Unit tests for MDX tag discovery and zone-scoped ledger writes.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "bun:test";
import {
  assembleBenchmarkBlock,
  buildLedgerTagInner,
  buildReportShell,
  buildSectionMarkers,
  EXECUTIVE_MARKERS,
  ensureExecutiveMarkers,
  LEDGER_MARKERS,
  patchExecutiveAlerts,
  patchExecutiveFixNotes,
  patchExecutivePartialWatermark,
  relocateStrayNarrativeToExecutive,
  patchLedgerTag,
  patchSummarySlot,
  SUMMARY_MARKERS,
  countLatestAuditHeadings,
  countLatestAuditMarkers,
  deduplicateLedgerSections,
  discoverTag,
  discoverTagInLedger,
  assembleDimensionGroupedLedger,
  extractFirstTagBlock,
  findDuplicateLedgerTags,
  isCollapsedLedgerInner,
  parseAvgMsFromAsciiTable,
  patchCollapsedLedgerSummary,
  normalizeLedgerTagInner,
  normalizeLedgerZone,
  stripStrayTrendHeadings,
  findLedgerTagBounds,
  getLedgerParseScope,
  LATEST_AUDIT_HEADING,
  LATEST_HEADER_MARKER,
  replaceBenchmarkBlock,
  replaceLatestAuditHeading,
  replaceLedgerTagContent,
  stripLatestOutsideExecutive,
  wrapSectionBlock,
  findUnclosedSectionTags,
  upsertLedgerSection,
  countTagInLedger,
  writeSummaryHistoryArchive,
  writeSummaryRunOverlay,
} from "./benchmark-mdx";

// Use a frozen string slice to replicate precise MDX report layouts
const MOCK_MDX_DOCUMENT = Object.freeze(`
<!-- SCAN_TABLE_START -->
<!-- SCAN_TABLE_END -->
<!-- INCREMENTAL_TABLE_START -->
<!-- INCREMENTAL_TABLE_END -->
<!-- CONTENT_STRESS_TABLE_START -->
<!-- CONTENT_STRESS_TABLE_END -->
<!-- HOOKS_TRACE_TABLE_START -->
<!-- HOOKS_TRACE_TABLE_END -->
<!-- CACHE_EFFICIENCY_TABLE_START -->
<!-- CACHE_EFFICIENCY_TABLE_END -->
`);

test("discoverTag maps content-incremental-reload to explicit INCREMENTAL tag", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/content-incremental-reload.test.ts");
  expect(tag).toBe("INCREMENTAL");
});

test("discoverTag maps content-scale-stress to explicit CONTENT_STRESS tag", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/content-scale-stress.test.ts");
  expect(tag).toBe("CONTENT_STRESS");
});

test("discoverTag maps content-scan to explicit SCAN tag", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/content-scan.test.ts");
  expect(tag).toBe("SCAN");
});

test("discoverTag prefers normalized shortLabel tag over explicit file matching rules", () => {
  const tag = discoverTag(
    MOCK_MDX_DOCUMENT,
    "tests/benchmarks/content-incremental-reload.test.ts",
    "Incremental",
  );
  expect(tag).toBe("INCREMENTAL");
});

test("discoverTag matches dynamic file names via case-insensitive segment exploration loops", () => {
  const tag = discoverTag(
    MOCK_MDX_DOCUMENT,
    "tests/benchmarks/hooks-performance.test.ts",
    "Hooks Trace",
  );
  expect(tag).toBe("HOOKS_TRACE");
});

test("discoverTag matches cache-hit-ratio via explicit CACHE_EFFICIENCY mapping", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests/benchmarks/cache-hit-ratio.test.ts");
  expect(tag).toBe("CACHE_EFFICIENCY");
});

test("discoverTag falls back gracefully to null when no structured tokens match the criteria", () => {
  const tag = discoverTag(
    MOCK_MDX_DOCUMENT,
    "tests/benchmarks/unregistered-diagnostic-module.test.ts",
    "UnknownSuite",
  );
  expect(tag).toBeNull();
});

test("discoverTag processes windows-style backslash file paths deterministically without collision", () => {
  const tag = discoverTag(MOCK_MDX_DOCUMENT, "tests\\benchmarks\\content-scan.test.ts");
  expect(tag).toBe("SCAN");
});

const MOCK_ZONE_DOCUMENT = `
<!-- LEDGER_START -->
<!-- SCAN_TABLE_START -->
### 🏷️ Scan ⚪ baseline (1 run)
ledger truth table
<!-- SCAN_TABLE_END -->
<!-- LEDGER_END -->

<!-- EDUCATIONAL_START -->
<!-- SCAN_TABLE_START -->
### 🏷️ Scan ⚪ educational copy
educational stale data
<!-- SCAN_TABLE_END -->
<!-- EDUCATIONAL_END -->
`;

test("findLedgerTagBounds returns only the ledger copy", () => {
  const bounds = findLedgerTagBounds(MOCK_ZONE_DOCUMENT, "SCAN");
  expect(bounds).not.toBeNull();
  expect(bounds!.startMarker).toBe("<!-- SCAN_TABLE_START -->");
  const inner = MOCK_ZONE_DOCUMENT.slice(bounds!.start + bounds!.startMarker.length, bounds!.end);
  expect(inner).toContain("ledger truth table");
  expect(inner).not.toContain("educational stale data");
});

test("replaceLedgerTagContent updates ledger copy only", () => {
  const updated = replaceLedgerTagContent(MOCK_ZONE_DOCUMENT, "SCAN", "fresh ledger data");
  expect(updated).toContain("fresh ledger data");
  expect(updated).toContain("educational stale data");
  expect(updated!.split("fresh ledger data").length).toBe(2);
});

test("discoverTagInLedger scopes discovery to LEDGER zone", () => {
  const tag = discoverTagInLedger(MOCK_ZONE_DOCUMENT, "tests/benchmarks/content-scan.test.ts");
  expect(tag).toBe("SCAN");
});

test("buildReportShell emits one TABLE tag pair per script", () => {
  const shell = buildReportShell({
    dbKey: "sqlite",
    title: "SQLite Performance Audit",
    adapterName: "SQLite",
    scripts: [
      {
        path: "tests/benchmarks/content-scan.test.ts",
        label: "Self-Healing Content Scan",
        shortLabel: "Scan",
        desc: "Scanner benchmark",
        strategy: "once",
      },
      {
        path: "tests/benchmarks/api-latency.test.ts",
        label: "API LAYER LATENCY",
        shortLabel: "API Latency",
        desc: "API latency benchmark",
        strategy: "all",
      },
    ],
  });

  expect(shell).toContain("<!-- LEDGER_START -->");
  expect(shell).toContain("<!-- EXECUTIVE_START -->");
  expect(shell).toContain("<!-- SUMMARY_START -->");
  expect(shell).toContain(buildSectionMarkers("SCAN").start);
  expect(shell).toContain(buildSectionMarkers("API_LATENCY").start);
  expect(shell).not.toContain("<!-- SCAN_TABLE_START -->");
  expect(shell).not.toContain("<!-- EDUCATIONAL_START -->\n<!-- SECTION:SCAN:START -->");
});

test("getLedgerParseScope prefers LEDGER zone over educational duplicates", () => {
  const scope = getLedgerParseScope(MOCK_ZONE_DOCUMENT);
  expect(scope).toContain("ledger truth table");
  expect(scope).not.toContain("educational stale data");
});

test("replaceBenchmarkBlock keeps exactly one Latest Performance Audit H2", () => {
  const legacy = `
<!-- SUMMARY_START -->
## 📊 Latest Performance Audit (Mode: MIXED — stale)
<!-- SUMMARY_END -->
<!-- BENCHMARK_START -->
## 📊 Latest Performance Audit (28/06/2026)
<!-- BENCHMARK_END -->
`;

  const next = replaceBenchmarkBlock(legacy, {
    executive: `${LATEST_AUDIT_HEADING} (2026-07-04)\n\n**Status:** ✅ PASS`,
    ledger:
      "## 🔬 Detailed Performance Ledger\n\n<!-- SCAN_TABLE_START -->\n<!-- SCAN_TABLE_END -->",
  });

  expect(countLatestAuditHeadings(next)).toBe(1);
  expect(countLatestAuditMarkers(next)).toBe(1);
  expect(next).toContain("<!-- EXECUTIVE_START -->");
  expect(next).toContain(LATEST_HEADER_MARKER);
  expect(next).not.toContain("Mode: MIXED");
  expect(next).not.toContain("(28/06/2026)");
});

test("replaceLatestAuditHeading replaces anchored marker block instead of appending", () => {
  const anchored = `${LATEST_HEADER_MARKER}\n${LATEST_AUDIT_HEADING} (2026-06-28)\n\n**Status:** PASS`;
  const next = replaceLatestAuditHeading(anchored, "(2026-07-04)");
  expect(countLatestAuditMarkers(next)).toBe(1);
  expect(countLatestAuditHeadings(next)).toBe(1);
  expect(next).toContain("(2026-07-04)");
  expect(next).not.toContain("(2026-06-28)");
  expect(next).toContain("**Status:** PASS");
});

test("replaceLatestAuditHeading upgrades legacy stacked H2s to a single marker block", () => {
  const stacked = `${LATEST_AUDIT_HEADING} (2026-06-28)\n\n${LATEST_AUDIT_HEADING} (Mode: MIXED)\n\n**Status:** PASS`;
  const next = replaceLatestAuditHeading(stacked, "(2026-07-04)");
  expect(countLatestAuditMarkers(next)).toBe(1);
  expect(countLatestAuditHeadings(next)).toBe(1);
  expect(next.indexOf(LATEST_HEADER_MARKER)).toBeLessThan(next.indexOf("**Status:** PASS"));
  expect(next).not.toContain("Mode: MIXED");
});

test("assembleBenchmarkBlock places Latest only inside EXECUTIVE", () => {
  const block = assembleBenchmarkBlock({
    executive: `${LATEST_AUDIT_HEADING}\n\n**Status:** PASS`,
    ledger: "<!-- API_LATENCY_TABLE_START -->\n<!-- API_LATENCY_TABLE_END -->",
  });
  const execStart = block.indexOf("<!-- EXECUTIVE_START -->");
  const execEnd = block.indexOf("<!-- EXECUTIVE_END -->");
  const executive = block.slice(execStart, execEnd);
  expect(executive).toContain(LATEST_HEADER_MARKER);
  expect(executive).toContain(LATEST_AUDIT_HEADING);
  expect(countLatestAuditHeadings(block)).toBe(1);
  expect(countLatestAuditMarkers(block)).toBe(1);
});

test("patchLedgerTag replaces marker slots without appending duplicates", () => {
  const doc = `
<!-- LEDGER_START -->
<!-- SCAN_TABLE_START -->
${buildLedgerTagInner({ trendHeading: "### 🏷️ Scan ⚪ baseline" })}
<!-- SCAN_TABLE_END -->
<!-- LEDGER_END -->
`;
  const first = patchLedgerTag(doc, "SCAN", { truth: "```text\nrun-1\n```" });
  expect(first).toContain("run-1");
  expect(first).not.toContain("run-2");

  const second = patchLedgerTag(first!, "SCAN", { truth: "```text\nrun-2\n```" });
  expect(second).toContain("run-2");
  expect(second).not.toContain("run-1");
  expect((second!.match(/<!-- LEDGER_TRUTH_START -->/g) || []).length).toBe(1);
  expect((second!.match(/<!-- SECTION:SCAN:START -->/g) || []).length).toBe(1);
});

test("buildLedgerTagInner uses deterministic START/END markers", () => {
  const inner = buildLedgerTagInner();
  expect(inner).toContain(LEDGER_MARKERS.trendHeading);
  expect(inner).toContain(LEDGER_MARKERS.insight[0]);
  expect(inner).toContain(LEDGER_MARKERS.truth[0]);
  expect(inner).toContain(LEDGER_MARKERS.runSummary[0]);
});

test("discoverTag resolves SECTION markers", () => {
  const doc = `
<!-- SECTION:API_LATENCY:START -->
content
<!-- SECTION:API_LATENCY:END -->
`;
  const tag = discoverTag(doc, "tests/benchmarks/api-latency.test.ts", "API Latency");
  expect(tag).toBe("API_LATENCY");
});

test("deduplicateLedgerSections migrates legacy TABLE pairs to SECTION markers", () => {
  const doc = `
<!-- LEDGER_START -->
## Ledger
<!-- SCAN_TABLE_START -->
ledger copy A
<!-- SCAN_TABLE_END -->
<!-- SCAN_TABLE_START -->
ledger copy B
<!-- SCAN_TABLE_END -->
<!-- LEDGER_END -->
`;
  const deduped = deduplicateLedgerSections(doc);
  expect(countTagInLedger(deduped, "SCAN")).toBe(1);
  expect(deduped).toContain("<!-- SECTION:SCAN:START -->");
  expect(deduped).not.toContain("<!-- SCAN_TABLE_START -->");
  expect(deduped).toContain("ledger copy A");
  expect(deduped).not.toContain("ledger copy B");
});

test("deduplicateLedgerSections keeps one TABLE pair per tag in LEDGER", () => {
  const doc = `
<!-- LEDGER_START -->
## Ledger
<!-- SCAN_TABLE_START -->
ledger copy A
<!-- SCAN_TABLE_END -->
<!-- SCAN_TABLE_START -->
ledger copy B
<!-- SCAN_TABLE_END -->
<!-- LEDGER_END -->
<!-- EDUCATIONAL_START -->
<!-- SCAN_TABLE_START -->
educational stale
<!-- SCAN_TABLE_END -->
<!-- EDUCATIONAL_END -->
`;
  const deduped = deduplicateLedgerSections(doc);
  expect(countTagInLedger(deduped, "SCAN")).toBe(1);
  expect(findDuplicateLedgerTags(deduped)).toEqual([]);
  expect(deduped).toContain("ledger copy A");
  expect(deduped).not.toContain("ledger copy B");
  expect(deduped).not.toContain("educational stale");
});

test("patchExecutiveAlerts replaces alerts slot without stacking duplicates", () => {
  const executive = ensureExecutiveMarkers(`${LATEST_HEADER_MARKER}\n${LATEST_AUDIT_HEADING}`);
  const first = patchExecutiveAlerts(executive, "> **Scan**: stable");
  expect(first).toContain("> **Scan**: stable");
  expect((first.match(/<!-- EXECUTIVE_ALERTS_START -->/g) || []).length).toBe(1);

  const second = patchExecutiveAlerts(first, "> **API**: regressed");
  expect(second).toContain("> **API**: regressed");
  expect(second).not.toContain("> **Scan**: stable");
});

test("patchExecutiveFixNotes replaces fix-notes slot without stacking duplicates", () => {
  const executive = ensureExecutiveMarkers(`${LATEST_HEADER_MARKER}\n${LATEST_AUDIT_HEADING}`);
  const first = patchExecutiveFixNotes(
    executive,
    "### 📝 Fix Overlays\n\n> **Fix Applied**: audit logging is now fire-and-forget.",
  );
  expect(first).toContain("**Fix Applied**");
  expect((first.match(/<!-- EXECUTIVE_FIX_NOTES_START -->/g) || []).length).toBe(1);

  const second = patchExecutiveFixNotes(
    first,
    "### 📝 Fix Overlays\n\n> **Fix Applied**: cache pool resized.",
  );
  expect(second).toContain("cache pool resized");
  expect(second).not.toContain("fire-and-forget");
});

test("relocateStrayNarrativeToExecutive hoists inline Fix Applied from LEDGER", () => {
  const fixNote =
    "> **Round 2 / Phase 1 Fix Applied**: `handle-audit-logging.ts` now uses fire-and-forget.";
  const doc = `
<!-- EXECUTIVE_START -->
${LATEST_HEADER_MARKER}
${LATEST_AUDIT_HEADING}
<!-- EXECUTIVE_FIX_NOTES_START -->
### 📝 Fix Overlays

> Phase notes and remediation entries appear here.
<!-- EXECUTIVE_FIX_NOTES_END -->
<!-- EXECUTIVE_PARTIAL_WATERMARK -->
<!-- EXECUTIVE_ALERTS_START -->
<!-- EXECUTIVE_ALERTS_END -->
<!-- EXECUTIVE_END -->
<!-- LEDGER_START -->
<!-- SECTION:CACHE:START -->
content
<!-- SECTION:CACHE:END -->

${fixNote}

<!-- SECTION:STATE:START -->
more
<!-- SECTION:STATE:END -->
<!-- LEDGER_END -->
`;
  const relocated = relocateStrayNarrativeToExecutive(doc);
  const ledger = relocated.slice(
    relocated.indexOf("<!-- LEDGER_START -->"),
    relocated.indexOf("<!-- LEDGER_END -->"),
  );
  const exec = relocated.slice(
    relocated.indexOf("<!-- EXECUTIVE_START -->"),
    relocated.indexOf("<!-- EXECUTIVE_END -->"),
  );
  expect(exec).toContain("**Round 2 / Phase 1 Fix Applied**");
  expect(ledger).not.toContain(fixNote);
});

test("patchExecutivePartialWatermark replaces watermark line in place", () => {
  const executive = ensureExecutiveMarkers(`${LATEST_HEADER_MARKER}\n${LATEST_AUDIT_HEADING}`);
  const withWatermark = patchExecutivePartialWatermark(
    executive,
    "> **Partial update**: run full matrix.",
  );
  expect(withWatermark).toContain("> **Partial update**");
  expect((withWatermark.match(EXECUTIVE_MARKERS.partialWatermark) || []).length).toBe(1);

  const cleared = patchExecutivePartialWatermark(withWatermark, null);
  expect(cleared).not.toContain("> **Partial update**");
  expect(cleared).toContain(EXECUTIVE_MARKERS.partialWatermark);
});

test("writeSummaryRunOverlay and writeSummaryHistoryArchive patch isolated slots", () => {
  const docPath = path.join(process.cwd(), "tests/benchmarks/results/summary-slot-test.mdx");
  const shell = buildReportShell({
    dbKey: "sqlite",
    title: "SQLite Performance Audit",
    adapterName: "SQLite",
    scripts: [],
  });
  fs.writeFileSync(docPath, shell, "utf8");

  writeSummaryRunOverlay(
    "### Current Run Summary (2026-07-04)\n\n> Only tests that ran in THIS invocation.\n\n| Test | Avg |\n|------|-----|\n| Scan | 1ms |",
    docPath,
  );
  let doc = fs.readFileSync(docPath, "utf8");
  expect(doc).toContain("| Scan | 1ms |");
  expect(doc).not.toContain("| Archive |");

  writeSummaryHistoryArchive(
    "### Historical Trends (2026-07-04)\n\n| Metric | Runs |\n|--------|------|\n| Archive | 12 |",
    docPath,
  );
  doc = fs.readFileSync(docPath, "utf8");
  expect(doc).toContain("| Scan | 1ms |");
  expect(doc).toContain("| Archive | 12 |");
  expect((doc.match(/<!-- SUMMARY_RUN_OVERLAY_START -->/g) || []).length).toBe(1);
  expect((doc.match(/<!-- SUMMARY_HISTORY_START -->/g) || []).length).toBe(1);

  fs.unlinkSync(docPath);
});

test("patchSummarySlot replaces run overlay without duplicating markers", () => {
  const summary = `${SUMMARY_MARKERS.runOverlay[0]}\n> old\n${SUMMARY_MARKERS.runOverlay[1]}`;
  const next = patchSummarySlot(summary, "runOverlay", "> fresh overlay");
  expect(next).toContain("> fresh overlay");
  expect(next).not.toContain("> old");
  expect((next.match(/<!-- SUMMARY_RUN_OVERLAY_START -->/g) || []).length).toBe(1);
});

test("wrapSectionBlock emits canonical SECTION markers", () => {
  const block = wrapSectionBlock("API_LATENCY", buildLedgerTagInner());
  expect(block).toContain("<!-- SECTION:API_LATENCY:START -->");
  expect(block).toContain("<!-- SECTION:API_LATENCY:END -->");
  expect(block).toContain(LEDGER_MARKERS.truth[0]);
  expect(findUnclosedSectionTags(block)).toEqual([]);
});

test("findUnclosedSectionTags detects missing SECTION:TAG:END", () => {
  const broken = `
<!-- SECTION:API_LATENCY:START -->
truth table only
`;
  expect(findUnclosedSectionTags(broken)).toEqual(["API_LATENCY"]);

  const paired = wrapSectionBlock("API_LATENCY", "ok");
  expect(findUnclosedSectionTags(paired)).toEqual([]);
});

test("upsertLedgerSection replaces interior without adding a second block", () => {
  const doc = `
<!-- LEDGER_START -->
## Ledger
<!-- SECTION:API_LATENCY:START -->
> old truth
<!-- SECTION:API_LATENCY:END -->
<!-- LEDGER_END -->
`;
  const next = upsertLedgerSection(
    doc,
    "API_LATENCY",
    buildLedgerTagInner({ truth: "```text\nfresh\n```" }),
  );
  expect(countTagInLedger(next, "API_LATENCY")).toBe(1);
  expect(next).toContain("fresh");
  expect(next).not.toContain("old truth");
  expect((next.match(/<!-- SECTION:API_LATENCY:START -->/g) || []).length).toBe(1);
});

test("upsertLedgerSection migrates legacy TABLE markers on replace", () => {
  const doc = `
<!-- LEDGER_START -->
<!-- API_LATENCY_TABLE_START -->
legacy body
<!-- API_LATENCY_TABLE_END -->
<!-- LEDGER_END -->
`;
  const next = upsertLedgerSection(
    doc,
    "API_LATENCY",
    buildLedgerTagInner({ truth: "```text\nmigrated\n```" }),
  );
  expect(next).toContain("<!-- SECTION:API_LATENCY:START -->");
  expect(next).toContain("<!-- SECTION:API_LATENCY:END -->");
  expect(next).not.toContain("<!-- API_LATENCY_TABLE_START -->");
  expect(next).toContain("migrated");
});

test("upsertLedgerSection inserts once when tag is missing", () => {
  const doc = `
<!-- LEDGER_START -->
## Ledger
<!-- LEDGER_END -->
`;
  const next = upsertLedgerSection(doc, "SCAN", buildLedgerTagInner());
  expect(countTagInLedger(next, "SCAN")).toBe(1);
  expect(next).toContain("<!-- SECTION:SCAN:START -->");
});

test("deduplicateLedgerSections drops unclosed START without matching END", () => {
  const doc = `
<!-- LEDGER_START -->
<!-- SECTION:API_LATENCY:START -->
api body
<!-- SECTION:SCAN:END -->
<!-- SECTION:SCAN:START -->
scan body
<!-- SECTION:SCAN:END -->
<!-- LEDGER_END -->
`;
  expect(findUnclosedSectionTags(doc)).toEqual(["API_LATENCY"]);
  const deduped = deduplicateLedgerSections(doc);
  expect(findUnclosedSectionTags(deduped)).toEqual([]);
  expect(deduped).not.toContain("<!-- SECTION:API_LATENCY:START -->");
  expect(deduped).toContain("<!-- SECTION:SCAN:START -->");
  expect(deduped).toContain("<!-- SECTION:SCAN:END -->");
});

test("buildReportShell includes SUMMARY and EXECUTIVE marker anchors", () => {
  const shell = buildReportShell({
    dbKey: "sqlite",
    title: "SQLite Performance Audit",
    adapterName: "SQLite",
    scripts: [
      {
        path: "tests/benchmarks/content-scan.test.ts",
        label: "Scan",
        shortLabel: "Scan",
        desc: "Scanner",
        strategy: "once",
      },
    ],
  });
  expect(shell).toContain(EXECUTIVE_MARKERS.fixNotes[0]);
  expect(shell).toContain(EXECUTIVE_MARKERS.partialWatermark);
  expect(shell).toContain(EXECUTIVE_MARKERS.alerts[0]);
  expect(shell).toContain(SUMMARY_MARKERS.runOverlay[0]);
  expect(shell).toContain(SUMMARY_MARKERS.historyTables[0]);
  expect(shell).toContain("LEDGER_DIMENSION:");
  expect(shell).toContain("ledger-dimension-");
});

test("patchCollapsedLedgerSummary refreshes summary metrics", () => {
  const inner = `<details id="section-seo">
<summary><strong>🏷️ SEO</strong> · ⏳ pending · ➡️ baseline · <a href="x">source</a></summary>
<!-- LEDGER_TRUTH_START -->
> pending
<!-- LEDGER_TRUTH_END -->
</details>`;
  const patched = patchCollapsedLedgerSummary(inner, {
    avgMs: 1.478,
    icon: "\u{1F7E2}",
    trendLabel: "stable (+2%)",
    deltaPct: 2,
  });
  expect(patched).toContain("1.478ms");
  expect(patched).not.toContain("\u23F3 pending");
});

test("parseAvgMsFromAsciiTable extracts first ms column", () => {
  const table = "║ Redirect Lookup │        1.478 ms │ p95: 2.273 ms ║";
  expect(parseAvgMsFromAsciiTable(table)).toBeCloseTo(1.478);
});

test("assembleDimensionGroupedLedger nests tests under dimension markers", () => {
  const body = assembleDimensionGroupedLedger("## Ledger", [
    { tag: "REST", inner: '<details id="section-rest"></details>' },
    { tag: "SCAN", inner: '<details id="section-scan"></details>' },
  ]);
  expect(body).toContain("LEDGER_DIMENSION:API:START");
  expect(body).toContain("LEDGER_DIMENSION:CORE:START");
  expect(body).toContain("ledger-dimension-api");
  expect(body).toContain("ledger-dimension-core");
});

test("deduplicateLedgerSections strips stale dimension markers from preamble", () => {
  const doc = `<!-- LEDGER_START -->
## Ledger

<!-- LEDGER_DIMENSION:CORE:START -->
<details id="ledger-dimension-core"><summary>Core stale</summary></details>
<!-- LEDGER_DIMENSION:CORE:END -->

<!-- LEDGER_DIMENSION:CORE:START -->
<details id="ledger-dimension-core"><summary>Core duplicate</summary></details>

<!-- SECTION:AUTH:START -->
<details id="section-auth"></details>
<!-- SECTION:AUTH:END -->
<!-- LEDGER_END -->`;

  const deduped = deduplicateLedgerSections(doc);
  const coreStarts = (deduped.match(/LEDGER_DIMENSION:CORE:START/g) || []).length;
  expect(coreStarts).toBe(1);
  expect(deduped).not.toContain("Core stale");
  expect(deduped).not.toContain("Core duplicate");
});

test("stripStrayTrendHeadings removes flat trend heading before collapsed details", () => {
  const inner = `<!-- LEDGER_TREND_HEADING -->
### 🏷️ Pending

<details id="section-api_latency">
<summary><strong>🏷️ API</strong></summary>
<!-- LEDGER_TRUTH_START -->
truth
<!-- LEDGER_TRUTH_END -->
</details>`;
  const cleaned = stripStrayTrendHeadings(inner);
  expect(cleaned.startsWith("<details")).toBe(true);
  expect(cleaned).not.toContain("LEDGER_TREND_HEADING");
});

test("normalizeLedgerTagInner does not prepend trend heading to collapsed ledger", () => {
  const inner = `<details id="section-seo">
<summary><strong>🏷️ SEO</strong></summary>
<!-- LEDGER_TRUTH_START -->
> pending
<!-- LEDGER_TRUTH_END -->
</details>`;
  const normalized = normalizeLedgerTagInner(inner);
  expect(isCollapsedLedgerInner(normalized)).toBe(true);
  expect(normalized).not.toMatch(/^<!-- LEDGER_TREND_HEADING -->/);
});

test("normalizeLedgerZone cleans stray headings after surgical truth write", () => {
  const doc = `
<!-- LEDGER_START -->
<!-- SECTION:SEO:START -->
<!-- LEDGER_TREND_HEADING -->
### 🏷️ Pending

<details id="section-seo">
<summary><strong>🏷️ SEO</strong></summary>
<!-- LEDGER_TRUTH_START -->
\`\`\`text
table
\`\`\`
<!-- LEDGER_TRUTH_END -->
</details>
<!-- SECTION:SEO:END -->
<!-- LEDGER_END -->
`;
  const cleaned = normalizeLedgerZone(doc);
  const seoBlock = extractFirstTagBlock(cleaned, "SEO");
  expect(seoBlock).toBeTruthy();
  expect(seoBlock!).not.toContain("LEDGER_TREND_HEADING");
});

test("stripLatestOutsideExecutive removes duplicates outside EXECUTIVE", () => {
  const doc = `
<!-- EXECUTIVE_START -->
${LATEST_HEADER_MARKER}
${LATEST_AUDIT_HEADING} (canonical)
<!-- EXECUTIVE_END -->
<!-- SUMMARY_START -->
${LATEST_HEADER_MARKER}
${LATEST_AUDIT_HEADING} (stale summary)
<!-- SUMMARY_END -->
`;
  const cleaned = stripLatestOutsideExecutive(doc);
  expect(countLatestAuditHeadings(cleaned)).toBe(1);
  expect(countLatestAuditMarkers(cleaned)).toBe(1);
  expect(cleaned).not.toContain("(stale summary)");
});

/**
 * @file scripts/lint/lint-benchmark-mdx.ts
 * @description CI guard for the generated benchmark ledgers in `docs/project/benchmarks/`.
 *
 * The per-adapter reports are machine-written (zones, markers, collapsed `<details>`
 * ledger tags). Every writer is marker-driven and surgical, which means a single
 * drift — a dropped `_TABLE_END`, a duplicated zone marker, an unclosed `<details>`
 * — silently poisons the next write instead of failing loudly. This guard asserts
 * the structural contract that the writers rely on, before the pipeline runs.
 *
 * ### Features:
 * - Zone markers present exactly once, balanced, and in canonical document order
 * - Sub-markers (executive / summary / ledger) balanced inside every report
 * - Ledger `<!-- <TAG>_TABLE_START -->` tags paired, unique, and non-nested
 * - `<details>` / `</details>` balance across the whole document
 * - Non-zero exit on any violation (CI-gateable), zero when the tree is clean
 *
 * Usage:
 *   bun run lint:benchmark-mdx
 */

import fs from "node:fs";
import path from "node:path";
import {
  EXECUTIVE_MARKERS,
  LEDGER_MARKERS,
  SUMMARY_MARKERS,
  ZONE_MARKERS,
} from "../../tests/benchmarks/modules/benchmark-mdx";

const DOCS_DIR = path.join(process.cwd(), "docs", "project", "benchmarks");

/** One structural problem found in a generated benchmark report. */
export interface BenchmarkMdxViolation {
  file: string;
  rule: string;
  detail: string;
}

/** One report as the core sees it: the content, or the read error that replaced it. */
export interface BenchmarkMdxFile {
  file: string;
  /** Report body, or `null` when the read failed (`readError` explains why). */
  content: string | null;
  readError?: string;
}

function violates(
  violations: BenchmarkMdxViolation[],
  file: string,
  rule: string,
  detail: string,
): void {
  violations.push({ file, rule, detail });
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function checkZoneMarkers(violations: BenchmarkMdxViolation[], file: string, doc: string): void {
  const positions = new Map<string, { start: number; end: number }>();
  for (const [zone, [start, end]] of Object.entries(ZONE_MARKERS)) {
    if (!doc.includes(start) && !doc.includes(end)) continue;
    const starts = countOccurrences(doc, start);
    const ends = countOccurrences(doc, end);
    if (starts !== 1 || ends !== 1) {
      violates(
        violations,
        file,
        "zone-marker-unbalanced",
        `${zone}: ${starts}× "${start}" / ${ends}× "${end}" (expected exactly 1 each)`,
      );
      continue;
    }
    if (doc.indexOf(end) < doc.indexOf(start)) {
      violates(violations, file, "zone-marker-order", `${zone}: END appears before START`);
      continue;
    }
    positions.set(zone, { start: doc.indexOf(start), end: doc.indexOf(end) });
  }

  // The generated reports wrap the content zones in BENCHMARK_START/END.
  const benchmark = positions.get("benchmark");
  if (benchmark) {
    for (const [zone, position] of positions) {
      if (zone === "benchmark") continue;
      if (position.start < benchmark.start || position.end > benchmark.end) {
        violates(
          violations,
          file,
          "zone-marker-order",
          `"${zone}" must be nested inside BENCHMARK`,
        );
      }
    }
  }

  // Content zones must keep their canonical relative order.
  const canonical = Object.keys(ZONE_MARKERS).filter(
    (zone) => zone !== "benchmark" && positions.has(zone),
  );
  const order = canonical
    .map((zone) => ({ zone, start: positions.get(zone)?.start ?? 0 }))
    .sort((left, right) => left.start - right.start)
    .map((entry) => entry.zone);
  if (order.join(",") !== canonical.join(",")) {
    violates(
      violations,
      file,
      "zone-marker-order",
      `zone order ${order.join(" → ")} differs from canonical ${canonical.join(" → ")}`,
    );
  }
}

function checkMarkerPairs(
  violations: BenchmarkMdxViolation[],
  file: string,
  doc: string,
  label: string,
  pairs: readonly (readonly [string, string])[],
): void {
  for (const [start, end] of pairs) {
    const starts = countOccurrences(doc, start);
    const ends = countOccurrences(doc, end);
    if (starts !== ends) {
      violates(
        violations,
        file,
        "marker-unbalanced",
        `${label}: ${starts}× "${start}" vs ${ends}× "${end}"`,
      );
    }
  }
}

function checkLedgerTags(violations: BenchmarkMdxViolation[], file: string, doc: string): void {
  const tagRx = /<!-- (?:SECTION:(\w+):START|(\w+)_TABLE_START) -->/g;
  const endRx = /<!-- (?:SECTION:(\w+):END|(\w+)_TABLE_END) -->/g;
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();

  for (const match of doc.matchAll(tagRx)) {
    const tag = match[1] ?? match[2];
    if (tag) starts.set(tag, (starts.get(tag) ?? 0) + 1);
  }
  for (const match of doc.matchAll(endRx)) {
    const tag = match[1] ?? match[2];
    if (tag) ends.set(tag, (ends.get(tag) ?? 0) + 1);
  }

  for (const [tag, count] of starts) {
    if (count > 1) {
      violates(
        violations,
        file,
        "ledger-tag-duplicate",
        `"${tag}" has ${count} START markers (expected 1)`,
      );
    }
    const endCount = ends.get(tag) ?? 0;
    if (endCount !== count) {
      violates(
        violations,
        file,
        "ledger-tag-unbalanced",
        `"${tag}": ${count}× START vs ${endCount}× END — a writer will append instead of replace`,
      );
    }
  }
  for (const [tag, count] of ends) {
    if (!starts.has(tag)) {
      violates(
        violations,
        file,
        "ledger-tag-orphan",
        `"${tag}" has ${count}× END without a matching START`,
      );
    }
  }

  // Unclosed <details> inside the LEDGER zone breaks every subsequent section write.
  const ledgerStart = doc.indexOf(ZONE_MARKERS.ledger[0]);
  const ledgerEnd = doc.indexOf(ZONE_MARKERS.ledger[1]);
  if (ledgerStart !== -1 && ledgerEnd > ledgerStart) {
    const ledger = doc.slice(ledgerStart, ledgerEnd);
    const open = countOccurrences(ledger, "<details");
    const close = countOccurrences(ledger, "</details>");
    if (open !== close) {
      violates(
        violations,
        file,
        "details-unbalanced",
        `LEDGER zone: ${open}× <details> vs ${close}× </details>`,
      );
    }
  }
}

/** Checks one report body; returns its violations in discovery order. */
function lintDocument(file: string, doc: string): BenchmarkMdxViolation[] {
  const violations: BenchmarkMdxViolation[] = [];

  checkZoneMarkers(violations, file, doc);

  const ledgerPairs = Object.values(LEDGER_MARKERS).flatMap((value) =>
    Array.isArray(value) ? [value as readonly [string, string]] : [],
  );
  checkMarkerPairs(violations, file, doc, "ledger", ledgerPairs);
  checkMarkerPairs(
    violations,
    file,
    doc,
    "executive",
    Object.values(EXECUTIVE_MARKERS).filter((v) =>
      Array.isArray(v),
    ) as unknown as readonly (readonly [string, string])[],
  );
  checkMarkerPairs(
    violations,
    file,
    doc,
    "summary",
    Object.values(SUMMARY_MARKERS).filter((v) =>
      Array.isArray(v),
    ) as unknown as readonly (readonly [string, string])[],
  );

  checkLedgerTags(violations, file, doc);

  const openDetails = countOccurrences(doc, "<details");
  const closeDetails = countOccurrences(doc, "</details>");
  if (openDetails !== closeDetails) {
    violates(
      violations,
      file,
      "details-unbalanced",
      `${openDetails}× <details> vs ${closeDetails}× </details>`,
    );
  }

  return violations;
}

/**
 * Pure core: assert the structural contract every generated report must keep.
 * `scripts/check/run-source-lints.ts` and the standalone CLI share this list.
 */
export function findBenchmarkMdxViolations(
  files: readonly BenchmarkMdxFile[],
): BenchmarkMdxViolation[] {
  const violations: BenchmarkMdxViolation[] = [];
  for (const entry of files) {
    if (entry.content === null) {
      violations.push({
        file: entry.file,
        rule: "read-failed",
        detail: entry.readError ?? "unknown read error",
      });
      continue;
    }
    violations.push(...lintDocument(entry.file, entry.content));
  }
  return violations;
}

function main(): void {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`❌ benchmark docs directory not found: ${DOCS_DIR}`);
    process.exit(1);
  }

  const fileNames = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => /^benchmark_.*\.mdx$/.test(f))
    .sort();

  if (fileNames.length === 0) {
    console.error(`❌ no benchmark_*.mdx reports found in ${DOCS_DIR}`);
    process.exit(1);
  }

  const docs: BenchmarkMdxFile[] = fileNames.map((file) => {
    try {
      return { file, content: fs.readFileSync(path.join(DOCS_DIR, file), "utf8") };
    } catch (err) {
      return {
        file,
        content: null,
        readError: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const violations = findBenchmarkMdxViolations(docs);

  if (violations.length > 0) {
    console.error(
      `❌ lint:benchmark-mdx — ${violations.length} violation(s) in ${fileNames.length} report(s):\n`,
    );
    for (const v of violations) {
      console.error(`  ${v.file.padEnd(28)} [${v.rule}] ${v.detail}`);
    }
    console.error(
      "\n  Repair: regenerate the affected zones with the pipeline\n" +
        "    bun run scripts/benchmark-matrix/generate-benchmark-reports.ts --force-all\n" +
        "  Never hand-edit a generated zone — the next write assumes marker integrity.",
    );
    process.exit(1);
  }

  console.log(
    `✅ lint:benchmark-mdx — ${fileNames.length} report(s) clean: ${fileNames.join(", ")}`,
  );
}

if (import.meta.main) main();

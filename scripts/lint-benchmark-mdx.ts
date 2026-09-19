/**
 * @file scripts/lint-benchmark-mdx.ts
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
} from "../tests/benchmarks/modules/benchmark-mdx";

const DOCS_DIR = path.join(process.cwd(), "docs", "project", "benchmarks");

interface Violation {
  file: string;
  rule: string;
  detail: string;
}

const violations: Violation[] = [];
const fileNames: string[] = [];

function violates(file: string, rule: string, detail: string): void {
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

function checkZoneMarkers(file: string, doc: string): void {
  const order: string[] = [];
  for (const [zone, [start, end]] of Object.entries(ZONE_MARKERS)) {
    if (!doc.includes(start) && !doc.includes(end)) continue;
    const starts = countOccurrences(doc, start);
    const ends = countOccurrences(doc, end);
    if (starts !== 1 || ends !== 1) {
      violates(
        file,
        "zone-marker-unbalanced",
        `${zone}: ${starts}× "${start}" / ${ends}× "${end}" (expected exactly 1 each)`,
      );
      continue;
    }
    if (doc.indexOf(end) < doc.indexOf(start)) {
      violates(file, "zone-marker-order", `${zone}: END appears before START`);
      continue;
    }
    order.push(zone);
  }

  const canonical = Object.keys(ZONE_MARKERS).filter((zone) => order.includes(zone));
  if (order.join(",") !== canonical.join(",")) {
    violates(
      file,
      "zone-marker-order",
      `zone order ${order.join(" → ")} differs from canonical ${canonical.join(" → ")}`,
    );
  }
}

function checkMarkerPairs(
  file: string,
  doc: string,
  label: string,
  pairs: readonly (readonly [string, string])[],
): void {
  for (const [start, end] of pairs) {
    const starts = countOccurrences(doc, start);
    const ends = countOccurrences(doc, end);
    if (starts !== ends) {
      violates(file, "marker-unbalanced", `${label}: ${starts}× "${start}" vs ${ends}× "${end}"`);
    }
  }
}

function checkLedgerTags(file: string, doc: string): void {
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
      violates(file, "ledger-tag-duplicate", `"${tag}" has ${count} START markers (expected 1)`);
    }
    const endCount = ends.get(tag) ?? 0;
    if (endCount !== count) {
      violates(
        file,
        "ledger-tag-unbalanced",
        `"${tag}": ${count}× START vs ${endCount}× END — a writer will append instead of replace`,
      );
    }
  }
  for (const [tag, count] of ends) {
    if (!starts.has(tag)) {
      violates(file, "ledger-tag-orphan", `"${tag}" has ${count}× END without a matching START`);
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
        file,
        "details-unbalanced",
        `LEDGER zone: ${open}× <details> vs ${close}× </details>`,
      );
    }
  }
}

function lintFile(filePath: string): void {
  const file = path.basename(filePath);
  fileNames.push(file);
  let doc: string;
  try {
    doc = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    violates(file, "read-failed", err instanceof Error ? err.message : String(err));
    return;
  }

  checkZoneMarkers(file, doc);

  const ledgerPairs = Object.values(LEDGER_MARKERS).flatMap((value) =>
    Array.isArray(value) ? [value as readonly [string, string]] : [],
  );
  checkMarkerPairs(file, doc, "ledger", ledgerPairs);
  checkMarkerPairs(
    file,
    doc,
    "executive",
    Object.values(EXECUTIVE_MARKERS).filter((v) =>
      Array.isArray(v),
    ) as unknown as readonly (readonly [string, string])[],
  );
  checkMarkerPairs(
    file,
    doc,
    "summary",
    Object.values(SUMMARY_MARKERS).filter((v) =>
      Array.isArray(v),
    ) as unknown as readonly (readonly [string, string])[],
  );

  checkLedgerTags(file, doc);

  const openDetails = countOccurrences(doc, "<details");
  const closeDetails = countOccurrences(doc, "</details>");
  if (openDetails !== closeDetails) {
    violates(
      file,
      "details-unbalanced",
      `${openDetails}× <details> vs ${closeDetails}× </details>`,
    );
  }
}

function main(): void {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`❌ benchmark docs directory not found: ${DOCS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => /^benchmark_.*\.mdx$/.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`❌ no benchmark_*.mdx reports found in ${DOCS_DIR}`);
    process.exit(1);
  }

  for (const file of files) lintFile(path.join(DOCS_DIR, file));

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

main();

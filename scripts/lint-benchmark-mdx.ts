#!/usr/bin/env bun
/**
 * @file scripts/lint-benchmark-mdx.ts
 * @description CI guard for benchmark MDX zone integrity, ledger markers, and collapsible HTML.
 *
 * Usage: bun run lint:benchmark-mdx
 */
import fs from "node:fs";
import path from "node:path";
import {
  ZONE_MARKERS,
  findDuplicateLedgerTags,
  findUnclosedSectionTags,
  extractZone,
} from "../tests/benchmarks/modules/benchmark-mdx";

const BENCH_DIR = path.join(process.cwd(), "docs/project/benchmarks");
const REQUIRED_ZONES = [
  ZONE_MARKERS.executive,
  ZONE_MARKERS.summary,
  ZONE_MARKERS.ledger,
  ZONE_MARKERS.metadata,
  ZONE_MARKERS.benchmark,
] as const;

function countUnclosedDetails(scope: string): number {
  const opens = (scope.match(/<details[\s>]/gi) || []).length;
  const closes = (scope.match(/<\/details>/gi) || []).length;
  return Math.max(0, opens - closes);
}

function findStrayTrendHeadings(ledger: string): string[] {
  const issues: string[] = [];
  const parts = ledger.split(/(?=<details[\s>])/i);
  for (const part of parts) {
    if (
      part.includes("<!-- LEDGER_TREND_HEADING -->") &&
      !part.trimStart().startsWith("<details")
    ) {
      issues.push("stray LEDGER_TREND_HEADING outside <details>");
      break;
    }
  }
  return issues;
}

function lintFile(filePath: string): string[] {
  const doc = fs.readFileSync(filePath, "utf8");
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const errors: string[] = [];

  for (const [start, end] of REQUIRED_ZONES) {
    if (!doc.includes(start) || !doc.includes(end)) {
      errors.push(`${rel}: missing zone ${start}`);
    }
  }

  const ledger = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]);
  if (!ledger) {
    errors.push(`${rel}: LEDGER zone empty`);
    return errors;
  }

  for (const tag of findDuplicateLedgerTags(doc)) {
    errors.push(`${rel}: duplicate ledger tag ${tag}`);
  }

  for (const tag of findUnclosedSectionTags(ledger)) {
    errors.push(`${rel}: unclosed SECTION:${tag}`);
  }

  const unclosedDetails = countUnclosedDetails(ledger);
  if (unclosedDetails > 0) {
    errors.push(`${rel}: ${unclosedDetails} unclosed <details> in LEDGER`);
  }

  for (const dim of ["CORE", "API", "SCALE", "RESILIENCE"]) {
    const start = `<!-- LEDGER_DIMENSION:${dim}:START -->`;
    const end = `<!-- LEDGER_DIMENSION:${dim}:END -->`;
    const starts = (
      ledger.match(new RegExp(start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []
    ).length;
    const ends = (ledger.match(new RegExp(end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [])
      .length;
    if (starts !== ends) {
      errors.push(`${rel}: mismatched LEDGER_DIMENSION:${dim} markers (${starts} vs ${ends})`);
    }
  }

  errors.push(...findStrayTrendHeadings(ledger).map((m) => `${rel}: ${m}`));

  if (!ledger.includes("ledger-dimension-")) {
    errors.push(`${rel}: ledger missing dimension groups (ledger-dimension-*)`);
  }

  return errors;
}

function main(): void {
  if (!fs.existsSync(BENCH_DIR)) {
    console.error(`❌ Benchmark docs directory not found: ${BENCH_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(BENCH_DIR)
    .filter((f) => f.startsWith("benchmark_") && f.endsWith(".mdx"))
    .map((f) => path.join(BENCH_DIR, f));

  const allErrors: string[] = [];
  for (const file of files) {
    allErrors.push(...lintFile(file));
  }

  if (allErrors.length > 0) {
    console.error("❌ Benchmark MDX lint failed:\n");
    for (const err of allErrors) console.error(`  • ${err}`);
    process.exit(1);
  }

  console.log(`✅ Benchmark MDX lint passed (${files.length} files)`);
}

main();

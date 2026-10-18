#!/usr/bin/env bun
/**
 * @file scripts/merge-coverage.ts
 * @description Union the unit (SSR) and component (client/jsdom) coverage reports.
 *
 * The two Vitest configs transform the same source with different builds, so
 * their Istanbul statement maps are not compatible. Merging statement-by-statement
 * would double-count and corrupt percentages. This script therefore unions at the
 * FILE level: a file covered by the unit run keeps that report (SSR is the more
 * complete path for server modules); files only reachable from the client DOM
 * build are added from the component report.
 *
 * Usage:
 *   bun run test:coverage        # unit → .vitest/coverage/coverage-final.json
 *   bun run test:coverage:dom    # components → .vitest/coverage-dom/coverage-final.json
 *   bun run coverage:merge       # prints and writes the union summary
 *
 * Output: .vitest/coverage-merged/coverage-summary.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type FileCoverage = {
  path?: string;
  statementMap?: Record<string, { start?: { line?: number } }>;
  s?: Record<string, number>;
  f?: Record<string, number>;
  b?: Record<string, number[]>;
};

type Totals = { total: number; covered: number };

const ROOT = join(import.meta.dirname, "..");
const UNIT = join(ROOT, ".vitest", "coverage", "coverage-final.json");
const DOM = join(ROOT, ".vitest", "coverage-dom", "coverage-final.json");
const OUT_DIR = join(ROOT, ".vitest", "coverage-merged");

function load(path: string): Record<string, FileCoverage> {
  if (!existsSync(path)) {
    throw new Error(
      `Missing coverage report: ${path}\n` +
        `Run the matching suite first (unit: bun run test:coverage, dom: bun run test:coverage:dom).`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, FileCoverage>;
}

const norm = (p: string) => p.replace(/\\/g, "/");
const rel = (p: string) => {
  const n = norm(p);
  const idx = n.indexOf("src/");
  return idx >= 0 ? n.slice(idx) : n;
};

function metricsFor(file: FileCoverage) {
  const statements = Object.values(file.s ?? {});
  const functions = Object.values(file.f ?? {});
  const branches = Object.values(file.b ?? {}).flat();

  const lineHits = new Map<number, boolean>();
  for (const [id, stmt] of Object.entries(file.statementMap ?? {})) {
    const line = stmt.start?.line;
    if (line === undefined) continue;
    const hit = (file.s?.[id] ?? 0) > 0;
    lineHits.set(line, (lineHits.get(line) ?? false) || hit);
  }
  const lines = [...lineHits.values()];

  const count = (values: Array<number | boolean>): Totals => ({
    total: values.length,
    covered: values.filter((v) => (typeof v === "boolean" ? v : v > 0)).length,
  });

  return {
    statements: count(statements),
    functions: count(functions),
    branches: count(branches),
    lines: count(lines),
  };
}

const add = (a: Totals, b: Totals) => ({
  total: a.total + b.total,
  covered: a.covered + b.covered,
});

const unit = load(UNIT);
const dom = load(DOM);

const unitByFile = new Map<string, FileCoverage>();
for (const [path, file] of Object.entries(unit)) unitByFile.set(rel(path), file);
const domByFile = new Map<string, FileCoverage>();
for (const [path, file] of Object.entries(dom)) domByFile.set(rel(path), file);

const union = new Map<string, FileCoverage>();
const source = new Map<string, "unit" | "dom">();
const keys = new Set([...unitByFile.keys(), ...domByFile.keys()]);
let domPreferred = 0;

for (const key of keys) {
  const u = unitByFile.get(key);
  const d = domByFile.get(key);
  if (!u) {
    union.set(key, d!);
    source.set(key, "dom");
    domPreferred += 1;
    continue;
  }
  if (!d) {
    union.set(key, u);
    source.set(key, "unit");
    continue;
  }
  // Best-of-both per FILE: the two reports transform the source differently, so
  // statement IDs cannot be merged. Pick the measurement with more covered lines
  // (ties → SSR unit, the authoritative server path). Never add the two.
  const uLines = metricsFor(u).lines;
  const dLines = metricsFor(d).lines;
  const useDom =
    dLines.covered / Math.max(1, dLines.total) > uLines.covered / Math.max(1, uLines.total);
  union.set(key, useDom ? d : u);
  source.set(key, useDom ? "dom" : "unit");
  if (useDom) domPreferred += 1;
}

const totals = {
  statements: { total: 0, covered: 0 },
  functions: { total: 0, covered: 0 },
  branches: { total: 0, covered: 0 },
  lines: { total: 0, covered: 0 },
};
const byArea = new Map<string, { files: number; statements: Totals; lines: Totals }>();

for (const [path, file] of union) {
  const m = metricsFor(file);
  for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
    totals[key] = add(totals[key], m[key]);
  }
  const parts = path.split("/");
  const area = parts.length > 2 ? `${parts[0]}/${parts[1]}` : path;
  const row = byArea.get(area) ?? {
    files: 0,
    statements: { total: 0, covered: 0 },
    lines: { total: 0, covered: 0 },
  };
  row.files += 1;
  row.statements = add(row.statements, m.statements);
  row.lines = add(row.lines, m.lines);
  byArea.set(area, row);
}

const pct = (t: Totals) => (t.total === 0 ? "0.0" : ((t.covered / t.total) * 100).toFixed(2));

console.log("\n== Merged coverage (unit ∪ component DOM, best measurement per file) ==");
console.log(`Files: ${union.size} (${domPreferred} measured better by the DOM report)`);
console.log(
  `Lines ${pct(totals.lines)}% · Statements ${pct(totals.statements)}% · ` +
    `Functions ${pct(totals.functions)}% · Branches ${pct(totals.branches)}%`,
);
console.log("\nBy area (lines):");
for (const [area, row] of [...byArea.entries()].sort(
  (a, b) => b[1].lines.total - a[1].lines.total,
)) {
  console.log(
    `${pct(row.lines).padStart(6)}%  ${String(row.lines.total).padStart(6)} lines  ` +
      `${String(row.files).padStart(4)} files  ${area}`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
const summary = {
  generatedAt: new Date().toISOString(),
  mode: "best-of-both-per-file",
  files: union.size,
  domPreferredFiles: domPreferred,
  totals: Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, { ...value, pct: Number(pct(value)) }]),
  ),
  byArea: Object.fromEntries(
    [...byArea.entries()].map(([area, row]) => [
      area,
      { files: row.files, statements: row.statements, lines: row.lines },
    ]),
  ),
};
writeFileSync(join(OUT_DIR, "coverage-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nWrote ${norm(join(OUT_DIR, "coverage-summary.json"))}`);

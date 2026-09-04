import fs from "node:fs";

const base = JSON.parse(fs.readFileSync("tests/benchmarks/results/base-cold-warm.json", "utf-8"));
const enhanced = JSON.parse(
  fs.readFileSync("tests/benchmarks/results/enhanced-cold-warm.json", "utf-8"),
);

interface ComparisonRow {
  testIndex: number;
  testFile: string;
  metricName: string;
  baseCold: number | null;
  enhancedCold: number | null;
  coldDeltaPct: string;
  baseWarm: number | null;
  enhancedWarm: number | null;
  warmDeltaPct: string;
  enhancedRps: number | null;
  changeNote: string;
}

const rows: ComparisonRow[] = [];
let index = 1;

const allFiles = Array.from(new Set([...Object.keys(base), ...Object.keys(enhanced)]));

for (const file of allFiles) {
  const baseMetrics: any[] = base[file] || [];
  const enhMetrics: any[] = enhanced[file] || [];

  const map = new Map<string, { base?: any; enh?: any }>();
  for (const m of baseMetrics) {
    map.set(m.testName, { base: m });
  }
  for (const m of enhMetrics) {
    if (!map.has(m.testName)) {
      map.set(m.testName, { enh: m });
    } else {
      map.get(m.testName)!.enh = m;
    }
  }

  for (const [name, data] of map.entries()) {
    const b = data.base;
    const e = data.enh;

    const baseCold = b?.coldFirstMs ?? null;
    const enhCold = e?.coldFirstMs ?? null;
    let coldDelta = "-";
    if (baseCold && enhCold) {
      const diff = ((enhCold - baseCold) / baseCold) * 100;
      coldDelta = `${diff <= 0 ? "" : "+"}${diff.toFixed(1)}%`;
      if (diff <= -20) coldDelta = `🚀 **${coldDelta}**`;
    }

    const baseWarm = b?.warmAvgMs ?? null;
    const enhWarm = e?.warmAvgMs ?? null;
    let warmDelta = "-";
    if (baseWarm && enhWarm) {
      const diff = ((enhWarm - baseWarm) / baseWarm) * 100;
      warmDelta = `${diff <= 0 ? "" : "+"}${diff.toFixed(1)}%`;
      if (diff <= -15) warmDelta = `⚡ **${warmDelta}**`;
    }

    let note = "Pre-warmed LRU & Native Fast-Path";
    if (file.includes("migration")) note = "UUID-compliant DDL + zero-alloc UUIDs";
    else if (file.includes("seo")) note = "Pre-warmed 404 & Redirect L1 LRU";
    else if (file.includes("schema")) note = "Boot-time Schema LRU Pre-warming";
    else if (file.includes("rest")) note = "Sync Schema Peek + In-Memory Pipeline";
    else if (file.includes("graphql")) note = "Cached AST & Relational Join Plans";
    else if (file.includes("etag")) note = "Zero-Copy Native Fast-Hash";
    else if (file.includes("websocket")) note = "Pre-warmed SyncStep & Dual-Client WS";
    else if (file.includes("dev-dependency")) note = "Extended timeout & parallel toolchain";

    rows.push({
      testIndex: index,
      testFile: file,
      metricName: name,
      baseCold,
      enhancedCold: enhCold,
      coldDeltaPct: coldDelta,
      baseWarm,
      enhancedWarm: enhWarm,
      warmDeltaPct: warmDelta,
      enhancedRps: e?.warmRps ?? null,
      changeNote: note,
    });
  }
  index++;
}

let md = `# SveltyCMS 56-Benchmark Comprehensive Comparison (Base vs Enhanced)\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;
md += `| # | Test Suite File | Metric / Test Name | Base Cold | Enhanced Cold | Cold Δ | Base Warm | Enhanced Warm | Warm Δ | Enhanced RPS | Optimization / Change |\n`;
md += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

for (const r of rows) {
  const bc = r.baseCold !== null ? `${r.baseCold.toFixed(2)}ms` : "-";
  const ec = r.enhancedCold !== null ? `${r.enhancedCold.toFixed(2)}ms` : "-";
  const bw = r.baseWarm !== null ? `${r.baseWarm.toFixed(3)}ms` : "-";
  const ew = r.enhancedWarm !== null ? `${r.enhancedWarm.toFixed(3)}ms` : "-";
  const rps = r.enhancedRps !== null ? `${r.enhancedRps.toLocaleString()}` : "-";

  md += `| ${r.testIndex} | \`${r.testFile}\` | **${r.metricName}** | ${bc} | ${ec} | ${r.coldDeltaPct} | ${bw} | ${ew} | ${r.warmDeltaPct} | ${rps} | ${r.changeNote} |\n`;
}

fs.writeFileSync("tests/benchmarks/results/comprehensive-56-comparison.md", md);
console.log(`Generated comparison with ${rows.length} metrics across 56 test files.`);

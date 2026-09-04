import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("tests/benchmarks/results/base-cold-warm.json", "utf-8"));
const files = Object.keys(data);
console.log(`Total test files recorded: ${files.length}`);

let totalMetrics = 0;
const coldTransients: { file: string; name: string; cold: number; warm: number; ratio: number }[] =
  [];
const warmOpportunities: { file: string; name: string; warm: number; p95: number; rps: number }[] =
  [];

for (const [file, metrics] of Object.entries(data)) {
  for (const m of metrics as any[]) {
    totalMetrics++;
    if (m.coldFirstMs && m.warmAvgMs && m.coldFirstMs > 5) {
      coldTransients.push({
        file,
        name: m.testName,
        cold: m.coldFirstMs,
        warm: m.warmAvgMs,
        ratio: m.coldFirstMs / m.warmAvgMs,
      });
    }
    if (m.warmAvgMs && m.warmAvgMs > 2) {
      warmOpportunities.push({
        file,
        name: m.testName,
        warm: m.warmAvgMs,
        p95: m.warmP95Ms || 0,
        rps: m.warmRps || 0,
      });
    }
  }
}

console.log(`Total metrics recorded: ${totalMetrics}`);

console.log("\n🔥 Top Cold Start Transients (Cold vs Warm Ratio):");
coldTransients
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 15)
  .forEach((c) => {
    console.log(
      `  [${c.file}] ${c.name}: Cold ${c.cold.toFixed(2)}ms vs Warm ${c.warm.toFixed(3)}ms (${c.ratio.toFixed(1)}x)`,
    );
  });

console.log("\n⚡ Top Warm Latencies (> 2ms):");
warmOpportunities
  .sort((a, b) => b.warm - a.warm)
  .slice(0, 15)
  .forEach((w) => {
    console.log(
      `  [${w.file}] ${w.name}: Warm ${w.warm.toFixed(3)}ms (p95: ${w.p95.toFixed(2)}ms, ${w.rps} RPS)`,
    );
  });

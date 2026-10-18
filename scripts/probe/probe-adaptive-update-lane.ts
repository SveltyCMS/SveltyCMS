/**
 * @file scripts/probe/probe-adaptive-update-lane.ts
 * @description Local micro-benchmark for the adaptive UPDATE coalescing lane.
 *
 * Measures an idle single update (no DB): coalesced (scheduler hop) vs
 * adaptive (immediate). Results are local wall-clock p50/p95 in microseconds.
 *
 * Run: bun run scripts/probe/probe-adaptive-update-lane.ts
 */
import { NetworkDbQueueGate } from "@src/databases/core/network-db-queue-gate";

const ITERATIONS = 5000;
const WARMUP = 500;

async function measure(label: string, gate: NetworkDbQueueGate): Promise<void> {
  const run = () => gate.coalesceWrite(async () => 1, "update");

  for (let i = 0; i < WARMUP; i++) await run();

  const samples = Array.from({ length: ITERATIONS }, () => 0);
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await run();
    samples[i] = (performance.now() - t0) * 1000;
  }
  samples.sort((a, b) => a - b);
  const pick = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  console.log(
    `${label}: p50=${pick(0.5).toFixed(1)}µs p95=${pick(0.95).toFixed(1)}µs max=${samples[samples.length - 1].toFixed(1)}µs`,
  );
}

async function main() {
  process.env.SVELTY_WRITE_COALESCING = "1";
  delete process.env.SVELTY_WRITE_COALESCE_UPDATE;
  const coalescedGate = new NetworkDbQueueGate({
    maxConcurrency: 4,
    name: "ProbeCoalesced",
    enableWriteCoalescing: true,
  });

  process.env.SVELTY_WRITE_COALESCE_UPDATE = "1";
  const adaptiveGate = new NetworkDbQueueGate({
    maxConcurrency: 4,
    name: "ProbeAdaptive",
    enableWriteCoalescing: true,
  });

  await measure("coalesced (SVELTY_WRITE_COALESCING=1)", coalescedGate);
  await measure("adaptive  (SVELTY_WRITE_COALESCE_UPDATE=1)", adaptiveGate);

  console.log("metrics (adaptive):", JSON.stringify(adaptiveGate.getMetrics().adaptiveUpdates));
  console.log("metrics (coalesced):", JSON.stringify(coalescedGate.getMetrics().adaptiveUpdates));
}

await main();

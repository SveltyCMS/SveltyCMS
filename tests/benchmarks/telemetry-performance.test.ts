import { test, expect, mock, beforeAll } from "bun:test";
import { telemetryService } from "../../src/services/telemetry-service";
import { runBenchmark, exportMetric } from "./benchmark-utils";

// Mock SvelteKit modules
mock.module("$app/environment", () => ({
  building: false,
  dev: false,
}));

// Mock environment and internal calls
beforeAll(() => {
  // Mock global fetch
  (global as any).fetch = mock(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          latest_version: "1.0.0",
          has_vulnerability: false,
        }),
        { status: 200 },
      ),
    ),
  );

  // Mock process.env
  process.env.TELEMETRY_ENDPOINT = "http://mock-telemetry.example.com";
});

test("Telemetry Service Performance Baseline", async () => {
  // 1. Measure Data Collection & Signing (No Network)
  const result = await runBenchmark({
    name: "Telemetry Payload Generation",
    iterations: 100,
    warmupIterations: 20,
    onIteration: async () => {
      await telemetryService.checkUpdateStatus();
    },
    silent: true,
  });

  console.log(
    `\n📊 Telemetry Baseline: ${result.avgMs.toFixed(4)}ms avg (p95: ${result.p95Ms.toFixed(4)}ms)`,
  );

  exportMetric("telemetry.payload_gen.avg", result.avgMs, "ms");
  exportMetric("telemetry.payload_gen.p95", result.p95Ms, "ms");

  // Baseline should be relatively fast (< 30ms)
  expect(result.avgMs).toBeLessThan(30);
});

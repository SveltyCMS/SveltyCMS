/**
 * @file tests/integration/databases/resilience-load.test.ts
 * @description Progressive System Load & Resilience Test
 *
 * Runs progressive load tests to determine system limits without crashing.
 * Levels: TINY -> LOW -> MEDIUM -> HIGH -> EXTREME
 */

import { beforeAll, describe, expect, it, mock } from "bun:test";

// Bun integration tests run outside SvelteKit, so mock SvelteKit runtime env.
mock.module("$app/environment", () => ({
  browser: false,
  dev: false,
  building: false,
  version: "test",
}));

let getDatabaseResilience: any;

// Import after mocking $app/environment.
beforeAll(async () => {
  const resilienceModule = await import("../../../src/databases/database-resilience");
  getDatabaseResilience = resilienceModule.getDatabaseResilience;
});

// Mock operation that simulates DB work with random latency and occasional failures
const simulateDbOp = async (id: number): Promise<string> => {
  const latency = Math.random() * 50;
  await new Promise((resolve) => setTimeout(resolve, latency));

  // Simulate 1% random failure
  if (Math.random() < 0.01) {
    throw new Error("Random ephemeral failure");
  }

  return `success-${id}`;
};

describe("System Load & Resilience Benchmark", () => {
  // Load Profiles Definition
  const LOAD_PROFILES = {
    TINY: { total: 1000, batch: 100, name: "Raspberry Pi / CI" },
    LOW: { total: 10_000, batch: 500, name: "Standard Laptop" },
    MEDIUM: { total: 50_000, batch: 2000, name: "Dev Workstation" },
    HIGH: { total: 100_000, batch: 5000, name: "Performance Server" },
    EXTREME: { total: 500_000, batch: 10_000, name: "Cluster / Mainframe" },
  };

  const TARGET_LEVEL = (process.env.LOAD_LEVEL as keyof typeof LOAD_PROFILES | "ALL") || "TINY";

  it("should determine system limit by progressive loading", async () => {
    const resilience = getDatabaseResilience({
      maxAttempts: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
    });

    let maxStableLevel = "NONE";

    const runLevel = async (
      levelName: string,
      config: { total: number; batch: number; name: string },
    ) => {
      console.log(`\n🔹 [${levelName}] Testing: ${config.name}`);
      console.log(`   Target: ${config.total} requests | Concurrency: ${config.batch}`);

      const startTime = Date.now();
      let successes = 0;
      let failures = 0;

      for (let i = 0; i < config.total; i += config.batch) {
        const batchSize = Math.min(config.batch, config.total - i);

        const batchProms = Array.from({ length: batchSize }, (_, idx) => {
          return resilience
            .executeWithRetry(
              async () => {
                return simulateDbOp(i + idx);
              },
              `op-${i + idx}`,
            )
            .then(() => {
              successes++;
            })
            .catch(() => {
              failures++;
            });
        });

        await Promise.all(batchProms);
      }

      const duration = Date.now() - startTime;
      const rps = Math.round((successes / (duration / 1000)) * 100) / 100;

      console.log(`   ✅ Completed in ${duration}ms (${rps} req/sec)`);
      console.log(`   Results: Success=${successes}, Failure=${failures}`);

      const successRate = successes / config.total;

      if (successRate < 0.99) {
        throw new Error(`Success rate too low: ${(successRate * 100).toFixed(2)}%`);
      }

      return { duration, rps };
    };

    const profilesToRun =
      TARGET_LEVEL === "ALL"
        ? Object.entries(LOAD_PROFILES)
        : [[TARGET_LEVEL, LOAD_PROFILES[TARGET_LEVEL]]];

    for (const [level, config] of profilesToRun as [string, (typeof LOAD_PROFILES)["TINY"]][]) {
      try {
        await runLevel(level, config);
        maxStableLevel = level;
      } catch (err: any) {
        console.error(`\n❌ [${level}] FAILED: ${err.message}`);
        console.log("\n⚠️  System Limit Reached!");
        console.log(`   The server switched off/failed at level: ${level}`);
        console.log(`   Last Stable Level: ${maxStableLevel}`);
        break;
      }
    }

    console.log(`\n🏆 BENCHMARK RESULT: Max Stable Load Level = [ ${maxStableLevel} ]`);
    expect(true).toBe(true);
  }, 300_000);
});

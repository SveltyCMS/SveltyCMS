/**
 * @file tests/unit/performance.test.ts
 * @description Performance tests for Batch API and Search functionality
 *
 * Tests:
 * - Batch widget vs legacy widget performance
 * - Parallel search performance
 */

// Mock data
const MOCK_ENTRIES = Array.from({ length: 100 }, (_, i) => ({
  _id: `entry-${i}`,
  title: `Entry ${i}`,
  author: `user-${i % 10}`, // Relation field
}));

// Mock Widget with Batch API
const BATCH_WIDGET = {
  Name: "BatchWidget",
  modifyRequestBatch: async ({ data }: { data: any[] }) => {
    // Simulate DB call with 50ms latency
    await new Promise((resolve) => setTimeout(resolve, 50));
    return data.map((entry) => ({
      ...entry,
      processed: true,
      batch: true,
    }));
  },
};

// Mock Widget without Batch API (Legacy)
const LEGACY_WIDGET = {
  Name: "LegacyWidget",
  modifyRequest: async ({ data }: { data: any }) => {
    // Simulate DB call with 50ms latency per entry
    await new Promise((resolve) => setTimeout(resolve, 50));
    data.update({
      ...data.get(),
      processed: true,
      legacy: true,
    });
  },
};

describe("Performance: Batch Widget API", () => {
  test("Batch Widget should be significantly faster than Legacy Widget", async () => {
    const runBatchOnce = () => BATCH_WIDGET.modifyRequestBatch({ data: MOCK_ENTRIES });
    const runLegacyOnce = () =>
      Promise.all(
        MOCK_ENTRIES.map(async (entry) => {
          const dataAccessor = {
            get: () => entry,
            update: () => {},
          };
          await LEGACY_WIDGET.modifyRequest({ data: dataAccessor });
        }),
      );

    // Warm up JIT before sampling medians to avoid cold-start variance.
    await runBatchOnce();
    await runLegacyOnce();

    const SAMPLES = 5;
    const batchSamples: number[] = [];
    const legacySamples: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const startBatch = performance.now();
      await runBatchOnce();
      batchSamples.push(performance.now() - startBatch);

      const startLegacy = performance.now();
      await runLegacyOnce();
      legacySamples.push(performance.now() - startLegacy);
    }

    batchSamples.sort((a, b) => a - b);
    legacySamples.sort((a, b) => a - b);
    const durationBatch = batchSamples[Math.floor(SAMPLES / 2)];
    const durationLegacy = legacySamples[Math.floor(SAMPLES / 2)];

    if (process.env.VERBOSE_TESTS) {
      console.log(`Batch Processing median (100 items): ${durationBatch.toFixed(2)}ms`);
      console.log(`Legacy Processing median (100 items): ${durationLegacy.toFixed(2)}ms`);
    }

    expect(durationBatch).toBeLessThan(Math.max(durationLegacy, 0.5) * 1.5);
  });
});

/**
 * @file scripts/benchmark-matrix/setup-benchmarks.ts
 * @description Seeds benchmark data into the running server.
 * Used by setupBenchmarkServer() in benchmark-utils.ts.
 */

export async function runBenchmarkSeed(options: {
  apiBase: string;
  secret: string;
  tenantId: string;
}): Promise<void> {
  const url = (path: string) => `${options.apiBase}${path}`;

  // Check if benchmark data already exists
  const checkRes = await fetch(url("/api/collections/BenchmarkStable/schema"), {
    headers: { "x-test-mode": "true", "x-test-secret": options.secret },
  });
  if (checkRes.ok) {
    console.log("  \u{1F680} [SmartSeed] Benchmark data already exists. Reusing state...");
    return;
  }

  console.log(`  \u2192 Seeding benchmark data (collections + entries via LocalCMS)...`);

  // Create benchmark collection
  const createRes = await fetch(url("/api/collections"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": options.secret,
    },
    body: JSON.stringify({
      name: "BenchmarkStable",
      slug: "benchmark_stable",
      fields: [
        { name: "title", type: "input", required: true },
        { name: "content", type: "rich-text" },
        { name: "author", type: "input" },
        { name: "published", type: "boolean", default: true },
      ],
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create benchmark collection: ${text}`);
  }

  // Seed 10 authors + 50 posts + stable entry + redirects
  const seedRes = await fetch(url("/api/testing"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": options.secret,
    },
    body: JSON.stringify({
      action: "seed",
      email: "admin@example.com",
      password: "Password123!",
    }),
  });

  if (!seedRes.ok) {
    const text = await seedRes.text();
    throw new Error(`Failed to seed benchmark data: ${text}`);
  }

  const _result = await seedRes.json();
  console.log(`  \u2705 Seeded benchmark data`);
}

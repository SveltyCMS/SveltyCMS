#!/usr/bin/env bun
/**
 * @file scripts/benchmark-matrix/setup-benchmarks.ts
 * @description Seeds benchmark entry data via real HTTP API endpoints.
 * Collections are created by the setup wizard (seed.ts seedPresetCollections).
 * This script only populates entry data — zero backdoors, zero @src imports.
 */

export const AUTHOR_COUNT = Number(process.env.AUTHOR_COUNT ?? 10);
export const POSTS_PER_AUTHOR = Number(process.env.POSTS_PER_AUTHOR ?? 5);
export const TENANT_ID = process.env.TENANT_ID || "default";

const API_BASE = process.env.API_BASE_URL!;
const SECRET = process.env.TEST_API_SECRET!;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[\x1b[90m${ts}\x1b[0m] ${msg}`);
}

function headers(extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    "x-test-secret": SECRET,
    "x-tenant-id": TENANT_ID,
    ...extra,
  };
}

async function notifyServer() {
  log(`   → Notifying server at ${API_BASE}...`);
  try {
    const res = await fetch(`${API_BASE}/api/content/refresh`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ method: "refresh", tenantId: TENANT_ID }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) log("   → Server refresh successful.");
    else log(`   → Server refresh failed: ${res.status}`);
  } catch (err: any) {
    const gqlRes = await fetch(`${API_BASE}/api/graphql`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
      signal: AbortSignal.timeout(30000),
    });
    if (gqlRes.ok) log("   -> GraphQL schema refresh successful.");
    else log(`   -> GraphQL schema refresh failed: ${gqlRes.status}`);
    log(`   → Server refresh notification error: ${err.message}`);
  }
}

async function createCollection(schema: any): Promise<void> {
  const res = await fetch(`${API_BASE}/api/testing`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ action: "create-collection", schema }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Collection create failed: ${res.status}`);
}

async function waitForServer(maxRetries = 8): Promise<void> {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        headers: headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        // Server is up — 401/403 are fine, it means auth is responding
        return;
      }
    } catch {
      // Not ready yet
    }
    const wait = Math.min(1000 * 2 ** i, 8000);
    log(`   ⏳ Server not ready, retrying in ${wait}ms (attempt ${i + 1}/${maxRetries})...`);
    await delay(wait);
  }
  throw new Error(`Server at ${API_BASE} not reachable after ${maxRetries} attempts`);
}

async function smartCheck(): Promise<boolean> {
  try {
    const sig = () => AbortSignal.timeout(15000);
    const [checkAuthor, checkStable, checkRedirect] = await Promise.all([
      fetch(`${API_BASE}/api/collections/benchmark_authors/author-1`, {
        headers: headers(),
        signal: sig(),
      }),
      fetch(`${API_BASE}/api/collections/BenchmarkStable/bench-shared-001`, {
        headers: headers(),
        signal: sig(),
      }),
      fetch(`${API_BASE}/api/collections/redirects/bench-redirect-1`, {
        headers: headers(),
        signal: sig(),
      }),
    ]);

    if (checkAuthor.ok && checkStable.ok && checkRedirect.ok) {
      const authorJson = await checkAuthor.json().catch(() => ({}));
      const stableJson = await checkStable.json().catch(() => ({}));
      const redirectJson = await checkRedirect.json().catch(() => ({}));

      return (
        authorJson.success &&
        authorJson.data?._id === "author-1" &&
        stableJson.success &&
        stableJson.data?._id === "bench-shared-001" &&
        redirectJson.success &&
        redirectJson.data?._id === "bench-redirect-1"
      );
    }
  } catch (e: any) {
    log(`   ⚠️ SmartSeed check error: ${e.message}`);
  }
  return false;
}

async function main(): Promise<void> {
  try {
    if (!API_BASE || !SECRET) {
      log("❌ API_BASE_URL and TEST_API_SECRET required. Run via setupBenchmarkServer().");
      process.exit(1);
    }

    log(`🚀 Benchmark data seeding via HTTP: ${API_BASE}`);

    // Wait for the server to be fully up before any requests
    await waitForServer();

    // Smart check: skip seeding if data already exists
    if (await smartCheck()) {
      log("🚀 [SmartSeed] Benchmark data already exists. Reusing state...");
      await notifyServer();
      process.exit(0);
    }

    // Create benchmark collections first (needed on relational DBs where
    // preset collections may not include benchmark-specific schemas)
    log("   → Creating benchmark collections...");
    await createCollection({
      _id: "benchmark_authors",
      name: "benchmark_authors",
      fields: [
        {
          db_fieldName: "_id",
          label: "ID",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "name",
          label: "Name",
          widget: { Name: "Input" },
          type: "string",
        },
      ],
    });
    await createCollection({
      _id: "benchmark_posts",
      name: "benchmark_posts",
      fields: [
        {
          db_fieldName: "_id",
          label: "ID",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "title",
          label: "Title",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "author",
          label: "Author",
          widget: { Name: "Relation" },
          type: "string",
          relation: "benchmark_authors",
        },
      ],
    });
    await createCollection({
      _id: "BenchmarkStable",
      name: "BenchmarkStable",
      fields: [
        {
          db_fieldName: "_id",
          label: "ID",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "title",
          label: "Title",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "content",
          label: "Content",
          widget: { Name: "RichText" },
          type: "string",
        },
        {
          db_fieldName: "count",
          label: "Count",
          widget: { Name: "Input" },
          type: "number",
        },
      ],
    });
    await createCollection({
      _id: "redirects",
      name: "redirects",
      fields: [
        {
          db_fieldName: "_id",
          label: "ID",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "source",
          label: "Source",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "target",
          label: "Target",
          widget: { Name: "Input" },
          type: "string",
        },
        {
          db_fieldName: "type",
          label: "Type",
          widget: { Name: "Input" },
          type: "number",
        },
      ],
    });
    log("   → Benchmark collections created.");

    // Seed authors (real API)
    log("   → Seeding authors...");
    const authors = Array.from({ length: AUTHOR_COUNT }, (_, i) => ({
      _id: `author-${i + 1}`,
      name: `Author ${i + 1}`,
      tenantId: TENANT_ID,
    }));
    const authorsRes = await fetch(`${API_BASE}/api/collections/benchmark_authors/bulk`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(authors),
    });
    if (!authorsRes.ok) {
      throw new Error(`Authors seed failed: ${authorsRes.status}`);
    }

    // Seed posts (real API)
    log("   → Seeding posts...");
    const posts = authors.flatMap((author, ai) =>
      Array.from({ length: POSTS_PER_AUTHOR }, (_, pi) => ({
        title: `Post ${pi + 1} by Author ${ai + 1}`,
        author: author._id,
        tenantId: TENANT_ID,
      })),
    );
    const postsRes = await fetch(`${API_BASE}/api/collections/benchmark_posts/bulk`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(posts),
    });
    if (!postsRes.ok) {
      throw new Error(`Posts seed failed: ${postsRes.status}`);
    }

    // Seed stable entry (real API)
    log("   → Seeding stable entry...");
    const stableEntry = {
      _id: "bench-shared-001",
      title: "Stable Benchmark Entry",
      content: "This is a stable entry for REST and API performance testing.",
      count: 1,
      tenantId: TENANT_ID,
    };
    const stableRes = await fetch(`${API_BASE}/api/collections/BenchmarkStable`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(stableEntry),
    });
    if (!stableRes.ok) {
      throw new Error(`Stable entry seed failed: ${stableRes.status}`);
    }

    // Seed redirects (real API)
    log("   → Seeding redirects...");
    const redirects = [
      {
        _id: "bench-redirect-1",
        source: "/old-path-1",
        target: "/new-path-1",
        type: 301,
        tenantId: TENANT_ID,
      },
      {
        _id: "bench-redirect-2",
        source: "/old-path-2",
        target: "/new-path-2",
        type: 301,
        tenantId: TENANT_ID,
      },
    ];
    const redirectsRes = await fetch(`${API_BASE}/api/collections/redirects/bulk`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(redirects),
    });
    if (!redirectsRes.ok) {
      throw new Error(`Redirects seed failed: ${redirectsRes.status}`);
    }

    await notifyServer();

    log(`✅ Seeded ${authors.length} authors + ${posts.length} posts + stable entry + 2 redirects`);
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Benchmark setup failed:", err.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}

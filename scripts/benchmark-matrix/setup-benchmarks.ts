#!/usr/bin/env bun
/**
 * @file scripts/benchmark-matrix/setup-benchmarks.ts
 * @description Sets up relational collections (Authors + Posts) and seeds benchmark data.
 * Optimized for repeatable, clean benchmark runs in SveltyCMS.
 */
import { plugin } from "bun";

// 🚀 SvelteKit Mocking Engine (Must be registered BEFORE any other imports)
plugin({
  name: "svelte-kit-mock",
  setup(build) {
    // 1. Mock $app/ modules
    build.onResolve({ filter: /^\$app\// }, (args) => {
      return { path: args.path, external: false, namespace: "svelte-kit-mock" };
    });

    // 2. Mock @sveltejs/kit
    build.onResolve({ filter: /^@sveltejs\/kit$/ }, (args) => {
      return { path: args.path, external: false, namespace: "svelte-kit-mock" };
    });

    build.onLoad({ filter: /.*/, namespace: "svelte-kit-mock" }, (args) => {
      if (args.path === "@sveltejs/kit") {
        return {
          contents: `
            export const error = (status, message) => {
              const err = new Error(typeof message === 'object' ? message.message : message);
              err.status = status;
              return err;
            };
            export const json = (data, options) => {
              return new Response(JSON.stringify(data), {
                status: options?.status || 200,
                headers: { 'Content-Type': 'application/json', ...options?.headers }
              });
            };
            export const redirect = (status, location) => {
              const err = new Error('Redirect');
              err.status = status;
              err.location = location;
              return err;
            };
          `,
          loader: "js",
        };
      }

      // Default mock for $app/ environment and navigation
      return {
        contents: `
          export const browser = false;
          export const dev = false;
          export const building = false;
          export const version = '1.0.0';
          export const goto = () => Promise.resolve();
          export const invalidate = () => Promise.resolve();
          export const invalidateAll = () => Promise.resolve();
          export const preloadData = () => Promise.resolve();
          export const preloadCode = () => Promise.resolve();
          export const beforeNavigate = () => {};
          export const afterNavigate = () => {};
          export const pushState = () => {};
          export const replaceState = () => {};
        `,
        loader: "js",
      };
    });
  },
});

import { contentSystem } from "@src/content/index.server";
import { getDefaultRoles } from "@src/databases/auth/default-roles";

import { LocalCMS } from "@src/services/sdk";

export const AUTHOR_COUNT = Number(process.env.AUTHOR_COUNT ?? 10);
export const POSTS_PER_AUTHOR = Number(process.env.POSTS_PER_AUTHOR ?? 5);
export const TENANT_ID = process.env.TENANT_ID || "default";

const COLLECTIONS = {
  AUTHORS: {
    _id: "benchmark_authors",
    name: "benchmark_authors",
    icon: "mdi:account-details",
    fields: [
      {
        label: "Name",
        db_fieldName: "name",
        widget: { Name: "Input" },
        required: true,
      },
      { label: "Bio", db_fieldName: "bio", widget: { Name: "Input" } },
    ],
  },
  POSTS: {
    _id: "benchmark_posts",
    name: "benchmark_posts",
    icon: "mdi:post",
    fields: [
      { label: "Title", db_fieldName: "title", widget: { Name: "Input" } },
      {
        label: "Author",
        db_fieldName: "author",
        widget: { Name: "Relation" },
        collection: "benchmark_authors",
        multiple: false,
      },
    ],
  },
  STABLE: {
    _id: "BenchmarkStable",
    name: "BenchmarkStable",
    icon: "mdi:database-check",
    fields: [
      {
        label: "Title",
        db_fieldName: "title",
        widget: { Name: "Input" },
        required: true,
      },
      { label: "Slug", db_fieldName: "slug", widget: { Name: "Input" } },
      {
        label: "Content",
        db_fieldName: "content",
        widget: { Name: "RichText" },
      },
      { label: "Count", db_fieldName: "count", widget: { Name: "Number" } },
      {
        label: "Author",
        db_fieldName: "author",
        widget: { Name: "Relation" },
        relation: "benchmark_authors",
      },
      {
        label: "Publish Date",
        db_fieldName: "publishDate",
        widget: { Name: "DateTime" },
      },
    ],
  },
  REDIRECTS: {
    _id: "redirects",
    name: "redirects",
    icon: "mdi:link-out",
    fields: [
      {
        label: "From",
        db_fieldName: "source",
        widget: { Name: "Input" },
        required: true,
      },
      {
        label: "To",
        db_fieldName: "target",
        widget: { Name: "Input" },
        required: true,
      },
      {
        label: "Type",
        db_fieldName: "type",
        widget: { Name: "Select" },
        required: true,
      },
      {
        label: "Tenant ID",
        db_fieldName: "tenantId",
        widget: { Name: "Text" },
        required: true,
      },
    ],
  },
  REVISIONS: {
    _id: "bench_revisions",
    name: "bench_revisions",
    icon: "mdi:history",
    fields: [
      {
        label: "Title",
        db_fieldName: "title",
        widget: { Name: "Input" },
        indexed: true,
        required: true,
      },
      {
        label: "Content",
        db_fieldName: "content",
        widget: { Name: "RichText" },
      },
    ],
  },
  ACID: {
    _id: "bench_acid",
    name: "bench_acid",
    icon: "mdi:flask-outline",
    fields: [{ label: "Title", db_fieldName: "title", widget: { Name: "Input" } }],
  },
  INDEX_PRESSURE: {
    _id: "bench_index_pressure",
    name: "bench_index_pressure",
    icon: "mdi:gauge",
    fields: [
      {
        label: "Title",
        db_fieldName: "title",
        widget: { Name: "Input" },
        indexed: true,
        required: true,
      },
      {
        label: "Category",
        db_fieldName: "category",
        widget: { Name: "Select" },
        indexed: true,
      },
      { label: "Count", db_fieldName: "count", widget: { Name: "Number" } },
    ],
  },
  MIGRATION: {
    _id: "bench_migration_large",
    name: "bench_migration_large",
    icon: "mdi:transfer",
    fields: [
      {
        label: "Title",
        db_fieldName: "title",
        widget: { Name: "Input" },
        required: true,
      },
      { label: "Data", db_fieldName: "data", widget: { Name: "JSON" } },
    ],
  },
} as const;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[\x1b[90m${ts}\x1b[0m] ${msg}`);
}
/**
 * 🏗️ SETUP COLLECTIONS: Registers all benchmark collections with the server.
 * Returns the resolved IDs for authors and posts.
 */
async function setupCollections(cms: LocalCMS) {
  const schemas = Object.values(COLLECTIONS);

  // 🚀 PREFER HTTP API: Avoid local locks if server is already running
  if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
    try {
      log(`Registering ${schemas.length} benchmark collections via HTTP API...`);
      const res = await fetch(`${process.env.API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": process.env.TEST_API_SECRET!,
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({
          action: "bulk-create-collections",
          schemas: schemas,
        }),
        signal: AbortSignal.timeout(30000), // High timeout for bulk operation
      });

      if (res.ok) {
        log("   ✅ Collections provisioned via API.");
      } else {
        const body = await res.text();
        log(`   ⚠️ API provisioning FAILED (${res.status}): ${body.substring(0, 100)}`);
        // Fall through to local fallback if API failed
      }
    } catch (e: any) {
      log(`   ⚠️ API connection failed: ${e.message}. Falling back to local SDK...`);
    }
  }

  // FALLBACK: Local SDK (Only if API not available or failed)
  // We only do this if we ARE NOT running against a background server to avoid lock contention
  if (!process.env.API_BASE_URL) {
    for (const schema of schemas) {
      try {
        await cms.db.collection.createModel(schema as any);
        if (typeof (cms.collections as any).registerSchema === "function") {
          (cms.collections as any).registerSchema(schema._id, schema, TENANT_ID as any);
        }
      } catch {
        /* ignore duplicates */
      }
    }
  }

  // 🛡️ RECONCILIATION GUARD: Poll until collections are visible via REST
  let authors: any = null;
  let posts: any = null;

  const MAX_POLL_ATTEMPTS = 20;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    let collections: any[] = [];

    // Ask the server via REST what it sees
    if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
      try {
        const res = await fetch(`${process.env.API_BASE_URL}/api/content/collections`, {
          headers: {
            "x-test-secret": process.env.TEST_API_SECRET,
            "x-tenant-id": TENANT_ID,
          },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          collections = data.success ? data.data : [];
        }
      } catch {
        /* ignore */
      }
    }

    // Fallback to local SDK if REST failed or returned nothing
    if (collections.length === 0 && cms) {
      // 🚀 FORCE REFRESH: Ensure the local content system cache is updated with DB schemas
      if (typeof cms.content?.refresh === "function") {
        await cms.content.refresh(TENANT_ID as any, false);
      }
      collections = await cms.collections.list({ tenantId: TENANT_ID as any });
    }

    const findCollection = (key: string) => {
      const search = key.toLowerCase().replace("benchmark_", "").replace("bench_", "");
      return collections.find((c: any) => {
        const name = (c.name || "").toLowerCase().replace("benchmark_", "").replace("bench_", "");
        const id = (c._id || "").toLowerCase().replace("benchmark_", "").replace("bench_", "");
        return (
          name === search || id === search || name === key.toLowerCase() || id === key.toLowerCase()
        );
      });
    };

    authors = findCollection("benchmark_authors");
    posts = findCollection("benchmark_posts");
    const acid = findCollection("bench_acid");

    if (authors && posts && acid) {
      // 🚀 PERFECT SETUP VERIFICATION: Ensure tables actually exist in the DB
      try {
        await cms.db.crud.count(authors._id || "benchmark_authors", {
          tenantId: TENANT_ID as any,
        });
        await cms.db.crud.count(posts._id || "benchmark_posts", {
          tenantId: TENANT_ID as any,
        });
        await cms.db.crud.count(acid._id || "bench_acid", {
          tenantId: TENANT_ID as any,
        });

        log(`✅ Collections reconciled on attempt ${attempt}.`);
        break;
      } catch (err: any) {
        /* Table might still be creating */
        if (process.env.BENCHMARK_DEBUG === "true") {
          log(`  ⚠ Table verification failed: ${err.message}`);
        }
      }
    }

    if (attempt === MAX_POLL_ATTEMPTS) {
      const available = collections.map((c: any) => c.name || c._id);
      throw new Error(`Reconciliation timeout. Available: ${available.join(", ")}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return { authorsCollection: authors, postsCollection: posts };
}

/**
 * 🚀 NOTIFY SERVER: Force the remote server process to re-scan collections
 */
async function notifyServer() {
  if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
    log(`   → Notifying server at ${process.env.API_BASE_URL}...`);
    try {
      // 🚀 CORRECTED ENDPOINT: Using /api/content/refresh
      const res = await fetch(`${process.env.API_BASE_URL}/api/content/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": process.env.TEST_API_SECRET,
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({ method: "refresh", tenantId: TENANT_ID }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) log("   → Server refresh successful.");
      else log(`   → Server refresh failed: ${res.status} ${res.statusText}`);
    } catch (err: any) {
      log(`   → Server refresh notification error: ${err.message}`);
    }
  }
}

async function seedData(cms: any, authorsId: string, postsId: string): Promise<void> {
  const maxRetries = 10;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const authors = Array.from({ length: AUTHOR_COUNT }, (_, i) => ({
        _id: `author-${i + 1}`,
        name: `Author ${i + 1}`,
        bio: `Bio for author ${i + 1}`,
      }));

      // 🚀 VERIFY: Ensure tables are actually ready before seeding
      const collectionIds = [authorsId, postsId, COLLECTIONS.STABLE._id, COLLECTIONS.REDIRECTS._id];
      await verifyTablesExist(cms, collectionIds, TENANT_ID);

      log(`   [SEED] Inserting ${authors.length} authors...`);
      const authorResult = await cms.collections.bulkCreate(authorsId, authors, {
        system: true,
        tenantId: TENANT_ID as any,
      });

      if (!authorResult.success) {
        throw new Error(`Failed to seed authors: ${authorResult.message}`);
      }

      const posts = authors.flatMap((author, ai) =>
        Array.from({ length: POSTS_PER_AUTHOR }, (_, pi) => ({
          title: `Post ${pi + 1} by Author ${ai + 1}`,
          author: author._id,
        })),
      );

      log(`   [SEED] Inserting ${posts.length} posts...`);
      const postResult = await cms.collections.bulkCreate(postsId, posts, {
        system: true,
        tenantId: TENANT_ID as any,
      });

      if (!postResult.success) {
        throw new Error(`Failed to seed posts: ${postResult.message}`);
      }

      // 🚀 Seed STABLE collection entry
      const stableEntry = {
        _id: "bench-shared-001",
        title: "Stable Benchmark Entry",
        content: "This is a stable entry for REST and API performance testing.",
        status: "publish",
        publishDate: new Date().toISOString(),
      };

      const stableResult = await cms.collections.create(COLLECTIONS.STABLE._id, stableEntry, {
        system: true,
        tenantId: TENANT_ID as any,
      });

      if (!stableResult.success) {
        throw new Error(`Failed to seed stable entry: ${stableResult.message}`);
      }

      // 🚀 Seed REDIRECTS collection entries
      const redirects = [
        {
          _id: "bench-redirect-1",
          source: "/old-path-1",
          target: "/new-path-1",
          type: 301,
          tenantId: "default",
        },
        {
          _id: "bench-redirect-2",
          source: "/old-path-2",
          target: "/new-path-2",
          type: 301,
          tenantId: "default",
        },
      ];

      log(`   [SEED] Inserting redirects...`);
      const redirectResult = await cms.collections.bulkCreate(
        COLLECTIONS.REDIRECTS._id,
        redirects,
        {
          system: true,
          tenantId: TENANT_ID as any,
        },
      );

      if (!redirectResult.success) {
        throw new Error(`Failed to seed redirects: ${redirectResult.message}`);
      }

      log(
        `Successfully seeded ${authors.length} authors, ${posts.length} posts, stable entry, and ${redirects.length} redirects`,
      );
      return; // Success!
    } catch (err: any) {
      if (
        err.message.includes("database is locked") ||
        err.message.includes("NOT_CONNECTED") ||
        err.message.includes("Collection model not found")
      ) {
        retryCount++;
        const delay = 1000 * retryCount;
        log(`   [RETRY] DB Busy/Reconciling (${err.message}). Waiting ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * 🚀 HARDENING: Proactive table existence verification.
 * Prevents race conditions between DDL registration and DML seeding.
 */
async function verifyTablesExist(cms: any, collectionIds: string[], tenantId: string | null) {
  for (const id of collectionIds) {
    let exists = false;
    for (let i = 0; i < 20; i++) {
      try {
        await cms.db.collection.getModel(id);
        exists = true;
        break;
      } catch {
        // Force a tiny reconciliation pulse
        if (i % 5 === 0) await cms.collections.refresh(tenantId, true);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!exists) throw new Error(`Collection model not found: ${id} (Verification Timeout)`);
  }
}

async function provisionAdmin(db: any) {
  const adminData = {
    username: "admin",
    email: "admin@example.com",
    password: "Password123!",
    role: "admin",
    isAdmin: true,
    isRegistered: true,
  };

  // Hash password manually to ensure Argon2id consistency
  const argon2 = await import("argon2");
  adminData.password = await argon2.hash(adminData.password);

  try {
    await db.auth.createUser(adminData);
    log("✅ Admin re-provisioned for clean state.");
  } catch (err) {
    log(`Warning: Admin creation failed: ${err}`);
  }
}

export async function main(): Promise<void> {
  try {
    log("Starting benchmark data setup...");

    const clearOnly = process.argv.includes("--clear-only");
    const force = process.argv.includes("--force");

    // 🚀 HYPER-ISOLATION: If API_BASE_URL is present, perform ALL setup via HTTP
    // This prevents the setup script from opening the SQLite file while the server is running.
    if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
      log(`🚀 [HyperIsolation] Using Remote API for setup: ${process.env.API_BASE_URL}`);

      // 🚀 REMOTE SMART SEEDING: Check if we already have data to avoid redundant setup
      let hasData = false;
      if (!clearOnly && !force) {
        try {
          const checkAuthor = await fetch(
            `${process.env.API_BASE_URL}/api/collections/benchmark_authors/author-1`,
            {
              headers: {
                "x-test-secret": process.env.TEST_API_SECRET!,
                "x-tenant-id": TENANT_ID,
              },
            },
          );
          const checkStable = await fetch(
            `${process.env.API_BASE_URL}/api/collections/BenchmarkStable/bench-shared-001`,
            {
              headers: {
                "x-test-secret": process.env.TEST_API_SECRET!,
                "x-tenant-id": TENANT_ID,
              },
            },
          );
          const checkRedirect = await fetch(
            `${process.env.API_BASE_URL}/api/collections/redirects/bench-redirect-1`,
            {
              headers: {
                "x-test-secret": process.env.TEST_API_SECRET!,
                "x-tenant-id": TENANT_ID,
              },
            },
          );

          if (checkAuthor.ok && checkStable.ok && checkRedirect.ok) {
            const authorJson = await checkAuthor.json().catch(() => ({}));
            const stableJson = await checkStable.json().catch(() => ({}));
            const redirectJson = await checkRedirect.json().catch(() => ({}));

            if (
              authorJson.success &&
              authorJson.data?._id === "author-1" &&
              stableJson.success &&
              stableJson.data?._id === "bench-shared-001" &&
              redirectJson.success &&
              redirectJson.data?._id === "bench-redirect-1"
            ) {
              hasData = true;
            }
          }
        } catch (e: any) {
          log(`   ⚠️ SmartSeed check error: ${e.message}`);
        }
      }

      if (hasData) {
        log("🚀 [SmartSeed] Benchmark data already exists on remote server. Reusing state...");
        await notifyServer();
        process.exit(0);
      }

      if (clearOnly || force || !hasData) {
        log("   → Triggering remote database reset...");
        const resetRes = await fetch(`${process.env.API_BASE_URL}/api/testing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": process.env.TEST_API_SECRET,
          },
          body: JSON.stringify({ action: "reset" }),
        });
        if (!resetRes.ok) {
          throw new Error(
            `Failed to reset remote database: ${resetRes.status} ${await resetRes.text()}`,
          );
        }
        // Wait for system to settle after reset
        await new Promise((r) => setTimeout(r, 2000));
      }

      // 1. Provision collections individually (resilient to old server builds)
      log("   → Provisioning 8 benchmark collections...");
      const schemas = Object.values(COLLECTIONS);
      for (const schema of schemas) {
        const res = await fetch(`${process.env.API_BASE_URL}/api/testing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": process.env.TEST_API_SECRET!,
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify({
            action: "create-collection",
            schema,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) log(`      ✅ ${schema._id}`);
        else {
          log(`      ❌ ${schema._id} (${res.status})`);
          throw new Error(
            `Collection provisioning failed for ${schema._id} with status ${res.status}`,
          );
        }
      }

      if (clearOnly) {
        log("✅ Remote database cleared.");
        process.exit(0);
      }

      // 2. High-Performance Seeding via Bulk API
      log("   → Seeding 100% accurate benchmark data...");

      // Authors
      const authors = Array.from({ length: AUTHOR_COUNT }, (_, i) => ({
        _id: `author-${i + 1}`,
        name: `Author ${i + 1}`,
        bio: `Bio for author ${i + 1}`,
        tenantId: TENANT_ID,
      }));
      const authorsRes = await fetch(
        `${process.env.API_BASE_URL}/api/collections/benchmark_authors/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": process.env.TEST_API_SECRET!,
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify(authors),
        },
      );
      if (!authorsRes.ok) {
        throw new Error(
          `Failed to seed authors remotely: ${authorsRes.status} ${await authorsRes.text()}`,
        );
      }

      // Posts
      const posts = authors.flatMap((author, ai) =>
        Array.from({ length: POSTS_PER_AUTHOR }, (_, pi) => ({
          title: `Post ${pi + 1} by Author ${ai + 1}`,
          author: author._id,
          tenantId: TENANT_ID,
        })),
      );
      const postsRes = await fetch(
        `${process.env.API_BASE_URL}/api/collections/benchmark_posts/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": process.env.TEST_API_SECRET!,
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify(posts),
        },
      );
      if (!postsRes.ok) {
        throw new Error(
          `Failed to seed posts remotely: ${postsRes.status} ${await postsRes.text()}`,
        );
      }

      // Stable Entry
      const stableEntry = {
        _id: "bench-shared-001",
        title: "Stable Benchmark Entry",
        content: "This is a stable entry for REST and API performance testing.",
        count: 1,
        tenantId: TENANT_ID,
      };
      const stableRes = await fetch(`${process.env.API_BASE_URL}/api/collections/BenchmarkStable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": process.env.TEST_API_SECRET!,
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify(stableEntry),
      });
      if (!stableRes.ok) {
        throw new Error(
          `Failed to seed stable entry remotely: ${stableRes.status} ${await stableRes.text()}`,
        );
      }

      // Redirects
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
      const redirectsRes = await fetch(
        `${process.env.API_BASE_URL}/api/collections/redirects/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-secret": process.env.TEST_API_SECRET!,
            "x-tenant-id": TENANT_ID,
          },
          body: JSON.stringify(redirects),
        },
      );
      if (!redirectsRes.ok) {
        throw new Error(
          `Failed to seed redirects remotely: ${redirectsRes.status} ${await redirectsRes.text()}`,
        );
      }

      await notifyServer();

      log(`✅ Remote setup completed successfully.`);
      process.exit(0);
    }

    // ─── LOCAL FALLBACK ──────────────────────────────────────────────────────
    // Dynamic imports to ensure proper initialization order
    const { getDb, getDbInitPromise } = await import("@src/databases/db");
    const { LocalCMS } = await import("@src/services/sdk");

    await getDbInitPromise();

    const db = getDb();
    if (!db) throw new Error("Database failed to initialize");

    // 🚀 SMART SEEDING: Check if we already have data to avoid redundant setup
    let existingResult: any = null;
    let existingStable: any = null;
    let existingRedirects: any = null;
    let existingAdmin: any = null;

    try {
      existingAdmin = await db.auth.getUserByEmail({
        email: "admin@example.com",
      });
    } catch {
      /* Table missing */
    }

    try {
      existingResult = await db.crud.findOne(
        "benchmark_authors",
        { _id: "author-1" as any },
        { tenantId: TENANT_ID as any },
      );
    } catch {
      /* Table likely missing */
    }

    try {
      existingStable = await db.crud.findOne(
        "BenchmarkStable",
        { _id: "bench-shared-001" as any },
        { tenantId: TENANT_ID as any },
      );
    } catch {
      /* Table likely missing */
    }

    try {
      existingRedirects = await db.crud.findOne(
        "redirects",
        { _id: "bench-redirect-1" as any },
        { tenantId: TENANT_ID as any },
      );
    } catch {
      /* Table likely missing */
    }

    const hasData =
      existingAdmin?.success &&
      existingResult?.success &&
      existingResult.data?._id === "author-1" &&
      existingStable?.success &&
      existingStable.data?._id === "bench-shared-001" &&
      existingRedirects?.success &&
      existingRedirects.data?._id === "bench-redirect-1";

    if (hasData && !clearOnly && !force) {
      log("🚀 [SmartSeed] Benchmark data already exists. Reusing state...");
      await notifyServer();
      process.exit(0);
    }

    // Clean slate for reproducible benchmarks
    if (typeof (db as any).clearDatabase === "function" && (clearOnly || force || !hasData)) {
      log("Clearing database for clean benchmark state...");
      const clearResult = await (db as any).clearDatabase();
      if (!clearResult.success) {
        log(`Warning: Database clear failed: ${clearResult.message}`);
      }

      // 🚀 UNIFIED SEEDING: Ensure roles exist for ALL databases
      log("Provisioning default roles...");
      if (typeof db.ensureAuth === "function") {
        await db.ensureAuth();
      } else {
        // Fallback for adapters without ensureAuth
        const roles = getDefaultRoles();
        for (const role of roles) {
          try {
            await db.auth.createRole({ ...role, tenantId: TENANT_ID as any });
          } catch {
            /* ignore duplicates */
          }
        }
      }

      // Always provision admin after a clear
      await provisionAdmin(db);

      // 🚀 SEED ESSENTIAL SETTINGS: Needed for CMS to function correctly
      log("Seeding essential system settings...");
      const essentialSettings = [
        {
          key: "SITE_NAME",
          value: "SveltyCMS Benchmark",
          category: "public",
          scope: "system",
        },
        {
          key: "DEFAULT_CONTENT_LANGUAGE",
          value: "en",
          category: "public",
          scope: "system",
        },
        {
          key: "AVAILABLE_CONTENT_LANGUAGES",
          value: ["en"],
          category: "public",
          scope: "system",
        },
        {
          key: "BASE_LOCALE",
          value: "en",
          category: "public",
          scope: "system",
        },
        { key: "LOCALES", value: ["en"], category: "public", scope: "system" },
      ];

      try {
        if (db.system?.preferences?.setMany) {
          await db.system.preferences.setMany(essentialSettings as any);
        }
      } catch (err) {
        log(`Warning: Failed to seed settings: ${err}`);
      }

      // 🚀 SEED DEFAULT THEME
      log("Seeding default theme...");
      const defaultTheme = {
        _id: "670e8b8c4d123456789abcde",
        name: "Benchmark Theme",
        path: "",
        isActive: true,
        isDefault: true,
        config: { tailwindConfigPath: "", assetsPath: "" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      try {
        if (db.system?.themes?.storeThemes) {
          await db.system.themes.storeThemes([defaultTheme as any]);
        }
      } catch (err) {
        log(`Warning: Failed to seed theme: ${err}`);
      }
    }

    if (clearOnly) {
      log("✅ Database cleared (clear-only mode).");
      await provisionAdmin(db);
      process.exit(0);
    }

    const cms = new LocalCMS(db);

    // 🏗️ ENSURE SYSTEM TABLES: Initialize content system to create core tables
    log("Initializing core system tables...");
    await contentSystem.initialize(TENANT_ID as any, true);

    // Force a reconciliation to ensure tables physically exist in the DB
    await (db as any).reconcile?.();

    const { authorsCollection, postsCollection } = await setupCollections(cms);

    log(
      `Resolved collection IDs → Authors: ${authorsCollection._id}, Posts: ${postsCollection._id}`,
    );

    // 🚀 SYNC SDK: Ensure local SDK instance is 1000% in sync with the reconciled server state
    if (typeof (cms as any).content?.refresh === "function") {
      await (cms as any).content.refresh(TENANT_ID as any, false);
    }

    await seedData(cms, authorsCollection._id, postsCollection._id);

    // 🚀 FINAL NOTIFICATION: Notify the server AFTER all data is seeded and local locks are released
    await notifyServer();

    log(
      `✅ Setup completed successfully: ${AUTHOR_COUNT} authors + ${AUTHOR_COUNT * POSTS_PER_AUTHOR} posts`,
    );
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Benchmark setup failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

// 🚀 EXECUTION ENGINE
// Detect if running under bun test (and NOT just preloaded in a runner process)
if (process.env.BUN_TEST && !process.env.SVELTY_BENCHMARK_SUITE) {
  const { it } = await import("bun:test");
  it("Seeds Relational Data", async () => {
    await main();
  });
} else {
  // Direct execution or via bun run
  main().catch((err) => {
    console.error("❌ Setup failed:", err);
    process.exit(1);
  });
}

#!/usr/bin/env bun
/**
 * @file scripts/benchmark-matrix/setup-benchmarks.ts
 * @description Sets up relational collections (Authors + Posts) and seeds benchmark data.
 * Optimized for repeatable, clean benchmark runs in SveltyCMS.
 */
import { plugin } from "bun";

// Mock $app/environment for standalone execution
plugin({
  name: "svelte-kit-mock",
  setup(build) {
    build.onResolve({ filter: /^\$/ }, (args) => {
      if (args.path.startsWith("$app/")) {
        return { path: args.path, external: false, namespace: "svelte-kit-mock" };
      }
    });
    build.onLoad({ filter: /.*/, namespace: "svelte-kit-mock" }, (_args) => {
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

import fs from "node:fs/promises";
import path from "node:path";
import { contentSystem } from "@src/content";
import { getDefaultRoles } from "@src/databases/auth/default-roles";

export const AUTHOR_COUNT = Number(process.env.AUTHOR_COUNT ?? 10);
export const POSTS_PER_AUTHOR = Number(process.env.POSTS_PER_AUTHOR ?? 5);
export const TENANT_ID = process.env.TENANT_ID || null;

const COLLECTIONS = {
  AUTHORS: {
    _id: "benchmark_authors",
    name: "benchmark_authors",
    icon: "mdi:account-details",
    fields: [
      { label: "Name", db_fieldName: "name", widget: { Name: "Input" }, required: true },
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
      { label: "Title", db_fieldName: "title", widget: { Name: "Input" }, required: true },
      { label: "Content", db_fieldName: "content", widget: { Name: "RichText" } },
    ],
  },
  REDIRECTS: {
    _id: "redirects",
    name: "redirects",
    icon: "mdi:link-out",
    fields: [
      { label: "From", db_fieldName: "from", widget: { Name: "Input" }, required: true },
      { label: "To", db_fieldName: "to", widget: { Name: "Input" }, required: true },
      { label: "Type", db_fieldName: "type", widget: { Name: "Select" }, required: true },
      { label: "Tenant ID", db_fieldName: "tenantId", widget: { Name: "Text" }, required: true },
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
      { label: "Content", db_fieldName: "content", widget: { Name: "RichText" } },
    ],
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
      { label: "Category", db_fieldName: "category", widget: { Name: "Select" }, indexed: true },
      { label: "Count", db_fieldName: "count", widget: { Name: "Number" } },
    ],
  },
  MIGRATION: {
    _id: "bench_migration_large",
    name: "bench_migration_large",
    icon: "mdi:transfer",
    fields: [
      { label: "Title", db_fieldName: "title", widget: { Name: "Input" }, required: true },
      { label: "Data", db_fieldName: "data", widget: { Name: "JSON" } },
    ],
  },
} as const;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[\x1b[90m${ts}\x1b[0m] ${msg}`);
}

async function ensureCompiledCollectionsDir(): Promise<string> {
  const dir = path.join(process.cwd(), ".compiledCollections");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeCollectionSchema(dir: string, collection: any): Promise<void> {
  await fs.writeFile(
    path.join(dir, `${collection.name}.js`),
    `export default ${JSON.stringify(collection, null, 2)};`,
  );
  log(`Written schema for ${collection.name}`);
}

async function setupCollections(cms: any): Promise<{ authorsId: string; postsId: string }> {
  log("Creating Authors and Posts collections...");

  const compiledDir = await ensureCompiledCollectionsDir();

  await writeCollectionSchema(compiledDir, COLLECTIONS.AUTHORS);
  await writeCollectionSchema(compiledDir, COLLECTIONS.POSTS);
  await writeCollectionSchema(compiledDir, COLLECTIONS.STABLE);
  await writeCollectionSchema(compiledDir, COLLECTIONS.REDIRECTS);
  await writeCollectionSchema(compiledDir, COLLECTIONS.REVISIONS);
  await writeCollectionSchema(compiledDir, COLLECTIONS.INDEX_PRESSURE);
  await writeCollectionSchema(compiledDir, COLLECTIONS.MIGRATION);

  // Create models in database adapter
  if (typeof cms.db.collection?.createModel === "function") {
    // For SQL adapters (SQLite/Postgres/Maria), drop existing tables if they exist to ensure a clean state
    if (typeof cms.db.raw?.execute === "function") {
      try {
        await cms.db.raw.execute("DROP TABLE IF EXISTS benchmark_authors");
        await cms.db.raw.execute("DROP TABLE IF EXISTS benchmark_posts");
        await cms.db.raw.execute("DROP TABLE IF EXISTS BenchmarkStable");
        await cms.db.raw.execute("DROP TABLE IF EXISTS redirects");
        await cms.db.raw.execute("DROP TABLE IF EXISTS bench_revisions");
        await cms.db.raw.execute("DROP TABLE IF EXISTS bench_index_pressure");
        await cms.db.raw.execute("DROP TABLE IF EXISTS bench_migration_large");
      } catch (e) {
        log(`Cleanup attempt failed: ${e}`);
      }
    }
    await cms.db.collection.createModel(COLLECTIONS.AUTHORS as any);
    await cms.db.collection.createModel(COLLECTIONS.POSTS as any);
    await cms.db.collection.createModel(COLLECTIONS.STABLE as any);
    await cms.db.collection.createModel(COLLECTIONS.REDIRECTS as any);
    await cms.db.collection.createModel(COLLECTIONS.REVISIONS as any);
    await cms.db.collection.createModel(COLLECTIONS.INDEX_PRESSURE as any);
    await cms.db.collection.createModel(COLLECTIONS.MIGRATION as any);
  }

  log("Refreshing local content system...");
  await cms.collections.refresh(TENANT_ID as any, false); // full refresh with reconciliation

  if (typeof (cms.db as any).reconcile === "function") {
    await (cms.db as any).reconcile();
  }

  // 🛡️ RECONCILIATION GUARD: Poll until collections are visible in the store
  // This prevents "Collection not found" errors due to async file system watchers.
  let authorsCollection: any = null;
  let postsCollection: any = null;
  let stableCollection: any = null;
  let revisionsCollection: any = null;
  let pressureCollection: any = null;
  let migrationCollection: any = null;
  let redirectsCollection: any = null;

  const MAX_POLL_ATTEMPTS = 15;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const collections = await cms.collections.list({ tenantId: TENANT_ID as any });
    authorsCollection = collections.find((c: any) => c.name === "benchmark_authors");
    postsCollection = collections.find((c: any) => c.name === "benchmark_posts");
    stableCollection = collections.find((c: any) => c.name === "BenchmarkStable");
    revisionsCollection = collections.find((c: any) => c.name === "bench_revisions");
    pressureCollection = collections.find((c: any) => c.name === "bench_index_pressure");
    migrationCollection = collections.find((c: any) => c.name === "bench_migration_large");
    redirectsCollection = collections.find((c: any) => c.name === "redirects");

    if (
      authorsCollection &&
      postsCollection &&
      stableCollection &&
      revisionsCollection &&
      pressureCollection &&
      migrationCollection &&
      redirectsCollection
    ) {
      if (attempt > 1) log(`✅ Collections reconciled on attempt ${attempt}.`);
      break;
    }

    const all = await cms.collections.list({ tenantId: TENANT_ID as any });
    log(
      `  (Attempt ${attempt}/${MAX_POLL_ATTEMPTS}) Available collections: ${all.map((c: any) => `${c.name} (${c._id})`).join(", ")}`,
    );

    if (attempt === MAX_POLL_ATTEMPTS) {
      const available = all.map((c: any) => c.name || c._id);
      throw new Error(
        `Reconciliation timeout: Collections not found. Available: ${available.join(", ")}`,
      );
    }

    log(`  (Attempt ${attempt}/${MAX_POLL_ATTEMPTS}) Waiting for reconciliation...`);
    await cms.collections.refresh(TENANT_ID as any, false);
    await new Promise((r) => setTimeout(r, 600));
  }

  const authorsId = authorsCollection?._id ?? COLLECTIONS.AUTHORS._id;
  const postsId = postsCollection?._id ?? COLLECTIONS.POSTS._id;

  log(`Resolved collection IDs → Authors: ${authorsId}, Posts: ${postsId}`);

  // Re-register models with possibly resolved IDs
  if (typeof cms.db.collection?.createModel === "function") {
    if (authorsCollection) await cms.db.collection.createModel(authorsCollection as any);
    if (postsCollection) await cms.db.collection.createModel(postsCollection as any);
    if (stableCollection) await cms.db.collection.createModel(stableCollection as any);
    if (revisionsCollection) await cms.db.collection.createModel(revisionsCollection as any);
    if (pressureCollection) await cms.db.collection.createModel(pressureCollection as any);
    if (migrationCollection) await cms.db.collection.createModel(migrationCollection as any);
    if (redirectsCollection) await cms.db.collection.createModel(redirectsCollection as any);
  }

  return { authorsId, postsId };
}

/**
 * 🚀 NOTIFY SERVER: Force the remote server process to re-scan collections
 */
async function notifyServer() {
  if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
    log(`   → Notifying server at ${process.env.API_BASE_URL}...`);
    try {
      const res = await fetch(`${process.env.API_BASE_URL}/api/system/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": process.env.TEST_API_SECRET,
        },
        body: JSON.stringify({ tenantId: TENANT_ID, skipReconciliation: false }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });
      if (res.ok) log("   → Server refresh successful.");
      else log(`   → Server refresh failed: ${res.status} ${res.statusText}`);
    } catch (err: any) {
      log(`   → Server refresh notification error: ${err.message}`);
    }
  }
}

async function seedData(cms: any, authorsId: string, postsId: string): Promise<void> {
  log(`Seeding ${AUTHOR_COUNT} authors with ${POSTS_PER_AUTHOR} posts each...`);

  const authors = Array.from({ length: AUTHOR_COUNT }, (_, i) => ({
    _id: `author-${i + 1}`,
    name: `Author ${i + 1}`,
    bio: `Bio for author ${i + 1}`,
  }));

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
      from: "/old-path-1",
      to: "/new-path-1",
      type: 301,
      tenantId: "default",
    },
    {
      _id: "bench-redirect-2",
      from: "/old-path-2",
      to: "/new-path-2",
      type: 301,
      tenantId: "default",
    },
  ];

  const redirectResult = await cms.collections.bulkCreate(COLLECTIONS.REDIRECTS._id, redirects, {
    system: true,
    tenantId: TENANT_ID as any,
  });

  if (!redirectResult.success) {
    throw new Error(`Failed to seed redirects: ${redirectResult.message}`);
  }

  log(
    `Successfully seeded ${authors.length} authors, ${posts.length} posts, stable entry, and ${redirects.length} redirects`,
  );
}

export async function main(): Promise<void> {
  try {
    log("Starting benchmark data setup...");

    // Dynamic imports to ensure proper initialization order
    const { getDb, getDbInitPromise } = await import("@src/databases/db");
    const { LocalCMS } = await import("@src/services/sdk");

    await getDbInitPromise();

    const db = getDb();
    if (!db) throw new Error("Database failed to initialize");

    const clearOnly = process.argv.includes("--clear-only");
    const force = process.argv.includes("--force");

    // 🚀 SMART SEEDING: Check if we already have data to avoid redundant setup
    let existingResult: any = null;
    let existingStable: any = null;
    let existingRedirects: any = null;

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

      // 🚀 SEED ESSENTIAL SETTINGS: Needed for CMS to function correctly
      log("Seeding essential system settings...");
      const essentialSettings = [
        { key: "SITE_NAME", value: "SveltyCMS Benchmark", category: "public", scope: "system" },
        { key: "DEFAULT_CONTENT_LANGUAGE", value: "en", category: "public", scope: "system" },
        { key: "AVAILABLE_CONTENT_LANGUAGES", value: ["en"], category: "public", scope: "system" },
        { key: "BASE_LOCALE", value: "en", category: "public", scope: "system" },
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

      process.exit(0);
    }

    const cms = new LocalCMS(db);

    // 🏗️ ENSURE SYSTEM TABLES: Initialize content system to create core tables
    log("Initializing core system tables...");
    await contentSystem.initialize(TENANT_ID as any, true);

    // Force a reconciliation to ensure tables physically exist in the DB
    await (db as any).reconcile?.();

    const { authorsId, postsId } = await setupCollections(cms);
    await seedData(cms, authorsId, postsId);

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

// Only execute if this is the main entry point
if (import.meta.main) {
  main().catch((err) => {
    console.error("❌ Setup failed:", err);
    process.exit(1);
  });
}

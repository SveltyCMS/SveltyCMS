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
        contents:
          "export const browser = false; export const dev = false; export const building = false; export const version = '1.0.0';",
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
    _id: "benchmark_stable",
    name: "benchmark_stable",
    icon: "mdi:database-check",
    fields: [
      { label: "Title", db_fieldName: "title", widget: { Name: "Input" }, required: true },
      { label: "Content", db_fieldName: "content", widget: { Name: "RichText" } },
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

async function writeCollectionSchema(
  dir: string,
  collection: typeof COLLECTIONS.AUTHORS | typeof COLLECTIONS.POSTS,
): Promise<void> {
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
  await writeCollectionSchema(compiledDir, COLLECTIONS.STABLE as any);

  // Create models in database adapter
  if (typeof cms.db.collection?.createModel === "function") {
    await cms.db.collection.createModel(COLLECTIONS.AUTHORS as any);
    await cms.db.collection.createModel(COLLECTIONS.POSTS as any);
    await cms.db.collection.createModel(COLLECTIONS.STABLE as any);
  }

  log("Refreshing local collections and notifying server...");
  await cms.collections.refresh(TENANT_ID as any, false); // full refresh with reconciliation

  // 🚀 NOTIFY SERVER: Force the remote server process to re-scan collections from .compiledCollections
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
      });
      if (res.ok) log("   → Server refresh successful.");
      else log(`   → Server refresh failed: ${res.status} ${res.statusText}`);
    } catch (err: any) {
      log(`   → Server refresh notification error: ${err.message}`);
    }
  }
  if (typeof (cms.db as any).reconcile === "function") {
    await (cms.db as any).reconcile();
  }

  // 🛡️ RECONCILIATION GUARD: Poll until collections are visible in the store
  // This prevents "Collection not found" errors due to async file system watchers.
  let authorsCollection: any = null;
  let postsCollection: any = null;
  const MAX_POLL_ATTEMPTS = 15;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const collections = await cms.collections.list({ tenantId: TENANT_ID as any });
    authorsCollection = collections.find((c: any) => c.name === "benchmark_authors");
    postsCollection = collections.find((c: any) => c.name === "benchmark_posts");
    const stableCollection = collections.find((c: any) => c.name === "benchmark_stable");

    if (authorsCollection && postsCollection && stableCollection) {
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
  }

  return { authorsId, postsId };
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

  log(`Successfully seeded ${authors.length} authors, ${posts.length} posts, and stable entry`);
}

export async function main(): Promise<void> {
  try {
    log("Starting benchmark data setup...");

    // Dynamic imports to ensure proper initialization order
    const { getDb, getDbInitPromise, reinitializeSystem } = await import("@src/databases/db");
    const { LocalCMS } = await import("@src/routes/api/cms");

    await reinitializeSystem(true);
    await getDbInitPromise();

    const db = getDb();
    if (!db) throw new Error("Database failed to initialize");

    const clearOnly = process.argv.includes("--clear-only");
    const force = process.argv.includes("--force");

    // 🚀 SMART SEEDING: Check if we already have data to avoid redundant setup
    const existingResult = await db.crud
      .findOne("benchmark_authors", { _id: "author-1" as any }, { tenantId: TENANT_ID as any })
      .catch(() => null);
    const existingStable = await db.crud
      .findOne("benchmark_stable", { _id: "bench-shared-001" as any }, { tenantId: TENANT_ID as any })
      .catch(() => null);

    const hasData =
      existingResult?.success &&
      existingResult.data?._id === "author-1" &&
      existingStable?.success &&
      existingStable.data?._id === "bench-shared-001";

    if (hasData && !clearOnly && !force) {
      log("🚀 [SmartSeed] Benchmark data already exists. Reusing state...");
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

    // Final reconciliation
    log("Performing final system reconciliation...");
    await cms.collections.refresh(TENANT_ID as any, false); // full refresh with reconciliation

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

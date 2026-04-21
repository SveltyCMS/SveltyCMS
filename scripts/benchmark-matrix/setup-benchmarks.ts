#!/usr/bin/env bun
/**
 * @file scripts/benchmark-matrix/setup-benchmarks.ts
 * @description Sets up relational collections (Authors + Posts) and seeds benchmark data.
 * Optimized for repeatable, clean benchmark runs in SveltyCMS.
 */

import fs from "node:fs/promises";
import path from "node:path";

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

  // Create models in database adapter
  if (typeof cms.db.collection?.createModel === "function") {
    await cms.db.collection.createModel(COLLECTIONS.AUTHORS as any);
    await cms.db.collection.createModel(COLLECTIONS.POSTS as any);
  }

  log("Refreshing collections and reconciling schemas...");
  await cms.collections.refresh(TENANT_ID as any, false); // full refresh

  // Small delay for disk / watcher consistency
  await new Promise((r) => setTimeout(r, 800));

  const collections = await cms.collections.list({ tenantId: TENANT_ID as any });

  const authorsCollection = collections.find((c: any) => c.name === "benchmark_authors");
  const postsCollection = collections.find((c: any) => c.name === "benchmark_posts");

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

  log(`Successfully seeded ${authors.length} authors and ${posts.length} posts`);
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

    // Clean slate for reproducible benchmarks
    if (typeof (db as any).clearDatabase === "function") {
      log("Clearing database for clean benchmark state...");
      const clearResult = await (db as any).clearDatabase();
      if (!clearResult.success) {
        log(`Warning: Database clear failed: ${clearResult.message}`);
      }
    }

    const cms = new LocalCMS(db);

    const { authorsId, postsId } = await setupCollections(cms);
    await seedData(cms, authorsId, postsId);

    // Final reconciliation
    log("Performing final system reconciliation...");
    await cms.collections.refresh(TENANT_ID as any);

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

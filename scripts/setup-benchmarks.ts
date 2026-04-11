#!/usr/bin/env bun
/**
 * @file scripts/setup-benchmarks.ts
 * @description Sets up relational collections and seeds benchmark data via HTTP API.
 * Optimized for SveltyCMS v3 architecture.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4173";
const AUTHOR_COUNT = Number(process.env.AUTHOR_COUNT ?? 10);
const POSTS_PER_AUTHOR = Number(process.env.POSTS_PER_AUTHOR ?? 5);
const SEED_CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 5);
const FETCH_TIMEOUT_MS = 30_000;
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";

const AUTHORS_COLLECTION_ID = "00000000000000000000000000000001";
const POSTS_COLLECTION_ID = "00000000000000000000000000000002";

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function apiFetch<T = unknown>(url: string, init: RequestInit, label: string): Promise<T> {
  // Bulletproof header merging for Bun/undici
  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => (mergedHeaders[k.toLowerCase()] = v));
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([k, v]) => (mergedHeaders[k.toLowerCase()] = v));
    } else {
      Object.entries(init.headers).forEach(
        ([k, v]) => (mergedHeaders[k.toLowerCase()] = v as string),
      );
    }
  }

  // Always force the secret
  mergedHeaders["x-test-secret"] = TEST_API_SECRET;

  const res = await fetch(url, {
    ...init,
    headers: mergedHeaders,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable body)");
    throw new Error(
      `${label} → HTTP ${res.status} ${res.statusText}\n  URL: ${url}\n  Body: ${body.slice(0, 300)}`,
    );
  }

  return res.json() as Promise<T>;
}

async function batchRun<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const slice = tasks.slice(i, i + concurrency).map((t) => t());
    const settled = await Promise.allSettled(slice);
    results.push(...settled);
  }
  return results;
}

async function setupCollections(authHeaders: Record<string, string>): Promise<void> {
  log("Creating 'Authors' and 'Posts' collections…");

  // Create Authors Collection
  await apiFetch(
    `${API_BASE_URL}/api/testing`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "create-collection",
        name: "Authors",
        schema: {
          _id: AUTHORS_COLLECTION_ID,
          icon: "mdi:account-details",
          fields: [
            { label: "Name", db_fieldName: "name", widget: "Input", required: true },
            { label: "Bio", db_fieldName: "bio", widget: "Input" },
          ],
        },
      }),
    },
    "setupAuthorsCollection",
  );

  // Create Posts Collection
  await apiFetch(
    `${API_BASE_URL}/api/testing`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "create-collection",
        name: "Posts",
        schema: {
          _id: POSTS_COLLECTION_ID,
          icon: "mdi:post",
          fields: [
            { label: "Title", db_fieldName: "title", widget: "Input", required: true },
            {
              label: "Author",
              db_fieldName: "author",
              widget: "Relation",
              collection: "Authors",
              multiple: false,
            },
          ],
        },
      }),
    },
    "setupPostsCollection",
  );

  log("Collections creation request sent and reconciled.");
}

async function seedAuthors(authHeaders: Record<string, string>): Promise<string[]> {
  log(`Seeding ${AUTHOR_COUNT} authors…`);
  const tasks = Array.from({ length: AUTHOR_COUNT }, (_, i) => {
    const n = i + 1;
    return () =>
      apiFetch<any>(
        `${API_BASE_URL}/api/collections/${AUTHORS_COLLECTION_ID}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            name: `Author ${n}`,
            bio: `Bio for author ${n}`,
          }),
        },
        `createAuthor(${n})`,
      );
  });

  const settled = await batchRun(tasks, SEED_CONCURRENCY);
  return settled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map((r) => r.value.data._id);
}

async function seedPosts(authHeaders: Record<string, string>, authorIds: string[]): Promise<void> {
  const total = authorIds.length * POSTS_PER_AUTHOR;
  log(`Seeding ${total} posts…`);
  const tasks = authorIds.flatMap((authorId, ai) =>
    Array.from({ length: POSTS_PER_AUTHOR }, (_, pi) => {
      const n = pi + 1;
      return () =>
        apiFetch<any>(
          `${API_BASE_URL}/api/collections/${POSTS_COLLECTION_ID}`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              title: `Post ${n} by Author ${ai + 1}`,
              author: authorId,
            }),
          },
          `createPost(author=${ai + 1}, post=${n})`,
        );
    }),
  );

  await batchRun(tasks, SEED_CONCURRENCY);
}

async function main(): Promise<void> {
  log(`Starting relational benchmark setup at ${API_BASE_URL}`);

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-test-secret": TEST_API_SECRET,
  };

  await setupCollections(authHeaders);
  const authorIds = await seedAuthors(authHeaders);
  if (authorIds.length === 0) throw new Error("Failed to seed authors");
  await seedPosts(authHeaders, authorIds);

  log(`🎉 Setup complete: ${authorIds.length} author(s) seeded.`);
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});

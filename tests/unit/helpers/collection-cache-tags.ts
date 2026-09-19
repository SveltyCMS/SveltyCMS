/**
 * @file tests/unit/helpers/collection-cache-tags.ts
 * @description
 * Shared expectations for the collection cache-tag two-spelling contract:
 * list/count producers register `collection:<name>` / `count:<name>` tags for
 * the as-passed, normalised physical and bare spellings, and every invalidator
 * (SDK write path, adapter, CacheService) must clear a set that intersects all
 * of them.
 *
 * The expected tag set is derived INDEPENDENTLY of `buildCollectionCacheTags`
 * (only the physical-name derivation is imported) so the contract is asserted,
 * not mirrored: dropping the bare-spelling tag — the `collectionBareName` line
 * in src/databases/core/collection-name.ts — makes these expectations fail.
 *
 * ### Features:
 * - `expectedCollectionCacheTags` — contract expectation for one collection spelling
 * - `expectClearedCovers` — cleared set covers every expected producer tag
 * - `expectTagOverlap` — produced ∩ cleared covers every expected tag
 * - `tagSetFromCalls` — flatten `clearByTags` mock calls into a tag set
 */

import { expect } from "vitest";
import { collectionTableName } from "@src/databases/core/collection-name";

/** Physical-name namespace prefix (restated, not imported, on purpose). */
const COLLECTION_TABLE_PREFIX = "collection_";

/**
 * Bare (unprefixed, dash-free) spelling: `collection_posts` → `posts`,
 * `blog-posts` → `blogposts`. Independent restatement of the production
 * normaliser so a dropped bare-spelling tag fails the expectations.
 */
function bareSpelling(collection: string): string {
  const id = collection.startsWith(COLLECTION_TABLE_PREFIX)
    ? collection.slice(COLLECTION_TABLE_PREFIX.length)
    : collection;
  return id.replace(/-/g, "");
}

/** The `collection:`/`count:` tag pair for one spelling; nothing for the degenerate "". */
function spellingTags(spelling: string): string[] {
  return spelling.length === 0 ? [] : [`collection:${spelling}`, `count:${spelling}`];
}

/**
 * Expected cache tags for a collection reference under every accepted spelling —
 * as passed, normalised physical (`collectionTableName`), and bare — deduped in
 * that order. Pass `{ countBucket: true }` to match `buildCountCacheTags`, which
 * prefixes the bare `count` bucket tag.
 */
export function expectedCollectionCacheTags(
  collection: string,
  options: { countBucket?: boolean } = {},
): string[] {
  const tags = new Set([
    ...spellingTags(collection),
    ...spellingTags(collectionTableName(collection)),
    ...spellingTags(bareSpelling(collection)),
  ]);
  return options.countBucket ? ["count", ...tags] : [...tags];
}

/** Flatten the tag-array argument of `clearByTags`-shaped mock calls into a set. */
export function tagSetFromCalls(calls: ReadonlyArray<readonly unknown[]>): Set<string> {
  const tags = new Set<string>();
  for (const args of calls) {
    const first = args[0];
    if (!Array.isArray(first)) continue;
    for (const tag of first) {
      if (typeof tag === "string") tags.add(tag);
    }
  }
  return tags;
}

/**
 * Assert an invalidator's cleared tags cover every expected tag — i.e. entries a
 * contract-following producer registered would all be evicted.
 */
export function expectClearedCovers(
  expected: readonly string[],
  cleared: ReadonlySet<string>,
): void {
  expect(expected.length).toBeGreaterThan(0);
  expect([...cleared]).toEqual(expect.arrayContaining([...expected]));
}

/**
 * Assert a producer's tags and an invalidator's cleared tags both cover every
 * expected tag, and that the two sets actually intersect — the stale-total
 * drift guard for the two-spelling contract.
 */
export function expectTagOverlap(
  produced: ReadonlySet<string>,
  cleared: ReadonlySet<string>,
  expected: readonly string[],
): void {
  expect(expected.length).toBeGreaterThan(0);
  expect([...produced]).toEqual(expect.arrayContaining([...expected]));
  expect([...cleared]).toEqual(expect.arrayContaining([...expected]));
  const overlap = [...produced].filter((tag) => cleared.has(tag));
  expect(overlap.length).toBeGreaterThan(0);
}

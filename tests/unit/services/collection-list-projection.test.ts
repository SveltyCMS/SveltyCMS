/**
 * @file tests/unit/services/collection-list-projection.test.ts
 * @description B2 regression at the SERVICE seam — `CollectionService.getCollectionData`
 * (→ `loadCollectionData`), where the list rows are projected. Deliberately not a test of
 * `@utils/entry-values`: the helper is new in this fix, so a helper test cannot fail on the
 * bug. These assertions exercise the projection the table and the row→editor handoff
 * actually receive, and fail on base commit 76440f73d, which:
 *
 * - wrote the display placeholder `"-"` into every empty translated cell of the row,
 * - mutated the row object the adapter/cache returned (in-place `entry[field] = …`),
 *   so a row handed to the editor could never come back as the stored document.
 *
 * The list projection is a one-language DISPLAY snapshot. Three contracts are pinned here:
 * (a) empty stays `""` — the en dash is drawn by `entry-list-cell.svelte`, never stored;
 * (b) only the active language survives, and an empty active layer never falls back
 *     to another language; (c) the projected row is a copy, so the cached row is untouched.
 * A fourth case pins the other side of the seam: edit mode (`editEntryId`) must keep every
 * locale, otherwise the editor would save a projection over the stored document.
 */

import { describe, expect, it, vi } from "vitest";
import type { Schema } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import { dbAdapter } from "@src/databases/db";
import { collectionService } from "@src/services/core/collection-service";
import { cloneFixture, COLLECTIONS, USERS } from "@tests/harness";

/** Schema as the harness stores it: `title`/`body` translated, `slug` not. */
const COLLECTION = {
  _id: COLLECTIONS.pages._id,
  name: COLLECTIONS.pages.name,
  label: COLLECTIONS.pages.label,
  tenantId: COLLECTIONS.pages.tenantId,
  fields: [
    { db_fieldName: "title", label: "Title", type: "string", translated: true },
    { db_fieldName: "body", label: "Body", type: "richtext", translated: true },
    { db_fieldName: "slug", label: "Slug", type: "string", translated: false },
  ],
} as unknown as Schema;

/** The editor/session user the service compiles filters for (harness fixture). */
const USER = USERS.admin as unknown as User;

/**
 * Two stored documents, one of them deliberately empty in the active language:
 * - `entry_A1` has both locales filled,
 * - `entry_A2` has an empty `en` title (German only) and an untouched structured `body`.
 */
function storedRows(): Record<string, unknown>[] {
  return [
    {
      _id: "entry_A1",
      title: { en: "Hello", de: "Hallo" },
      body: { en: "<p>Body</p>", de: "<p>Text</p>" },
      slug: "hello",
    },
    {
      _id: "entry_A2",
      title: { en: "", de: "Nur Deutsch" },
      body: {},
      slug: "leer",
    },
  ];
}

/**
 * Install the rows on the harness dbAdapter (vitest setup mocks `@src/databases/db`)
 * and give it the query-builder surface the list path needs. `execute()` returns the
 * SAME row objects it was given, so a projection that writes into them is observable.
 */
function installRows(rows: Record<string, unknown>[]): void {
  const adapter = dbAdapter as unknown as Record<string, any>;
  const builder: Record<string, any> = {
    where: () => builder,
    search: () => builder,
    sort: () => builder,
    orderBy: () => builder,
    paginate: () => builder,
    count: async () => ({ success: true, data: rows.length }),
    execute: async () => ({ success: true, data: rows }),
  };
  adapter.queryBuilder = vi.fn(() => builder);
  adapter.crud = {
    ...adapter.crud,
    count: vi.fn(async () => ({ success: true, data: rows.length })),
    findByIds: vi.fn(async () => ({ success: true, data: [] })),
  };
}

/** List mode: the current page, no edit target, cache bypassed (hits the DB load path). */
async function loadList(language = "en") {
  return collectionService.getCollectionData({
    collection: COLLECTION,
    user: USER,
    language,
    page: 1,
    pageSize: 10,
    bypassCache: true,
  });
}

describe("CollectionService list projection (B2)", () => {
  it("stores an empty translation as '' and never the '-' display placeholder", async () => {
    installRows(storedRows());

    const result = await loadList();
    expect(result.entries).toHaveLength(2);

    const second = result.entries[1] as Record<string, unknown>;
    // (a) an empty cell is empty data; the en dash belongs to the cell renderer.
    expect(second.title).toBe("");
    expect(second.body).toBe("");
    // No row may carry a display placeholder at all: it would be saved back over
    // the document when the row seeds a form.
    expect(JSON.stringify(result.entries)).not.toContain('"-"');
  });

  it("projects only the active language and never falls back to another one", async () => {
    installRows(storedRows());

    const result = await loadList("en");
    const [first, second] = result.entries as Array<Record<string, unknown>>;

    // (b) a translated field is the active language layer, as a plain value.
    expect(first).toEqual({
      _id: "entry_A1",
      title: "Hello",
      body: "<p>Body</p>",
      slug: "hello",
    });
    // No other locale may leak into the list payload.
    expect(JSON.stringify(result.entries)).not.toContain("Hallo");
    expect(JSON.stringify(result.entries)).not.toContain("<p>Text</p>");

    // An empty active layer stays empty — German text is not a substitute.
    expect(second.title).toBe("");
    expect(JSON.stringify(result.entries)).not.toContain("Nur Deutsch");
  });

  it("does not mutate the row object the adapter returned", async () => {
    const rows = storedRows();
    const before = cloneFixture(rows);
    installRows(rows);

    const result = await loadList();

    // (c) the stored row is the cache's row: writing "-" (or the projection) into it
    // means every later reader — including the editor handoff — sees the display value.
    expect(rows).toEqual(before);
    expect((rows[0] as Record<string, unknown>).title).toEqual({ en: "Hello", de: "Hallo" });
    // …and the projected row is a copy, not an alias of the cached object.
    expect(result.entries[0]).not.toBe(rows[0]);
  });

  it("keeps every locale when loading one entry for the editor (edit mode)", async () => {
    installRows(storedRows());

    const result = await collectionService.getCollectionData({
      collection: COLLECTION,
      user: USER,
      language: "en",
      page: 1,
      pageSize: 10,
      editEntryId: "entry_A1",
      bypassCache: true,
    });

    // Edit mode is the other consumer of the stored document: it must never be
    // projected to one language, or saving would drop the other locales.
    const entry = result.entries[0] as Record<string, unknown>;
    expect(entry.title).toEqual({ en: "Hello", de: "Hallo" });
    expect(entry.body).toEqual({ en: "<p>Body</p>", de: "<p>Text</p>" });
  });
});

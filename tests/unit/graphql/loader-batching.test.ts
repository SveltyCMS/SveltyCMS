/**
 * @file tests/unit/graphql/loader-batching.test.ts
 * @description
 * Request-scoped GraphQL batching regressions: inverse-relation loaders must be
 * cached per (collection, foreign key) pair so sibling resolver calls share one
 * batch, and the media widget resolver must consume the shared mediaLoader
 * instead of issuing a query per node.
 *
 * Features tested:
 * - `createInverseLoader` identity per pair, per request, collision-safe key
 * - three concurrent parent ids coalesce into a single `crud.findMany($in)`
 * - media widget resolver prefers `context.loaders.mediaLoader`
 * - media widget resolver falls back to `dbAdapter` when loaders are absent
 */

import { describe, expect, it, vi } from "vitest";
vi.mock(
  "@src/paraglide/messages",
  async () => (await import("../widgets/test-utils")).WIDGET_MESSAGES,
);
import MediaWidget from "@widgets/core/media-upload";
import { createLoaders } from "@src/routes/api/graphql/loaders";
import type { MediaProps } from "@src/widgets/core/media-upload/types";
import type { DatabaseAdapter } from "@src/databases/db-interface";

interface CrudFindManyResult {
  success: boolean;
  data?: Array<Record<string, unknown>>;
}

type CrudFindMany = (
  collection: string,
  query: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<CrudFindManyResult>;

/** The only adapter surface the inverse loader touches. */
interface LoaderAdapterStub {
  crud: { findMany: CrudFindMany };
}

function adapterStub(findMany: CrudFindMany): DatabaseAdapter {
  const stub: LoaderAdapterStub = { crud: { findMany } };
  return stub as unknown as DatabaseAdapter;
}

describe("createInverseLoader caching", () => {
  it("returns one loader per collection/foreign-key pair within a request", () => {
    const findMany = vi.fn<CrudFindMany>(async () => ({ success: true, data: [] }));
    const loaders = createLoaders(adapterStub(findMany), "tenant_1");

    const authorLoader = loaders.createInverseLoader("posts", "author");

    expect(loaders.createInverseLoader("posts", "author")).toBe(authorLoader);
    expect(loaders.createInverseLoader("posts", "editor")).not.toBe(authorLoader);
    expect(loaders.createInverseLoader("comments", "author")).not.toBe(authorLoader);
  });

  it("keeps the cache request-scoped", () => {
    const findMany = vi.fn<CrudFindMany>(async () => ({ success: true, data: [] }));

    const first = createLoaders(adapterStub(findMany), "tenant_1");
    const second = createLoaders(adapterStub(findMany), "tenant_1");

    expect(second.createInverseLoader("posts", "author")).not.toBe(
      first.createInverseLoader("posts", "author"),
    );
  });

  it("keys the cache collision-safely across delimiter-like names", () => {
    const findMany = vi.fn<CrudFindMany>(async () => ({ success: true, data: [] }));
    const loaders = createLoaders(adapterStub(findMany), "tenant_1");

    expect(loaders.createInverseLoader("posts:author", "x")).not.toBe(
      loaders.createInverseLoader("posts", "author:x"),
    );
  });
});

describe("createInverseLoader batching", () => {
  it("coalesces three concurrent parent ids into one $in query", async () => {
    const rows = [
      { _id: "r1", author: "p1" },
      { _id: "r2", author: "p2" },
      { _id: "r3", author: "p3" },
    ];
    const findMany = vi.fn<CrudFindMany>(async () => ({ success: true, data: rows }));
    const loaders = createLoaders(adapterStub(findMany), "tenant_1");
    const loader = loaders.createInverseLoader("posts", "author");

    const [p1, p2, p3] = await Promise.all([
      loader.load("p1"),
      loader.load("p2"),
      loader.load("p3"),
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    const [collection, query, options] = findMany.mock.calls[0];
    expect(collection).toBe("posts");
    expect(query).toEqual({ author: { $in: ["p1", "p2", "p3"] } });
    expect(options).toEqual({ tenantId: "tenant_1", limit: 1000 });
    expect(p1).toEqual([rows[0]]);
    expect(p2).toEqual([rows[1]]);
    expect(p3).toEqual([rows[2]]);
  });
});

interface MediaQueryResult {
  success: boolean;
  data?: unknown;
}

interface MediaCrudStub {
  findMany: (collection: string, query: Record<string, unknown>) => Promise<MediaQueryResult>;
  findOne: (collection: string, query: Record<string, unknown>) => Promise<MediaQueryResult>;
}

interface MediaResolverContext {
  dbAdapter?: { crud: MediaCrudStub };
  tenantId?: string;
  loaders?: {
    mediaLoader?: {
      load: (id: string) => Promise<unknown>;
    };
  };
}

type MediaResolver = (
  parent: Record<string, unknown>,
  args: Record<string, unknown>,
  context: MediaResolverContext,
) => Promise<unknown>;

function buildMediaResolver(fieldName: string, multiupload: boolean): MediaResolver {
  const schema = MediaWidget.GraphqlSchema?.({
    field: { multiupload } satisfies MediaProps,
    fieldName,
    label: "Media",
    collection: {},
  });
  const resolver = schema?.resolver?.[fieldName];
  if (typeof resolver !== "function") {
    throw new Error(`Media widget did not expose a resolver for "${fieldName}"`);
  }
  return resolver as MediaResolver;
}

describe("MediaWidget GraphQL resolver", () => {
  it("returns the mediaLoader result without touching the dbAdapter fallback", async () => {
    const resolveAvatar = buildMediaResolver("avatar", false);
    const media = { _id: "m1", name: "hero.png" };
    const load = vi.fn(async (id: string) => (id === "m1" ? media : null));
    const findOne = vi.fn(async () => ({ success: true, data: { _id: "m1", name: "db.png" } }));
    const findMany = vi.fn(async () => ({ success: true, data: [] }));

    const result = await resolveAvatar(
      { avatar: "m1" },
      {},
      {
        dbAdapter: { crud: { findOne, findMany } },
        tenantId: "tenant_1",
        loaders: { mediaLoader: { load } },
      },
    );

    expect(result).toBe(media);
    expect(load).toHaveBeenCalledWith("m1");
    expect(findOne).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("batches multi-upload ids through the mediaLoader and drops missing items", async () => {
    const resolveGallery = buildMediaResolver("gallery", true);
    const media = { _id: "m1", name: "hero.png" };
    const load = vi.fn(async (id: string) => (id === "m1" ? media : null));
    const findOne = vi.fn(async () => ({ success: true, data: null }));
    const findMany = vi.fn(async () => ({ success: true, data: [] }));

    const result = await resolveGallery(
      { gallery: ["m1", "missing"] },
      {},
      {
        dbAdapter: { crud: { findOne, findMany } },
        tenantId: "tenant_1",
        loaders: { mediaLoader: { load } },
      },
    );

    expect(load.mock.calls.map(([id]) => id)).toEqual(["m1", "missing"]);
    expect(result).toEqual([media]);
    expect(findMany).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it("falls back to the direct dbAdapter path when loaders are absent", async () => {
    const resolveAvatar = buildMediaResolver("avatar", false);
    const dbMedia = { _id: "m1", name: "db.png" };
    const findOne = vi.fn(async () => ({ success: true, data: dbMedia }));
    const findMany = vi.fn(async () => ({ success: true, data: [] }));

    const result = await resolveAvatar(
      { avatar: "m1" },
      {},
      { dbAdapter: { crud: { findOne, findMany } }, tenantId: "tenant_1" },
    );

    expect(result).toBe(dbMedia);
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});

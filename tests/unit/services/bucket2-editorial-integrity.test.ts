/**
 * @file tests/unit/services/bucket2-editorial-integrity.test.ts
 * @description Tests field `omit` projection masking, relational `onDelete` referential integrity,
 * SEO site -> collection -> entry cascade defaults, and draft-version rollback.
 */

import { describe, expect, it, vi } from "vitest";
import { canAccessField, redactReadEnvelope } from "@utils/field-access";
import {
  applyOnDeleteAfterDelete,
  enforceOnDeleteBeforeDelete,
} from "@src/services/sdk/namespaces/collections/relation-integrity";
import { buildSeoHead } from "@src/services/content/seo/seo-head";
import { mergeSeoCascade } from "@src/services/content/seo/seo-cascade";
import { DraftsNamespace } from "@src/services/sdk/namespaces/drafts-namespace";
import type { FieldInstance, Schema } from "@src/content/types";
import type { IDBAdapter } from "@src/databases/db-interface";

describe("Bucket 2 editorial & schema integrity", () => {
  it("masks fields marked omit: true from external read projections while permitting writes and system reads", () => {
    const fields = [
      {
        db_fieldName: "title",
        label: "Title",
        required: true,
        translated: false,
        widget: {} as any,
      },
      {
        db_fieldName: "internalSecret",
        label: "Internal Secret",
        omit: true,
        required: false,
        translated: false,
        widget: {} as any,
      },
    ] as FieldInstance[];

    const adminUser = { _id: "u-admin", role: "admin", isAdmin: true };
    const systemUser = { _id: "system", role: "admin" };

    expect(canAccessField(fields[1], adminUser, "write")).toBe(true);
    expect(canAccessField(fields[1], adminUser, "read")).toBe(false);
    expect(canAccessField(fields[1], systemUser, "read")).toBe(true);

    const redacted = redactReadEnvelope(
      { success: true, data: { _id: "1", title: "Hello", internalSecret: "top-secret" } },
      fields,
      adminUser,
    ) as { data: Record<string, unknown> };

    expect(redacted.data).toEqual({ _id: "1", title: "Hello" });
  });

  it("enforces relational onDelete: restrict (409), setNull, and cascade without cycles", async () => {
    const authorsSchema = { _id: "authors", name: "Authors", fields: [] } as Schema;
    const postsRestrictSchema = {
      _id: "posts_restrict",
      name: "PostsRestrict",
      fields: [
        {
          db_fieldName: "author",
          label: "Author",
          required: false,
          translated: false,
          collection: "authors",
          onDelete: "restrict",
          widget: {
            Name: "Relation",
            props: { collection: "authors", onDelete: "restrict" },
          } as any,
        },
      ],
    } as Schema;

    const adapter = {
      crud: {
        findMany: vi.fn(async (table: string) => {
          if (table.includes("posts_restrict")) {
            return { success: true, data: [{ _id: "post-1", author: "author-1" }] };
          }
          return { success: true, data: [] };
        }),
        update: vi.fn(async () => ({ success: true, data: {} })),
        delete: vi.fn(async () => ({ success: true, data: {} })),
      },
    } as unknown as IDBAdapter;

    await expect(
      enforceOnDeleteBeforeDelete({
        adapter,
        targetSchema: authorsSchema,
        entryId: "author-1",
        getCollectionName: (id) => `collection_${id}`,
        candidateSchemas: [authorsSchema, postsRestrictSchema],
      }),
    ).rejects.toMatchObject({ status: 409, code: "RELATION_RESTRICT_CONFLICT" });

    // Test setNull + cascade together
    const postsCascadeSchema = {
      _id: "posts_cascade",
      name: "PostsCascade",
      fields: [
        {
          db_fieldName: "author",
          label: "Author",
          required: false,
          translated: false,
          widget: {
            Name: "Relation",
            props: { collection: "authors", onDelete: "cascade" },
          } as any,
        },
        {
          db_fieldName: "coAuthors",
          label: "CoAuthors",
          required: false,
          translated: false,
          widget: {
            Name: "RelationList",
            props: { collection: "authors", multiple: true, onDelete: "setNull" },
          } as any,
        },
      ],
    } as Schema;

    const cascadingAdapter = {
      crud: {
        findMany: vi.fn(async (_table: string, filter: Record<string, unknown>) => {
          if (filter.author === "author-1") {
            return { success: true, data: [{ _id: "post-2", author: "author-1" }] };
          }
          if (filter.coAuthors === "author-1") {
            return {
              success: true,
              data: [{ _id: "post-3", coAuthors: ["author-1", "author-2"] }],
            };
          }
          return { success: true, data: [] };
        }),
        update: vi.fn(async () => ({ success: true, data: {} })),
        delete: vi.fn(async () => ({ success: true, data: {} })),
      },
    } as unknown as IDBAdapter;

    const counts = await applyOnDeleteAfterDelete({
      adapter: cascadingAdapter,
      targetSchema: authorsSchema,
      entryId: "author-1",
      getCollectionName: (id) => `collection_${id}`,
      candidateSchemas: [authorsSchema, postsCascadeSchema],
    });

    expect(counts).toEqual({ cascaded: 1, unlinked: 1 });
    expect(cascadingAdapter.crud.delete).toHaveBeenCalledTimes(1);
    expect(cascadingAdapter.crud.update).toHaveBeenCalledWith(
      "collection_posts_cascade",
      "post-3",
      { coAuthors: ["author-2"] },
      expect.anything(),
    );
  });

  it("cascades site -> collection -> entry SEO defaults cleanly with titleTemplate", () => {
    const merged = mergeSeoCascade({
      siteDefaults: {
        siteName: "Svelty",
        titleTemplate: "%s | Svelty",
        defaultDescription: "Site desc",
        defaultRobotsMeta: "index, follow",
      },
      collectionDefaults: {
        defaultDescription: "Blog desc",
      },
      fallbackTitle: "Launch Post",
    });

    expect(merged.effectiveData.title).toBe("Launch Post | Svelty");
    expect(merged.effectiveData.description).toBe("Blog desc");
    expect(merged.effectiveData.robotsMeta).toBe("index, follow");

    const head = buildSeoHead({
      lang: "en",
      defaultLang: "en",
      origin: "https://example.com",
      pathname: "/blog/launch",
      titleFallback: "Launch Post",
      siteDefaults: {
        siteName: "Svelty",
        titleTemplate: "%s | Svelty",
        defaultRobotsMeta: "index, follow",
      },
    });
    expect(head.title).toBe("Launch Post | Svelty");
    expect(head.robots).toBe("index, follow");
  });

  it("rolls back a staged draft to a historical revision without mutating the live entry", async () => {
    const upsertDraft = vi.fn(async (input: Record<string, unknown>) => ({
      success: true,
      data: { _id: "draft-1", version: 4, ...input },
    }));
    const adapter = {
      crud: { findMany: vi.fn(), update: vi.fn() },
      content: {
        revisions: {
          get: vi.fn(async (_id: string, version: number) => ({
            success: true,
            data: { version, data: { _id: "e1", title: "Restored v2 Title", status: "publish" } },
          })),
          getHistory: vi.fn(async () => ({ success: true, data: { items: [], total: 0 } })),
        },
        drafts: {
          getLatestForContent: vi.fn(async () => ({ success: true, data: null })),
          upsertDraft,
        },
      },
    } as unknown as IDBAdapter;

    const mockCollections = {
      getSchema: vi.fn(async () => ({ _id: "posts", name: "Posts", fields: [] })),
      assertEntryWriteAccess: vi.fn(async () => undefined),
    };

    const draftsNs = new DraftsNamespace(adapter, mockCollections as any);
    const res = await draftsNs.rollbackDraft("posts", "e1", 2, {
      user: { _id: "u1", role: "editor" },
      tenantId: "t1" as any,
    });

    expect(res.success).toBe(true);
    expect(adapter.crud.update).not.toHaveBeenCalled();
    expect(upsertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        contentId: "e1",
        collectionId: "posts",
        status: "draft",
        data: { title: "Restored v2 Title" },
      }),
      expect.anything(),
    );
  });
});

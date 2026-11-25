/**
 * @file tests/unit/security/bucket3-sandbox-access-temporal.test.ts
 * @description Tests declarative plugin capability manifests, write ACCESS_RULES,
 * and revision-based temporal reads (`asOf`).
 */

import { describe, expect, it, vi } from "vitest";
import {
  assertPluginFsAllowed,
  assertPluginNetworkAllowed,
  createScopedDbAdapter,
  readSandboxedEnv,
  validatePluginManifest,
} from "@src/plugins/sandbox";
import {
  assertCreateAccessAllowed,
  buildOperationConstraint,
  type AccessRuleConfig,
} from "@src/services/security/access-rule-service";
import { executeFindByIdAsOf } from "@src/services/sdk/namespaces/collections/revisions";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

describe("Bucket 3 security & governance", () => {
  it("validates plugin sandbox manifests and blocks protected/undeclared operations", () => {
    expect(() =>
      validatePluginManifest("rogue", {
        sandbox: { collections: { read: ["users"] } },
      }),
    ).toThrow(/protected collection/i);

    const mockAdapter = {
      crud: {
        findMany: vi.fn(async () => ({ success: true, data: [] })),
        insert: vi.fn(async () => ({ success: true, data: {} })),
        delete: vi.fn(async () => ({ success: true, data: {} })),
      },
    } as unknown as IDBAdapter;

    const { adapter } = createScopedDbAdapter(mockAdapter, "analytics", {
      capabilities: ["db:read"],
      sandbox: {
        collections: { read: ["posts"] },
        net: { allowHosts: ["api.example.com", "*.trusted.dev"] },
        fs: { readPaths: ["media/exports"] },
        env: ["ANALYTICS_KEY"],
      },
    });

    // Allowed collection read
    expect(() => adapter.crud.findMany("posts", {})).not.toThrow();
    // Blocked undeclared collection read
    expect(() => adapter.crud.findMany("orders", {})).toThrow(/denied read/i);
    // Blocked missing db:write capability
    expect(() => adapter.crud.insert("plugin_analytics_events", {})).toThrow(/without "db:write"/i);
    // Blocked protected collection even when db:read exists
    expect(() => adapter.crud.findMany("audit_logs", {})).toThrow(/protected collection/i);

    // Network host allowlist
    expect(
      assertPluginNetworkAllowed("analytics", "https://sub.trusted.dev/v1", {
        capabilities: ["network:fetch"],
        sandbox: { net: { allowHosts: ["*.trusted.dev"] } },
      }).hostname,
    ).toBe("sub.trusted.dev");
    expect(() =>
      assertPluginNetworkAllowed("analytics", "https://evil.internal/steal", {
        capabilities: ["network:fetch"],
        sandbox: { net: { allowHosts: ["*.trusted.dev"] } },
      }),
    ).toThrow(/allowHosts/i);

    // Filesystem traversal guard
    expect(() =>
      assertPluginFsAllowed("analytics", "../../etc/passwd", "read", {
        capabilities: ["file:read"],
        sandbox: { fs: { readPaths: ["media/exports"] } },
      }),
    ).toThrow(/outside sandbox roots/i);

    // Env variable allowlist
    expect(() =>
      readSandboxedEnv("analytics", "JWT_SECRET_KEY", { sandbox: { env: ["PUBLIC_ID"] } }),
    ).toThrow(/undeclared environment variable/i);
  });

  it("enforces create/update/delete operation ACCESS_RULES with 403 fail-closed on create violations", () => {
    const config: AccessRuleConfig = {
      posts: {
        editor: {
          read: { authorId: "$user._id" },
          create: { authorId: "$user._id", department: "editorial" },
          update: { authorId: "$user._id" },
          delete: { authorId: "$user._id", status: "draft" },
        },
      },
    };
    const ctx = { user: { _id: "u-editor-1", role: "editor" }, role: "editor", tenantId: "t1" };

    expect(buildOperationConstraint(config, "posts", "delete", ctx)).toEqual({
      authorId: "u-editor-1",
      status: "draft",
    });

    expect(() =>
      assertCreateAccessAllowed(
        "posts",
        { authorId: "u-editor-1", department: "editorial" },
        ctx,
        config,
      ),
    ).not.toThrow();

    expect(() =>
      assertCreateAccessAllowed(
        "posts",
        { authorId: "u-other", department: "editorial" },
        ctx,
        config,
      ),
    ).toThrow(/ACCESS_RULE|forbids/i);
  });

  it("reconstructs temporal snapshots by revision number and ISO timestamp with omit masking", async () => {
    const schema = {
      _id: "posts",
      name: "Posts",
      revision: true,
      fields: [
        {
          db_fieldName: "title",
          label: "Title",
          required: true,
          translated: false,
          widget: {} as any,
        },
        {
          db_fieldName: "internalToken",
          label: "Internal Token",
          omit: true,
          required: false,
          translated: false,
          widget: {} as any,
        },
      ],
    } as Schema;

    const historyItems = [
      {
        version: 2,
        createdAt: "2026-11-20T12:00:00.000Z",
        data: { _delta: true, changes: { title: "Title v2", internalToken: "secret-v2" } },
      },
      {
        version: 1,
        createdAt: "2026-11-10T10:00:00.000Z",
        data: { title: "Title v1", internalToken: "secret-v1" },
      },
    ];

    const adapter = {
      content: {
        revisions: {
          get: vi.fn(async (_id: string, version: number) => ({
            success: true,
            data: historyItems.find((r) => r.version === version) ?? null,
          })),
          getHistory: vi.fn(async () => ({
            success: true,
            data: { items: historyItems, total: 2 },
          })),
        },
      },
    } as unknown as IDBAdapter;

    const ctx = {
      _dbAdapter: adapter,
      schemaOf: vi.fn(async () => schema),
      getCollectionName: (id: string) => `collection_${id}`,
      findById: vi.fn(async () => ({ success: true, data: { _id: "e1", title: "Live Title" } })),
    };

    const atV1 = await executeFindByIdAsOf(ctx, "posts", "e1", "1", {
      user: { _id: "u1", role: "editor" },
    });
    expect((atV1.data as Record<string, unknown>).title).toBe("Title v1");
    expect((atV1.data as Record<string, unknown>)._revisionVersion).toBe(1);
    expect((atV1.data as Record<string, unknown>).internalToken).toBeUndefined();

    const atTimestamp = await executeFindByIdAsOf(ctx, "posts", "e1", "2026-11-21T00:00:00.000Z", {
      user: { _id: "u1", role: "editor" },
    });
    expect((atTimestamp.data as Record<string, unknown>).title).toBe("Title v2");
    expect((atTimestamp.data as Record<string, unknown>)._revisionVersion).toBe(2);
  });
});

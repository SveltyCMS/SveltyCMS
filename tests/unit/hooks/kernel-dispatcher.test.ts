/**
 * @file tests/unit/hooks/kernel-dispatcher.test.ts
 * @description Unit tests for Clean-Channel Micro-Kernel Dispatcher (Phase 3).
 *
 * Validates the 4-stage pipeline:
 * - Stage 1 (Parse Plane): Method, path, action, and cookie parsing
 * - Stage 2 (Security Plane): 64-bit Integer Bitmask authorization gate
 * - Stage 3 (Query Plane): Direct-to-Wire SQL execution plan & L1 wire cache
 * - Stage 4 (Stream Plane): Zero-copy response streaming & 304 conditional handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchKernel } from "@src/hooks/kernel-dispatcher.server";
import { setTurboAuthContext, invalidateTurboAuthContext } from "@src/hooks/handle-turbo-get";
import { responseCache, buildUserResponseCacheKey } from "@src/services/cache/response-cache";
import { dbAdapter } from "@src/databases/db";
import { PERMISSION_BITS, ADMIN_PERM_MASK } from "@src/databases/auth/permission-bitmask";
import { contentStore } from "@src/stores/content-registry.svelte";
import type { Schema } from "@src/content/types";

describe("Clean-Channel Micro-Kernel Dispatcher (Phase 3)", () => {
  const sessionId = "test-session-kernel-123";
  const userAdmin = {
    _id: "admin-1",
    email: "admin@test.com",
    role: "admin",
  } as any;

  const userEditor = {
    _id: "editor-1",
    email: "editor@test.com",
    role: "editor",
  } as any;

  const userGuest = {
    _id: "guest-1",
    email: "guest@test.com",
    role: "guest",
  } as any;

  const mockPostsSchema: Schema = {
    _id: "posts",
    name: "posts",
    fields: [
      { name: "title", type: "text" },
      { name: "content", type: "text" },
    ],
  };

  beforeEach(async () => {
    invalidateTurboAuthContext(sessionId);
    await responseCache.invalidateAll();
    contentStore.setCollections("global", [mockPostsSchema]);
  });

  describe("Stage 1: Parse Plane", () => {
    it("declines non-GET/HEAD methods", async () => {
      const result = await dispatchKernel({
        method: "POST",
        url: "/api/collections/posts/rec-1",
        origin: "http://127.0.0.1",
        headers: {},
      });
      expect(result).toBeNull();
    });

    it("declines non-collection paths", async () => {
      const result = await dispatchKernel({
        method: "GET",
        url: "/api/system/health",
        origin: "http://127.0.0.1",
        headers: {},
      });
      expect(result).toBeNull();
    });

    it("declines action segments and list routes without entryId", async () => {
      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/schema",
        origin: "http://127.0.0.1",
        headers: {},
      });
      expect(result).toBeNull();
    });

    it("declines when session cookie is absent", async () => {
      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/rec-1",
        origin: "http://127.0.0.1",
        headers: {},
      });
      expect(result).toBeNull();
    });
  });

  describe("Stage 2: Security Plane (64-Bit Integer Bitmask Gate)", () => {
    it("falls through to SvelteKit pipeline on cold session", async () => {
      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/rec-1",
        origin: "http://127.0.0.1",
        headers: { cookie: `svelty_session=${sessionId}` },
      });
      expect(result).toBeNull();
    });

    it("falls through to Domain Plane (returns null) when user lacks collection:read bitmask", async () => {
      // Guest with no collection:read bitmask (only system:read)
      const guestMask = PERMISSION_BITS["system:read"];
      setTurboAuthContext(sessionId, userGuest, [], "global", guestMask);

      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/rec-1",
        origin: "http://127.0.0.1",
        headers: { cookie: `svelty_session=${sessionId}` },
      });

      // Falls through to Domain Plane so full RBAC / FLAC / dynamic bitsets can evaluate
      expect(result).toBeNull();
    });

    it("authorizes user with 64-bit collection:read bitmask", async () => {
      // Editor with collection:read bitmask
      const editorMask = PERMISSION_BITS["collection:read"] | PERMISSION_BITS["collections:read"];
      setTurboAuthContext(sessionId, userEditor, [], "global", editorMask);

      // Seed mock wire stream on dbAdapter
      const origFindPointWireStream = dbAdapter?.crud?.findPointWireStream;
      if (dbAdapter?.crud) {
        dbAdapter.crud.findPointWireStream = vi.fn().mockResolvedValue({
          success: true,
          data: {
            wireBody: '{"success":true,"data":{"_id":"rec-1","title":"Hello Direct Wire"}}',
            etag: "etag-wire-1",
          },
        });
      }

      try {
        const result = await dispatchKernel({
          method: "GET",
          url: "/api/collections/posts/rec-1",
          origin: "http://127.0.0.1",
          headers: { cookie: `svelty_session=${sessionId}` },
        });

        expect(result).not.toBeNull();
        expect(result?.status).toBe(200);
        expect(result?.headers["x-kernel-channel"]).toBe("direct-to-wire");
        expect(result?.headers["x-cache"]).toBe("MISS");
        expect(result?.body).toContain("Hello Direct Wire");
      } finally {
        if (dbAdapter?.crud) {
          dbAdapter.crud.findPointWireStream = origFindPointWireStream;
        }
      }
    });

    it("authorizes admin user with ADMIN_PERM_MASK", async () => {
      setTurboAuthContext(sessionId, userAdmin, [], "global", ADMIN_PERM_MASK);

      const origFindPointWireStream = dbAdapter?.crud?.findPointWireStream;
      if (dbAdapter?.crud) {
        dbAdapter.crud.findPointWireStream = vi.fn().mockResolvedValue({
          success: true,
          data: {
            wireBody: '{"success":true,"data":{"_id":"rec-2","title":"Admin Wire Document"}}',
            etag: "etag-admin-2",
          },
        });
      }

      try {
        const result = await dispatchKernel({
          method: "GET",
          url: "/api/collections/posts/rec-2",
          origin: "http://127.0.0.1",
          headers: { cookie: `svelty_session=${sessionId}` },
        });

        expect(result?.status).toBe(200);
        expect(result?.body).toContain("Admin Wire Document");
      } finally {
        if (dbAdapter?.crud) {
          dbAdapter.crud.findPointWireStream = origFindPointWireStream;
        }
      }
    });

    it("falls through to Domain Plane if wire predicate rejects request (e.g. draft=true)", async () => {
      setTurboAuthContext(sessionId, userAdmin, [], "global", ADMIN_PERM_MASK);

      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/rec-2?draft=true",
        origin: "http://127.0.0.1",
        headers: { cookie: `svelty_session=${sessionId}` },
      });

      expect(result).toBeNull();
    });
  });

  describe("Stage 3 & 4: Query & Stream Plane", () => {
    it("serves L1 wire cache directly on subsequent hit (TURBO-HIT)", async () => {
      setTurboAuthContext(sessionId, userAdmin, [], "global", ADMIN_PERM_MASK);

      // Pre-seed responseCache (2-touch point-tier admission)
      const pathKey = buildUserResponseCacheKey("/api/collections/posts/rec-cached", "", "admin-1");
      const cacheEntry = {
        body: '{"success":true,"data":{"_id":"rec-cached","title":"Cached Direct Wire"}}',
        etag: "cached-etag-99",
      };
      responseCache.set(pathKey, cacheEntry, 60_000, "global");
      responseCache.set(pathKey, cacheEntry, 60_000, "global");

      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/rec-cached",
        origin: "http://127.0.0.1",
        headers: {
          cookie: `svelty_session=${sessionId}`,
          "x-tenant-id": "global",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(200);
      expect(result?.headers["x-cache"]).toBe("TURBO-HIT");
      expect(result?.headers["etag"]).toBe('"cached-etag-99"');
      expect(result?.body).toContain("Cached Direct Wire");
    });

    it("answers 304 Not Modified when If-None-Match matches ETag", async () => {
      setTurboAuthContext(sessionId, userAdmin, [], "global", ADMIN_PERM_MASK);

      const pathKey = buildUserResponseCacheKey("/api/collections/posts/rec-cached", "", "admin-1");
      responseCache.set(
        pathKey,
        {
          body: '{"success":true,"data":{"_id":"rec-cached"}}',
          etag: "etag-match-304",
        },
        60_000,
        "global",
      );

      const result = await dispatchKernel({
        method: "GET",
        url: "/api/collections/posts/rec-cached",
        origin: "http://127.0.0.1",
        headers: {
          cookie: `svelty_session=${sessionId}`,
          "if-none-match": "etag-match-304",
          "x-tenant-id": "global",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe(304);
      expect(result?.body).toBe("");
    });
  });
});

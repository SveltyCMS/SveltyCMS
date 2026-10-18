/**
 * @file tests/unit/hooks/local-context.test.ts
 * @description Tests for handleLocalContext middleware.
 *
 * Exercises the consolidated LocalCMS binding + content-system initialization hook:
 * - static / health short-circuits
 * - LocalCMS.getLocals binding (with and without a dbAdapter, and the error path)
 * - setup-state early return and the media route-spec skip
 * - DB re-init when disconnected
 * - tenant content initialization (single-flight ensureContentInitialized)
 * - auth redirects for fresh installs (root, empty collections, admin vs non-admin)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEvent, createAdminEvent, mockResolve } from "./test-utils";

const dbControl = vi.hoisted(() => ({
  dbAdapter: { marker: "adapter" } as unknown,
  getDbInitPromise: vi.fn(async () => {}),
  isDbConnected: vi.fn(() => true),
}));

const sdkControl = vi.hoisted(() => ({
  getLocals: vi.fn((_adapter: unknown, _locals: unknown) => ({ __mockCms: true })),
}));

const contentControl = vi.hoisted(() => ({
  isInitializedForTenant: vi.fn(() => true),
  getCollections: vi.fn((): unknown[] => []),
  initialize: vi.fn(async () => {}),
  ensureContentInitialized: vi.fn(async () => {}),
  getFirstCollectionRedirectUrl: vi.fn(async (): Promise<string | null> => null),
}));

vi.mock("@src/databases/db", () => ({
  // Live getter so tests can swap dbAdapter to a falsy value without the mock
  // factory capturing a stale reference at first import.
  get dbAdapter() {
    return dbControl.dbAdapter;
  },
  getDbInitPromise: dbControl.getDbInitPromise,
  isDbConnected: dbControl.isDbConnected,
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: { getLocals: sdkControl.getLocals },
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    isInitializedForTenant: contentControl.isInitializedForTenant,
    getCollections: contentControl.getCollections,
    initialize: contentControl.initialize,
    getFirstCollectionRedirectUrl: contentControl.getFirstCollectionRedirectUrl,
  },
  ensureContentInitialized: contentControl.ensureContentInitialized,
}));

import { handleLocalContext } from "@src/hooks/handle-local-context";

describe("handleLocalContext", () => {
  beforeEach(() => {
    mockResolve.mockClear();
    dbControl.dbAdapter = { marker: "adapter" };
    dbControl.getDbInitPromise.mockReset().mockResolvedValue(undefined);
    dbControl.isDbConnected.mockReset().mockReturnValue(true);
    sdkControl.getLocals.mockReset().mockImplementation(() => ({ __mockCms: true }));
    contentControl.isInitializedForTenant.mockReset().mockReturnValue(true);
    contentControl.getCollections.mockReset().mockReturnValue([]);
    contentControl.initialize.mockReset().mockResolvedValue(undefined);
    contentControl.ensureContentInitialized.mockReset().mockResolvedValue(undefined);
    contentControl.getFirstCollectionRedirectUrl.mockReset().mockResolvedValue(null);
  });

  describe("short-circuits", () => {
    it("resolves static assets immediately", async () => {
      const event = createMockEvent("/_app/immutable/chunks/index.js");
      (event.locals as any).__flags = {
        isStatic: true,
        isApi: false,
        isBootstrap: false,
        isPublic: false,
        isTestMode: true,
      };

      await handleLocalContext({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
      expect(sdkControl.getLocals).not.toHaveBeenCalled();
      expect(contentControl.isInitializedForTenant).not.toHaveBeenCalled();
    });

    it.each(["/api/system/health", "/health"])(
      "resolves health check %s immediately",
      async (pathname) => {
        const event = createMockEvent(pathname);

        await handleLocalContext({ event, resolve: mockResolve });

        expect(mockResolve).toHaveBeenCalledWith(event);
        expect(contentControl.isInitializedForTenant).not.toHaveBeenCalled();
      },
    );
  });

  describe("LocalCMS binding", () => {
    it("binds locals.cms through LocalCMS.getLocals when a dbAdapter exists", async () => {
      const event = createMockEvent("/dashboard");
      delete (event.locals as any).cms;
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(sdkControl.getLocals).toHaveBeenCalledTimes(1);
      expect(sdkControl.getLocals.mock.calls[0][0]).toBe(dbControl.dbAdapter);
      expect(event.locals.cms).toEqual({ __mockCms: true });
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("waits for the DB init promise but leaves cms unbound when no adapter resolves", async () => {
      dbControl.dbAdapter = null;
      const event = createMockEvent("/dashboard");
      delete (event.locals as any).cms;
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(dbControl.getDbInitPromise).toHaveBeenCalled();
      expect(sdkControl.getLocals).not.toHaveBeenCalled();
      expect(event.locals.cms).toBeUndefined();
    });

    it("binds locals.cms once the adapter becomes available after DB init", async () => {
      dbControl.dbAdapter = null;
      dbControl.getDbInitPromise.mockImplementation(async () => {
        dbControl.dbAdapter = { marker: "adapter" };
      });
      const event = createMockEvent("/dashboard");
      delete (event.locals as any).cms;
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(dbControl.getDbInitPromise).toHaveBeenCalled();
      expect(sdkControl.getLocals).toHaveBeenCalledTimes(1);
      expect(event.locals.cms).toEqual({ __mockCms: true });
    });

    it("records a dbInitializationError for non-API routes when binding throws", async () => {
      sdkControl.getLocals.mockImplementation(() => {
        throw new Error("boot exploded");
      });
      const event = createMockEvent("/dashboard");
      delete (event.locals as any).cms;
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect((event.locals as any).dbInitializationError).toBe("boot exploded");
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("records a dbInitializationError via String(error) when the error has no message", async () => {
      sdkControl.getLocals.mockImplementation(() => {
        throw "raw failure";
      });
      const event = createMockEvent("/dashboard");
      delete (event.locals as any).cms;
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect((event.locals as any).dbInitializationError).toBe("raw failure");
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("returns a 503 JSON envelope for API routes when binding throws", async () => {
      sdkControl.getLocals.mockImplementation(() => {
        throw new Error("boot exploded");
      });
      const event = createMockEvent("/api/collections");
      delete (event.locals as any).cms;

      const response = await handleLocalContext({ event, resolve: mockResolve });

      expect(response.status).toBe(503);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      const body = (await response.json()) as { success: boolean; message: string };
      expect(body.success).toBe(false);
      expect(body.message).toBe("Database adapter unavailable");
      expect(mockResolve).not.toHaveBeenCalled();
    });
  });

  describe("content-system gating", () => {
    it("returns early before content init when setup is incomplete", async () => {
      const event = createMockEvent("/dashboard");
      (event.locals as any).__setupState = "MISSING_CONFIG";

      await handleLocalContext({ event, resolve: mockResolve });

      expect((event.locals as any).__setupConfigExists).toBe(false);
      expect(contentControl.isInitializedForTenant).not.toHaveBeenCalled();
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("skips content + media tenant init on the media skip lane", async () => {
      const event = createMockEvent("/dashboard");
      (event.locals as any).__setupState = "COMPLETE";
      (event.locals as any).routeSpec = { skipMiddlewares: ["media"] };

      await handleLocalContext({ event, resolve: mockResolve });

      expect(contentControl.isInitializedForTenant).not.toHaveBeenCalled();
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("re-inits the core DB when isDbConnected reports false", async () => {
      dbControl.isDbConnected.mockReturnValue(false);
      const event = createMockEvent("/dashboard");
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(dbControl.getDbInitPromise).toHaveBeenCalledWith(false, "CORE");
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("initializes the content system for a tenant on an authenticated content route", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(false);
      const event = createAdminEvent("/api/collections");
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(contentControl.ensureContentInitialized).toHaveBeenCalledWith(
        event.locals.tenantId,
        false,
      );
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("reads setup state from getSetupState() when __setupState is absent", async () => {
      const event = createMockEvent("/dashboard");

      await handleLocalContext({ event, resolve: mockResolve });

      // No __setupState means the hook fell back to getSetupState() (COMPLETE).
      expect((event.locals as any).__setupConfigExists).toBe(true);
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("logs a tenant init crash and still resolves when ensureContentInitialized rejects", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(false);
      contentControl.ensureContentInitialized.mockRejectedValue(new Error("tenant init crash"));
      const event = createAdminEvent("/api/collections");
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      // The .catch swallows the rejection so the request still completes.
      expect(mockResolve).toHaveBeenCalledWith(event);
    });
  });

  describe("auth redirects for fresh installs", () => {
    it("redirects the root to the first collection URL when collections exist", async () => {
      contentControl.getCollections.mockReturnValue([{ _id: "col1", name: "posts" }]);
      contentControl.getFirstCollectionRedirectUrl.mockResolvedValue("/collections/posts");
      const event = createAdminEvent("/");
      (event.locals as any).__setupState = "COMPLETE";

      await expect(handleLocalContext({ event, resolve: mockResolve })).rejects.toMatchObject({
        status: 302,
        location: "/collections/posts",
      });
      expect(contentControl.getFirstCollectionRedirectUrl).toHaveBeenCalledWith(
        "en",
        event.locals.tenantId,
      );
    });

    it("redirects an admin with no collections to the collection builder", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(false);
      contentControl.getCollections.mockReturnValue([]);
      const event = createAdminEvent("/some-page");
      (event.locals as any).__setupState = "COMPLETE";

      await expect(handleLocalContext({ event, resolve: mockResolve })).rejects.toMatchObject({
        status: 302,
        location: "/config/collectionbuilder",
      });
      // The tenant-init flight was already in flight, so the redirect block
      // reuses it instead of spawning contentSystem.initialize again.
      expect(contentControl.ensureContentInitialized).toHaveBeenCalledWith(
        event.locals.tenantId,
        false,
      );
      expect(contentControl.initialize).not.toHaveBeenCalled();
    });

    it("redirects a non-admin with no collections to their profile", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(true);
      contentControl.getCollections.mockReturnValue([]);
      const event = createMockEvent("/some-page", {
        user: { _id: "u1", email: "editor@test.com", role: "editor", isAdmin: false, roles: [] },
      });
      (event.locals as any).__setupState = "COMPLETE";

      await expect(handleLocalContext({ event, resolve: mockResolve })).rejects.toMatchObject({
        status: 302,
        location: "/user/profile",
      });
    });

    it("spawns contentSystem.initialize under the global flight key when the tenant is missing", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(false);
      contentControl.getCollections.mockReturnValue([]);
      const event = createAdminEvent("/some-page");
      event.locals.tenantId = null;
      (event.locals as any).__setupState = "COMPLETE";

      await expect(handleLocalContext({ event, resolve: mockResolve })).rejects.toMatchObject({
        status: 302,
        location: "/config/collectionbuilder",
      });
      expect(contentControl.initialize).toHaveBeenCalledWith(null, false);
    });

    it("resolves the root without redirecting when no collections exist", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(true);
      contentControl.getCollections.mockReturnValue([]);
      const event = createAdminEvent("/");
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(contentControl.getFirstCollectionRedirectUrl).not.toHaveBeenCalled();
      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("resolves the root when the first collection redirect URL is null", async () => {
      contentControl.getCollections.mockReturnValue([{ _id: "col1", name: "posts" }]);
      contentControl.getFirstCollectionRedirectUrl.mockResolvedValue(null);
      const event = createAdminEvent("/");
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
    });

    it("resolves a non-whitelisted page when collections already exist", async () => {
      contentControl.isInitializedForTenant.mockReturnValue(true);
      contentControl.getCollections.mockReturnValue([{ _id: "col1", name: "posts" }]);
      const event = createAdminEvent("/some-page");
      (event.locals as any).__setupState = "COMPLETE";

      await handleLocalContext({ event, resolve: mockResolve });

      expect(mockResolve).toHaveBeenCalledWith(event);
    });
  });
});

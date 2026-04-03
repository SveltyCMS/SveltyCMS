/**
 * @file tests/unit/api/media-security.test.ts
 * @description Unit tests for Media API security hardening (Tenant Isolation & IDOR protection).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

// Define the mock service object first
const mockMediaService = {
  ensureInitialized: vi.fn(),
  getMedia: vi.fn(),
  updateMedia: vi.fn(),
  deleteMedia: vi.fn(),
  saveMedia: vi.fn(),
  manipulateMedia: vi.fn(),
  batchProcessImages: vi.fn(),
};

// Mock dependencies
vi.mock("@utils/api-handler", () => ({
  apiHandler: (fn: any) => fn,
}));

// Mock @src/databases/db to avoid $app/environment issues
vi.mock("@src/databases/db", () => {
  const mockDbAdapter = {
    auth: {
      getUserByEmail: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      getAllUsers: vi.fn(),
      updateRoles: vi.fn(),
      getAllRoles: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
      getAllTokens: vi.fn(),
      createToken: vi.fn(),
      deleteTokens: vi.fn(),
      blockTokens: vi.fn(),
      unblockTokens: vi.fn(),
    },
    collections: {
      listSchemas: vi.fn(),
      getModel: vi.fn(),
    },
    media: {
      files: {
        getByFolder: vi.fn(),
        upload: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
    widgets: {
      getActiveWidgets: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
    },
    system: {
      widgets: {
        getActiveWidgets: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
      },
      preferences: {
        getMany: vi.fn(),
        set: vi.fn(),
      },
    },
    crud: {
      findMany: vi.fn(),
      findOne: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
  };
  return {
    dbAdapter: mockDbAdapter,
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getAuth: vi.fn(),
  };
});

// Mock MediaService to return the mock object
vi.mock("@src/utils/media/media-service.server", () => {
  return {
    MediaService: vi.fn().mockImplementation(function (this: any) {
      return mockMediaService;
    }),
  };
});

// Import dispatcher instead of handlers
import { _handler as dispatcher } from "@src/routes/api/[...path]/+server";

import { dbAdapter } from "@src/databases/db";

const mediaIdHandler = {
  GET: (event: any) => {
    const id = event.params?.id || "media-1";
    event.params = { path: `media/${id}` };
    event.url = new URL(`http://localhost/api/media/${id}`);
    event.request = event.request || { method: "GET" };
    event.request.method = "GET";
    event.locals = { ...event.locals, dbAdapter };
    event.cookies = event.cookies || {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    };
    return dispatcher(event);
  },
  PATCH: (event: any) => {
    const id = event.params?.id || "media-1";
    event.params = { path: `media/${id}` };
    event.url = new URL(`http://localhost/api/media/${id}`);
    event.request = event.request || { method: "PATCH" };
    event.request.method = "PATCH";
    event.locals = { ...event.locals, dbAdapter };
    event.cookies = event.cookies || {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    };
    return dispatcher(event);
  },
};

const mediaDeleteHandler = {
  DELETE: (event: any) => {
    const id = event.params?.id || "media-1";
    event.params = { path: `media/${id}` };
    event.url = new URL(`http://localhost/api/media/${id}`);
    event.request = event.request || { method: "DELETE" };
    event.request.method = "DELETE";
    event.locals = { ...event.locals, dbAdapter };
    event.cookies = event.cookies || {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    };
    return dispatcher(event);
  },
};

const mediaProcessHandler = {
  POST: (event: any) => {
    event.params = { path: "media/process" };
    event.url = new URL("http://localhost/api/media/process");
    event.request = event.request || { method: "POST" };
    event.request.method = "POST";
    event.locals = { ...event.locals, dbAdapter };
    event.cookies = event.cookies || {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    };
    return dispatcher(event);
  },
};

describe("Media API Security Unit Tests", () => {
  const user = { _id: "user-1", email: "test@example.com", role: "admin-id" };
  const roles = [{ _id: "admin-id", name: "Administrator", isAdmin: true, permissions: [] }];
  const tenantId = "tenant-A";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/media/[id]", () => {
    it("should enforce tenant isolation when finding the media item", async () => {
      (dbAdapter!.crud.findOne as any).mockResolvedValue({
        success: true,
        data: { _id: "media-1", tenantId },
      });

      const event = {
        params: { id: "media-1" },
        locals: { user, roles, tenantId },
      } as unknown as RequestEvent;

      await mediaIdHandler.GET(event as any);

      expect(dbAdapter!.crud.findOne).toHaveBeenCalledWith(
        "media",
        expect.objectContaining({ _id: "media-1" }),
        expect.objectContaining({ tenantId }),
      );
    });
  });

  describe("PATCH /api/media/[id]", () => {
    it("should propagate tenantId to MediaService.updateMedia", async () => {
      const event = {
        params: { id: "media-1" },
        locals: { user, roles, tenantId },
        request: {
          method: "PATCH",
          json: vi.fn().mockResolvedValue({ metadata: { alt: "new alt" } }),
        },
      } as unknown as RequestEvent;

      await mediaIdHandler.PATCH(event as any);

      expect(mockMediaService.updateMedia).toHaveBeenCalledWith(
        "media-1",
        expect.objectContaining({ metadata: { alt: "new alt" } }),
        tenantId,
      );
    });
  });

  describe("DELETE /api/media/[id]", () => {
    it("should enforce tenant isolation when deleting the media item", async () => {
      const event = {
        params: { id: "media-1" },
        locals: { user, roles, tenantId },
        request: {
          method: "DELETE",
        },
      } as unknown as RequestEvent;

      await mediaDeleteHandler.DELETE(event as any);

      expect(mockMediaService.deleteMedia).toHaveBeenCalledWith("media-1", tenantId);
    });
  });

  describe("POST /api/media/process (batch)", () => {
    it("should propagate tenantId to MediaService.batchProcessImages", async () => {
      const formData = new FormData();
      formData.append("processType", "batch");
      formData.append("mediaIds", JSON.stringify(["m1", "m2"]));
      formData.append("options", JSON.stringify({ filters: { grayscale: 100 } }));

      const event = {
        locals: { user, roles, tenantId },
        request: {
          formData: vi.fn().mockResolvedValue(formData),
        },
      } as unknown as RequestEvent;

      await mediaProcessHandler.POST(event as any);

      expect(mockMediaService.batchProcessImages).toHaveBeenCalledWith(
        ["m1", "m2"],
        expect.objectContaining({ filters: { grayscale: 100 } }),
        user._id,
        tenantId,
      );
    });
  });

  describe("POST /api/media/process (save)", () => {
    it("should propagate tenantId to MediaService.saveMedia", async () => {
      const formData = new FormData();
      formData.append("processType", "save");
      formData.append("files", new File([""], "test.jpg", { type: "image/jpeg" }));

      const event = {
        locals: { user, roles, tenantId },
        request: {
          formData: vi.fn().mockResolvedValue(formData),
        },
      } as unknown as RequestEvent;

      await mediaProcessHandler.POST(event as any);

      expect(mockMediaService.saveMedia).toHaveBeenCalledWith(
        expect.any(File),
        user._id,
        "private",
        tenantId,
        "global",
        undefined,
      );
    });
  });
});

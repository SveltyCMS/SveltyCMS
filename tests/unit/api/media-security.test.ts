/**
 * @file tests/unit/api/media-security.test.ts
 * @description Unit tests for Media API security hardening (Tenant Isolation & IDOR protection).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { createMockSuperAdmin } from "../utils/mock-factories";

// Define the mock service object first
const mockMediaService = {
  ensureInitialized: vi.fn(),
  getMedia: vi.fn(),
  updateMedia: vi.fn(),
  patchMetadata: vi.fn().mockResolvedValue(undefined),
  deleteMedia: vi.fn(),
  saveMedia: vi.fn().mockResolvedValue({
    success: true,
    data: { _id: "m1", path: "test.jpg" },
  }),
  manipulateMedia: vi.fn(),
  batchProcessImages: vi.fn(),
  getPublishedReferences: vi.fn().mockResolvedValue([]),
  getMediaReferences: vi.fn().mockResolvedValue([]),
  enrichMediaWithUrl: vi.fn((m) => ({
    ...m,
    url: `http://localhost/files/${m.path}`,
  })),
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
    collection: {
      getModel: vi.fn(),
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
    getDb: vi.fn().mockReturnValue(mockDbAdapter),
    isDbConnected: vi.fn().mockReturnValue(true),
    getDbInitPromise: vi.fn().mockResolvedValue(undefined),
    getAuth: vi.fn(),
    getPrivateEnv: vi.fn().mockReturnValue({}),
  };
});

// Mock MediaService to return the mock object
vi.mock("@src/utils/media/media-service.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/utils/media/media-service.server")>();
  return {
    ...actual,
    MediaService: vi.fn().mockImplementation(function (this: any) {
      return mockMediaService;
    }),
  };
});

// Import dispatcher instead of handlers
import {
  GET as dispatcherGET,
  POST as dispatcherPOST,
  PATCH as dispatcherPATCH,
  DELETE as dispatcherDELETE,
} from "@src/routes/api/[...path]/+server";
// Removed non-existent mediaService import

import { dbAdapter } from "@src/databases/db";

import { createMockRequestEvent } from "../utils/mock-event";

const mediaIdHandler = {
  GET: (event: any) => {
    const id = event.params?.id || "media-1";
    const mockEvent = {
      ...createMockRequestEvent({
        method: "GET",
        url: `http://localhost/api/media/${id}`,
        user: event.locals?.user,
        tenantId: event.locals?.tenantId,
        roles: event.locals?.roles,
        dbAdapter: event.locals?.dbAdapter || dbAdapter,
      }),
      params: { path: `media/${id}` },
    };
    return dispatcherGET(mockEvent as any);
  },
  PATCH: async (event: any) => {
    const id = event.params?.id || "media-1";
    const mockEvent = {
      ...createMockRequestEvent({
        method: "PATCH",
        url: `http://localhost/api/media/${id}`,
        user: event.locals?.user,
        tenantId: event.locals?.tenantId,
        roles: event.locals?.roles,
        dbAdapter: event.locals?.dbAdapter || dbAdapter,
        body: event.request?.json ? await event.request.json() : {},
      }),
      params: { path: `media/${id}` },
    };
    return dispatcherPATCH(mockEvent as any);
  },
};

const mediaDeleteHandler = {
  DELETE: (event: any) => {
    const id = event.params?.id || "media-1";
    const mockEvent = {
      ...createMockRequestEvent({
        method: "DELETE",
        url: `http://localhost/api/media/${id}`,
        user: event.locals?.user,
        tenantId: event.locals?.tenantId,
        roles: event.locals?.roles,
        dbAdapter: event.locals?.dbAdapter || dbAdapter,
      }),
      params: { path: `media/${id}` },
    };
    return dispatcherDELETE(mockEvent as any);
  },
};

const mediaShareHandler = {
  POST: (event: any) => {
    const mockEvent = {
      ...createMockRequestEvent({
        method: "POST",
        url: "http://localhost/api/media/share/media-1",
        user: event.locals?.user,
        tenantId: event.locals?.tenantId,
        roles: event.locals?.roles,
        dbAdapter: event.locals?.dbAdapter || dbAdapter,
        body: { expiryHours: 24 },
      }),
      params: { path: "media/share/media-1" },
    };
    return dispatcherPOST(mockEvent as any);
  },
};

const mediaProcessHandler = {
  POST: (event: any) => {
    const mockEvent = {
      ...createMockRequestEvent({
        method: "POST",
        url: "http://localhost/api/media/process",
        user: event.locals?.user,
        tenantId: event.locals?.tenantId,
        roles: event.locals?.roles,
        dbAdapter: event.locals?.dbAdapter || dbAdapter,
        headers: { "content-type": "multipart/form-data" },
      }),
      params: { path: "media/process" },
    };
    // FormData needs to be handled specially if passed as override
    if (event.request?.formData) {
      (mockEvent as any).request.formData = event.request.formData;
    }
    return dispatcherPOST(mockEvent as any);
  },
};

describe("Media API Security Unit Tests", () => {
  const user = createMockSuperAdmin({ _id: "user-1" });
  const roles = [{ _id: "admin", name: "Administrator", isAdmin: true, permissions: [] }];
  const tenantId = "tenant-A";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/media/share/:id", () => {
    it("denies share-link creation to a read-only user (403 FORBIDDEN)", async () => {
      // media:read passes the dispatcher gate, but creating a share link is a
      // write-class action (anonymous download exposure) and must be denied.
      const readOnlyUser = {
        _id: "user-ro",
        email: "ro@test.com",
        role: "editor",
        isAdmin: false,
        permissions: ["media:read"],
        tenantId,
      };
      const editorRoles = [
        { _id: "editor", name: "Editor", isAdmin: false, permissions: ["media:read"] },
      ];

      const response = mediaShareHandler.POST({
        locals: { user: readOnlyUser, roles: editorRoles, tenantId, isAdmin: false },
      });
      await expect(response).rejects.toThrow("Insufficient permissions for share-link creation");
    });

    it("allows share-link creation for admins", async () => {
      // Stateful stub: creation patches `metadata.sharedLinks` and then verifies
      // the read-back, so the fake store must actually keep the patch.
      const metadata: Record<string, unknown> = {};
      (dbAdapter!.crud.findOne as any).mockResolvedValue({
        success: true,
        data: { _id: "media-1", tenantId, metadata },
      });
      mockMediaService.patchMetadata.mockImplementation(
        async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(metadata, patch);
        },
      );

      const response = await mediaShareHandler.POST({
        locals: { user, roles, tenantId, isAdmin: true },
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as { data?: { token?: string } };
      expect(body.data?.token).toBeTruthy();
      expect(metadata.sharedLinks).toHaveLength(1);
    });
  });

  describe("DELETE /api/media/share/:id/:token", () => {
    it("persists the revoked state returned by the immutable helper", async () => {
      const metadata: Record<string, unknown> = {
        sharedLinks: [{ token: "tok-1", active: true, expiresAt: "2099-01-01T00:00:00.000Z" }],
      };
      (dbAdapter!.crud.findOne as any).mockResolvedValue({
        success: true,
        data: { _id: "media-r1", tenantId, metadata },
      });
      mockMediaService.patchMetadata.mockImplementation(
        async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(metadata, patch);
        },
      );

      const event = {
        ...createMockRequestEvent({
          method: "DELETE",
          url: "http://localhost/api/media/share/media-r1/tok-1",
          user,
          tenantId,
          roles,
          dbAdapter,
        }),
        params: { path: "media/share/media-r1/tok-1" },
      };

      const response = await dispatcherDELETE(event as any);
      expect(response.status).toBe(200);
      expect((metadata.sharedLinks as Array<{ active: boolean }>)[0].active).toBe(false);
    });
  });

  describe("PATCH /api/media/share/:id/:token", () => {
    it("persists the extended expiry instead of the discarded helper return", async () => {
      const metadata: Record<string, unknown> = {
        sharedLinks: [{ token: "tok-1", active: true, expiresAt: "2099-01-01T00:00:00.000Z" }],
      };
      (dbAdapter!.crud.findOne as any).mockResolvedValue({
        success: true,
        data: { _id: "media-e1", tenantId, metadata },
      });
      mockMediaService.patchMetadata.mockImplementation(
        async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(metadata, patch);
        },
      );

      const event = {
        ...createMockRequestEvent({
          method: "PATCH",
          url: "http://localhost/api/media/share/media-e1/tok-1",
          user,
          tenantId,
          roles,
          dbAdapter,
          body: { expiryHours: 2 },
        }),
        params: { path: "media/share/media-e1/tok-1" },
      };

      const response = await dispatcherPATCH(event as any);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data?: { expiresAt?: string } };
      expect(body.data?.expiresAt).toBe("2099-01-01T02:00:00.000Z");
    });
  });

  describe("GET /api/media/[id]", () => {
    it("should enforce tenant isolation when finding the media item", async () => {
      // A distinct id avoids the request-cache entry the share-link test warms.
      (dbAdapter!.crud.findOne as any).mockResolvedValue({
        success: true,
        data: { _id: "media-2", tenantId },
      });

      const event = {
        params: { id: "media-2" },
        locals: { user, roles, tenantId },
      } as unknown as RequestEvent;

      await mediaIdHandler.GET(event as any);

      expect(dbAdapter!.crud.findOne).toHaveBeenCalledWith(
        "media",
        expect.objectContaining({ _id: "media-2" }),
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

    it("strips tenant and managed columns before the adapter (mass assignment)", async () => {
      const event = {
        params: { id: "media-1" },
        locals: { user, roles, tenantId },
        request: {
          method: "PATCH",
          json: vi.fn().mockResolvedValue({
            tenantId: "tenant-B",
            _id: "forged-id",
            uploadedBy: "attacker",
            createdBy: "attacker",
            createdAt: "2000-01-01T00:00:00.000Z",
            updatedAt: "2000-01-01T00:00:00.000Z",
            storagePath: "/etc/passwd",
            url: "https://evil.example/x.jpg",
            size: 1,
            mimeType: "text/html",
            hash: "forged",
            isDeleted: true,
            path: "../../etc/passwd",
            bucket: "other-bucket",
            provider: "s3",
            alt: "A",
            caption: "C",
            tags: ["t1"],
            metadata: { alt: "nested alt", caption: "nested caption", tags: ["t2"] },
          }),
        },
      } as unknown as RequestEvent;

      await mediaIdHandler.PATCH(event as any);

      expect(mockMediaService.updateMedia).toHaveBeenCalledTimes(1);
      const [, payload, scopedTenant] = mockMediaService.updateMedia.mock.calls[0];
      expect(scopedTenant).toBe(tenantId);
      expect(payload).toEqual({
        alt: "A",
        caption: "C",
        tags: ["t1"],
        metadata: { alt: "nested alt", caption: "nested caption", tags: ["t2"] },
      });
      for (const managed of [
        "tenantId",
        "_id",
        "uploadedBy",
        "createdBy",
        "createdAt",
        "updatedAt",
        "storagePath",
        "url",
        "size",
        "mimeType",
        "hash",
        "isDeleted",
        "path",
        "bucket",
        "provider",
      ]) {
        expect(payload).not.toHaveProperty(managed);
      }
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

    it("rejects >100 ids before any per-item work (400 INVALID_BATCH_SIZE)", async () => {
      const oversize = Array.from({ length: 101 }, (_, i) => `m${i}`);
      const formData = new FormData();
      formData.append("processType", "batch");
      formData.append("mediaIds", JSON.stringify(oversize));

      const event = {
        locals: { user, roles, tenantId },
        request: {
          formData: vi.fn().mockResolvedValue(formData),
        },
      } as unknown as RequestEvent;

      await expect(mediaProcessHandler.POST(event as any)).rejects.toMatchObject({
        status: 400,
        code: "INVALID_BATCH_SIZE",
        message: "Batch size exceeds maximum limit of 100",
      });
      // The cap must short-circuit the serial manipulateMedia() loop downstream.
      expect(mockMediaService.batchProcessImages).not.toHaveBeenCalled();
    });

    it("accepts exactly the 100-id ceiling", async () => {
      const atLimit = Array.from({ length: 100 }, (_, i) => `m${i}`);
      const formData = new FormData();
      formData.append("processType", "batch");
      formData.append("mediaIds", JSON.stringify(atLimit));

      const event = {
        locals: { user, roles, tenantId },
        request: {
          formData: vi.fn().mockResolvedValue(formData),
        },
      } as unknown as RequestEvent;

      await mediaProcessHandler.POST(event as any);

      expect(mockMediaService.batchProcessImages).toHaveBeenCalledWith(
        atLimit,
        expect.any(Object),
        user._id,
        tenantId,
      );
    });

    it("rejects a non-array mediaIds payload", async () => {
      const formData = new FormData();
      formData.append("processType", "batch");
      formData.append("mediaIds", JSON.stringify({ ids: ["m1"] }));

      const event = {
        locals: { user, roles, tenantId },
        request: {
          formData: vi.fn().mockResolvedValue(formData),
        },
      } as unknown as RequestEvent;

      await expect(mediaProcessHandler.POST(event as any)).rejects.toMatchObject({
        status: 400,
        code: "INVALID_BATCH_IDS",
      });
      expect(mockMediaService.batchProcessImages).not.toHaveBeenCalled();
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
        null,
        false,
      );
    });
  });
});

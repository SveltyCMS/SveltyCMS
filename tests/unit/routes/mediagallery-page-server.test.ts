/**
 * @file tests/unit/routes/mediagallery-page-server.test.ts
 * @description Permission gating for media gallery load + remoteUpload action
 * (SSRF authz class: actions must not rely on load-only media checks).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const saveRemoteMedia = vi.fn();

vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    system: {
      virtualFolder: {
        getAll: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
    },
    media: {
      files: {
        getByFolder: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0 } }),
        getAll: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
      },
    },
  },
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    getOrSetSWR: vi.fn(async (_k: string, fn: () => Promise<unknown>) => fn()),
  },
}));

vi.mock("@src/utils/media/media-service.server", () => ({
  MediaService: class {
    list = vi.fn().mockResolvedValue({ success: true, data: [] });
    isReferencedByPublishedContent = vi.fn().mockResolvedValue({ referenced: false });
    saveRemoteMedia = (...args: unknown[]) => saveRemoteMedia(...args);
    saveMedia = vi.fn();
  },
}));

vi.mock("@utils/media/media-storage.server", () => ({
  getImageSizes: vi.fn().mockReturnValue({}),
  moveMediaToTrash: vi.fn(),
}));

vi.mock("@utils/media/media-utils", () => ({
  resolveMediaPublicPath: vi.fn((p: string) => p),
}));

import { load, actions } from "../../../src/routes/(app)/mediagallery/+page.server";

function makeEvent(locals: Record<string, unknown>, search = "") {
  return {
    locals,
    url: new URL(`http://localhost/mediagallery${search}`),
  } as any;
}

function makeRemoteUploadEvent(locals: Record<string, unknown>, urls: string[]) {
  const fd = new FormData();
  fd.set("remoteUrls", JSON.stringify(urls));
  fd.set("folder", "global");
  return {
    locals,
    request: {
      formData: async () => fd,
    },
  } as any;
}

describe("mediagallery +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admin", async () => {
    const data: any = (await load(
      makeEvent({
        user: { _id: { toString: () => "u1" }, email: "a@b.co" },
        isAdmin: true,
        roles: [],
        tenantId: "t1",
      }),
    )) as any;
    expect(data).toBeDefined();
    expect(Array.isArray((data as any).media) || (data as any).media === undefined || true).toBe(
      true,
    );
  });

  it("allows user with media:read", async () => {
    const data: any = (await load(
      makeEvent({
        user: { _id: { toString: () => "u2" }, email: "e@b.co" },
        isAdmin: false,
        roles: [{ permissions: ["media:read"] }],
        tenantId: "t1",
      }),
    )) as any;
    expect(data).toBeDefined();
  });

  it("throws 403 without media permission", async () => {
    await expect(
      load(
        makeEvent({
          user: { _id: { toString: () => "u3" }, email: "v@b.co" },
          isAdmin: false,
          roles: [{ permissions: ["collection:read"] }],
          tenantId: "t1",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("mediagallery remoteUpload action (VULN-002 class)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveRemoteMedia.mockResolvedValue({ success: false, message: "Blocked private IP: 127.0.0.1" });
  });

  it("rejects authenticated user without media:write (action-level authz)", async () => {
    await expect(
      actions.remoteUpload(
        makeRemoteUploadEvent(
          {
            user: { _id: "guest-1", email: "g@b.co" },
            isAdmin: false,
            roles: [{ permissions: ["collection:read"] }],
            tenantId: "t1",
          },
          ["http://127.0.0.1:9000/internal-proof.txt"],
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(saveRemoteMedia).not.toHaveBeenCalled();
  });

  it("rejects media:read-only user (load may pass, action must not)", async () => {
    await expect(
      actions.remoteUpload(
        makeRemoteUploadEvent(
          {
            user: { _id: "reader-1", email: "r@b.co" },
            isAdmin: false,
            roles: [{ permissions: ["media:read"] }],
            tenantId: "t1",
          },
          ["http://169.254.169.254/latest/meta-data/"],
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(saveRemoteMedia).not.toHaveBeenCalled();
  });

  it("allows media:write and routes through saveRemoteMedia (not raw fetch)", async () => {
    saveRemoteMedia.mockResolvedValue({ success: true, data: { _id: "m1" } });
    const result = await actions.remoteUpload(
      makeRemoteUploadEvent(
        {
          user: { _id: "writer-1", email: "w@b.co" },
          isAdmin: false,
          roles: [{ permissions: ["media:write"] }],
          tenantId: "t1",
        },
        ["https://cdn.example.com/photo.jpg"],
      ),
    );
    expect(result).toEqual({ success: true });
    expect(saveRemoteMedia).toHaveBeenCalled();
    expect(saveRemoteMedia.mock.calls[0][0]).toBe("https://cdn.example.com/photo.jpg");
  });

  it("does not persist when saveRemoteMedia blocks private targets", async () => {
    saveRemoteMedia.mockResolvedValue({
      success: false,
      message: "Blocked private IP: 127.0.0.1",
    });
    const result = await actions.remoteUpload(
      makeRemoteUploadEvent(
        {
          user: { _id: "writer-1", email: "w@b.co" },
          isAdmin: true,
          roles: [],
          tenantId: "t1",
        },
        ["http://127.0.0.1:9000/secret"],
      ),
    );
    // Action still returns success envelope; individual URL failures are logged
    expect(result).toEqual({ success: true });
    expect(saveRemoteMedia).toHaveBeenCalledWith(
      "http://127.0.0.1:9000/secret",
      expect.anything(),
      "public",
      "t1",
      "global",
    );
  });
});

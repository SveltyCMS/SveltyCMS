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
    getPublishedReferencedIds = vi.fn().mockResolvedValue([]);
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
import { dbAdapter } from "@src/databases/db";
import { cacheService } from "@src/databases/cache/cache-service";

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

  it("scopes the virtual-folder cache entry to the tenant (F09 cache isolation)", async () => {
    await load(
      makeEvent({
        user: { _id: { toString: () => "u1" }, email: "a@b.co" },
        isAdmin: true,
        roles: [],
        tenantId: "t1",
      }),
    );

    expect(vi.mocked(cacheService.getOrSetSWR)).toHaveBeenCalledWith(
      "mediagallery:virtualFolders:t1",
      expect.any(Function),
      300_000,
      1_800_000,
      "t1",
    );
  });

  it("allows admin and keeps the adapter page total (F01)", async () => {
    // F01: the loader used to replace `total` with items.length. An empty slice of
    // a 7-row folder is exactly the shape that kept that regression green — the
    // old assertion ended in `|| true`.
    vi.mocked(dbAdapter.media.files.getByFolder).mockResolvedValueOnce({
      success: true,
      data: {
        items: [],
        total: 7,
        pageSize: 100,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    });

    const data: any = (await load(
      makeEvent({
        user: { _id: { toString: () => "u1" }, email: "a@b.co" },
        isAdmin: true,
        roles: [],
        tenantId: "t1",
      }),
    )) as any;

    expect(data.media).toEqual([]);
    expect(data.mediaPagination).toEqual({
      page: 1,
      pageSize: 100,
      total: 7,
      hasNextPage: true,
      hasPreviousPage: false,
    });
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

  it("rejects the action when saveRemoteMedia blocks every URL", async () => {
    saveRemoteMedia.mockResolvedValue({
      success: false,
      message: "Blocked private IP: 127.0.0.1",
    });
    // A batch where nothing was stored is a failure — the UI must not report a
    // successful import for URLs the SSRF guard rejected.
    await expect(
      actions.remoteUpload(
        makeRemoteUploadEvent(
          {
            user: { _id: "writer-1", email: "w@b.co" },
            isAdmin: true,
            roles: [],
            tenantId: "t1",
          },
          ["http://127.0.0.1:9000/secret"],
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(saveRemoteMedia).toHaveBeenCalledWith(
      "http://127.0.0.1:9000/secret",
      expect.anything(),
      "public",
      "t1",
      "global",
    );
  });
});

describe("mediagallery +page.server load — structured filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminLocals = {
    user: { _id: { toString: () => "u1" }, email: "a@b.co" },
    isAdmin: true,
    roles: [],
    tenantId: "t1",
  };

  function lastGetByFolderOptions() {
    const calls = vi.mocked(dbAdapter.media.files.getByFolder).mock.calls;
    expect(calls).toHaveLength(1);
    return calls[0]?.[1] as Record<string, unknown>;
  }

  it("forwards valid size / dimension / MIME params to the adapter", async () => {
    const data = (await load(
      makeEvent(
        adminLocals,
        "?mime=image/png,image/jpeg&minSize=1024&maxSize=2048&minWidth=800&maxWidth=4000&minHeight=600&maxHeight=3000",
      ),
    )) as { mediaFilters: Record<string, unknown> };

    expect(lastGetByFolderOptions()).toMatchObject({
      mimeTypes: ["image/png", "image/jpeg"],
      minSize: 1024,
      maxSize: 2048,
      minWidth: 800,
      maxWidth: 4000,
      minHeight: 600,
      maxHeight: 3000,
    });

    // Normalized echo so the modal can reopen on the applied filters.
    expect(data.mediaFilters).toMatchObject({
      mimeTypes: ["image/png", "image/jpeg"],
      minSize: 1024,
      minWidth: 800,
    });
  });

  it("drops invalid values instead of forwarding them", async () => {
    await load(
      makeEvent(
        adminLocals,
        "?mime=png,image/png,image/png;charset=utf-8&minSize=abc&maxSize=-5&minWidth=1.5&maxWidth=0&minHeight=10px&maxHeight=999999999",
      ),
    );

    const options = lastGetByFolderOptions();
    // Only the complete MIME token is accepted; every malformed number is dropped.
    expect(options.mimeTypes).toEqual(["image/png"]);
    for (const key of ["minSize", "maxSize", "minWidth", "maxWidth", "minHeight", "maxHeight"]) {
      expect(options).not.toHaveProperty(key);
    }
  });

  it("drops an inverted size range", async () => {
    await load(makeEvent(adminLocals, "?minSize=4096&maxSize=128"));

    const options = lastGetByFolderOptions();
    expect(options.minSize).toBeUndefined();
    expect(options.maxSize).toBeUndefined();
  });

  it("parses 1-based pages and clamps absurd offsets", async () => {
    await load(makeEvent(adminLocals, "?page=3"));
    expect(lastGetByFolderOptions().page).toBe(3);

    vi.mocked(dbAdapter.media.files.getByFolder).mockClear();
    await load(makeEvent(adminLocals, "?page=0"));
    expect(lastGetByFolderOptions().page).toBe(1);

    vi.mocked(dbAdapter.media.files.getByFolder).mockClear();
    await load(makeEvent(adminLocals, "?page=abc"));
    expect(lastGetByFolderOptions().page).toBe(1);

    vi.mocked(dbAdapter.media.files.getByFolder).mockClear();
    await load(makeEvent(adminLocals, "?page=999999"));
    expect(lastGetByFolderOptions().page).toBe(10_000);
  });

  it("keeps quick search and structured filters on the same adapter call", async () => {
    await load(makeEvent(adminLocals, "?q=beach&minSize=1024"));

    expect(lastGetByFolderOptions()).toMatchObject({ search: "beach", minSize: 1024 });
  });
});

interface MediaGalleryPageData {
  media: Array<{ _id: string; tenantId?: string | null }>;
  systemVirtualFolders: unknown[];
  mediaPagination: { page: number; pageSize: number; total: number };
}

function makeTenantLoadEvent(tenantId: string) {
  return makeEvent({
    user: { _id: { toString: () => `${tenantId}-user` }, email: `${tenantId}@b.co` },
    isAdmin: true,
    roles: [],
    tenantId,
  }) as unknown as Parameters<typeof load>[0];
}

describe("mediagallery +page.server load — concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps each tenant's media list on its own parallel load", async () => {
    vi.mocked(dbAdapter.media.files.getByFolder).mockImplementation(async (_folderId, options) => {
      const tenantId = String(options?.tenantId ?? "global");
      return {
        success: true,
        data: {
          items: [
            {
              _id: `${tenantId}-asset`,
              filename: `${tenantId}-asset.png`,
              hash: `${tenantId}-hash`,
              mimeType: "image/png",
              path: "global",
              tenantId,
              metadata: {},
            },
          ],
          total: 1,
          pageSize: 100,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      } as unknown as Awaited<ReturnType<typeof dbAdapter.media.files.getByFolder>>;
    });

    const [first, second] = (await Promise.all([
      load(makeTenantLoadEvent("t1")),
      load(makeTenantLoadEvent("t2")),
    ])) as unknown as [MediaGalleryPageData, MediaGalleryPageData];

    // Each request reads its own tenant scope — the adapter call is not shared state.
    expect(first.media).toHaveLength(1);
    expect(second.media).toHaveLength(1);
    expect(first.media[0].tenantId).toBe("t1");
    expect(second.media[0].tenantId).toBe("t2");
    expect(first.media[0]._id).toBe("t1-asset");
    expect(second.media[0]._id).toBe("t2-asset");
    expect(first.media[0]._id).not.toBe(second.media[0]._id);
  });
});

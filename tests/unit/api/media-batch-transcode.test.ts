/**
 * @file tests/unit/api/media-batch-transcode.test.ts
 * @description Contract tests for the batch media processing and video transcode handlers.
 *
 * These exercise the handlers directly (no dispatcher) so the validation limits,
 * the publish-state gate, and the fail-closed `ffmpeg` probe are pinned without a
 * browser or a server. `node:child_process` is stubbed to report ENOENT, which makes
 * the 503 path deterministic even on machines and CI images that ship ffmpeg.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { DatabaseId } from "@src/databases/db-interface";

vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  type Emitter = InstanceType<typeof EventEmitter>;
  return {
    spawn: vi.fn(() => {
      const child = new EventEmitter() as Emitter & {
        stderr: Emitter;
        kill: () => void;
      };
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
      });
      return child;
    }),
  };
});

vi.mock("@utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@utils/media/media-storage.server", () => ({
  getFile: vi.fn(),
  saveFile: vi.fn(),
}));

const { handleMediaBatchProcess } = await import("@src/routes/api/[...path]/handlers/media");
const { handleMediaTranscode } = await import("@src/routes/api/[...path]/handlers/media-transcode");

const TENANT_ID = "tenant-batch-test" as unknown as DatabaseId;

interface CmsStub {
  media: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    manipulate: ReturnType<typeof vi.fn>;
    getPublishedReferences: ReturnType<typeof vi.fn>;
    references: ReturnType<typeof vi.fn>;
  };
}

function createCms(options: { publishedReferences?: unknown[] } = {}): CmsStub {
  return {
    media: {
      findById: vi.fn().mockResolvedValue({ success: true, data: null }),
      update: vi.fn().mockResolvedValue({ success: true }),
      manipulate: vi.fn().mockResolvedValue({ success: true, data: { _id: "media" } }),
      getPublishedReferences: vi.fn().mockResolvedValue(options.publishedReferences ?? []),
      references: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
  };
}

function makeEvent(body: unknown, { isAdmin = true, roles = [] as string[] } = {}): RequestEvent {
  return {
    request: new Request("http://localhost/api/media/batch-process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: { isAdmin, roles, user: isAdmin ? { _id: "admin-1" } : null },
    url: new URL("http://localhost/api/media/batch-process"),
  } as unknown as RequestEvent;
}

describe("POST /api/media/batch-process", () => {
  let cms: CmsStub;

  beforeEach(() => {
    cms = createCms();
  });

  it("rejects an empty selection", async () => {
    await expect(
      handleMediaBatchProcess(
        makeEvent({ ids: [], operation: "resize" }),
        cms as never,
        TENANT_ID,
        {
          _id: "admin-1",
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("caps a batch at 100 assets", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `media-${index}`);
    await expect(
      handleMediaBatchProcess(
        makeEvent({ ids, operation: "resize", params: { width: 640 } }),
        cms as never,
        TENANT_ID,
        { _id: "admin-1" },
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("100") });
    expect(cms.media.manipulate).not.toHaveBeenCalled();
  });

  it("rejects an unknown filter preset", async () => {
    await expect(
      handleMediaBatchProcess(
        makeEvent({ ids: ["m1"], operation: "filter", params: { filterPreset: "nope" } }),
        cms as never,
        TENANT_ID,
        { _id: "admin-1" },
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Unknown filter") });
  });

  it.each([10, 5000, 320.5])("rejects an out-of-range resize width (%s)", async (width) => {
    await expect(
      handleMediaBatchProcess(
        makeEvent({ ids: ["m1"], operation: "resize", params: { width } }),
        cms as never,
        TENANT_ID,
        { _id: "admin-1" },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("between 32 and 4096"),
    });
    expect(cms.media.manipulate).not.toHaveBeenCalled();
  });

  it("applies a filter preset to every id and reports the counts", async () => {
    const event = makeEvent({
      ids: ["m1", "m2"],
      operation: "filter",
      params: { filterPreset: "sepia" },
    });
    const response = await handleMediaBatchProcess(event, cms as never, TENANT_ID, {
      _id: "admin-1",
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data?: { processed?: number; failed?: number; results?: unknown[] };
    };
    expect(payload.data?.processed).toBe(2);
    expect(payload.data?.failed).toBe(0);
    expect(cms.media.manipulate).toHaveBeenCalledTimes(2);
    expect(cms.media.manipulate).toHaveBeenNthCalledWith(
      1,
      "m1",
      { filters: { sepia: 80 }, saveBehavior: "overwrite" },
      { userId: "admin-1", tenantId: TENANT_ID },
    );
  });

  it("passes the resize through as an explicit output width", async () => {
    const response = await handleMediaBatchProcess(
      makeEvent({ ids: ["m1"], operation: "resize", params: { width: 320 } }),
      cms as never,
      TENANT_ID,
      { _id: "admin-1" },
    );

    expect(response.status).toBe(200);
    expect(cms.media.manipulate).toHaveBeenCalledWith(
      "m1",
      { resize: { width: 320 }, saveBehavior: "overwrite" },
      { userId: "admin-1", tenantId: TENANT_ID },
    );
  });

  it("reports per-asset failures instead of aborting the batch", async () => {
    cms.media.manipulate
      .mockResolvedValueOnce({ success: false, message: "Sharp refused the input" })
      .mockResolvedValueOnce({ success: true, data: { _id: "m2" } });

    const response = await handleMediaBatchProcess(
      makeEvent({ ids: ["m1", "m2"], operation: "resize", params: { width: 640 } }),
      cms as never,
      TENANT_ID,
      { _id: "admin-1" },
    );

    const payload = (await response.json()) as {
      data?: {
        processed?: number;
        failed?: number;
        results?: Array<{ id: string; success: boolean; error?: string }>;
      };
    };
    expect(payload.data?.processed).toBe(1);
    expect(payload.data?.failed).toBe(1);
    expect(payload.data?.results?.[0]).toMatchObject({
      id: "m1",
      success: false,
      error: "Sharp refused the input",
    });
    expect(payload.data?.results?.[1]).toMatchObject({ id: "m2", success: true });
  });

  it("refuses to rewrite an asset referenced by published content", async () => {
    cms = createCms({
      publishedReferences: [
        { entryId: "e1", entryName: "Home", collectionName: "pages", fieldName: "hero" },
      ],
    });

    const response = await handleMediaBatchProcess(
      makeEvent({ ids: ["m1"], operation: "resize", params: { width: 640 } }),
      cms as never,
      TENANT_ID,
      { _id: "admin-1" },
    );

    const payload = (await response.json()) as {
      data?: { processed?: number; failed?: number; results?: Array<{ error?: string }> };
    };
    expect(payload.data?.processed).toBe(0);
    expect(payload.data?.failed).toBe(1);
    expect(payload.data?.results?.[0]?.error).toContain("published content");
    expect(cms.media.manipulate).not.toHaveBeenCalled();
  });

  it("requires media:write for non-admins", async () => {
    await expect(
      handleMediaBatchProcess(
        makeEvent({ ids: ["m1"], operation: "resize", params: { width: 640 } }, { isAdmin: false }),
        cms as never,
        TENANT_ID,
        { _id: "editor-1", role: "editor" },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("POST /api/media/transcode", () => {
  function videoCms(overrides: Record<string, unknown> = {}) {
    const cms = createCms();
    cms.media.findById.mockResolvedValue({
      success: true,
      data: {
        _id: "video-1",
        type: "video",
        filename: "clip.mp4",
        mimeType: "video/mp4",
        size: 1024,
        path: "global/clip.mp4",
        metadata: {},
        ...overrides,
      },
    });
    return cms;
  }

  it("requires media:write for non-admins", async () => {
    await expect(
      handleMediaTranscode(
        makeEvent({ mediaId: "video-1" }, { isAdmin: false }),
        videoCms() as never,
        TENANT_ID,
        { _id: "editor-1" },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 for an unknown asset", async () => {
    const cms = createCms();
    await expect(
      handleMediaTranscode(makeEvent({ mediaId: "missing" }), cms as never, TENANT_ID, {
        _id: "admin-1",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects non-video assets", async () => {
    const cms = videoCms({ type: "image", mimeType: "image/png" });
    await expect(
      handleMediaTranscode(makeEvent({ mediaId: "video-1" }), cms as never, TENANT_ID, {
        _id: "admin-1",
      }),
    ).rejects.toMatchObject({ status: 400, code: "NOT_A_VIDEO" });
  });

  it("rejects a video above the 512 MB transcode ceiling", async () => {
    const cms = videoCms({ size: 513 * 1024 * 1024 });
    await expect(
      handleMediaTranscode(makeEvent({ mediaId: "video-1" }), cms as never, TENANT_ID, {
        _id: "admin-1",
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("rejects a job with only unknown resolutions", async () => {
    const cms = videoCms();
    await expect(
      handleMediaTranscode(
        makeEvent({ mediaId: "video-1", resolutions: ["4k", "quad-hd"] }),
        cms as never,
        TENANT_ID,
        { _id: "admin-1" },
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("resolution") });
  });

  it("fails closed with 503 when ffmpeg is unavailable, without touching metadata", async () => {
    const cms = videoCms();
    await expect(
      handleMediaTranscode(
        makeEvent({ mediaId: "video-1", format: "hls", resolutions: ["720p"] }),
        cms as never,
        TENANT_ID,
        { _id: "admin-1" },
      ),
    ).rejects.toMatchObject({ status: 503, code: "FFMPEG_UNAVAILABLE" });

    // A failed pre-flight must not mark the asset as processing.
    expect(cms.media.update).not.toHaveBeenCalled();
  });
});

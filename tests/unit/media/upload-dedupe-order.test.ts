/**
 * @file tests/unit/media/upload-dedupe-order.test.ts
 * @description Unit tests for the upload dedupe order — item #2 of the media pipeline plan:
 * the content-hash lookup must run BEFORE any derivative work, so re-uploading identical
 * bytes performs zero encodes, writes no derivative files and schedules no variant job.
 *
 * Covers the three outcomes of a dedupe hit:
 * - reusable (every advertised file is on disk) → the existing record is returned untouched
 * - reusable under a new filename → only the original copy is written, still zero derivatives
 * - stale (a file the row advertises is gone) → the row is repaired in place, never re-inserted
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { DatabaseId, MediaItem as DbMediaItem } from "@src/databases/db-interface";

const TENANT = "t1";
/** `saveMedia` takes a branded tenant id — paths keep the plain string. */
const TENANT_ID = TENANT as DatabaseId;
/** JPEG magic — keeps the write-time MIME agreement check happy. */
const IMAGE_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
]);

const mocks = vi.hoisted(() => ({
  exists: new Set<string>(),
  fileExists: vi.fn(async (rel: string) => mocks.exists.has(rel)),
  saveFile: vi.fn(async (_data: unknown, rel: string) => {
    mocks.exists.add(rel);
    return `/files/${rel}`;
  }),
  saveResizedImages: vi.fn(async () => ({
    thumbnail: {
      url: "/files/t1/thumbnail.jpg",
      width: 200,
      height: 150,
      mimeType: "image/jpeg",
      size: 2_048,
    },
  })),
  getFile: vi.fn(async () => Buffer.from(IMAGE_BYTES)),
  processImageWithPresets: vi.fn(async () => []),
  sharpMetadata: vi.fn(async () => ({ width: 400, height: 300, format: "jpeg" })),
  sharpEncode: vi.fn(async () => Buffer.from(IMAGE_BYTES)),
  getByHash: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(async (_collection: string, _id: string, _patch: Record<string, unknown>) => ({
    success: true,
    data: {},
  })),
}));

vi.mock("@src/utils/media/media-storage.server", () => ({
  fileExists: mocks.fileExists,
  getFile: mocks.getFile,
  saveFile: mocks.saveFile,
  saveResizedImages: mocks.saveResizedImages,
}));

vi.mock("@src/services/media/image-processor", () => ({
  processImageWithPresets: mocks.processImageWithPresets,
}));

vi.mock("sharp", () => ({
  default: () => {
    const chain: Record<string, unknown> = {
      metadata: mocks.sharpMetadata,
      toBuffer: mocks.sharpEncode,
    };
    for (const method of ["resize", "clone", "jpeg", "webp", "avif", "png", "rotate"]) {
      chain[method] = () => chain;
    }
    return chain;
  },
}));

const { MediaService } = await import("@src/utils/media/media-service.server");
const { buildOriginalRelPath } = await import("@src/utils/media/media-utils");
const { hashFileContent } = await import("@src/utils/media/media-processing.server");

const HASH = await hashFileContent(Buffer.from(IMAGE_BYTES));
const ORIGINAL_PATH = buildOriginalRelPath(HASH, "photo.jpg", TENANT);
const COPY_PATH = buildOriginalRelPath(HASH, "copy.jpg", TENANT);
const DERIVATIVE_PATH = `t1/${HASH}/thumbnail/photo-${HASH}.jpg`;

function makeRecord(overrides: Partial<DbMediaItem> = {}): DbMediaItem {
  return {
    _id: "existing-id",
    path: ORIGINAL_PATH,
    hash: HASH,
    filename: "photo.jpg",
    originalFilename: "photo.jpg",
    mimeType: "image/jpeg",
    size: IMAGE_BYTES.length,
    tenantId: TENANT,
    metadata: { width: 400, height: 300 },
    thumbnails: { thumbnail: { url: `/files/${DERIVATIVE_PATH}`, width: 200, height: 150 } },
    ...overrides,
  } as unknown as DbMediaItem;
}

function createService(): InstanceType<typeof MediaService> {
  return new MediaService({
    media: { files: { getByHash: mocks.getByHash, upload: mocks.upload } },
    crud: { update: mocks.update },
  } as unknown as IDBAdapter);
}

function uploadFile(name: string) {
  const file = new File([IMAGE_BYTES], name, { type: "image/jpeg" });
  return createService().saveMedia(file, "user-1", "public", TENANT_ID);
}

/** Decodes + encodes performed anywhere in the upload path. */
function sharpWork(): number {
  return mocks.sharpMetadata.mock.calls.length + mocks.sharpEncode.mock.calls.length;
}

describe("saveMedia — dedupe before derivative generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exists.clear();
    mocks.getByHash.mockResolvedValue({ success: true, data: null });
    mocks.upload.mockResolvedValue({
      success: true,
      data: { _id: "inserted-id", path: ORIGINAL_PATH },
    });
  });

  it("reuses the existing record for identical bytes without a single encode", async () => {
    mocks.exists.add(ORIGINAL_PATH);
    mocks.exists.add(DERIVATIVE_PATH);
    mocks.getByHash.mockResolvedValue({ success: true, data: makeRecord() });

    const res = await uploadFile("photo.jpg");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error(`saveMedia failed: ${res.message}`);
    expect(res.data._id).toBe("existing-id");
    // Falsifies the old order: derivatives used to be (re)written before the hash lookup.
    expect(mocks.saveResizedImages).not.toHaveBeenCalled();
    expect(sharpWork()).toBe(0);
    // No derivative work is deferred either.
    expect(mocks.processImageWithPresets).not.toHaveBeenCalled();
    // No second row, and no patch — path and folder already match.
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.saveFile).not.toHaveBeenCalled();
  });

  it("still writes no derivatives when the same bytes arrive under a new filename", async () => {
    mocks.exists.add(ORIGINAL_PATH);
    mocks.exists.add(DERIVATIVE_PATH);
    mocks.getByHash.mockResolvedValue({ success: true, data: makeRecord() });

    const res = await uploadFile("copy.jpg");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error(`saveMedia failed: ${res.message}`);
    expect(res.data._id).toBe("existing-id");
    // One plain copy of the original so the patched `path` resolves — never an encode.
    expect(mocks.saveFile).toHaveBeenCalledTimes(1);
    expect(mocks.saveFile.mock.calls[0]?.[1]).toBe(COPY_PATH);
    expect(mocks.saveResizedImages).not.toHaveBeenCalled();
    expect(sharpWork()).toBe(0);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[1]).toBe("existing-id");
    expect(mocks.update.mock.calls[0]?.[2]).toMatchObject({ path: COPY_PATH });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("repairs a dedupe hit whose derivative file is gone instead of serving a dead URL", async () => {
    mocks.exists.add(ORIGINAL_PATH); // derivatives vanished (unlink/GC) → stale hit
    mocks.getByHash.mockResolvedValue({ success: true, data: makeRecord() });

    const res = await uploadFile("photo.jpg");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error(`saveMedia failed: ${res.message}`);
    expect(res.data._id).toBe("existing-id");
    // Regenerated onto the row that already exists — identical bytes never get a second row.
    expect(mocks.saveResizedImages).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();
    const patch = mocks.update.mock.calls[0]?.[2] ?? {};
    expect(patch.path).toBe(ORIGINAL_PATH);
    expect(patch.thumbnails).toMatchObject({ thumbnail: expect.any(Object) });
    expect(patch.metadata).toMatchObject({ width: 400, height: 300 });
    // The deferred variant job is re-armed (variant paths are hash-keyed, so it is idempotent).
    await vi.waitFor(() => expect(mocks.processImageWithPresets).toHaveBeenCalledTimes(1));
  });

  it("keeps repairing: a stale hit whose original is gone rewrites the original too", async () => {
    mocks.getByHash.mockResolvedValue({ success: true, data: makeRecord() });

    await uploadFile("photo.jpg");

    expect(mocks.saveFile.mock.calls.some((call) => call[1] === ORIGINAL_PATH)).toBe(true);
    expect(mocks.saveResizedImages).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("inserts and generates derivatives only for genuinely new content", async () => {
    const res = await uploadFile("photo.jpg");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error(`saveMedia failed: ${res.message}`);
    expect(res.data._id).toBe("inserted-id");
    expect(mocks.saveFile.mock.calls.some((call) => call[1] === ORIGINAL_PATH)).toBe(true);
    expect(mocks.saveResizedImages).toHaveBeenCalledTimes(1);
    expect(sharpWork()).toBeGreaterThan(0);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(mocks.processImageWithPresets).toHaveBeenCalledTimes(1));
  });
});

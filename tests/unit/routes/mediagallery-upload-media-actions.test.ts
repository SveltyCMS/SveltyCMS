/**
 * @file tests/unit/routes/mediagallery-upload-media-actions.test.ts
 * @description Behaviour contract for the media-gallery `upload` form action.
 *
 * Boundaries mocked: the DB adapter handle, `MediaService.saveMedia` (real file
 * IO/storage) and the page guards. The action's own permission ordering,
 * duplicate-name handling and 400 wrapping run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { error } from "@sveltejs/kit";

vi.mock("@src/databases/db", () => ({
  dbAdapter: { kind: "fake-adapter" },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn(),
  requirePagePermission: vi.fn(),
}));

const mediaStore = vi.hoisted(() => {
  const names = new Set<string>();

  const saveMedia = vi.fn(
    async (_file: File, _userId: string, _access: string, _tenantId: string | null) => {
      if (names.has(_file.name)) {
        throw new Error(`duplicate media file: ${_file.name}`);
      }
      names.add(_file.name);
      return { success: true, data: { _id: `media-${_file.name}` } };
    },
  );

  return { names, saveMedia };
});

vi.mock("@src/utils/media/media-service.server", () => {
  class MediaService {
    constructor(_adapter: unknown) {}

    saveMedia(
      file: File,
      userId: string,
      access: string,
      tenantId: string | null,
    ): Promise<unknown> {
      return mediaStore.saveMedia(file, userId, access, tenantId);
    }
  }

  return { MediaService };
});

import { actions } from "../../../src/routes/(app)/mediagallery/upload-media/+page.server";
import { getAuthenticatedUser, requirePagePermission } from "@utils/page-guards.server";

const UPLOAD_URL = "http://localhost/mediagallery/upload-media?/upload";

type UploadLocals = Record<string, unknown>;

function makeLocals(overrides: UploadLocals = {}): UploadLocals {
  return {
    user: { _id: "u-media", email: "editor@example.com", role: "editor" },
    roles: [],
    isAdmin: false,
    tenantId: "t1",
    ...overrides,
  };
}

function makeUploadEvent(
  files: File[],
  locals: UploadLocals,
): Parameters<typeof actions.upload>[0] {
  const form = new FormData();
  for (const file of files) form.append("files", file);

  return {
    request: new Request(UPLOAD_URL, { method: "POST", body: form }),
    locals,
  } as unknown as Parameters<typeof actions.upload>[0];
}

async function readStoredNames(): Promise<string[]> {
  return [...mediaStore.names].sort();
}

describe("mediagallery upload-media action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaStore.names.clear();
    mediaStore.saveMedia.mockClear();

    vi.mocked(getAuthenticatedUser).mockImplementation(
      ((locals: { user: unknown }) => locals.user) as unknown as typeof getAuthenticatedUser,
    );
    vi.mocked(requirePagePermission).mockImplementation(() => undefined);
  });

  it("stores an uploaded file for the session user, public access and the tenant (load-contract)", async () => {
    const file = new File(["pixels"], "photo.jpg", { type: "image/jpeg" });

    const result = await actions.upload(makeUploadEvent([file], makeLocals()));

    expect(result).toEqual({ success: true });
    expect(mediaStore.saveMedia).toHaveBeenCalledTimes(1);
    // `request.formData()` rebuilds the File, so match the boundary arguments
    // structurally instead of by object identity.
    expect(mediaStore.saveMedia).toHaveBeenCalledWith(
      expect.objectContaining({ name: "photo.jpg" }),
      "u-media",
      "public",
      "t1",
    );
    expect(await readStoredNames()).toEqual(["photo.jpg"]);
  });

  it("propagates a 403 from the media:write guard without storing anything", async () => {
    vi.mocked(requirePagePermission).mockImplementation(() => {
      throw error(403, "Insufficient permissions to upload media");
    });

    const uploadAttempt = actions.upload(
      makeUploadEvent([new File(["x"], "blocked.jpg")], makeLocals({ isAdmin: false })),
    );

    await expect(uploadAttempt).rejects.toMatchObject({
      status: 403,
      body: { message: "Insufficient permissions to upload media" },
    });
    expect(mediaStore.saveMedia).not.toHaveBeenCalled();
  });

  it("wraps a duplicate-name refusal from storage into a 400 naming the file", async () => {
    mediaStore.names.add("taken.jpg");

    let failure: { status?: number; body?: { message?: string } } | null = null;
    try {
      await actions.upload(makeUploadEvent([new File(["x"], "taken.jpg")], makeLocals()));
    } catch (err) {
      failure = err as { status?: number; body?: { message?: string } };
    }

    expect(failure?.status).toBe(400);
    expect(failure?.body?.message).toMatch(/already exists/);
    expect(failure?.body?.message).toContain("taken.jpg");
  });

  it("persists stored names so a repeated upload is refused (persistence)", async () => {
    const locals = makeLocals();
    const first = await actions.upload(
      makeUploadEvent([new File(["v1"], "same.png", { type: "image/png" })], locals),
    );
    expect(first).toEqual({ success: true });

    const duplicateAttempt = actions.upload(
      makeUploadEvent([new File(["v2"], "same.png", { type: "image/png" })], locals),
    );

    await expect(duplicateAttempt).rejects.toMatchObject({ status: 400 });

    const persisted = await readStoredNames();
    expect(persisted).toEqual(["same.png"]);
    expect(mediaStore.saveMedia).toHaveBeenCalledTimes(2);
  });

  it("keeps both files when two uploads run in parallel (concurrency)", async () => {
    const locals = makeLocals();

    const results = await Promise.all([
      actions.upload(makeUploadEvent([new File(["a"], "a.jpg", { type: "image/jpeg" })], locals)),
      actions.upload(makeUploadEvent([new File(["b"], "b.jpg", { type: "image/jpeg" })], locals)),
    ]);

    expect(results).toEqual([{ success: true }, { success: true }]);

    const stored = await readStoredNames();
    expect(stored).toEqual(["a.jpg", "b.jpg"]);
    expect(mediaStore.saveMedia).toHaveBeenCalledTimes(2);
  });
});

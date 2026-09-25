/**
 * @file tests/unit/widgets/core/media-upload-process.test.ts
 * @description Unit tests for the bounded-parallel multi-file upload path in
 * `process-upload.ts`: order preservation, the concurrency ceiling, and
 * per-file failure isolation.
 */

import { describe, expect, it, vi } from "vitest";

const saveMediaMock = vi.hoisted(() => vi.fn());

vi.mock("@src/utils/media/media-service.server", () => ({
  MediaService: class {
    saveMedia = saveMediaMock;
  },
}));
vi.mock("@src/databases/db", () => ({ dbAdapter: { __mock: true } }));
vi.mock("@utils/logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { processMediaUpload } from "@src/widgets/core/media-upload/process-upload";

const ctx = { field: { multiupload: true }, user: { _id: "u1" as any }, tenantId: "global" };
const file = (name: string) => new File(["x"], name, { type: "image/png" });

describe("processMediaUpload — multi-file pool", () => {
  it("preserves input order in the returned ids", async () => {
    saveMediaMock.mockImplementation(async (f: File) => ({
      success: true,
      data: { _id: `id-${f.name}` },
    }));

    const { ids, isMulti } = await processMediaUpload(
      [file("a.png"), file("b.png"), file("c.png")],
      ctx,
    );

    expect(ids).toEqual(["id-a.png", "id-b.png", "id-c.png"]);
    expect(isMulti).toBe(true);
    expect(saveMediaMock).toHaveBeenCalledTimes(3);
  });

  it("runs parallel but caps concurrency at 4", async () => {
    let active = 0;
    let peak = 0;
    let seq = 0;
    const resolvers: Array<() => void> = [];
    saveMediaMock.mockImplementation(() => {
      active++;
      peak = Math.max(peak, active);
      return new Promise<{ success: true; data: { _id: string } }>((resolve) => {
        resolvers.push(() => {
          active--;
          resolve({ success: true, data: { _id: `id-${++seq}` } });
        });
      });
    });

    const pending = processMediaUpload(
      Array.from({ length: 10 }, (_, i) => file(`${i}.png`)),
      ctx,
    );

    // Wait for the pool to fill (bounded poll — no fixed sleeps).
    for (let i = 0; i < 50 && active < 2; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(active).toBeGreaterThanOrEqual(2); // genuinely parallel
    expect(peak).toBeLessThanOrEqual(4); // never above the ceiling

    // Drain in waves: each released save lets its worker claim the next file,
    // which pushes a fresh resolver — so snapshot, release, and yield a
    // microtask until every slot has been consumed.
    while (resolvers.length) {
      resolvers.splice(0).forEach((release) => release());
      await Promise.resolve();
    }
    const { ids } = await pending;
    expect(ids).toHaveLength(10);
    expect(saveMediaMock).toHaveBeenCalledTimes(10);
  });

  it("skips failed files without dropping the others", async () => {
    saveMediaMock.mockImplementation(async (f: File) =>
      f.name === "bad.png"
        ? { success: false, message: "boom" }
        : { success: true, data: { _id: `ok-${f.name}` } },
    );

    const { ids } = await processMediaUpload(
      [file("good1.png"), file("bad.png"), file("good2.png")],
      ctx,
    );

    expect(ids).toEqual(["ok-good1.png", "ok-good2.png"]);
  });

  it("passes non-File ids through, keeping their slot order", async () => {
    saveMediaMock.mockImplementation(async (f: File) => ({
      success: true,
      data: { _id: `id-${f.name}` },
    }));

    const { ids } = await processMediaUpload(["existing-id", file("new.png")], ctx);

    expect(ids).toEqual(["existing-id", "id-new.png"]);
    expect(saveMediaMock).toHaveBeenCalledTimes(1);
  });
});

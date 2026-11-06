/**
 * @file tests/unit/services/media-manipulation-parity.test.ts
 * @description Pixel-level parity between the image editor preview and the
 * server-side Sharp bake.
 *
 * The editor draws the SOURCE crop, then flips, then rotates (canvas CTM
 * `translate × scale(flip) × rotate`). The server must produce the same
 * orientation, and every fine-tune slider the editor exposes must change the
 * encoded pixels — previously seven of eleven were silently dropped.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import sharp from "sharp";

// The global unit setup mocks Sharp for speed; these assertions are about real
// pixels, so this file opts back into the native binding.
vi.unmock("sharp");

vi.mock("@src/utils/media/media-storage.server", () => ({
  getFile: vi.fn(),
  saveFile: vi.fn(),
  fileExists: vi.fn(),
}));

const mockDbAdapter = (globalThis as any).mockDbAdapter;

type Rgba = [number, number, number, number];

describe("MediaService — editor parity", () => {
  let mediaService: any;
  let storageMock: any;
  let sourceBuffer: Buffer;

  beforeAll(async () => {
    storageMock = await import("@src/utils/media/media-storage.server");
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    storageMock.getFile.mockImplementation(async () => sourceBuffer);
    storageMock.saveFile.mockResolvedValue(undefined);
    storageMock.fileExists.mockResolvedValue(true);

    const { MediaService } = await import("@src/utils/media/media-service.server");
    mediaService = new MediaService(mockDbAdapter as any);
  });

  function record() {
    return {
      _id: "img-parity",
      filename: "parity.png",
      path: "global/parity.png",
      mimeType: "image/png",
      size: sourceBuffer.length,
      hash: "parityhash",
      url: "/files/global/parity.png",
      metadata: {},
      access: "public",
    };
  }

  /** Run a manipulation and return the encoded original written to storage. */
  async function bake(manipulations: Record<string, unknown>): Promise<Buffer> {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({ success: true, data: record() });
    (mockDbAdapter.crud.update as any).mockResolvedValue({ success: true });
    storageMock.saveFile.mockClear();

    await mediaService.manipulateMedia(
      "img-parity",
      { ...manipulations, saveBehavior: "overwrite" },
      "user-1",
    );

    const saved = storageMock.saveFile.mock.calls[0]?.[0];
    expect(saved, "the manipulated original must be written").toBeInstanceOf(Buffer);
    return saved as Buffer;
  }

  async function raw(buffer: Buffer): Promise<{
    data: Buffer;
    width: number;
    height: number;
    channels: number;
  }> {
    const result = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
      data: result.data,
      width: result.info.width,
      height: result.info.height,
      channels: result.info.channels,
    };
  }

  function pixel(image: Awaited<ReturnType<typeof raw>>, x: number, y: number): Rgba {
    const index = (y * image.width + x) * image.channels;
    return [
      image.data[index] ?? 0,
      image.data[index + 1] ?? 0,
      image.data[index + 2] ?? 0,
      image.data[index + 3] ?? 0,
    ];
  }

  async function quadPng(): Promise<Buffer> {
    // [R G; B Y] — every flip/rotation is distinguishable by pixel order.
    const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]);
    return sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } })
      .png()
      .toBuffer();
  }

  async function patternPng(): Promise<Buffer> {
    const width = 48;
    const height = 40;
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 3;
        data[index] = (x * 17 + y * 7) % 256;
        data[index + 1] = (x * 5 + y * 23) % 256;
        data[index + 2] = (x * 31 + y * 11) % 256;
      }
    }
    return sharp(data, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
  }

  it("rotates clockwise like the canvas preview", async () => {
    sourceBuffer = await quadPng();
    const out = await raw(await bake({ rotation: 90 }));

    expect([pixel(out, 0, 0), pixel(out, 1, 0)]).toEqual([
      [0, 0, 255, 255],
      [255, 0, 0, 255],
    ]);
    expect([pixel(out, 0, 1), pixel(out, 1, 1)]).toEqual([
      [255, 255, 0, 255],
      [0, 255, 0, 255],
    ]);
  });

  it("rotates first and then flips (preview CTM order)", async () => {
    sourceBuffer = await quadPng();
    const out = await raw(await bake({ rotation: 90, flipH: true }));

    // rotate90 → [B R; Y G]; horizontal flip → [R B; G Y]
    expect([pixel(out, 0, 0), pixel(out, 1, 0)]).toEqual([
      [255, 0, 0, 255],
      [0, 0, 255, 255],
    ]);
    expect([pixel(out, 0, 1), pixel(out, 1, 1)]).toEqual([
      [0, 255, 0, 255],
      [255, 255, 0, 255],
    ]);
  });

  it("crops in source space before rotating", async () => {
    sourceBuffer = await quadPng();
    const out = await raw(
      await bake({
        crop: { x: 1, y: 0, width: 1, height: 2 },
        rotation: 90,
      }),
    );

    // Right column [G; Y] rotated clockwise → [Y G]
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(pixel(out, 0, 0)).toEqual([255, 255, 0, 255]);
    expect(pixel(out, 1, 0)).toEqual([0, 255, 0, 255]);
  });

  it("keeps a circular crop transparent outside the circle", async () => {
    sourceBuffer = await patternPng();
    const out = await raw(
      await bake({ crop: { x: 0, y: 0, width: 40, height: 40, shape: "circle" } }),
    );

    expect(pixel(out, 0, 0)[3]).toBe(0);
    expect(pixel(out, out.width - 1, out.height - 1)[3]).toBe(0);
    expect(pixel(out, Math.floor(out.width / 2), Math.floor(out.height / 2))[3]).toBe(255);
  });

  const sliders = [
    "exposure",
    "highlights",
    "shadows",
    "clarity",
    "vibrance",
    "tint",
    "sharpness",
  ] as const;

  it.each(sliders)("applies the %s slider to the saved pixels", async (slider) => {
    sourceBuffer = await patternPng();
    const baseline = await raw(await bake({}));
    const filtered = await raw(await bake({ filters: { [slider]: 60 } }));

    expect(filtered.data.equals(baseline.data), `${slider} must change the output`).toBe(false);
  });
});

/**
 * @file tests/unit/media/replace-size-cap.test.ts
 * @description Media replace uses the same byte ceiling as a new API upload.
 *
 * Features:
 * - non-SVG replace rejects declared and buffered sizes above the API body cap
 * - SVG stays on its own tighter cap
 * - a hashed stream stops once maxBytes is passed
 */

import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { API_MAX_BODY_SIZE_BYTES } from "@utils/api-body-limits";
import { AppError } from "@utils/error-handling";
import { hashStream } from "@src/utils/media/media-processing.server";
import { assertMediaReplaceSize, MAX_SVG_BYTES } from "@src/utils/media/media-service.server";

describe("media replace size ceiling", () => {
  it("rejects a non-SVG file above the new-upload ceiling", () => {
    expect(() =>
      assertMediaReplaceSize({
        name: "clip.mp4",
        type: "video/mp4",
        size: API_MAX_BODY_SIZE_BYTES + 1,
      }),
    ).toThrow(AppError);
    try {
      assertMediaReplaceSize({
        name: "clip.mp4",
        type: "video/mp4",
        size: API_MAX_BODY_SIZE_BYTES + 1,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(413);
    }
  });

  it("rejects a buffer that is larger than the declared size", () => {
    expect(() =>
      assertMediaReplaceSize(
        { name: "photo.jpg", type: "image/jpeg", size: 10 },
        API_MAX_BODY_SIZE_BYTES + 8,
      ),
    ).toThrow(AppError);
  });

  it("allows a file at the ceiling and leaves SVG to its own cap", () => {
    expect(() =>
      assertMediaReplaceSize({
        name: "photo.jpg",
        type: "image/jpeg",
        size: API_MAX_BODY_SIZE_BYTES,
      }),
    ).not.toThrow();
    expect(() =>
      assertMediaReplaceSize({
        name: "icon.svg",
        type: "image/svg+xml",
        size: MAX_SVG_BYTES + 1,
      }),
    ).not.toThrow();
  });

  it("stops hashing a stream once maxBytes is passed", async () => {
    const stream = Readable.from([Buffer.alloc(64)]);
    await expect(hashStream(stream, 16)).rejects.toMatchObject({ status: 413 });
  });
});

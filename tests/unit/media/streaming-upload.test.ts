/**
 * @file tests/unit/media/streaming-upload.test.ts
 * @description Regression tests for the bounded, incremental multipart upload parser.
 *
 * `POST /api/media/stream` accumulates every file chunk in heap. The parser defaults
 * (1 GiB per file / 5 GiB total) were only skipped for requests that advertised a
 * `Content-Length` — a chunked body bypassed the dispatcher's 15 MB guard entirely.
 * These tests pin the explicit ceiling, the incremental 413 abort, and that a
 * rejected body is never drained to completion.
 */

import { describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { AppError } from "@utils/error-handling";
import { API_MAX_BODY_SIZE_BYTES } from "@utils/api-body-limits";
import { parseMultipartStream } from "@utils/media/streaming-upload";
import type { DatabaseId } from "@src/content/types";
import { handleMediaStreamUpload } from "@src/routes/api/[...path]/handlers/media";
import type { LocalCMS } from "@src/services/sdk";

const BOUNDARY = "----sveltycms-stream-regression";
const encoder = new TextEncoder();

function encode(value: string): Uint8Array {
  return encoder.encode(value);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * `BodyInit` only accepts an `ArrayBuffer`-backed view, while `Uint8Array` is
 * `ArrayBufferLike`-generic since TS 5.7. `slice()` copies the exact same bytes into
 * an `ArrayBuffer` that spans them precisely — byte-identical, and no cast.
 */
function toBodyBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

/** `--boundary` + headers for a single file part (no body, no closing boundary). */
function buildFilePartPrefix(filename: string, contentType = "image/png"): Uint8Array {
  return encode(
    `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
}

function createStreamRequest(body: ReadableStream<Uint8Array>): Request {
  // `duplex: "half"` is required by undici for streaming request bodies but is
  // absent from the DOM `RequestInit` type.
  const init = {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    body,
    duplex: "half",
  } as RequestInit;
  return new Request("http://localhost/api/media/stream", init);
}

interface CountedSource {
  readonly stream: ReadableStream<Uint8Array>;
  /** Bytes the parser actually pulled — the "did it read the whole body?" counter. */
  readonly bytesPulled: number;
  readonly cancelled: boolean;
}

/**
 * Emits `prefix` first, then zero-filled chunks until `plannedBytes`.
 * Records pulled bytes and cancellation so tests can prove an early abort.
 */
function createCountedSource(
  prefix: Uint8Array,
  plannedBytes: number,
  chunkSize: number,
): CountedSource {
  const filler = new Uint8Array(chunkSize);
  let remaining = Math.max(0, plannedBytes - prefix.length);
  let bytesPulled = 0;
  let cancelled = false;
  let prefixSent = false;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!prefixSent) {
        prefixSent = true;
        bytesPulled += prefix.length;
        controller.enqueue(prefix);
        return;
      }
      if (remaining <= 0) {
        controller.close();
        return;
      }
      const size = Math.min(chunkSize, remaining);
      remaining -= size;
      bytesPulled += size;
      controller.enqueue(filler.subarray(0, size));
    },
    cancel() {
      cancelled = true;
    },
  });

  return {
    stream,
    get bytesPulled() {
      return bytesPulled;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

/** Drains a part stream into a single buffer (mirrors the handler's read loop). */
async function drainPart(info: { stream: ReadableStream<Uint8Array> }): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = info.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return concatBytes(chunks);
}

describe("parseMultipartStream — bounded parsing", () => {
  it("still parses a legitimate multipart body within the explicit limits", async () => {
    const fileBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
    const body = concatBytes([
      encode(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="folder"\r\n\r\nglobal\r\n`),
      buildFilePartPrefix("pixel.png"),
      fileBytes,
      encode(`\r\n--${BOUNDARY}--\r\n`),
    ]);

    const fields: Array<[string, string]> = [];
    const files: Array<{ filename: string; bytes: Uint8Array }> = [];

    await parseMultipartStream(
      new Request("http://localhost/api/media/stream", {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
        body: toBodyBuffer(body),
      }),
      {
        onFile: async (info) => {
          files.push({ filename: info.filename, bytes: await drainPart(info) });
        },
        onField: (name, value) => {
          fields.push([name, value]);
        },
      },
      { maxFileSize: 64 * 1024, maxTotalSize: 64 * 1024 },
    );

    expect(fields).toEqual([["folder", "global"]]);
    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toBe("pixel.png");
    expect(Array.from(files[0]!.bytes)).toEqual(Array.from(fileBytes));
  });

  it("aborts with 413 PAYLOAD_TOO_LARGE once the body cap is crossed without draining the stream", async () => {
    const cap = 8 * 1024;
    const planned = 256 * 1024;
    const source = createCountedSource(buildFilePartPrefix("large.png"), planned, 4 * 1024);

    const error = await parseMultipartStream(
      createStreamRequest(source.stream),
      { onFile: async (info) => void (await drainPart(info)) },
      { maxFileSize: 1024 * 1024, maxTotalSize: cap },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(source.cancelled).toBe(true);
    expect(source.bytesPulled).toBeLessThan(planned);
    expect(source.bytesPulled).toBeLessThanOrEqual(cap + 8 * 1024);
  });

  it("aborts with 413 PAYLOAD_TOO_LARGE when a single file part exceeds its cap", async () => {
    const fileCap = 4 * 1024;
    const planned = 256 * 1024;
    const source = createCountedSource(buildFilePartPrefix("huge.png"), planned, 8 * 1024);
    let fileError: unknown;

    const error = await parseMultipartStream(
      createStreamRequest(source.stream),
      {
        onFile: async (info) => {
          try {
            await drainPart(info);
          } catch (err) {
            fileError = err;
            throw err;
          }
        },
      },
      { maxFileSize: fileCap, maxTotalSize: planned },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    // The part consumer observes the same error instead of a truncated success.
    expect(fileError).toBeInstanceOf(AppError);
    expect((fileError as AppError).code).toBe("PAYLOAD_TOO_LARGE");
    expect(source.cancelled).toBe(true);
    expect(source.bytesPulled).toBeLessThan(planned);
  });
});

describe("handleMediaStreamUpload — incremental cap", () => {
  it("rejects an oversize chunked upload with 413 and never calls cms.media.upload", async () => {
    const chunkSize = 64 * 1024;
    const planned = API_MAX_BODY_SIZE_BYTES * 2;
    const source = createCountedSource(buildFilePartPrefix("attack.bin"), planned, chunkSize);
    const upload = vi.fn(async () => ({ success: true, data: { _id: "m1" } }));
    const event = {
      request: createStreamRequest(source.stream),
      locals: { isAdmin: true },
    } as unknown as RequestEvent;

    const error = await handleMediaStreamUpload(
      event,
      { media: { upload } } as unknown as LocalCMS,
      "t1" as DatabaseId,
      { _id: "u1" },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(upload).not.toHaveBeenCalled();
    expect(source.cancelled).toBe(true);
    expect(source.bytesPulled).toBeLessThan(planned);
    expect(source.bytesPulled).toBeLessThanOrEqual(API_MAX_BODY_SIZE_BYTES + 2 * chunkSize);
  });

  it("keeps accepting uploads that fit inside the API body budget", async () => {
    const fileBytes = new Uint8Array(1024).fill(7);
    const body = concatBytes([
      buildFilePartPrefix("ok.png"),
      fileBytes,
      encode(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const upload = vi.fn(async () => ({ success: true, data: { _id: "m1" } }));
    const event = {
      request: new Request("http://localhost/api/media/stream", {
        method: "POST",
        headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
        body: toBodyBuffer(body),
      }),
      locals: { isAdmin: true },
    } as unknown as RequestEvent;

    const response = await handleMediaStreamUpload(
      event,
      { media: { upload } } as unknown as LocalCMS,
      "t1" as DatabaseId,
      { _id: "u1" },
    );

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

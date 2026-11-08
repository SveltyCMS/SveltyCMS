/**
 * @file tests/unit/media/video-thumbnail-pipe.test.ts
 * @description Video thumbnails stream ffmpeg output to stdout instead of
 * writing and re-reading a second temp file; non-seekable containers skip temp
 * files entirely.
 *
 * Features:
 * - `shouldPipeVideoInput` container sniffing (EBML vs ISO-BMFF `ftyp`)
 * - `runFfmpegPipe` stdin/stdout wiring, stderr capture, empty output, EPIPE,
 *   non-zero exit and timeout kill
 * - ISO-BMFF path keeps a seekable temp input but pipes the JPEG out
 * - optional real-ffmpeg probe: a generated WebM must decode to a JPEG
 */

import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureVideoThumbnail,
  runFfmpegPipe,
  shouldPipeVideoInput,
} from "@src/utils/media/media-storage.server";

/** Structural view of the fake child process handed to the spawn script. */
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: EventEmitter & { end: (chunk?: Buffer) => void };
  kill: (signal?: string) => boolean;
}

type SpawnScript = (child: FakeChild, args: readonly string[]) => void;

interface SpawnCall {
  command: string;
  args: string[];
  stdio: unknown;
}

const h = vi.hoisted(() => ({
  calls: [] as SpawnCall[],
  script: null as SpawnScript | null,
  lastChild: null as FakeChild | null,
  useRealSpawn: false,
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  const { EventEmitter: Emitter } = await import("node:events");

  class FakeChildProcess extends Emitter {
    stdout = new Emitter();
    stderr = new Emitter();
    stdin = Object.assign(new Emitter(), { end: vi.fn(() => {}) });
    kill = vi.fn(() => true);
  }

  const spawn = vi.fn(
    (
      command: string,
      args?: readonly string[],
      options?: import("node:child_process").SpawnOptions,
    ) => {
      if (h.useRealSpawn) {
        return actual.spawn(
          command,
          args ?? [],
          options as import("node:child_process").SpawnOptionsWithStdioTuple<
            "pipe",
            "pipe",
            "pipe"
          >,
        );
      }

      const call: SpawnCall = { command, args: [...(args ?? [])], stdio: options?.stdio };
      h.calls.push(call);

      const child = new FakeChildProcess() as unknown as FakeChild;
      h.lastChild = child;
      queueMicrotask(() => h.script?.(child, call.args));
      return child;
    },
  );

  return { ...actual, spawn };
});

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

function makeWebm(): Buffer {
  return Buffer.concat([WEBM_MAGIC, Buffer.alloc(64)]);
}

function makeMp4(): Buffer {
  return Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypisom")]);
}

describe("shouldPipeVideoInput", () => {
  it("pipes EBML/WebM payloads", () => {
    expect(shouldPipeVideoInput(makeWebm())).toBe(true);
    expect(shouldPipeVideoInput(Buffer.concat([WEBM_MAGIC, Buffer.alloc(0)]))).toBe(true);
  });

  it("keeps a seekable temp input for ISO-BMFF containers", () => {
    expect(shouldPipeVideoInput(makeMp4())).toBe(false);
    expect(shouldPipeVideoInput(Buffer.concat([makeMp4(), Buffer.alloc(32)]))).toBe(false);
  });

  it("defaults empty and short buffers to the pipe attempt", () => {
    expect(shouldPipeVideoInput(Buffer.alloc(0))).toBe(true);
    expect(shouldPipeVideoInput(Buffer.from([0x00, 0x00, 0x00, 0x18]))).toBe(true);
    expect(shouldPipeVideoInput(Buffer.from("ftyp"))).toBe(true);
  });
});

describe("runFfmpegPipe", () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.script = null;
    h.lastChild = null;
    h.useRealSpawn = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses stdin/stdout pipes and concatenates the JPEG chunks", async () => {
    h.script = (child) => {
      child.stdout.emit("data", Buffer.from([0xff, 0xd8]));
      child.stdout.emit("data", Buffer.from([0xff, 0xd9]));
      child.emit("close", 0);
    };

    const input = Buffer.from("webm-bytes");
    const jpeg = await runFfmpegPipe(input);

    expect(jpeg).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(h.calls).toHaveLength(1);

    const [call] = h.calls;
    expect(call.command).toBe("ffmpeg");
    expect(call.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(call.args).toContain("pipe:0");
    expect(call.args).toContain("pipe:1");
    // A pipe cannot seek, so `-ss` must follow `-i`.
    expect(call.args.indexOf("-ss")).toBeGreaterThan(call.args.indexOf("-i"));
    expect(h.lastChild?.stdin.end).toHaveBeenCalledWith(input);
  });

  it("rejects with the exit code and captured stderr", async () => {
    h.script = (child) => {
      child.stderr.emit("data", Buffer.from("Invalid data found when processing input"));
      child.emit("close", 1);
    };

    await expect(runFfmpegPipe(Buffer.alloc(16))).rejects.toThrow(
      /ffmpeg exited with code 1: .*Invalid data found/,
    );
  });

  it("rejects when ffmpeg exits cleanly without a frame", async () => {
    h.script = (child) => {
      child.emit("close", 0);
    };

    await expect(runFfmpegPipe(Buffer.alloc(16))).rejects.toThrow(/no thumbnail data/);
  });

  it("ignores EPIPE on stdin and trusts the exit code", async () => {
    h.script = (child) => {
      child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      child.stdout.emit("data", JPEG_SOI);
      child.emit("close", 0);
    };

    await expect(runFfmpegPipe(Buffer.from("x"))).resolves.toEqual(JPEG_SOI);
  });

  it("kills ffmpeg and rejects when the frame grab times out", async () => {
    vi.useFakeTimers();
    h.script = () => {};

    const pending = runFfmpegPipe(Buffer.alloc(8), 1_234);
    const assertion = expect(pending).rejects.toThrow(/ffmpeg timed out after 1234ms/);

    await vi.advanceTimersByTimeAsync(1_234);
    await assertion;

    expect(h.lastChild?.kill).toHaveBeenCalledWith("SIGKILL");
  });
});

describe("captureVideoThumbnail", () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.script = null;
    h.lastChild = null;
    h.useRealSpawn = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pipes non-seekable containers end-to-end with no temp files", async () => {
    h.script = (child) => {
      child.stdout.emit("data", Buffer.from([0xff, 0xd8, 0xff]));
      child.emit("close", 0);
    };

    const thumbnail = await captureVideoThumbnail(makeWebm());

    expect(thumbnail).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(h.calls).toHaveLength(1); // a temp-file capture would spawn ffmpeg twice
    expect(h.calls[0].args).toContain("pipe:0");
    expect(h.calls[0].args).toContain("pipe:1");
  });

  it("keeps a seekable temp input for ISO-BMFF but pipes the JPEG out", async () => {
    h.script = (child) => {
      child.stdout.emit("data", Buffer.from([0xff, 0xd8, 0xff]));
      child.emit("close", 0);
    };

    const thumbnail = await captureVideoThumbnail(makeMp4());

    expect(thumbnail).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(h.calls).toHaveLength(1);

    const args = h.calls[0].args;
    const inputIndex = args.indexOf("-i");
    // Fast input-side seek: `-ss` before `-i`, on a real temp file.
    expect(args.indexOf("-ss")).toBeLessThan(inputIndex);
    expect(args[inputIndex + 1]).toMatch(/ffmpeg-input-.*\.mp4$/);
    expect(args).toContain("pipe:1");
    // The temp input is not fed through stdin; the JPEG goes to stdout.
    expect(h.lastChild?.stdin.end).toHaveBeenCalledWith(undefined);
  });

  it("falls back to the full temp-file path when the pipe fails", async () => {
    // First spawn (pipe) reports failure; the fallback spawn then needs an output file.
    let spawnCount = 0;
    h.script = (child) => {
      spawnCount++;
      if (spawnCount === 1) {
        child.emit("close", 1);
        return;
      }
      child.emit("exit", 0);
    };

    const result = await captureVideoThumbnail(makeWebm());

    // The fallback reuses the temp-file capture, whose `spawnAsync` waits on `exit`;
    // the missing output file makes it return null instead of throwing.
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].args).toContain("pipe:0");
    expect(h.calls[1].args).not.toContain("pipe:0");
    expect(result).toBeNull();
  });
});

describe("real ffmpeg probe", () => {
  it("decodes a generated WebM to a JPEG", async (ctx) => {
    const version = spawnSync("ffmpeg", ["-version"], { timeout: 10_000, encoding: "utf8" });
    if (version.status !== 0) {
      ctx.skip(
        `real-ffmpeg probe skipped: ffmpeg -version failed (${version.error?.message ?? `status ${version.status}`})`,
      );
      return;
    }

    // The capture seeks to 1s, so the clip must extend past that mark.
    const clip = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=64x64:rate=10",
        "-t",
        "2",
        "-c:v",
        "libvpx",
        "-f",
        "webm",
        "pipe:1",
      ],
      { timeout: 20_000, maxBuffer: 8 * 1024 * 1024, encoding: "buffer" },
    );
    if (clip.status !== 0 || clip.stdout.length === 0) {
      ctx.skip(
        `real-ffmpeg probe skipped: WebM generation failed (${clip.stderr.toString().trim() || `status ${clip.status}`})`,
      );
      return;
    }

    h.calls.length = 0;
    h.script = null;
    h.lastChild = null;
    h.useRealSpawn = true;
    try {
      const jpeg = await runFfmpegPipe(clip.stdout);
      expect(jpeg.subarray(0, 2)).toEqual(JPEG_SOI);
    } finally {
      h.useRealSpawn = false;
    }
  });
});

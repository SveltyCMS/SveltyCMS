/**
 * @file src/routes/api/[...path]/handlers/media-transcode.ts
 * @description Video transcoding (`POST /api/media/transcode`).
 *
 * Produces adaptive HLS (master playlist + per-resolution variant playlists and
 * segments) or a single progressive MP4 from an existing video asset. The work
 * runs in the background after a `202` acknowledgement; progress is recorded on
 * `metadata.transcode` and the playable HLS/MP4 URLs on `metadata.hls` /
 * `metadata.mp4`.
 *
 * Requirements and failure modes:
 * - `ffmpeg` must be on `PATH` (or `FFMPEG_PATH`). Without it the endpoint
 *   returns `503 FFMPEG_UNAVAILABLE` — it never pretends a job started.
 * - Input is buffered via the storage adapter (local/S3/R2/Cloudinary), so the
 *   pipeline is storage-agnostic. Videos above `MAX_INPUT_BYTES` are rejected.
 * - `spawn` is used with an argument array (no shell), and every resolution /
 *   bitrate is validated against a fixed allow-list.
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getFile, saveFile } from "@utils/media/media-storage.server";
import { isStoredMedia } from "@utils/media/media-models";
import { nowISODateString } from "@utils/date";
import { successResponse } from "./base";
import { hasMediaPermission } from "./media-permissions";

const RESOLUTION_HEIGHTS = {
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
} as const;

type ResolutionLabel = keyof typeof RESOLUTION_HEIGHTS;

/** Rough video bitrate per rendition (`auto`); ffmpeg also caps at source size. */
const RESOLUTION_BITRATES: Record<ResolutionLabel, string> = {
  "1080p": "2500k",
  "720p": "1500k",
  "480p": "800k",
  "360p": "500k",
};

const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

/** Resolved per call so a container can inject `FFMPEG_PATH` after boot. */
function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

interface TranscodeInput {
  mediaId: string;
  filename: string;
  inputPath: string;
  format: "hls" | "mp4";
  resolutions: ResolutionLabel[];
  bitrate: string;
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

function runCommand(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new AppError(`${bin} timed out after ${timeoutMs}ms`, 504, "TRANSCODE_TIMEOUT"));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`${bin} exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runCommand(ffmpegBinary(), ["-version"], 5000);
    return true;
  } catch {
    return false;
  }
}

async function updateTranscodeMetadata(
  cms: LocalCMS,
  tenantId: DatabaseId,
  mediaId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // Partial patch — a whole-blob write from this snapshot would delete keys a
  // concurrent share link or variant job added while ffmpeg was running.
  const result = await cms.media.patchMetadata(mediaId, patch, { tenantId });
  if (!result.success) {
    logger.warn("[MediaTranscode] Metadata update failed", {
      mediaId,
      error: result.message,
    });
  }
}

async function saveDirectory(
  localDir: string,
  storagePrefix: string,
): Promise<{ playlistUrl: string; fileCount: number }> {
  const files = await readdir(localDir);
  let playlistUrl = "";
  for (const file of files) {
    if (!/^[a-zA-Z0-9._-]+$/.test(file)) continue;
    const url = await saveFile(await readFile(join(localDir, file)), `${storagePrefix}/${file}`);
    if (file.endsWith(".m3u8")) playlistUrl = url;
  }
  return { playlistUrl, fileCount: files.length };
}

async function transcodeHls(input: TranscodeInput): Promise<Record<string, unknown>> {
  const safeId = safeSegment(input.mediaId, "media");
  const workDir = await mkdtemp(join(tmpdir(), "svelty-transcode-"));
  const source = join(
    workDir,
    `input.${safeSegment(input.filename.split(".").pop() ?? "", "mp4")}`,
  );

  try {
    await writeFile(source, await getFile(input.inputPath));

    const variants: Array<{ resolution: ResolutionLabel; height: number; playlist: string }> = [];
    for (const resolution of input.resolutions) {
      const height = RESOLUTION_HEIGHTS[resolution];
      const variantDir = join(workDir, `v${height}`);
      await mkdir(variantDir, { recursive: true });
      const bitrate = input.bitrate === "auto" ? RESOLUTION_BITRATES[resolution] : input.bitrate;

      await runCommand(
        ffmpegBinary(),
        [
          "-y",
          "-i",
          source,
          "-vf",
          `scale=-2:${height}`,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-b:v",
          bitrate,
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-f",
          "hls",
          "-hls_time",
          "6",
          "-hls_playlist_type",
          "vod",
          "-hls_segment_filename",
          join(variantDir, "seg_%03d.ts"),
          join(variantDir, "index.m3u8"),
        ],
        FFMPEG_TIMEOUT_MS,
      );

      const persisted = await saveDirectory(variantDir, `hls/${safeId}/v${height}`);
      variants.push({ resolution, height, playlist: `v${height}/index.m3u8` });
      if (!persisted.playlistUrl) {
        throw new Error(`HLS playlist missing for ${resolution}`);
      }
    }

    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      ...variants.flatMap((variant) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${Number.parseInt(RESOLUTION_BITRATES[variant.resolution], 10) * 1000}`,
        variant.playlist,
      ]),
      "",
    ].join("\n");
    const masterUrl = await saveFile(Buffer.from(master), `hls/${safeId}/master.m3u8`);

    return {
      hls: {
        master: masterUrl,
        variants: variants.map((variant) => ({
          resolution: variant.resolution,
          height: variant.height,
          playlist: variant.playlist,
        })),
        createdAt: nowISODateString(),
      },
      transcode: { status: "ready", format: "hls", completedAt: nowISODateString() },
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function transcodeMp4(input: TranscodeInput): Promise<Record<string, unknown>> {
  const safeId = safeSegment(input.mediaId, "media");
  const workDir = await mkdtemp(join(tmpdir(), "svelty-transcode-"));
  const source = join(
    workDir,
    `input.${safeSegment(input.filename.split(".").pop() ?? "", "mp4")}`,
  );
  const output = join(workDir, "output.mp4");

  try {
    await writeFile(source, await getFile(input.inputPath));
    const height = RESOLUTION_HEIGHTS[input.resolutions[0] ?? "720p"];
    const bitrate =
      input.bitrate === "auto"
        ? RESOLUTION_BITRATES[input.resolutions[0] ?? "720p"]
        : input.bitrate;

    await runCommand(
      ffmpegBinary(),
      [
        "-y",
        "-i",
        source,
        "-vf",
        `scale=-2:${height}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        bitrate,
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ],
      FFMPEG_TIMEOUT_MS,
    );

    const url = await saveFile(await readFile(output), `transcoded/${safeId}/output.mp4`);
    return {
      mp4: { url, height, createdAt: nowISODateString() },
      transcode: { status: "ready", format: "mp4", completedAt: nowISODateString() },
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function handleMediaTranscode(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  user: unknown,
) {
  if (!hasMediaPermission(event, user, "media:write")) {
    throw new AppError("Insufficient permissions for video transcoding", 403, "FORBIDDEN");
  }

  const body = await event.request.json().catch(() => ({}) as Record<string, unknown>);
  const mediaId = typeof body.mediaId === "string" ? body.mediaId.trim() : "";
  if (!mediaId) throw new AppError("mediaId is required", 400, "BAD_REQUEST");

  const format = body.format === "mp4" ? "mp4" : "hls";
  const requested: unknown[] = Array.isArray(body.resolutions) ? body.resolutions : ["720p"];
  const resolutions: ResolutionLabel[] = [
    ...new Set(
      requested.filter(
        (resolution: unknown): resolution is ResolutionLabel =>
          typeof resolution === "string" && resolution in RESOLUTION_HEIGHTS,
      ),
    ),
  ];
  if (resolutions.length === 0) {
    throw new AppError("Select at least one supported resolution", 400, "BAD_REQUEST");
  }

  const bitrate =
    typeof body.bitrate === "string" && /^(auto|\d{2,6}k)$/.test(body.bitrate)
      ? body.bitrate
      : "auto";

  const item = await cms.media.findById(mediaId, { tenantId });
  if (!item.success || !item.data) {
    throw new AppError("Media not found", 404, "MEDIA_NOT_FOUND");
  }
  const media = item.data;
  // Legacy/seeded rows may omit `type`; the transcode requirement is stored bytes
  // with a video MIME, and remote-video rows have neither a path nor a file.
  if (!isStoredMedia(media) || !media.mimeType.startsWith("video/")) {
    throw new AppError("Only stored video assets can be transcoded", 400, "NOT_A_VIDEO");
  }
  if (media.size > MAX_INPUT_BYTES) {
    throw new AppError("Video exceeds the 512 MB transcode limit", 413, "FILE_TOO_LARGE");
  }
  if (!media.path) {
    throw new AppError("Media has no stored source path", 400, "BAD_REQUEST");
  }

  if (!(await ffmpegAvailable())) {
    throw new AppError(
      "Video transcoding requires ffmpeg on the server PATH (or FFMPEG_PATH).",
      503,
      "FFMPEG_UNAVAILABLE",
    );
  }

  const input: TranscodeInput = {
    mediaId,
    filename: String(media.filename ?? "video.mp4"),
    inputPath: media.path,
    format,
    resolutions,
    bitrate,
  };

  await updateTranscodeMetadata(cms, tenantId, mediaId, {
    transcode: {
      status: "processing",
      format,
      resolutions,
      startedAt: nowISODateString(),
    },
  });

  // Background job: the request acknowledges immediately (long videos exceed a
  // normal HTTP budget). Failures are recorded on the asset, never swallowed.
  void (async () => {
    try {
      const patch = input.format === "hls" ? await transcodeHls(input) : await transcodeMp4(input);
      await updateTranscodeMetadata(cms, tenantId, mediaId, patch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[MediaTranscode] ${mediaId} failed: ${message}`);
      await updateTranscodeMetadata(cms, tenantId, mediaId, {
        transcode: {
          status: "failed",
          format: input.format,
          error: message.slice(0, 500),
          failedAt: nowISODateString(),
        },
      }).catch(() => undefined);
    }
  })();

  return successResponse(event, { status: "processing", mediaId, format, resolutions }, 202);
}

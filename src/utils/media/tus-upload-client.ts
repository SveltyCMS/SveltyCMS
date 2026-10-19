/**
 * @file src/utils/media/tus-upload-client.ts
 * @description Browser-side TUS 1.0.0 uploader with reload-safe resume.
 *
 * ### Features
 * - 5 MiB chunks against `POST/HEAD/PATCH /api/media/tus`
 * - resume state persisted in `localStorage` keyed by name+size+lastModified
 * - bounded retries per chunk (network/5xx), offset re-sync on `409`
 * - abortable via `AbortSignal`; an aborted upload keeps its resume state
 * - no dependency on `node:*` (runs in the browser bundle)
 */

export const TUS_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const TUS_CHUNK_SIZE = 5 * 1024 * 1024;
export const TUS_CLIENT_MAX_BYTES = 15 * 1024 * 1024;
const STORAGE_PREFIX = "svelty:tus:";
const MAX_RETRIES = 3;

export interface TusUploadOptions {
  folder?: string;
  access?: "public" | "private";
  csrfToken?: string;
  onProgress?: (percent: number, bytesUploaded: number) => void;
  signal?: AbortSignal;
}

export interface TusUploadResult {
  success: boolean;
  mediaId?: string;
  message?: string;
  aborted?: boolean;
}

interface SavedUpload {
  url: string;
  offset: number;
  size: number;
}

function fingerprint(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function storageKey(file: File): string {
  return `${STORAGE_PREFIX}${fingerprint(file)}`;
}

function loadSaved(file: File): SavedUpload | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(file));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedUpload;
    if (!parsed?.url || typeof parsed.offset !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(file: File, state: SavedUpload): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(file), JSON.stringify(state));
  } catch {
    // Quota/private mode — resume is best-effort.
  }
}

function clearState(file: File): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(file));
  } catch {
    // Ignore.
  }
}

function csrfHeader(explicit?: string): Record<string, string> {
  if (explicit) return { "X-CSRF-Token": explicit };
  if (typeof document === "undefined") return {};
  const host = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
  const plain = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  const raw = host?.[1] || plain?.[1] || "";
  if (!raw) return {};
  try {
    return { "X-CSRF-Token": decodeURIComponent(raw) };
  } catch {
    return { "X-CSRF-Token": raw };
  }
}

function serializeMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([key, value]) => (value ? `${key} ${toBase64(value)}` : key))
    .join(",");
}

/** UTF-8 safe base64 (metadata values are user filenames). */
function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isTusEligible(file: File): boolean {
  return file.size >= TUS_UPLOAD_THRESHOLD_BYTES && file.size <= TUS_CLIENT_MAX_BYTES;
}

async function createSession(file: File, options: TusUploadOptions): Promise<string> {
  const csrfToken = csrfHeader(options.csrfToken)["X-CSRF-Token"] || "";
  const response = await fetch("/api/media/tus", {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": serializeMetadata({
        filename: file.name,
        filetype: file.type,
        folder: options.folder || "global",
        access: options.access || "private",
      }),
      "X-CSRF-Token": csrfToken,
    },
    signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Could not start resumable upload (${response.status})`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error("Resumable upload start returned no Location");
  return location;
}

async function getOffset(url: string, options: TusUploadOptions): Promise<number | null> {
  const response = await fetch(url, {
    method: "HEAD",
    headers: { "Tus-Resumable": "1.0.0" },
    signal: options.signal,
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`Could not inspect upload (${response.status})`);
  const offset = Number(response.headers.get("upload-offset"));
  return Number.isFinite(offset) ? offset : null;
}

interface PatchOutcome {
  conflict: boolean;
  expected?: number;
  offset?: number;
  mediaId?: string;
}

async function patchChunk(
  url: string,
  offset: number,
  chunk: Blob,
  options: TusUploadOptions,
): Promise<PatchOutcome> {
  const csrfToken = csrfHeader(options.csrfToken)["X-CSRF-Token"] || "";
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": String(offset),
      "Content-Type": "application/offset+octet-stream",
      "X-CSRF-Token": csrfToken,
    },
    body: chunk,
    signal: options.signal,
  });
  if (response.status === 409) {
    const expected = Number(response.headers.get("upload-offset"));
    return { conflict: true, expected: Number.isFinite(expected) ? expected : undefined };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Chunk upload failed (${response.status})`);
  }
  const next = Number(response.headers.get("upload-offset"));
  return {
    conflict: false,
    offset: Number.isFinite(next) ? next : undefined,
    mediaId: response.headers.get("x-media-id") || undefined,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload one file over TUS. Returns `success: false` with `aborted: true` when
 * the signal fires; the persisted resume state is kept in that case.
 */
export async function uploadFileViaTus(
  file: File,
  options: TusUploadOptions = {},
): Promise<TusUploadResult> {
  if (!isTusEligible(file)) {
    return {
      success: false,
      message: `Resumable uploads accept ${TUS_UPLOAD_THRESHOLD_BYTES}-${TUS_CLIENT_MAX_BYTES} bytes`,
    };
  }
  if (options.signal?.aborted) {
    return { success: false, aborted: true, message: "Upload cancelled" };
  }

  try {
    let saved = loadSaved(file);
    let url = saved?.url ?? "";
    let offset = 0;

    if (saved) {
      const remoteOffset = await getOffset(saved.url, options);
      if (remoteOffset === null) {
        clearState(file);
        saved = null;
        url = "";
      } else {
        offset = Math.min(remoteOffset, file.size);
        saveState(file, { url: saved.url, offset, size: file.size });
      }
    }

    if (!saved) {
      url = await createSession(file, options);
      offset = 0;
      saveState(file, { url, offset, size: file.size });
    }

    options.onProgress?.(Math.round((offset / file.size) * 100), offset);

    let mediaId: string | undefined;
    while (offset < file.size) {
      const end = Math.min(offset + TUS_CHUNK_SIZE, file.size);
      const chunk = file.slice(offset, end);
      let attempt = 0;
      while (true) {
        try {
          const outcome = await patchChunk(url, offset, chunk, options);
          if (outcome.conflict) {
            offset = outcome.expected ?? offset;
            saveState(file, { url, offset, size: file.size });
            break;
          }
          offset = outcome.offset ?? end;
          mediaId = outcome.mediaId || mediaId;
          saveState(file, { url, offset, size: file.size });
          options.onProgress?.(Math.round((offset / file.size) * 100), offset);
          break;
        } catch (err: unknown) {
          if (options.signal?.aborted) throw err;
          attempt++;
          if (attempt >= MAX_RETRIES) throw err;
          await delay(250 * attempt);
        }
      }
      if (options.signal?.aborted) {
        return { success: false, aborted: true, message: "Upload cancelled" };
      }
    }

    if (!mediaId) {
      const response = await fetch(url, {
        method: "HEAD",
        headers: { "Tus-Resumable": "1.0.0" },
        signal: options.signal,
      });
      mediaId = response.headers.get("x-media-id") || undefined;
    }

    clearState(file);
    return { success: true, mediaId };
  } catch (err: unknown) {
    if (options.signal?.aborted || (err as Error)?.name === "AbortError") {
      return { success: false, aborted: true, message: "Upload cancelled" };
    }
    return {
      success: false,
      message: err instanceof Error ? err.message : "Resumable upload failed",
    };
  }
}

/** True when a file should use the resumable path. */
export function shouldUseTusUpload(file: File): boolean {
  return isTusEligible(file);
}

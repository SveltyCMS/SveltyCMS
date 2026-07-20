/**
 * @file src/utils/media/upload-client.ts
 * @description Client-side media upload helpers — standard form action vs streaming API.
 *
 * ### Features:
 * - auto-routing large payloads to `/api/media/stream`
 * - progress callbacks for XHR uploads
 * - abort/cancel via AbortSignal or returned handle
 * - optional client-side type filtering via `allowedTypes`
 */

/** Use streaming endpoint when any file or total batch exceeds this size */
export const STREAM_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;

export interface FileUploadProgress {
  /** 0-based index of the file currently uploading (batch mode) */
  fileIndex: number;
  /** Total files in this batch */
  fileCount: number;
  /** Filename for the active file */
  fileName: string;
  /** 0–100 overall batch progress (weighted by file size when sequential) */
  overallPercent: number;
  /** 0–100 progress for the active file only */
  filePercent: number;
}

export interface MediaUploadOptions {
  folder?: string;
  /** SvelteKit form action URL (e.g. `?/upload` or `/mediagallery?/upload`) */
  formActionUrl: string;
  onProgress?: (percent: number) => void;
  /** Finer-grained multi-file progress (preferred for batch UX) */
  onFileProgress?: (progress: FileUploadProgress) => void;
  /**
   * Upload files one-by-one for accurate per-file progress.
   * Default: true when `files.length > 1` and total size is below stream threshold.
   */
  sequential?: boolean;
  /**
   * Optional CSRF token for environments that require an explicit header
   * (e.g. cross-origin deployments). In same-origin SveltyCMS installs the
   * browser automatically attaches the `__Host-xsrf` / `__Secure-xsrf` cookie.
   */
  csrfToken?: string;
  /**
   * Optional client-side MIME type allow-list.
   * Files whose MIME type does not match any entry are skipped before upload.
   */
  allowedTypes?: string[];
  /** Abort in-flight XHR when aborted (user cancel / navigate away). */
  signal?: AbortSignal;
}

export interface MediaUploadResult {
  success: boolean;
  message?: string;
  /** True when aborted by signal / cancel handle */
  aborted?: boolean;
  /** Per-file outcomes when sequential batch upload was used */
  files?: Array<{ name: string; success: boolean; message?: string }>;
}

/** Cancelable upload handle — prefer this over fire-and-forget promises. */
export interface MediaUploadHandle {
  promise: Promise<MediaUploadResult>;
  /** Abort the active XHR immediately */
  cancel: () => void;
}

export function shouldUseStreamUpload(files: File[]): boolean {
  let total = 0;
  for (const file of files) {
    if (file.size >= STREAM_UPLOAD_THRESHOLD_BYTES) return true;
    total += file.size;
  }
  return total >= STREAM_UPLOAD_THRESHOLD_BYTES;
}

function wireAbort(xhr: XMLHttpRequest, signal?: AbortSignal, onAbort?: () => void): () => void {
  if (!signal) return () => xhr.abort();
  if (signal.aborted) {
    xhr.abort();
    onAbort?.();
    return () => {};
  }
  const handler = () => {
    xhr.abort();
    onAbort?.();
  };
  signal.addEventListener("abort", handler, { once: true });
  return () => {
    signal.removeEventListener("abort", handler);
    xhr.abort();
  };
}

/** Upload via SvelteKit form action with optional XHR progress.
 *
 *  NOTE: XHR uploads do NOT automatically attach SvelteKit's CSRF cookie.
 *  If your deployment requires the `X-CSRF-Token` header, pass `csrfToken`
 *  in `options` or ensure the cookie is SameSite/secure.
 */
export function uploadViaFormAction(
  files: File[],
  options: MediaUploadOptions,
): Promise<MediaUploadResult> {
  return uploadViaFormActionHandle(files, options).promise;
}

export function uploadViaFormActionHandle(
  files: File[],
  options: MediaUploadOptions,
): MediaUploadHandle {
  const { folder = "global", formActionUrl, onProgress, csrfToken, allowedTypes, signal } = options;

  const filtered = allowedTypes ? files.filter((f) => allowedTypes.includes(f.type)) : files;

  if (filtered.length === 0) {
    return {
      promise: Promise.resolve({ success: false, message: "No files match the allowed types" }),
      cancel: () => {},
    };
  }

  const formData = new FormData();
  for (const file of filtered) {
    formData.append("files", file);
  }
  formData.append("folder", folder);

  let cancelFn = () => {};
  const promise = new Promise<MediaUploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (result: MediaUploadResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    cancelFn = wireAbort(xhr, signal, () =>
      finish({ success: false, message: "Upload cancelled", aborted: true }),
    );

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish({ success: true });
        return;
      }
      finish({ success: false, message: `Upload failed (${xhr.status})` });
    };
    xhr.onerror = () => finish({ success: false, message: "Network error during upload" });
    xhr.onabort = () => finish({ success: false, message: "Upload cancelled", aborted: true });

    xhr.open("POST", formActionUrl);
    if (csrfToken) {
      xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    }
    xhr.send(formData);
  });

  return { promise, cancel: () => cancelFn() };
}

/** Upload large batches via `/api/media/stream`
 *
 *  Uses XMLHttpRequest (not fetch) so that progress events are available,
 *  giving users real-time feedback during large uploads.
 *
 *  NOTE: XHR uploads do NOT automatically attach SvelteKit's CSRF cookie.
 *  If your deployment requires the `X-CSRF-Token` header, pass `csrfToken`
 *  in `options` or ensure the cookie is SameSite/secure.
 */
export function uploadViaStreamApi(
  files: File[],
  options: {
    folder?: string;
    csrfToken?: string;
    allowedTypes?: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<MediaUploadResult> {
  return uploadViaStreamApiHandle(files, options).promise;
}

export function uploadViaStreamApiHandle(
  files: File[],
  options: {
    folder?: string;
    csrfToken?: string;
    allowedTypes?: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {},
): MediaUploadHandle {
  const { folder = "global", csrfToken, onProgress, signal } = options;
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  formData.append("folder", folder);

  let cancelFn = () => {};
  const promise = new Promise<MediaUploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (result: MediaUploadResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    cancelFn = wireAbort(xhr, signal, () =>
      finish({ success: false, message: "Upload cancelled", aborted: true }),
    );

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        finish({ success: false, message: `Stream upload failed (${xhr.status})` });
        return;
      }

      // Parse JSON body — do NOT silently swallow parse errors:
      // a non-JSON response means the server returned something unexpected
      // (e.g. an HTML error page), so we MUST report failure.
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        finish({
          success: false,
          message: `Upload failed: server returned non-JSON response (${xhr.status})`,
        });
        return;
      }

      const payload = (body as { data?: { files?: { success: boolean; message?: string }[] } })
        .data;
      const results = payload?.files ?? [];
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        finish({
          success: false,
          message: failed[0]?.message || `${failed.length} file(s) failed to upload`,
        });
        return;
      }

      finish({ success: true });
    };

    xhr.onerror = () => finish({ success: false, message: "Network error during stream upload" });
    xhr.onabort = () => finish({ success: false, message: "Upload cancelled", aborted: true });

    xhr.open("POST", "/api/media/stream");
    if (csrfToken) {
      xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    }
    xhr.send(formData);
  });

  return { promise, cancel: () => cancelFn() };
}

/** Pick streaming or form-action upload based on payload size */
export async function uploadMediaFiles(
  files: File[],
  options: MediaUploadOptions,
): Promise<MediaUploadResult> {
  return uploadMediaFilesHandle(files, options).promise;
}

/**
 * Sequential multi-file upload with per-file + overall progress.
 * Prefer for galleries when users select many medium files.
 */
export function uploadMediaFilesSequential(
  files: File[],
  options: MediaUploadOptions,
): MediaUploadHandle {
  const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
  let cancelled = false;
  let activeCancel: (() => void) | null = null;
  const outcomes: Array<{ name: string; success: boolean; message?: string }> = [];

  const cancel = () => {
    cancelled = true;
    activeCancel?.();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      return {
        promise: Promise.resolve({
          success: false,
          message: "Upload cancelled",
          aborted: true,
        }),
        cancel,
      };
    }
    options.signal.addEventListener("abort", cancel, { once: true });
  }

  const promise = (async (): Promise<MediaUploadResult> => {
    let completedBytes = 0;

    for (let i = 0; i < files.length; i++) {
      if (cancelled) {
        return {
          success: false,
          message: "Upload cancelled",
          aborted: true,
          files: outcomes,
        };
      }

      const file = files[i]!;
      const handle = uploadViaFormActionHandle([file], {
        ...options,
        onProgress: (filePercent) => {
          const overall = Math.min(
            100,
            Math.round(((completedBytes + (file.size * filePercent) / 100) / totalBytes) * 100),
          );
          options.onProgress?.(overall);
          options.onFileProgress?.({
            fileIndex: i,
            fileCount: files.length,
            fileName: file.name,
            overallPercent: overall,
            filePercent,
          });
        },
      });
      activeCancel = handle.cancel;
      const result = await handle.promise;
      activeCancel = null;

      if (result.aborted || cancelled) {
        outcomes.push({ name: file.name, success: false, message: "cancelled" });
        return {
          success: false,
          message: "Upload cancelled",
          aborted: true,
          files: outcomes,
        };
      }

      outcomes.push({
        name: file.name,
        success: result.success,
        message: result.message,
      });
      completedBytes += file.size;
      options.onProgress?.(Math.min(100, Math.round((completedBytes / totalBytes) * 100)));
      options.onFileProgress?.({
        fileIndex: i,
        fileCount: files.length,
        fileName: file.name,
        overallPercent: Math.min(100, Math.round((completedBytes / totalBytes) * 100)),
        filePercent: result.success ? 100 : 0,
      });

      if (!result.success) {
        return {
          success: false,
          message: result.message || `Failed on ${file.name}`,
          files: outcomes,
        };
      }
    }

    return { success: true, files: outcomes };
  })();

  return { promise, cancel };
}

/** Cancelable variant — keep the handle to call `.cancel()` from the UI. */
export function uploadMediaFilesHandle(
  files: File[],
  options: MediaUploadOptions,
): MediaUploadHandle {
  if (files.length === 0) {
    return {
      promise: Promise.resolve({ success: false, message: "No files selected" }),
      cancel: () => {},
    };
  }

  // Client-side type filtering (optional)
  let filtered = files;
  if (options.allowedTypes?.length) {
    filtered = files.filter((f) => options.allowedTypes!.includes(f.type));
    if (filtered.length === 0) {
      return {
        promise: Promise.resolve({
          success: false,
          message: "No files match the allowed types",
        }),
        cancel: () => {},
      };
    }
  }

  // Sequential multi-file for accurate per-file progress (skip for huge stream batches)
  const preferSequential =
    options.sequential !== false &&
    filtered.length > 1 &&
    !shouldUseStreamUpload(filtered) &&
    (options.onFileProgress != null || options.sequential === true);

  if (preferSequential || (options.sequential === true && filtered.length > 1)) {
    return uploadMediaFilesSequential(filtered, options);
  }

  if (shouldUseStreamUpload(filtered)) {
    return uploadViaStreamApiHandle(filtered, {
      folder: options.folder,
      csrfToken: options.csrfToken,
      onProgress: options.onProgress,
      signal: options.signal,
    });
  }

  // Single-file or multi without per-file callback — one XHR batch
  if (filtered.length === 1 && options.onFileProgress) {
    const f = filtered[0]!;
    return uploadViaFormActionHandle(filtered, {
      ...options,
      onProgress: (p) => {
        options.onProgress?.(p);
        options.onFileProgress?.({
          fileIndex: 0,
          fileCount: 1,
          fileName: f.name,
          overallPercent: p,
          filePercent: p,
        });
      },
    });
  }

  return uploadViaFormActionHandle(filtered, options);
}

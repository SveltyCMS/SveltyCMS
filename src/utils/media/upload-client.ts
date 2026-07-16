/**
 * @file src/utils/media/upload-client.ts
 * @description Client-side media upload helpers — standard form action vs streaming API.
 *
 * ### Features:
 * - auto-routing large payloads to `/api/media/stream`
 * - progress callbacks for XHR uploads
 * - optional client-side type filtering via `allowedTypes`
 */

/** Use streaming endpoint when any file or total batch exceeds this size */
export const STREAM_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;

export interface MediaUploadOptions {
  folder?: string;
  /** SvelteKit form action URL (e.g. `?/upload` or `/mediagallery?/upload`) */
  formActionUrl: string;
  onProgress?: (percent: number) => void;
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
}

export interface MediaUploadResult {
  success: boolean;
  message?: string;
}

export function shouldUseStreamUpload(files: File[]): boolean {
  let total = 0;
  for (const file of files) {
    if (file.size >= STREAM_UPLOAD_THRESHOLD_BYTES) return true;
    total += file.size;
  }
  return total >= STREAM_UPLOAD_THRESHOLD_BYTES;
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
  const { folder = "global", formActionUrl, onProgress, csrfToken, allowedTypes } = options;

  // Client-side type filtering (optional)
  const filtered = allowedTypes ? files.filter((f) => allowedTypes.includes(f.type)) : files;

  if (filtered.length === 0) {
    return Promise.resolve({ success: false, message: "No files match the allowed types" });
  }

  const formData = new FormData();
  for (const file of filtered) {
    formData.append("files", file);
  }
  formData.append("folder", folder);

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true });
        return;
      }
      resolve({ success: false, message: `Upload failed (${xhr.status})` });
    };
    xhr.onerror = () => resolve({ success: false, message: "Network error during upload" });

    xhr.open("POST", formActionUrl);
    if (csrfToken) {
      xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    }
    xhr.send(formData);
  });
}

/** Upload large batches via `/api/media/stream`
 *
 *  NOTE: `fetch()` does NOT automatically attach SvelteKit's CSRF cookie
 *  on cross-origin requests. If your deployment requires the
 *  `X-CSRF-Token` header, pass `csrfToken` in `options`.
 */
export async function uploadViaStreamApi(
  files: File[],
  options: { folder?: string; csrfToken?: string; allowedTypes?: string } = {},
): Promise<MediaUploadResult> {
  const { folder = "global", csrfToken } = options;
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  formData.append("folder", folder);

  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch("/api/media/stream", {
    method: "POST",
    headers,
    body: formData,
  });

  // Parse JSON body — do NOT silently swallow parse errors:
  // a non-JSON response means the server returned something unexpected
  // (e.g. an HTML error page), so we MUST report failure.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      success: false,
      message: `Upload failed: server returned non-JSON response (${response.status})`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      message:
        (body as { message?: string }).message || `Stream upload failed (${response.status})`,
    };
  }

  const payload = (body as { data?: { files?: { success: boolean; message?: string }[] } }).data;
  const results = payload?.files ?? [];
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    return {
      success: false,
      message: failed[0]?.message || `${failed.length} file(s) failed to upload`,
    };
  }

  return { success: true };
}

/** Pick streaming or form-action upload based on payload size */
export async function uploadMediaFiles(
  files: File[],
  options: MediaUploadOptions,
): Promise<MediaUploadResult> {
  if (files.length === 0) {
    return { success: false, message: "No files selected" };
  }

  // Client-side type filtering (optional)
  let filtered = files;
  if (options.allowedTypes?.length) {
    filtered = files.filter((f) => options.allowedTypes!.includes(f.type));
    if (filtered.length === 0) {
      return { success: false, message: "No files match the allowed types" };
    }
  }

  if (shouldUseStreamUpload(filtered)) {
    return uploadViaStreamApi(filtered, {
      folder: options.folder,
      csrfToken: options.csrfToken,
    });
  }

  return uploadViaFormAction(filtered, options);
}

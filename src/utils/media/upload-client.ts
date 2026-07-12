/**
 * @file src/utils/media/upload-client.ts
 * @description Client-side media upload helpers — standard form action vs streaming API.
 *
 * ### Features:
 * - auto-routing large payloads to `/api/media/stream`
 * - progress callbacks for XHR uploads
 */

/** Use streaming endpoint when any file or total batch exceeds this size */
export const STREAM_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;

export interface MediaUploadOptions {
  folder?: string;
  /** SvelteKit form action URL (e.g. `?/upload` or `/mediagallery?/upload`) */
  formActionUrl: string;
  onProgress?: (percent: number) => void;
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

/** Upload via SvelteKit form action with optional XHR progress */
export function uploadViaFormAction(
  files: File[],
  options: MediaUploadOptions,
): Promise<MediaUploadResult> {
  const { folder = "global", formActionUrl, onProgress } = options;
  const formData = new FormData();
  for (const file of files) {
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
    xhr.send(formData);
  });
}

/** Upload large batches via `/api/media/stream` */
export async function uploadViaStreamApi(
  files: File[],
  options: { folder?: string } = {},
): Promise<MediaUploadResult> {
  const { folder = "global" } = options;
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  formData.append("folder", folder);

  const response = await fetch("/api/media/stream", {
    method: "POST",
    body: formData,
  });

  const body = await response.json().catch(() => ({}));
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

  if (shouldUseStreamUpload(files)) {
    return uploadViaStreamApi(files, { folder: options.folder });
  }

  return uploadViaFormAction(files, options);
}

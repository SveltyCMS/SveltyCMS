/**
 * @file src/utils/media/webgpu-processor.ts
 * @description Client-side media processing engine using Canvas 2D API
 * (not WebGPU — the name is retained for backward compatibility).
 * Handles resizing, compression, and metadata generation before upload.
 *
 * ### Limitations / Future:
 * - EXIF orientation is NOT applied during canvas rendering. Images uploaded
 *   directly from cameras may appear rotated. Callers should strip/apply
 *   EXIF orientation via a library like `exifr` before passing the file here,
 *   or use `ctx.setTransform()` based on the EXIF `Orientation` tag.
 */

export interface ProcessedMedia {
  file: File;
  blurhash?: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
}

export interface OptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  generateBlurhash?: boolean;
  /** Optional AbortSignal to cancel the operation. */
  signal?: AbortSignal;
}

/**
 * Optimizes an image file in the browser before upload.
 */
export async function optimizeImage(
  file: File,
  options: OptimizationOptions = {},
): Promise<ProcessedMedia> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    generateBlurhash = true,
    signal,
  } = options;

  // Early MIME type check — reject non-image files immediately
  if (!file.type.startsWith("image/")) {
    throw new Error(`Unsupported file type: ${file.type}. Only image files are supported.`);
  }

  if (signal?.aborted) {
    throw new DOMException("Operation was aborted", "AbortError");
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    // AbortSignal support: reject if cancelled while loading
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Operation was aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    img.onload = async () => {
      URL.revokeObjectURL(url);
      signal?.removeEventListener("abort", onAbort);

      if (signal?.aborted) {
        return reject(new DOMException("Operation was aborted", "AbortError"));
      }

      let width = img.width;
      let height = img.height;

      // Calculate scaling
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas 2D context"));
        return;
      }

      // Note: EXIF orientation is NOT applied here. Callers should strip/apply
      // EXIF orientation before passing the file to this function.

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);

      // Generate placeholder (returns a data URL, not a blurhash)
      let blurhash: string | undefined;
      if (generateBlurhash) {
        try {
          blurhash = await generatePlaceholder(canvas);
        } catch {
          // Placeholder generation is best-effort — don't fail the whole operation
          blurhash = undefined;
        }
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob returned null — the canvas may be tainted or empty"));
            return;
          }

          const optimizedFile = new File([blob], file.name, {
            type: "image/webp", // Default to WebP for 2026 performance
            lastModified: Date.now(),
          });

          resolve({
            file: optimizedFile,
            blurhash,
            width,
            height,
            originalSize: file.size,
            processedSize: blob.size,
          });
        },
        "image/webp",
        quality,
      );
    };

    img.onerror = () => {
      cleanup();
      signal?.removeEventListener("abort", onAbort);
      reject(
        new Error(
          `Failed to load image: ${file.name}. The file may be corrupted or not a valid image.`,
        ),
      );
    };

    img.src = url;
  });
}

/**
 * Generates a tiny base64 placeholder for instant LCP feel.
 * Returns a low-quality data URL (not a blurhash string).
 */
async function generatePlaceholder(canvas: HTMLCanvasElement): Promise<string> {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 32;
  tempCanvas.height = 32;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(canvas, 0, 0, 32, 32);
  return tempCanvas.toDataURL("image/webp", 0.1); // Ultra-low quality tiny thumb
}

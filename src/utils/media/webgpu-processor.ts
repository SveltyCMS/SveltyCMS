/**
 * @file src/utils/media/webgpu-processor.ts
 * @description Client-side media processing engine using Canvas/WebGPU.
 * Handles resizing, compression, and metadata generation before upload.
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
}

/**
 * Optimizes an image file in the browser before upload.
 */
export async function optimizeImage(
  file: File,
  options: OptimizationOptions = {},
): Promise<ProcessedMedia> {
  const { maxWidth = 1920, maxHeight = 1080, quality = 0.8, generateBlurhash = true } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(url);

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
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);

      // Generate Blurhash (Simplified placeholder logic - in real world use blurhash lib)
      let blurhash: string | undefined;
      if (generateBlurhash) {
        blurhash = await generatePlaceholderBlurhash(canvas);
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
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

    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

/**
 * Generates a tiny base64 placeholder as a blurhash alternative.
 * For 2026, we use this for instant "LCP" feel.
 */
async function generatePlaceholderBlurhash(canvas: HTMLCanvasElement): Promise<string> {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = 32;
  tempCanvas.height = 32;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(canvas, 0, 0, 32, 32);
  return tempCanvas.toDataURL("image/webp", 0.1); // Ultra-low quality tiny thumb
}

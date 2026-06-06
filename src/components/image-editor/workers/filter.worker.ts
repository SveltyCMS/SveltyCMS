/**
 * @file src/components/image-editor/workers/filter.worker.ts
 * @description Web Worker for offloading pixel-level image filter processing.
 *
 * Receives raw ImageData and filter parameters via postMessage, performs
 * sharpness/blur convolution on a background thread, and transfers the
 * processed ImageData back via zero-copy transfer — keeping the main UI
 * thread at 60fps during slider adjustments.
 *
 * Features:
 * - Sharpness convolution (3×3 kernel, unsharp mask)
 * - Softening/blur convolution
 * - CSS filter string builder
 */

interface FilterWorkerInput {
  type: "applySharpness" | "buildFilterString";
  imageData?: ImageData;
  width?: number;
  height?: number;
  filters?: Record<string, number>;
}

interface FilterWorkerOutput {
  type: "sharpnessApplied" | "filterString" | "error";
  data?: ImageData | string;
  message?: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function buildFilterString(filters: Record<string, number>): string {
  const parts: string[] = [];

  if (filters.brightness) parts.push(`brightness(${100 + filters.brightness}%)`);
  if (filters.contrast) parts.push(`contrast(${100 + filters.contrast}%)`);
  if (filters.saturation) parts.push(`saturate(${100 + filters.saturation}%)`);

  if (filters.clarity) {
    const c = filters.clarity;
    if (c > 0) {
      parts.push(
        `contrast(${100 + c * 0.42}%)`,
        `saturate(${100 + c * 0.18}%)`,
        `brightness(${100 - c * 0.05}%)`,
      );
    } else {
      const s = Math.abs(c);
      parts.push(
        `contrast(${100 - s * 0.26}%)`,
        `brightness(${100 + s * 0.1}%)`,
        `saturate(${100 - s * 0.08}%)`,
      );
    }
  }

  if (filters.highlights) {
    const h = filters.highlights;
    if (h > 0) {
      parts.push(`brightness(${100 + h * 0.25}%)`, `contrast(${100 - h * 0.08}%)`);
    } else {
      const l = Math.abs(h);
      parts.push(`contrast(${100 + l * 0.12}%)`, `brightness(${100 - l * 0.08}%)`);
    }
  }

  if (filters.shadows) {
    const s = filters.shadows;
    if (s > 0) {
      parts.push(`brightness(${100 + s * 0.2}%)`, `contrast(${100 - s * 0.05}%)`);
    } else {
      const d = Math.abs(s);
      parts.push(`brightness(${100 - d * 0.18}%)`, `contrast(${100 + d * 0.1}%)`);
    }
  }

  if (filters.temperature) {
    const t = filters.temperature;
    if (t > 0) {
      parts.push(`sepia(${t * 0.3}%)`, `hue-rotate(${-t * 0.2}deg)`);
    } else {
      parts.push(`hue-rotate(${Math.abs(t) * 0.3}deg)`);
    }
  }

  if (filters.tint) parts.push(`hue-rotate(${filters.tint * 1.5}deg)`);
  if (filters.exposure) parts.push(`brightness(${100 + filters.exposure * 1.2}%)`);
  if (filters.vibrance) parts.push(`saturate(${100 + filters.vibrance * 0.7}%)`);

  return parts.join(" ");
}

function applySharpness(
  imageData: ImageData,
  width: number,
  height: number,
  filters: Record<string, number>,
): ImageData {
  const sharpness = filters.sharpness ?? 0;
  const clarity = filters.clarity ?? 0;
  const strength = sharpness / 72 + clarity / 92;

  if (strength === 0) return imageData;

  const { data } = imageData;
  const output = new Uint8ClampedArray(data.length);

  if (strength < 0) {
    // Softening (box blur)
    const amount = Math.min(1, Math.abs(strength));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let r = 0,
          g = 0,
          b = 0,
          n = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const py = Math.max(0, Math.min(height - 1, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const px = Math.max(0, Math.min(width - 1, x + kx));
            const si = (py * width + px) * 4;
            r += data[si];
            g += data[si + 1];
            b += data[si + 2];
            n++;
          }
        }
        output[idx] = clamp(data[idx] * (1 - amount) + (r / n) * amount);
        output[idx + 1] = clamp(data[idx + 1] * (1 - amount) + (g / n) * amount);
        output[idx + 2] = clamp(data[idx + 2] * (1 - amount) + (b / n) * amount);
        output[idx + 3] = data[idx + 3];
      }
    }
    imageData.data.set(output);
    return imageData;
  }

  // Sharpening (unsharp mask)
  const amount = Math.min(1, strength);
  const sideW = -amount * 0.6;
  const centerW = 1 + amount * 4.8;
  const totalW = centerW + sideW * 4;
  const norm = totalW !== 0 ? totalW : 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = 0,
        g = 0,
        b = 0;
      const alpha = data[idx + 3];

      for (let ky = -1; ky <= 1; ky++) {
        const py = Math.max(0, Math.min(height - 1, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const px = Math.max(0, Math.min(width - 1, x + kx));
          const si = (py * width + px) * 4;
          const w = kx === 0 && ky === 0 ? centerW : kx === 0 || ky === 0 ? sideW : 0;
          r += data[si] * w;
          g += data[si + 1] * w;
          b += data[si + 2] * w;
        }
      }
      output[idx] = clamp(r / norm);
      output[idx + 1] = clamp(g / norm);
      output[idx + 2] = clamp(b / norm);
      output[idx + 3] = alpha;
    }
  }

  imageData.data.set(output);
  return imageData;
}

self.onmessage = (e: MessageEvent<FilterWorkerInput>) => {
  const { type, imageData, width, height, filters } = e.data;
  try {
    if (type === "buildFilterString" && filters) {
      const data = buildFilterString(filters);
      self.postMessage({ type: "filterString", data } satisfies FilterWorkerOutput);
    } else if (type === "applySharpness" && imageData && width && height && filters) {
      const data = applySharpness(imageData, width, height, filters);
      // Transfer the buffer back (zero-copy)
      self.postMessage({ type: "sharpnessApplied", data } satisfies FilterWorkerOutput, [
        data.data.buffer,
      ]);
    } else {
      self.postMessage({
        type: "error",
        message: "Invalid worker input",
      } satisfies FilterWorkerOutput);
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: (err as Error).message,
    } satisfies FilterWorkerOutput);
  }
};

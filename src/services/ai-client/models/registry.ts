/**
 * @file src/services/ai-client/models/registry.ts
 * @description
 * Model metadata registry for client-side LiteRT.js models.
 *
 * Each entry describes a `.tflite` model available for browser inference,
 * including its expected location on the CDN, size, and compatibility.
 *
 * ### Adding a New Model
 * 1. Convert or download the model to `.tflite` format
 * 2. Place it at `static/ai/models/{id}.tflite`
 * 3. Add an entry to MODEL_METADATA below
 * 4. Create a wrapper in `@services/ai-client/models/`
 * 5. Add a method to the `ai` object in `@services/ai-client/index.ts`
 *
 * ### Features:
 * - model metadata (size, accelerator, license)
 * - CDN URL resolution for self-hosted vs marketplace deployments
 * - model group classification
 */

export interface ModelMetadata {
  /** Unique model identifier (matches the .tflite filename). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Brief description of what the model does. */
  description: string;
  /** Expected file size in megabytes. */
  sizeMb: number;
  /** Preferred accelerator. Falls back to CPU when unavailable. */
  preferredAccelerator: "webgpu" | "xnnpack" | "webnn";
  /** SPDX license identifier. */
  license: string;
  /** Model classification group. */
  group: "vision" | "text" | "audio" | "embedding";
  /** Whether this model requires GPU (WebGPU) for acceptable performance. */
  requiresGpu: boolean;
}

/**
 * All available models for client-side inference.
 *
 * Models are downloaded on-demand from `/ai/models/{id}.tflite`.
 * In marketplace deployments, these can be hosted on the SveltyCMS CDN.
 */
export const AI_MODELS: ModelMetadata[] = [
  {
    id: "mobilenet-v3-256",
    name: "MobileNetV3 (256px)",
    description: "Image classification for alt-text suggestion. Lightweight, fast, WebGPU-ready.",
    sizeMb: 4.5,
    preferredAccelerator: "webgpu",
    license: "Apache-2.0",
    group: "vision",
    requiresGpu: false,
  },
  {
    id: "embedding-gemma-384",
    name: "EmbeddingGemma (384d)",
    description: "Text embedding for semantic search. 384-dimensional vectors.",
    sizeMb: 18,
    preferredAccelerator: "webgpu",
    license: "Gemma",
    group: "embedding",
    requiresGpu: false,
  },
];

/**
 * Get model metadata by ID.
 */
export function getModelMetadata(modelId: string): ModelMetadata | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

/**
 * Get all models in a group.
 */
export function getModelsByGroup(group: ModelMetadata["group"]): ModelMetadata[] {
  return AI_MODELS.filter((m) => m.group === group);
}

/**
 * Total download size for all models (MB).
 */
export function totalModelSize(): number {
  return AI_MODELS.reduce((sum, m) => sum + m.sizeMb, 0);
}

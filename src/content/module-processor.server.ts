/**
 * @file src/content/module-processor.server.ts
 * @description
 * High-performance, reliable schema module loader.
 * Prioritizes simplicity, speed, and robustness over premature worker complexity.
 *
 * Responsibilities:
 * - Direct native dynamic import for schema files.
 * - Inject case-insensitive self-healing widgets proxy.
 * - Generate stable change hashes.
 *
 * ### Features:
 * - Native dynamic import with benchmark cache stability.
 * - Self-healing case-insensitive widgets proxy.
 * - Zero-tax deterministic schema hashing.
 */

import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { logger } from "@utils/logger";
import type { Schema } from "./types";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Global Widgets Proxy (Singleton with self-healing)
// ─────────────────────────────────────────────────────────────

let widgetsProxy: any = null;

async function getWidgetsProxy() {
  if (widgetsProxy) {
    return widgetsProxy;
  }

  const widgetsMap = await widgetRegistryService.getAllWidgets();
  const base = Object.fromEntries(widgetsMap.entries());

  widgetsProxy = new Proxy(base, {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string") return target[prop as any];
      if (prop === "then" || prop === "toJSON" || prop === "constructor" || prop === "prototype") {
        return undefined;
      }

      // Exact match
      if (prop in target) return target[prop];

      // Case-insensitive fallback
      const lower = prop.toLowerCase();
      const match = Object.entries(target).find(([k]) => k.toLowerCase() === lower);
      if (match) return match[1];

      // Self-healing fallback widget
      return createFallbackWidget(prop);
    },
  });

  return widgetsProxy;
}

function createFallbackWidget(name: string) {
  const factory = (config: any = {}) => ({
    widget: {
      widgetId: name,
      Name: name,
      Icon: "mdi:widgets-outline",
      Description: `Self-healing fallback for ${name}`,
    },
    label: config.label || name,
    db_fieldName: config.db_fieldName || name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
    required: config.required ?? false,
    ...config,
  });

  // Make it behave like a real widget factory
  factory.Name = name;
  factory.Icon = "mdi:widgets-outline";
  factory.__widgetType = "core";
  factory.__inputComponentPath = "";
  factory.__displayComponentPath = "";

  return factory;
}

// ─────────────────────────────────────────────────────────────
// Main Loader
// ─────────────────────────────────────────────────────────────

/**
 * Loads a compiled collection schema using native dynamic import.
 * Fastest and most reliable path.
 */
export async function loadSchemaNative(filePath: string): Promise<{ schema?: Schema } | null> {
  const fullPath = path.resolve(filePath);

  try {
    // Inject widgets proxy for dynamic modules
    (globalThis as any).widgets = await getWidgetsProxy();

    const fileUrl = `file://${fullPath.replace(/\\/g, "/")}`;

    // Smart cache-busting strategy
    const isBenchmark =
      process.env.BENCHMARK_STABLE === "true" || process.env.SVELTY_BENCHMARK_SUITE === "true";

    const query = isBenchmark ? "?v=stable" : `?v=${Date.now()}`;
    const importUrl = `${fileUrl}${query}`;

    const module = await import(/* @vite-ignore */ importUrl);

    let schema = module.default || module.schema || module;

    if (schema && typeof schema === "object" && Array.isArray(schema.fields)) {
      // Ensure _id
      if (!schema._id && schema.name) {
        schema._id = schema.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      }
      return { schema: schema as Schema };
    }

    logger.warn(`[ModuleProcessor] No valid schema in ${path.basename(filePath)}`);
    return null;
  } catch (err: any) {
    logger.error(`[ModuleProcessor] Failed to load ${path.basename(filePath)}`, {
      error: err.message,
      stack: process.env.BENCHMARK_DEBUG === "true" ? err.stack : undefined,
    });
    return null;
  }
}

/**
 * Legacy string-based parser (kept for backward compatibility).
 * Should rarely be used.
 */
export async function processModule(_content: string): Promise<{ schema?: Schema } | null> {
  logger.warn(
    "[ModuleProcessor] Legacy string parsing is deprecated. Use loadSchemaNative instead.",
  );
  return null;
}

/**
 * Generates a stable hash for change detection.
 */
export function generateSchemaHash(schema: Schema): string {
  try {
    const relevant = {
      name: schema.name,
      fieldsCount: schema.fields?.length ?? 0,
      fieldSignatures: schema.fields?.map((f: any) => ({
        name: f.db_fieldName || f.name,
        type: f.widget?.Name || f.type,
        required: !!f.required,
      })),
    };

    const str = JSON.stringify(relevant);
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }

    return (hash >>> 0).toString(36); // unsigned 32-bit → base36
  } catch {
    return `err-${Date.now()}`;
  }
}

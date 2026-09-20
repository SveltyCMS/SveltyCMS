/**
 * @file src/components/image-editor/widgets/registry.ts
 * @description Dynamic widget registry with validation and type safety
 *
 * Features:
 * - Auto-discovery of widgets via import.meta.glob
 * - Runtime validation of widget structure
 * - Ordering/categorization support
 * - Development mode warnings
 */

import { logger } from "@utils/logger";
import type { Component } from "svelte";

export interface EditorWidget {
  category?: string; // 'adjust' | 'transform' | 'annotate' | 'effects'
  controls?: Component<Record<string, unknown>>;
  description?: string;
  disabled?: boolean;
  experimental?: boolean;
  icon?: string;
  key: string;
  order?: number; // For custom ordering
  // Metadata for conditional features
  requiresImage?: boolean;
  title: string;
  tool: Component<Record<string, unknown>>;
}

// Type guard for widget validation
function isValidWidget(obj: unknown): obj is EditorWidget {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  const widget = obj as Partial<EditorWidget>;

  return !!(
    widget.key &&
    typeof widget.key === "string" &&
    widget.title &&
    typeof widget.title === "string" &&
    widget.tool
  );
}

// Load all widgets from lowercase folders
// slop:suppress — editor widget registry: the modules themselves are the registry
const modules = import.meta.glob("./*/index.ts", {
  eager: true,
}) as Record<string, { default?: EditorWidget; editorWidget?: EditorWidget }>;

// Process and validate widgets
export const editorWidgets: EditorWidget[] = Object.entries(modules)
  .map(([path, module]) => {
    const widget = module.default ?? module.editorWidget;

    if (!widget) {
      if (import.meta.env.DEV) {
        logger.warn(`[Widget Registry] No widget export found in ${path}`);
      }
      return null;
    }

    if (!isValidWidget(widget)) {
      if (import.meta.env.DEV) {
        logger.error(`[Widget Registry] Invalid widget structure in ${path}:`, widget);
      }
      return null;
    }

    // Set defaults
    return {
      requiresImage: true,
      experimental: false,
      disabled: false,
      category: "general",
      order: 999,
      ...widget,
    } as EditorWidget;
  })
  .filter((w): w is EditorWidget => w !== null)
  .filter((w) => !w.disabled) // Filter out disabled widgets
  .sort((a, b) => {
    // Sort by order, then by title
    if (a.order !== b.order) {
      return (a.order ?? 999) - (b.order ?? 999);
    }
    return a.title.localeCompare(b.title);
  });

/**
 * Check if a widget is available (not disabled, not experimental in production)
 */
export function isWidgetAvailable(widget: EditorWidget): boolean {
  if (widget.disabled) {
    return false;
  }
  if (widget.experimental && !import.meta.env.DEV) {
    return false;
  }
  return true;
}

// Development mode logging
if (import.meta.env.DEV) {
  // Only log widgets in development/benchmark mode if needed
  if (typeof process !== "undefined" && process.env && process.env.BENCHMARK_DEBUG === "true") {
    logger.debug("[Widget Registry] Loaded widgets:", editorWidgets.length);
  }
}

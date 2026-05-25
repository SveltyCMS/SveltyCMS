/**
 * @file packages/widgets/src/index.ts
 * @description Barrel export for @sveltycms/widgets — re-exports from the main src/ directory.
 *
 * ### Features:
 * - createWidget factory (type-safe widget creation)
 * - Widget types (WidgetDefinition, WidgetFactory, WidgetRecord, etc.)
 * - Widget configuration types (WidgetConfig, FieldConfig)
 */

// ── Widget Factory ───────────────────────────────────────────────────────────
export { createWidget } from "../../../src/widgets/widget-factory.js";
export type { WidgetConfig } from "../../../src/widgets/widget-factory.js";

// ── Widget Types ─────────────────────────────────────────────────────────────
export type {
  WidgetDefinition,
  WidgetFactory,
  WidgetRecord,
  WidgetProps,
  WidgetRegistry,
  WidgetRegistryEntry,
  FieldConfig,
  WidgetMetadata,
  WidgetType,
  WidgetModule,
  WidgetParam,
  WidgetPlaceholder,
} from "../../../src/widgets/types.js";

// ── Type Guards ──────────────────────────────────────────────────────────────
export {
  isWidgetFactory,
  isWidgetDefinition,
  isFieldInstance,
} from "../../../src/widgets/types.js";

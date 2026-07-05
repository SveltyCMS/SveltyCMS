/**
 * @file packages/widgets/src/index.ts
 * @description
 * Barrel export for @sveltycms/widgets — the widget system public API.
 *
 * Re-exports:
 * - createWidget() — the type-safe widget factory
 * - Widget type definitions (WidgetDefinition, WidgetFactory, FieldConfig, WidgetType, WidgetMetadata)
 * - Widget scanner exports (allWidgetModules, getComponentLoader, getWidgetNameFromPath)
 *
 * @packageDocumentation
 */

// ── Widget Factory ───────────────────────────────────────────────────
export { createWidget } from "../../../src/widgets/widget-factory";

// ── Widget Types ─────────────────────────────────────────────────────
export type {
  WidgetDefinition,
  WidgetFactory,
  FieldConfig,
  WidgetType,
  WidgetMetadata,
  WidgetProps,
  Widget,
  WidgetFunction,
  WidgetParam,
  WidgetPlaceholder,
  WidgetRegistryEntry,
  WidgetRegistry,
  WidgetRecord,
} from "../../../src/widgets/types";

export { isWidgetFactory, isWidgetDefinition, isFieldInstance } from "../../../src/widgets/types";

// ── Widget Scanner ───────────────────────────────────────────────────
export {
  allWidgetModules,
  getComponentLoader,
  getWidgetNameFromPath,
} from "../../../src/widgets/scanner";

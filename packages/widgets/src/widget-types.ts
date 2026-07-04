/**
 * @file packages/widgets/src/widget-types.ts
 * @description Sub-path export for @sveltycms/widgets/types — widget type definitions.
 */

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

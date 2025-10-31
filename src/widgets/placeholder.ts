/**
 * @file src/widgets/placeholder.ts
 * @description Defines the WidgetPlaceholder interface.
 */

export interface WidgetPlaceholder {
	__widgetId: string;
	__widgetName: string;
	__widgetConfig: Record<string, unknown>;
}

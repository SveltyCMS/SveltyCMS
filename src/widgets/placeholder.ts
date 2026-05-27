/**
 * @file src/widgets/placeholder.ts
 * @description Defines the WidgetPlaceholder interface.
 */

export interface WidgetPlaceholder {
	__widgetConfig: Record<string, unknown>;
	__widgetId: string;
	__widgetName: string;
}

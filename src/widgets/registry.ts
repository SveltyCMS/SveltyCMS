/**
 * @file src/widgets/registry.ts
 * @description Centralized widget registry to avoid circular dependencies
 */

import type { Widget } from './types';

// Widget registry to store all available widgets
const widgetRegistry = new Map<string, Widget>();

/**
 * Register a widget in the global registry
 */
export function registerWidget(widget: Widget): void {
	widgetRegistry.set(widget.Name, widget);
}

/**
 * Get a widget by name from the registry
 */
export function getWidget(name: string): Widget | undefined {
	return widgetRegistry.get(name);
}

/**
 * Get all registered widgets
 */
export function getAllWidgets(): Record<string, Widget> {
	const widgets: Record<string, Widget> = {};
	for (const [name, widget] of widgetRegistry) {
		widgets[name] = widget;
	}
	return widgets;
}

/**
 * Get all widget names
 */
export function getWidgetNames(): string[] {
	return Array.from(widgetRegistry.keys());
}

/**
 * Check if a widget is registered
 */
export function hasWidget(name: string): boolean {
	return widgetRegistry.has(name);
}

/**
 * Clear all registered widgets (useful for testing)
 */
export function clearRegistry(): void {
	widgetRegistry.clear();
}

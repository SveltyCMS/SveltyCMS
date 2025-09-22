/**
 * @file src/utils/widgetValidation.ts
 * @description Simple widget validation utilities for collections and preferences
 *
 * These utilities work directly with your existing:
 * - systemPreferences for user settings
 * - widgetStore for dynamic widgets
 * - database interface for collections
 */

import type { Layout, Schema } from '@src/content/types';

/**
 * Validate widgets in a collection schema
 */
export function validateSchemaWidgets(
	schema: Schema,
	activeWidgets: string[]
): {
	valid: boolean;
	missingWidgets: string[];
	suggestions: string[];
} {
	const usedWidgets = extractWidgetsFromSchema(schema);
	const missingWidgets = usedWidgets.filter((widget) => !activeWidgets.includes(widget));

	const suggestions = missingWidgets.map((widget) => `Activate widget '${widget}' or replace with available alternative`);

	return {
		valid: missingWidgets.length === 0,
		missingWidgets,
		suggestions
	};
}

/**
 * Validate widgets in a dashboard layout
 */
export function validateLayoutWidgets(
	layout: Layout,
	activeWidgets: string[]
): {
	valid: boolean;
	invalidWidgets: string[];
	cleanedLayout: Layout;
} {
	const invalidWidgets: string[] = [];
	const validPreferences = layout.preferences.filter((widget) => {
		if (!activeWidgets.includes(widget.component)) {
			invalidWidgets.push(widget.component);
			return false;
		}
		return true;
	});

	return {
		valid: invalidWidgets.length === 0,
		invalidWidgets,
		cleanedLayout: {
			...layout,
			preferences: validPreferences
		}
	};
}

/**
 * Extract widget names from schema fields
 */
function extractWidgetsFromSchema(schema: Schema): string[] {
	const widgets: string[] = [];

	for (const field of schema.fields) {
		if (field.widget) {
			if (typeof field.widget === 'string') {
				widgets.push(field.widget);
			} else if (field.widget.type) {
				widgets.push(field.widget.type);
			}
		}
	}

	return Array.from(new Set(widgets));
}

/**
 * Get widget dependencies for a collection
 */
export function getCollectionWidgetDependencies(schema: Schema): {
	widgets: string[];
	totalCount: number;
} {
	const widgets = extractWidgetsFromSchema(schema);

	return {
		widgets,
		totalCount: widgets.length
	};
}

/**
 * Check if a widget can be safely deactivated
 */
export function canSafelyDeactivateWidget(
	widgetName: string,
	allSchemas: Schema[],
	allLayouts: Layout[]
): {
	canDeactivate: boolean;
	usedInCollections: string[];
	usedInLayouts: string[];
} {
	const usedInCollections: string[] = [];
	const usedInLayouts: string[] = [];

	// Check collections
	for (const schema of allSchemas) {
		const schemaWidgets = extractWidgetsFromSchema(schema);
		if (schemaWidgets.includes(widgetName)) {
			usedInCollections.push(schema.name);
		}
	}

	// Check layouts
	for (const layout of allLayouts) {
		const layoutWidgets = layout.preferences.map((p) => p.component);
		if (layoutWidgets.includes(widgetName)) {
			usedInLayouts.push(layout.name);
		}
	}

	return {
		canDeactivate: usedInCollections.length === 0 && usedInLayouts.length === 0,
		usedInCollections,
		usedInLayouts
	};
}

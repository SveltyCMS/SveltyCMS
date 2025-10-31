/**
 * @file src/utils/widgetValidation.ts
 * @description Widget validation utilities for collections and preferences
 *
 * These utilities work directly with your existing:
 * - systemPreferences for user settings
 * - widgetStore for dynamic widgets
 * - database interface for collections
 *
 * Validation checks:
 * - Widget availability (exists in filesystem)
 * - Widget activation status (active in database)
 * - Collection rendering safety (all required widgets active)
 * - Dependency validation (required widgets available)
 */

import { logger } from '@utils/logger.svelte';
import type { Layout, Schema } from '@src/content/types';

/**
 * Validate widgets in a collection schema
 * Logs at DEBUG level for validation results
 */
export function validateSchemaWidgets(
	schema: Schema,
	activeWidgets: string[]
): {
	valid: boolean;
	missingWidgets: string[];
	suggestions: string[];
} {
	logger.trace('[WidgetValidation] Validating schema widgets', {
		schema: schema.name,
		activeWidgetsCount: activeWidgets.length
	});

	const usedWidgets = extractWidgetsFromSchema(schema);
	const missingWidgets = usedWidgets.filter((widget) => !activeWidgets.includes(widget));

	const suggestions = missingWidgets.map((widget) => `Activate widget '${widget}' or replace with available alternative`);

	const valid = missingWidgets.length === 0;

	logger.debug(`[WidgetValidation] Schema "${schema.name}" validation result`, {
		valid,
		missingWidgetsCount: missingWidgets.length,
		missingWidgets
	});

	return {
		valid,
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

	for (const field of schema.fields as FieldInstance[]) {
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
 * Logs at WARN level if widget is in use
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
	logger.trace('[WidgetValidation] Checking if widget can be safely deactivated', { widgetName });

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

	const canDeactivate = usedInCollections.length === 0 && usedInLayouts.length === 0;

	if (!canDeactivate) {
		logger.warn(`[WidgetValidation] Widget "${widgetName}" cannot be safely deactivated`, {
			collectionsCount: usedInCollections.length,
			layoutsCount: usedInLayouts.length,
			collections: usedInCollections,
			layouts: usedInLayouts
		});
	} else {
		logger.debug(`[WidgetValidation] Widget "${widgetName}" can be safely deactivated`);
	}

	return {
		canDeactivate,
		usedInCollections,
		usedInLayouts
	};
}

/**
 * Get affected collections when deactivating a widget
 * Useful for showing warnings to users before deactivation
 *
 * Logs at DEBUG level for troubleshooting
 */
export function getAffectedCollections(widgetName: string, schemas: Schema[]): string[] {
	logger.trace('[WidgetValidation] Checking affected collections for widget', { widgetName });

	const affected: string[] = [];

	for (const schema of schemas) {
		const schemaWidgets = extractWidgetsFromSchema(schema);
		if (schemaWidgets.includes(widgetName)) {
			affected.push(schema.name);
			logger.trace('[WidgetValidation] Widget used in collection', {
				widget: widgetName,
				collection: schema.name
			});
		}
	}

	if (affected.length > 0) {
		logger.debug(`[WidgetValidation] Widget "${widgetName}" is used in ${affected.length} collection(s)`, {
			collections: affected
		});
	} else {
		logger.debug(`[WidgetValidation] Widget "${widgetName}" is not used in any collections`);
	}

	return affected;
}

/**
 * Validate that a collection can render properly with current active widgets
 * Returns detailed information about missing/inactive widgets
 *
 * Logs at appropriate levels:
 * - WARN: User-facing issues (inactive widgets blocking rendering)
 * - DEBUG: Validation results for troubleshooting
 * - TRACE: Detailed validation flow
 */
export function validateCollectionForRendering(
	schema: Schema,
	activeWidgets: string[]
): {
	canRender: boolean;
	missingWidgets: string[];
	fieldsWithIssues: Array<{ fieldName: string; widget: string; issue: string }>;
} {
	logger.trace('[WidgetValidation] Validating collection for rendering', {
		collection: schema.name,
		activeWidgetsCount: activeWidgets.length,
		fieldsCount: schema.fields?.length || 0
	});

	const usedWidgets = extractWidgetsFromSchema(schema);
	const missingWidgets = usedWidgets.filter((widget) => !activeWidgets.includes(widget));
	const fieldsWithIssues: Array<{ fieldName: string; widget: string; issue: string }> = [];

	// Check each field for widget issues
	for (const field of schema.fields || []) {
		if (field.widget && !activeWidgets.includes(field.widget)) {
			const fieldName = field.db_fieldName || field.label || 'unknown';
			const issue = `Widget "${field.widget}" is inactive or missing. Content for this field cannot be rendered.`;

			fieldsWithIssues.push({
				fieldName,
				widget: field.widget,
				issue
			});

			// Log warning for each inactive widget (user-facing issue)
			logger.warn(`[WidgetValidation] Inactive widget in collection "${schema.name}"`, {
				field: fieldName,
				widget: field.widget,
				reason: 'Widget is not in active widgets list'
			});
		}
	}

	const canRender = missingWidgets.length === 0;

	// Log validation result
	if (!canRender) {
		logger.warn(`[WidgetValidation] Collection "${schema.name}" cannot render safely`, {
			missingWidgets,
			affectedFieldsCount: fieldsWithIssues.length
		});
	} else {
		logger.debug(`[WidgetValidation] Collection "${schema.name}" validation passed`, {
			usedWidgetsCount: usedWidgets.length
		});
	}

	return {
		canRender,
		missingWidgets,
		fieldsWithIssues
	};
}

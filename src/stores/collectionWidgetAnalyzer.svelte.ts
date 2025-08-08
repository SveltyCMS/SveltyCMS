/**
 * @file src/stores/collectionWidgetAnalyzer.svelte.ts
 * @description Utility for analyzing widget dependencies in collections
 */

import type { Schema, FieldDefinition } from '@src/content/types';
import type { WidgetPlaceholder } from '@widgets/types';
import { logger } from '@utils/logger.svelte';

export interface CollectionWidgetDependency {
	collectionId: string;
	collectionName: string;
	requiredWidgets: string[];
	optionalWidgets: string[];
	missingWidgets: string[];
}

/**
 * Extract widget type from a field definition
 */
function extractWidgetType(field: FieldDefinition): string | null {
	if (typeof field === 'object' && field !== null) {
		// Handle widget placeholder
		if ('__widgetName' in field) {
			return (field as WidgetPlaceholder).__widgetName;
		}

		// Handle direct widget field
		if ('type' in field && typeof field.type === 'string') {
			return field.type;
		}

		// Handle nested widget configuration
		if ('widget' in field && field.widget && typeof field.widget === 'object') {
			const widget = field.widget as { Name?: string; __widgetName?: string };
			if (widget.Name) return widget.Name;
			if (widget.__widgetName) return widget.__widgetName;
		}
	}

	return null;
}

/**
 * Analyze a single collection schema for widget dependencies
 */
export function analyzeCollectionWidgets(schema: Schema, activeWidgets: string[]): CollectionWidgetDependency {
	const requiredWidgets: string[] = [];
	const optionalWidgets: string[] = [];

	// Recursively analyze fields
	function analyzeFields(fields: FieldDefinition[]) {
		for (const field of fields) {
			const widgetType = extractWidgetType(field);
			if (widgetType) {
				// For now, consider all widgets as required for the collection to function
				// This could be enhanced based on field.required property
				const isRequired = typeof field === 'object' && 'required' in field ? field.required : true;

				if (isRequired) {
					if (!requiredWidgets.includes(widgetType)) {
						requiredWidgets.push(widgetType);
					}
				} else {
					if (!optionalWidgets.includes(widgetType)) {
						optionalWidgets.push(widgetType);
					}
				}
			}

			// Handle nested fields (e.g., group widgets)
			if (typeof field === 'object' && 'fields' in field && Array.isArray(field.fields)) {
				analyzeFields(field.fields);
			}
		}
	}

	analyzeFields(schema.fields);

	// Find missing widgets
	const missingWidgets = requiredWidgets.filter((widget) => !activeWidgets.includes(widget));

	return {
		collectionId: schema._id,
		collectionName: schema.name || 'Unknown',
		requiredWidgets,
		optionalWidgets,
		missingWidgets
	};
}

/**
 * Analyze multiple collections for widget dependencies
 */
export function analyzeMultipleCollections(schemas: Schema[], activeWidgets: string[]): CollectionWidgetDependency[] {
	return schemas.map((schema) => analyzeCollectionWidgets(schema, activeWidgets));
}

/**
 * Get all widgets required by any collection
 */
export function getAllRequiredWidgets(analyses: CollectionWidgetDependency[]): string[] {
	const allRequired: string[] = [];
	for (const analysis of analyses) {
		analysis.requiredWidgets.forEach((widget) => {
			if (!allRequired.includes(widget)) {
				allRequired.push(widget);
			}
		});
	}
	return allRequired;
}

/**
 * Check if a widget can be safely disabled
 * Returns false if any collection requires this widget
 */
export function canSafelyDisableWidget(
	widgetName: string,
	analyses: CollectionWidgetDependency[]
): { canDisable: boolean; reason?: string; affectedCollections: string[] } {
	const affectedCollections = analyses.filter((analysis) => analysis.requiredWidgets.includes(widgetName)).map((analysis) => analysis.collectionName);

	if (affectedCollections.length > 0) {
		return {
			canDisable: false,
			reason: `Widget is required by ${affectedCollections.length} collection(s)`,
			affectedCollections
		};
	}

	return {
		canDisable: true,
		affectedCollections: []
	};
}

/**
 * Get recommendations for widget activation based on collection usage
 */
export function getWidgetActivationRecommendations(
	analyses: CollectionWidgetDependency[],
	activeWidgets: string[]
): {
	shouldActivate: string[];
	shouldKeepActive: string[];
	canDeactivate: string[];
} {
	const allRequired = getAllRequiredWidgets(analyses);

	const shouldActivate = allRequired.filter((widget) => !activeWidgets.includes(widget));
	const shouldKeepActive = allRequired.filter((widget) => activeWidgets.includes(widget));
	const canDeactivate = activeWidgets.filter((widget) => !allRequired.includes(widget));

	return {
		shouldActivate,
		shouldKeepActive,
		canDeactivate
	};
}

/**
 * Validate collections against current widget state
 */
export function validateCollections(
	schemas: Schema[],
	activeWidgets: string[]
): {
	valid: CollectionWidgetDependency[];
	invalid: CollectionWidgetDependency[];
	warnings: string[];
} {
	const analyses = analyzeMultipleCollections(schemas, activeWidgets);

	const valid = analyses.filter((analysis) => analysis.missingWidgets.length === 0);
	const invalid = analyses.filter((analysis) => analysis.missingWidgets.length > 0);

	const warnings: string[] = [];
	for (const analysis of invalid) {
		warnings.push(`Collection "${analysis.collectionName}" is missing widgets: ${analysis.missingWidgets.join(', ')}`);
	}

	return { valid, invalid, warnings };
}

/**
 * Log collection widget analysis results
 */
export function logCollectionAnalysis(analyses: CollectionWidgetDependency[]): void {
	for (const analysis of analyses) {
		if (analysis.missingWidgets.length > 0) {
			logger.warn(`Collection "${analysis.collectionName}" has missing widgets:`, {
				collectionId: analysis.collectionId,
				missing: analysis.missingWidgets,
				required: analysis.requiredWidgets
			});
		} else {
			logger.debug(`Collection "${analysis.collectionName}" has all required widgets`, {
				collectionId: analysis.collectionId,
				required: analysis.requiredWidgets
			});
		}
	}
}

/**
 * @file src/utils/fieldSelection.ts
 * @description Utilities for optimizing database queries by selecting only necessary fields
 *
 * Performance Benefits:
 * - Reduces database query payload by 50-80%
 * - Decreases network transfer time
 * - Improves cache efficiency
 * - Faster serialization/deserialization
 *
 * @example
 * const fields = getDisplayFields(collection, 'list');
 * // Returns: ['_id', 'title', 'status', 'createdAt', 'author']
 * // Instead of all 50+ fields in the collection
 */

import type { Schema } from '@shared/database/dbInterface';
import { logger } from './logger';

/**
 * Fields that are always included regardless of view mode
 */
const ESSENTIAL_FIELDS = ['_id', 'status', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const;

/**
 * View mode types for field selection
 */
export type ViewMode = 'list' | 'edit' | 'preview';

/**
 * Configuration for which fields to display in different views
 */
export interface FieldSelectionConfig {
	/** Maximum number of fields to display in list view (excluding essential fields) */
	maxListFields?: number;
	/** Custom field names to always include in list view */
	customListFields?: string[];
	/** Whether to include all fields marked as 'showInList' */
	respectShowInList?: boolean;
}

/**
 * Gets the optimal set of fields to select based on view mode
 *
 * @param collection - The collection schema
 * @param mode - The view mode (list, edit, preview)
 * @param config - Optional configuration for field selection
 * @returns Array of field names to select from database
 */
export function getDisplayFields(collection: Schema, mode: ViewMode = 'list', config: FieldSelectionConfig = {}): string[] {
	const { maxListFields = 5, customListFields = [], respectShowInList = true } = config;

	// Edit mode needs all fields
	if (mode === 'edit') {
		return ['*']; // Query all fields
	}

	// Start with essential fields
	const selectedFields = new Set<string>([...ESSENTIAL_FIELDS]);

	// Add custom fields
	customListFields.forEach((field) => selectedFields.add(field));

	if (mode === 'list' && collection.fields) {
		const listFields: string[] = [];

		for (const field of collection.fields) {
			if (typeof field === 'object' && field !== null) {
				const fieldObj = field as Record<string, unknown>;
				const fieldName =
					(fieldObj.db_fieldName as string) ||
					(fieldObj.name as string) ||
					(fieldObj.label
						? String(fieldObj.label)
								.toLowerCase()
								.replace(/[^a-z0-9_]/g, '_')
						: null);

				if (!fieldName) continue;

				// Priority 1: Fields explicitly marked for list view
				if (respectShowInList && fieldObj.showInList === true) {
					listFields.push(fieldName);
					continue;
				}

				// Priority 2: Title/Name fields (common display fields)
				if (fieldName.toLowerCase().includes('title') || fieldName.toLowerCase().includes('name') || fieldName === 'slug') {
					listFields.push(fieldName);
					continue;
				}

				// Priority 3: Fields used for sorting (if configured)
				if (fieldObj.sortable === true && listFields.length < maxListFields) {
					listFields.push(fieldName);
					continue;
				}

				// Priority 4: First few text fields for context
				if ((fieldObj.type === 'text' || fieldObj.type === 'textarea') && listFields.length < maxListFields) {
					listFields.push(fieldName);
				}
			}
		}

		// Add the selected list fields (limited by maxListFields)
		listFields.slice(0, maxListFields).forEach((field) => selectedFields.add(field));
	}

	const result = Array.from(selectedFields);

	logger.debug(`[Field Selection] Mode: ${mode}, Selected: ${result.length} fields`, {
		fields: result.join(', '),
		collection: collection._id
	});

	return result;
}

/**
 * Converts a field name array to MongoDB projection object
 *
 * @param fields - Array of field names
 * @returns MongoDB projection object
 *
 * @example
 * createProjection(['_id', 'title', 'status'])
 * // Returns: { _id: 1, title: 1, status: 1 }
 */
export function createProjection(fields: string[]): Record<string, 1> {
	if (fields.includes('*')) {
		return {}; // Empty object means select all fields
	}

	const projection: Record<string, 1> = {};
	fields.forEach((field) => {
		projection[field] = 1;
	});

	return projection;
}

/**
 * Filters an entry object to only include specified fields
 * Useful for reducing payload size before sending to client
 *
 * @param entry - The entry object to filter
 * @param fields - Fields to keep
 * @returns Filtered entry with only specified fields
 */
export function filterEntryFields<T extends Record<string, unknown>>(entry: T, fields: string[]): Partial<T> {
	if (fields.includes('*')) {
		return entry;
	}

	const filtered: Partial<T> = {};

	for (const field of fields) {
		if (field in entry) {
			filtered[field as keyof T] = entry[field as keyof T];
		}
	}

	return filtered;
}

/**
 * Gets estimated payload size reduction percentage
 *
 * @param totalFields - Total number of fields in collection
 * @param selectedFields - Number of selected fields
 * @returns Estimated percentage reduction
 */
export function estimatePayloadReduction(totalFields: number, selectedFields: number): number {
	if (totalFields === 0) return 0;
	return Math.round(((totalFields - selectedFields) / totalFields) * 100);
}

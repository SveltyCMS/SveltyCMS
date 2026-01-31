/**
 * @file src/lib/utils/schemaComparison.ts
 * @description Schema comparison utilities for detecting breaking changes
 * 
 * Provides:
 * - Detection of field removals, renames, type changes
 * - Analysis of constraint changes (required, unique)
 * - Severity classification (blocking vs warning)
 * - Migration possibility assessment
 */

import type { Schema, FieldInstance } from '@content/types';
import type { BreakingChange, SchemaChangeType } from '$lib/schemas/collectionBuilder';

/**
 * Result of schema comparison
 */
export interface SchemaComparisonResult {
	hasChanges: boolean;
	breakingChanges: BreakingChange[];
	safeChanges: Array<{
		type: string;
		field: string;
		message: string;
	}>;
}

/**
 * Compare two schema versions to detect changes
 * @param oldSchema - Previous schema version from database
 * @param newSchema - New schema version from code/GUI
 * @param sampleData - Optional sample documents for impact analysis
 * @returns Comparison result with breaking and safe changes
 */
export function compareSchemaVersions(
	oldSchema: Schema,
	newSchema: Schema,
	sampleData?: Array<Record<string, unknown>>
): SchemaComparisonResult {
	const breakingChanges: BreakingChange[] = [];
	const safeChanges: Array<{ type: string; field: string; message: string }> = [];

	// Get field maps for easier comparison
	const oldFields = getFieldMap(oldSchema.fields as FieldInstance[]);
	const newFields = getFieldMap(newSchema.fields as FieldInstance[]);

	// Check for removed fields
	for (const [fieldName, oldField] of oldFields.entries()) {
		if (!newFields.has(fieldName)) {
			const affectedCount = countAffectedDocuments(fieldName, sampleData);
			breakingChanges.push({
				type: 'field_removed',
				field: fieldName,
				severity: affectedCount > 0 ? 'blocking' : 'warning',
				dataLoss: affectedCount > 0,
				migrationPossible: true,
				affectedCount,
				transform: `delete value` // Simple deletion transform
			});
		}
	}

	// Check for type changes and constraint changes
	for (const [fieldName, newField] of newFields.entries()) {
		const oldField = oldFields.get(fieldName);

		if (!oldField) {
			// New field added - safe change
			safeChanges.push({
				type: 'field_added',
				field: fieldName,
				message: `New field "${fieldName}" added`
			});
			continue;
		}

		// Check for widget type changes
		if (oldField.widget?.Name !== newField.widget?.Name) {
			const affectedCount = countAffectedDocuments(fieldName, sampleData);
			breakingChanges.push({
				type: 'type_changed',
				field: fieldName,
				severity: 'blocking',
				dataLoss: true,
				migrationPossible: canAutoConvert(oldField.widget?.Name, newField.widget?.Name),
				affectedCount,
				transform: generateTypeConversionTransform(oldField.widget?.Name, newField.widget?.Name)
			});
		}

		// Check for required constraint added
		if (!oldField.required && newField.required) {
			const affectedCount = countDocumentsMissingField(fieldName, sampleData);
			breakingChanges.push({
				type: 'required_added',
				field: fieldName,
				severity: affectedCount > 0 ? 'blocking' : 'warning',
				dataLoss: false,
				migrationPossible: true,
				affectedCount,
				transform: `return value ?? ''` // Set default for missing values
			});
		}

		// Check for unique constraint added
		if (!oldField.unique && newField.unique) {
			const affectedCount = countDuplicateValues(fieldName, sampleData);
			breakingChanges.push({
				type: 'unique_added',
				field: fieldName,
				severity: affectedCount > 0 ? 'blocking' : 'warning',
				dataLoss: false,
				migrationPossible: affectedCount === 0,
				affectedCount
			});
		}

		// Check for validation constraint changes
		if (hasStricterValidation(oldField, newField)) {
			const affectedCount = countInvalidDocuments(fieldName, newField, sampleData);
			if (affectedCount > 0) {
				breakingChanges.push({
					type: 'constraint_tightened',
					field: fieldName,
					severity: 'warning',
					dataLoss: false,
					migrationPossible: true,
					affectedCount
				});
			}
		}
	}

	return {
		hasChanges: breakingChanges.length > 0 || safeChanges.length > 0,
		breakingChanges,
		safeChanges
	};
}

/**
 * Build a map of field name to field instance
 */
function getFieldMap(fields: FieldInstance[]): Map<string, FieldInstance> {
	const map = new Map<string, FieldInstance>();
	
	for (const field of fields) {
		const fieldName = field.db_fieldName || field.label;
		if (fieldName) {
			map.set(fieldName, field);
		}
	}
	
	return map;
}

/**
 * Count documents that have a value for the specified field
 */
function countAffectedDocuments(
	fieldName: string,
	sampleData?: Array<Record<string, unknown>>
): number {
	if (!sampleData || sampleData.length === 0) return 0;
	
	return sampleData.filter(doc => 
		doc[fieldName] !== undefined && doc[fieldName] !== null
	).length;
}

/**
 * Count documents missing the specified field
 */
function countDocumentsMissingField(
	fieldName: string,
	sampleData?: Array<Record<string, unknown>>
): number {
	if (!sampleData || sampleData.length === 0) return 0;
	
	return sampleData.filter(doc => 
		doc[fieldName] === undefined || doc[fieldName] === null || doc[fieldName] === ''
	).length;
}

/**
 * Count documents with duplicate values for a field
 */
function countDuplicateValues(
	fieldName: string,
	sampleData?: Array<Record<string, unknown>>
): number {
	if (!sampleData || sampleData.length === 0) return 0;
	
	const values = new Set<unknown>();
	let duplicates = 0;
	
	for (const doc of sampleData) {
		const value = doc[fieldName];
		if (value !== undefined && value !== null) {
			if (values.has(value)) {
				duplicates++;
			} else {
				values.add(value);
			}
		}
	}
	
	return duplicates;
}

/**
 * Check if auto-conversion between widget types is possible
 */
function canAutoConvert(oldType?: string, newType?: string): boolean {
	if (!oldType || !newType) return false;
	
	// Safe conversions
	const safeConversions: Record<string, string[]> = {
		'text': ['textarea', 'richtext'],
		'number': ['text'],
		'email': ['text'],
		'url': ['text'],
		'date': ['text'],
		'boolean': ['text']
	};
	
	return safeConversions[oldType]?.includes(newType) || false;
}

/**
 * Generate a transform function string for type conversion
 */
function generateTypeConversionTransform(oldType?: string, newType?: string): string | undefined {
	if (!oldType || !newType) return undefined;
	
	// Simple type conversions
	if (oldType === 'number' && newType === 'text') {
		return 'return String(value)';
	}
	if (oldType === 'boolean' && newType === 'text') {
		return 'return value ? "true" : "false"';
	}
	if (oldType === 'text' && newType === 'number') {
		return 'return parseFloat(value) || 0';
	}
	
	return undefined;
}

/**
 * Check if new field has stricter validation than old field
 */
function hasStricterValidation(oldField: FieldInstance, newField: FieldInstance): boolean {
	// This is a simplified check - in production, you'd want to compare actual validation rules
	// For now, we'll check if required or unique constraints were added
	return (!oldField.required && newField.required) || (!oldField.unique && newField.unique);
}

/**
 * Count documents that would fail new validation rules
 */
function countInvalidDocuments(
	fieldName: string,
	newField: FieldInstance,
	sampleData?: Array<Record<string, unknown>>
): number {
	if (!sampleData || sampleData.length === 0) return 0;
	
	let invalid = 0;
	
	for (const doc of sampleData) {
		const value = doc[fieldName];
		
		// Check required constraint
		if (newField.required && (value === undefined || value === null || value === '')) {
			invalid++;
			continue;
		}
		
		// Additional validation checks could be added here
		// For example, checking string length, number ranges, etc.
	}
	
	return invalid;
}

/**
 * @file src/utils/schema/comparison.ts
 * @description Utilities for comparing Code vs Database schemas to detect drift.
 */

import type { Schema } from '@content/types';

export type SchemaChangeType =
	| 'field_removed'
	| 'type_changed'
	| 'required_added'
	| 'unique_added'
	| 'field_added' // Less critical, but good to track
	| 'option_changed';

export interface SchemaChange {
	type: SchemaChangeType;
	collectionId: string;
	fieldName: string;
	oldValue?: any;
	newValue?: any;
	severity: 'critical' | 'warning' | 'info';
	message: string;
	suggestion?: string;
}

export interface ComparisonResult {
	collectionId: string;
	changes: SchemaChange[];
	hasDrift: boolean;
	requiresMigration: boolean;
}

/**
 * Normalizes a field definition to a comparable object.
 * This handles differences between how fields might be stored in DB vs defined in code.
 */
function normalizeField(field: any): any {
	// Simplified normalization - in a real app this would handle specific widget props
	return {
		name: field.db_fieldName || field.name || field.label, // Best effort name resolution
		widget: field.widget?.type || field.widget,
		required: !!field.required,
		unique: !!field.unique,
		...field
	};
}

/**
 * Compares two schemas (Code vs Database) and returns differences.
 * @param codeSchema The schema defined in code (Source of Truth)
 * @param dbSchema The schema currently in the database
 */
export function compareSchemas(codeSchema: Schema, dbSchema: Schema): ComparisonResult {
	const changes: SchemaChange[] = [];
	const collectionId = codeSchema._id || 'unknown';

	// Map fields by name for O(1) lookup
	// Note: We assume db_fieldName or label is the key.
	// In SveltyCMS, fields usually have a db_fieldName.
	const codeFields = new Map<string, any>();
	codeSchema.fields.forEach((f) => {
		const norm = normalizeField(f);
		if (norm.name) codeFields.set(norm.name, norm);
	});

	const dbFields = new Map<string, any>();
	dbSchema.fields.forEach((f) => {
		const norm = normalizeField(f);
		if (norm.name) dbFields.set(norm.name, norm);
	});

	// 1. Check for Removed Fields (Critical - Data Loss Risk)
	for (const [name, dbField] of dbFields) {
		if (!codeFields.has(name)) {
			changes.push({
				type: 'field_removed',
				collectionId,
				fieldName: name,
				oldValue: dbField,
				severity: 'critical',
				message: `Field "${name}" removed - all data in this field will be lost.`,
				suggestion: `Backup data from "${name}" before proceeding if it's still needed.`
			});
		}
	}

	// 2. Check for Modified Fields
	for (const [name, codeField] of codeFields) {
		const dbField = dbFields.get(name);

		if (!dbField) {
			changes.push({
				type: 'field_added',
				collectionId,
				fieldName: name,
				newValue: codeField,
				severity: 'info',
				message: `New field "${name}" added.`,
				suggestion: 'Check if you need to set default values for existing entries.'
			});
			continue;
		}

		// Check Widget Type Change
		if (codeField.widget !== dbField.widget) {
			changes.push({
				type: 'type_changed',
				collectionId,
				fieldName: name,
				oldValue: dbField.widget,
				newValue: codeField.widget,
				severity: 'critical',
				message: `Field "${name}" type changed from "${dbField.widget}" to "${codeField.widget}".`,
				suggestion: `Verify if existing data format for "${dbField.widget}" is compatible with "${codeField.widget}".`
			});
		}

		// Check Constraints
		if (codeField.required && !dbField.required) {
			changes.push({
				type: 'required_added',
				collectionId,
				fieldName: name,
				severity: 'warning',
				message: `Field "${name}" is now required.`,
				suggestion: 'Ensure all existing entries have a value for this field to avoid validation errors.'
			});
		}

		if (codeField.unique && !dbField.unique) {
			changes.push({
				type: 'unique_added',
				collectionId,
				fieldName: name,
				severity: 'warning',
				message: `Field "${name}" now requires unique values.`,
				suggestion: 'Check for and remove duplicate values in existing entries before saving.'
			});
		}
	}

	const hasDrift = changes.length > 0;
	// Critical changes usually require manual intervention or careful migration
	const requiresMigration = changes.some((c) => c.severity === 'critical' || c.severity === 'warning');

	return {
		collectionId,
		changes,
		hasDrift,
		requiresMigration
	};
}

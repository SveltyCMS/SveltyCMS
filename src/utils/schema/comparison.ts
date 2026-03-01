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
	collectionId: string;
	fieldName: string;
	message: string;
	newValue?: any;
	oldValue?: any;
	severity: 'critical' | 'warning' | 'info';
	suggestion?: string;
	type: SchemaChangeType;
}

export interface ComparisonResult {
	changes: SchemaChange[];
	collectionId: string;
	hasDrift: boolean;
	requiresMigration: boolean;
}

export interface CompareSchemasOptions {
	/** When true, match fields by array index. Use in Collection Builder so renames (label/db_fieldName) do not trigger field_removed + field_added. */
	compareByIndex?: boolean;
}

/** Normalizes widget to a string (type only) so object vs string does not cause false type_changed. */
function normalizeField(field: any): any {
	let widgetType = '';
	if (field.widget != null) {
		const w = field.widget;
		if (typeof w === 'object') {
			widgetType =
				String((w as { type?: string }).type ?? (w as { key?: string }).key ?? (w as { Name?: string }).Name ?? '') || '';
		} else {
			widgetType = String(w);
		}
	}
	return {
		...field,
		name: field.db_fieldName || field.name || field.label,
		widget: widgetType,
		required: !!field.required,
		unique: !!field.unique
	};
}

/**
 * Compares two schemas (Code vs Database) and returns differences.
 * @param options.compareByIndex When true, match by index so renames do not produce field_removed + field_added.
 */
export function compareSchemas(
	codeSchema: Schema,
	dbSchema: Schema,
	options: CompareSchemasOptions = {}
): ComparisonResult {
	const { compareByIndex = false } = options;
	const changes: SchemaChange[] = [];
	const collectionId = codeSchema._id || 'unknown';

	const codeList = (codeSchema.fields ?? []).map((f) => normalizeField(f));
	const dbList = (dbSchema.fields ?? []).map((f) => normalizeField(f));

	if (compareByIndex) {
		const maxLen = Math.max(codeList.length, dbList.length);
		for (let i = 0; i < maxLen; i++) {
			const codeField = codeList[i];
			const dbField = dbList[i];
			const name = codeField?.name ?? dbField?.name ?? `field_${i}`;

			if (!dbField) {
				changes.push({
					type: 'field_added',
					collectionId,
					fieldName: name,
					newValue: codeField,
					severity: 'info',
					message: `New field "${name}" added at index ${i}.`,
					suggestion: 'Check if you need to set default values for existing entries.'
				});
				continue;
			}
			if (!codeField) {
				changes.push({
					type: 'field_removed',
					collectionId,
					fieldName: dbField.name ?? String(i),
					oldValue: dbField,
					severity: 'critical',
					message: `Field at index ${i} removed - all data in this field will be lost.`,
					suggestion: `Backup data before proceeding if it's still needed.`
				});
				continue;
			}

			const codeWidget = codeField.widget ?? '';
			const dbWidget = dbField.widget ?? '';
			if (codeWidget !== dbWidget && (codeWidget || dbWidget)) {
				changes.push({
					type: 'type_changed',
					collectionId,
					fieldName: name,
					oldValue: dbField.widget,
					newValue: codeField.widget,
					severity: 'critical',
					message: `Field "${name}" type changed from "${dbWidget}" to "${codeWidget}".`,
					suggestion: `Verify if existing data format for "${dbWidget}" is compatible with "${codeWidget}".`
				});
			}
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
	} else {
		const codeFields = new Map<string, any>();
		codeList.forEach((norm) => {
			if (norm.name) codeFields.set(norm.name, norm);
		});
		const dbFields = new Map<string, any>();
		dbList.forEach((norm) => {
			if (norm.name) dbFields.set(norm.name, norm);
		});

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

			const codeWidget = codeField.widget ?? '';
			const dbWidget = dbField.widget ?? '';
			if (codeWidget !== dbWidget && (codeWidget || dbWidget)) {
				changes.push({
					type: 'type_changed',
					collectionId,
					fieldName: name,
					oldValue: dbField.widget,
					newValue: codeField.widget,
					severity: 'critical',
					message: `Field "${name}" type changed from "${dbWidget}" to "${codeWidget}".`,
					suggestion: `Verify if existing data format for "${dbWidget}" is compatible with "${codeWidget}".`
				});
			}
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
	}

	const hasDrift = changes.length > 0;
	const onlyRemovals = changes.length > 0 && changes.every((c) => c.type === 'field_removed');
	const isBlockingChange = (c: SchemaChange) =>
		c.severity === 'critical' || c.severity === 'warning'
			? compareByIndex
				? c.type === 'field_removed' || c.type === 'type_changed'
				: true
			: false;
	const requiresMigration = !onlyRemovals && changes.some(isBlockingChange);

	return {
		collectionId,
		changes,
		hasDrift,
		requiresMigration
	};
}

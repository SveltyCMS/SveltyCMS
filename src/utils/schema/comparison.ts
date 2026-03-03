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
			widgetType = String((w as { type?: string }).type ?? (w as { key?: string }).key ?? (w as { Name?: string }).Name ?? '') || '';
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

/** Stable key for a field so we can match code vs db regardless of array order (avoids false type_changed on reorder). */
function fieldKey(norm: any, index: number): string {
	return (
		(norm._id != null && String(norm._id).trim()) ||
		(norm.name && String(norm.name).trim()) ||
		(norm.db_fieldName && String(norm.db_fieldName).trim()) ||
		`idx_${index}`
	);
}

/** Signature for matching fields by content when keys differ (e.g. after deletion, index-based keys no longer align). */
function fieldSignature(norm: any): string {
	const name = norm.name || norm.db_fieldName || '';
	const widget = typeof norm.widget === 'string' ? norm.widget : (norm.widget?.Name ?? norm.widget?.key ?? '');
	return `${String(widget)}\0${String(name)}`;
}

/**
 * Compares two schemas (Code vs Database) and returns differences.
 * @param options.compareByIndex When true, match by identity (id/db_fieldName) so reorder and renames do not produce false drift.
 */
export function compareSchemas(codeSchema: Schema, dbSchema: Schema, options: CompareSchemasOptions = {}): ComparisonResult {
	const { compareByIndex = false } = options;
	const changes: SchemaChange[] = [];
	const collectionId = codeSchema._id || 'unknown';

	const codeList = (codeSchema.fields ?? []).map((f) => normalizeField(f));
	const dbList = (dbSchema.fields ?? []).map((f) => normalizeField(f));

	if (compareByIndex) {
		// When lengths differ (common when deleting widgets), key-based matching can misalign and produce false adds/changes.
		// In that case, compare as a multiset by signature so deletions are recognized as pure removals.
		if (codeList.length !== dbList.length) {
			const codeBySig = new Map<string, any[]>();
			for (const f of codeList) {
				const sig = fieldSignature(f);
				const arr = codeBySig.get(sig);
				if (arr) arr.push(f);
				else codeBySig.set(sig, [f]);
			}

			const dbBySig = new Map<string, any[]>();
			for (const f of dbList) {
				const sig = fieldSignature(f);
				const arr = dbBySig.get(sig);
				if (arr) arr.push(f);
				else dbBySig.set(sig, [f]);
			}

			// Removals: present in DB but not in code (or fewer occurrences)
			for (const [sig, dbFieldsForSig] of dbBySig) {
				const codeCount = codeBySig.get(sig)?.length ?? 0;
				const removeCount = Math.max(0, dbFieldsForSig.length - codeCount);
				for (let i = 0; i < removeCount; i++) {
					const dbField = dbFieldsForSig[i] ?? { name: sig };
					changes.push({
						type: 'field_removed',
						collectionId,
						fieldName: dbField.name ?? sig,
						oldValue: dbField,
						severity: 'critical',
						message: `Field "${dbField.name ?? sig}" removed - all data in this field will be lost.`,
						suggestion: `Backup data before proceeding if it's still needed.`
					});
				}
			}

			// Adds: present in code but not in DB (or more occurrences)
			for (const [sig, codeFieldsForSig] of codeBySig) {
				const dbCount = dbBySig.get(sig)?.length ?? 0;
				const addCount = Math.max(0, codeFieldsForSig.length - dbCount);
				for (let i = 0; i < addCount; i++) {
					const codeField = codeFieldsForSig[i] ?? { name: sig };
					const name = codeField.name ?? sig;
					changes.push({
						type: 'field_added',
						collectionId,
						fieldName: name,
						newValue: codeField,
						severity: 'info',
						message: `New field "${name}" added.`,
						suggestion: 'Check if you need to set default values for existing entries.'
					});
				}
			}
		} else {
			// Match by identity (not array index) so reordering does not trigger type_changed; only real adds/removes/type changes do.
			const codeFields = new Map<string, any>();
			codeList.forEach((norm, i) => {
				codeFields.set(fieldKey(norm, i), norm);
			});
			const dbFields = new Map<string, any>();
			dbList.forEach((norm, i) => {
				dbFields.set(fieldKey(norm, i), norm);
			});

			for (const [key, dbField] of dbFields) {
				if (!codeFields.has(key)) {
					changes.push({
						type: 'field_removed',
						collectionId,
						fieldName: dbField.name ?? key,
						oldValue: dbField,
						severity: 'critical',
						message: `Field "${dbField.name ?? key}" removed - all data in this field will be lost.`,
						suggestion: `Backup data before proceeding if it's still needed.`
					});
				}
			}

			for (const [key, codeField] of codeFields) {
				const dbField = dbFields.get(key);
				const name = codeField.name ?? key;
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
		c.severity === 'critical' || c.severity === 'warning' ? (compareByIndex ? c.type === 'field_removed' || c.type === 'type_changed' : true) : false;
	let requiresMigration = !onlyRemovals && changes.some(isBlockingChange);

	// When comparing by identity: if both schemas have the same set of fields (same widget + stable id), treat as order-only — do not require migration
	if (compareByIndex && requiresMigration && codeList.length === dbList.length && codeList.length > 0) {
		const sig = (f: any) => `${f.widget ?? ''}\0${f.db_fieldName ?? f.name ?? ''}`;
		const codeSigs = new Set(codeList.map(sig));
		const dbSigs = new Set(dbList.map(sig));
		const sameSet = codeSigs.size === dbSigs.size && [...codeSigs].every((s) => dbSigs.has(s));
		if (sameSet) {
			requiresMigration = false;
		}
	}

	return {
		collectionId,
		changes,
		hasDrift,
		requiresMigration
	};
}

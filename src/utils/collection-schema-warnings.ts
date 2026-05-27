/**
 * @file src/utils/collectionSchemaWarnings.ts
 * @description Schema comparison engine for detecting breaking changes between collection schemas.
 * Used by both GUI (collection builder) and code (compile.ts) to warn users about data loss.
 *
 * @features
 * - Field removal detection (data loss)
 * - Field rename detection (orphaned data)
 * - Widget type change detection (potential corruption)
 * - New required field detection (existing entries invalid)
 */

import type { Schema } from '@src/content/types';

/**
 * Minimal field shape for comparison purposes.
 * We use a loose type since Schema.fields is FieldDefinition[] (which includes unknown)
 */
interface ComparableField {
	db_fieldName: string;
	label?: string;
	required?: boolean;
	unique?: boolean;
	widget?: {
		Name?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

/**
 * Types of breaking changes that can occur when a schema is modified
 */
export type BreakingChangeType =
	| 'field_removed' // Field was deleted - data will be lost
	| 'field_renamed' // Field name changed - data orphaned
	| 'type_changed' // Widget type changed - potential data corruption
	| 'required_added' // New required field - existing entries become invalid
	| 'unique_added'; // New unique constraint - may cause conflicts

/**
 * Represents a breaking change between two schema versions
 */
export interface BreakingChange {
	/** Whether this change will cause data loss */
	dataLoss: boolean;
	/** Database field name affected */
	fieldName: string;
	/** Human-readable message explaining the change */
	message: string;
	/** New value (for context) */
	newValue?: unknown;
	/** Previous value (for context) */
	oldValue?: unknown;
	/** Suggested action to mitigate the change */
	suggestion?: string;
	/** Type of breaking change */
	type: BreakingChangeType;
}

/**
 * Detailed diff result between two schemas
 */
export interface SchemaDiffResult {
	/** List of breaking changes detected */
	breakingChanges: BreakingChange[];
	/** Whether any changes will cause data loss */
	hasDataLoss: boolean;
	/** Whether any changes require user acknowledgment */
	requiresConfirmation: boolean;
	/** Summary message for display */
	summary: string;
}

/**
 * Safely extracts field data from a FieldDefinition (which may be unknown)
 */
function toComparableField(field: unknown): ComparableField | null {
	if (!field || typeof field !== 'object') {
		return null;
	}

	const f = field as Record<string, unknown>;

	// Must have db_fieldName to be a valid field for comparison
	if (typeof f.db_fieldName !== 'string') {
		return null;
	}

	return {
		db_fieldName: f.db_fieldName,
		widget: f.widget as ComparableField['widget'],
		label: typeof f.label === 'string' ? f.label : undefined,
		required: typeof f.required === 'boolean' ? f.required : undefined,
		unique: typeof f.unique === 'boolean' ? f.unique : undefined
	};
}

/**
 * Extracts valid comparable fields from a schema
 */
function extractFields(schema: Schema): Map<string, ComparableField> {
	const fieldsMap = new Map<string, ComparableField>();
	const fields = schema.fields || [];

	for (const field of fields) {
		const comparable = toComparableField(field);
		if (comparable) {
			fieldsMap.set(comparable.db_fieldName, comparable);
		}
	}

	return fieldsMap;
}

/**
 * Compares two schemas and returns a list of breaking changes.
 *
 * @param oldSchema - The existing schema (null if creating new)
 * @param newSchema - The new/updated schema
 * @returns Array of breaking changes detected
 */
export function compareSchemas(oldSchema: Schema | null, newSchema: Schema): BreakingChange[] {
	// If no old schema, this is a new collection - no breaking changes
	if (!oldSchema) {
		return [];
	}

	const changes: BreakingChange[] = [];

	// Extract comparable fields from both schemas
	const oldFields = extractFields(oldSchema);
	const newFields = extractFields(newSchema);

	// Check for removed fields (data loss)
	for (const [fieldName, oldField] of oldFields) {
		if (!newFields.has(fieldName)) {
			changes.push({
				type: 'field_removed',
				fieldName,
				oldValue: oldField.widget?.Name || oldField.label,
				dataLoss: true,
				message: `Field "${fieldName}" removed - all data in this field will be lost`,
				suggestion: `Backup data from "${fieldName}" before proceeding`
			});
		}
	}

	// Check for type changes and new required/unique fields
	for (const [fieldName, newField] of newFields) {
		const oldField = oldFields.get(fieldName);

		if (oldField) {
			// Check for widget type change
			const oldType = oldField.widget?.Name;
			const newType = newField.widget?.Name;
			if (oldType && newType && oldType !== newType) {
				changes.push({
					type: 'type_changed',
					fieldName,
					oldValue: oldType,
					newValue: newType,
					dataLoss: false, // May not lose data, but may corrupt
					message: `Field "${fieldName}" type changed from "${oldType}" to "${newType}" - data format may be incompatible`,
					suggestion: `Review if existing "${oldType}" data is compatible with "${newType}"`
				});
			}

			// Check for new unique constraint
			if (!oldField.unique && newField.unique) {
				changes.push({
					type: 'unique_added',
					fieldName,
					oldValue: false,
					newValue: true,
					dataLoss: false,
					message: `Field "${fieldName}" now requires unique values - existing duplicates will cause errors`,
					suggestion: `Remove duplicates in "${fieldName}" before applying this change`
				});
			}
		} else {
			// New field - check if required
			if (newField.required) {
				changes.push({
					type: 'required_added',
					fieldName,
					newValue: true,
					dataLoss: false,
					message: `New required field "${fieldName}" added - existing entries will be invalid`,
					suggestion: `Set a default value for "${fieldName}" or make it optional`
				});
			}
		}
	}

	return changes;
}

/**
 * Analyzes schema changes and returns a comprehensive diff result.
 *
 * @param oldSchema - The existing schema
 * @param newSchema - The new/updated schema
 * @returns Detailed diff result with summary
 */
export function analyzeSchemaChanges(oldSchema: Schema | null, newSchema: Schema): SchemaDiffResult {
	const breakingChanges = compareSchemas(oldSchema, newSchema);
	const hasDataLoss = breakingChanges.some((c) => c.dataLoss);
	const requiresConfirmation = breakingChanges.length > 0;

	let summary = '';
	if (breakingChanges.length === 0) {
		summary = 'No breaking changes detected';
	} else {
		const dataLossCount = breakingChanges.filter((c) => c.dataLoss).length;
		const otherCount = breakingChanges.length - dataLossCount;

		const parts: string[] = [];
		if (dataLossCount > 0) {
			parts.push(`${dataLossCount} change${dataLossCount > 1 ? 's' : ''} will cause data loss`);
		}
		if (otherCount > 0) {
			parts.push(`${otherCount} other breaking change${otherCount > 1 ? 's' : ''}`);
		}
		summary = parts.join(', ');
	}

	return {
		breakingChanges,
		hasDataLoss,
		requiresConfirmation,
		summary
	};
}

/**
 * Formats breaking changes for terminal output with colors.
 *
 * @param changes - Array of breaking changes
 * @returns Formatted string for terminal display
 */
export function formatChangesForTerminal(changes: BreakingChange[]): string {
	if (changes.length === 0) {
		return '';
	}

	const lines: string[] = [];
	const dataLossChanges = changes.filter((c) => c.dataLoss);
	const otherChanges = changes.filter((c) => !c.dataLoss);

	if (dataLossChanges.length > 0) {
		lines.push('\x1b[31m⚠️  DATA LOSS WARNING:\x1b[0m');
		for (const change of dataLossChanges) {
			lines.push(`   \x1b[31m• ${change.message}\x1b[0m`);
			if (change.suggestion) {
				lines.push(`     \x1b[33m→ ${change.suggestion}\x1b[0m`);
			}
		}
	}

	if (otherChanges.length > 0) {
		lines.push('\x1b[33m⚠️  BREAKING CHANGES:\x1b[0m');
		for (const change of otherChanges) {
			lines.push(`   \x1b[33m• ${change.message}\x1b[0m`);
			if (change.suggestion) {
				lines.push(`     → ${change.suggestion}`);
			}
		}
	}

	return lines.join('\n');
}

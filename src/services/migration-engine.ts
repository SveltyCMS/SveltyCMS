/**
 * @file src/services/migration-engine.ts
 * @description Architecture for handling Schema Migrations when Code definitions diverge from DB.
 */

import type { Schema } from '@content/types';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger';
import { compareSchemas, type CompareSchemasOptions, type SchemaChange } from '@utils/schema/comparison';

export interface MigrationPlan {
	changes: SchemaChange[];
	collectionId: string;
	impact: {
		documentsAffected: number;
		dataLossPotential: boolean;
	};
	requiresMigration: boolean;
}

export class MigrationEngine {
	/**
	 * Creates a migration plan by comparing the Code Schema (Target) vs Database Schema (Current).
	 * @param options.compareByIndex When true (Collection Builder save), match fields by index so renames do not block save.
	 */
	static async createPlan(codeSchema: Schema, options: CompareSchemasOptions = {}): Promise<MigrationPlan> {
		// 1. Fetch current DB Schema. For existing collections, fetch by id first so General Configuration
		// (e.g. name/slug/status) changes do not look up by new name and get null, which would falsely trigger drift.
		let dbSchema: Schema | null = null;

		if (dbAdapter) {
			try {
				if (codeSchema._id) {
					const byId = await dbAdapter.collection.getSchemaById(String(codeSchema._id).trim());
					if (byId.success && byId.data) {
						dbSchema = byId.data;
					}
				}
				if (dbSchema == null) {
					const byName = await dbAdapter.collection.getSchema(codeSchema.name as string);
					if (byName.success && byName.data) {
						dbSchema = byName.data;
					}
				}
			} catch (e) {
				logger.warn(`Failed to fetch schema for ${codeSchema.name}:`, e);
			}
		} else {
			logger.warn('DB Adapter not active, assuming no drift.');
		}

		// If DB schema is not found (e.g. new collection), assume it matches codeSchema (no drift)
		// OR we could return an empty schema to detect that everything is "new".
		// For safety, if it's new, we treat it as "no drift" initially, or better:
		// If dbSchema is null, it means the collection doesn't exist in DB structure yet.
		// So we can assume the "current" state is empty or non-existent.
		// For comparison purposes, comparing against an empty schema would show "everything is added".
		const currentDbSchema = dbSchema || ({ _id: codeSchema._id, name: codeSchema.name, fields: [] } as Schema);

		const comparison = compareSchemas(codeSchema, currentDbSchema, options);

		console.log('comparison', JSON.stringify(comparison));

		// 2. Assess Impact
		const dataLossPotential = comparison.changes.some((c) => c.type === 'field_removed' || c.type === 'type_changed');
		console.log('dataLossPotential', JSON.stringify(dataLossPotential));
		const documentsAffected = dbAdapter ? await dbAdapter.crud.count(codeSchema.name as string).then((res) => (res.success ? res.data : 0)) : 0;
		console.log('documentsAffected', JSON.stringify(documentsAffected));
		console.log('comparison.requiresMigration', JSON.stringify(comparison.requiresMigration));
		return {
			collectionId: codeSchema._id || 'unknown',
			changes: comparison.changes,
			requiresMigration: comparison.requiresMigration,
			impact: {
				documentsAffected,
				dataLossPotential
			}
		};
	}

	/**
	 * Executes the migration.
	 * In a real scenario, this would handle data transformation batches.
	 * For now, it updates the model definition in the DB.
	 */
	static async executeMigration(plan: MigrationPlan, codeSchema: Schema): Promise<{ success: boolean; message: string }> {
		if (plan.impact.dataLossPotential) {
			logger.warn(`Migration for ${plan.collectionId} involves potential data loss.`);
			// In a full implementation, we would create a backup here.
		}

		try {
			if (!dbAdapter) {
				throw new Error('DB Adapter not initialized');
			}
			await dbAdapter.collection.updateModel(codeSchema);
			return { success: true, message: 'Migration executed successfully.' };
		} catch (err) {
			const error = err as Error;
			logger.error('Migration failed', error);
			return { success: false, message: error.message || 'Migration failed' };
		}
	}
}

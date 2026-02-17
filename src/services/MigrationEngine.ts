/**
 * @file src/services/MigrationEngine.ts
 * @description Architecture for handling Schema Migrations when Code definitions diverge from DB.
 */

import type { Schema } from '@content/types';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger';
import { compareSchemas, type SchemaChange } from '@utils/schema/comparison';

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
	 */
	static async createPlan(codeSchema: Schema): Promise<MigrationPlan> {
		// 1. Fetch current DB Schema
		// Note: We need a way to get the *current* DB schema specifically.
		// For now we assume dbAdapter.collection.getModel returns the current model definition.
		let dbSchema: Schema | null = null;

		if (dbAdapter) {
			try {
				// Fetch the current schema from the database adapter using the agnostic interface
				const result = await dbAdapter.collection.getSchema(codeSchema.name as string);
				if (result.success && result.data) {
					dbSchema = result.data;
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

		const comparison = compareSchemas(codeSchema, currentDbSchema);

		// 2. Assess Impact
		const dataLossPotential = comparison.changes.some((c) => c.type === 'field_removed' || c.type === 'type_changed');

		const documentsAffected = dbAdapter ? await dbAdapter.crud.count(codeSchema.name as string).then((res) => (res.success ? res.data : 0)) : 0;

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

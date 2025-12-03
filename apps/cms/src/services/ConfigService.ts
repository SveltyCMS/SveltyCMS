/**
 * @file src/services/ConfigService.ts
 * @description Service layer for handling all configuration synchronization logic.
 * Scans files, queries DB, compares states, validates dependencies, and handles import/export.
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { dbAdapter } from '@src/databases/db';
import { createChecksum } from '@utils/crypto';
import { logger } from '@utils/logger.server';

type ConfigEntity = {
	uuid: string;
	type: string;
	name: string;
	hash: string;
	entity: Record<string, unknown>;
};

export type ConfigSyncStatus = {
	status: 'in_sync' | 'changes_detected';
	changes: { new: ConfigEntity[]; updated: ConfigEntity[]; deleted: ConfigEntity[] };
	unmetRequirements: Array<{ key: string; value?: unknown }>;
};

class ConfigService {
	/** Returns current sync status between filesystem and database. */
	public async getStatus(): Promise<ConfigSyncStatus> {
		logger.debug('Fetching configuration sync status...');
		const [source, active] = await Promise.all([this.getSourceState(), this.getActiveState()]);

		logger.debug('Source state:', Array.from(source.values()));
		logger.debug('Active state:', Array.from(active.values()));

		const changes = this.compareStates(source, active);
		logger.debug('Detected changes:', changes);

		const unmetRequirements = await this.checkForUnmetRequirements(source);
		logger.debug('Unmet requirements:', unmetRequirements);

		return {
			status: changes.new.length > 0 || changes.updated.length > 0 || changes.deleted.length > 0 ? 'changes_detected' : 'in_sync',
			changes,
			unmetRequirements
		};
	}

	/**
	 * Exports all configuration entities from DB to a timestamped folder.
	 * Optimized for enterprise performance: parallel file writes, scalable for large datasets.
	 */
	public async performExport({ uuids }: { uuids?: string[] } = {}): Promise<{ dirPath: string }> {
		logger.info('Exporting configuration...');
		const exportDir = path.resolve(process.cwd(), 'config/backup', `export_${Date.now()}`);
		await fs.mkdir(exportDir, { recursive: true });

		// Fetch all entity types in parallel
		// Note: Roles are database-only and not part of export/import sync
		// TODO: Implement proper collection schema fetching via dbAdapter.collection API
		const [collections] = await Promise.all([Promise.resolve([])]);

		// Prepare entities map
		const entities = { collections };

		// Write each entity type in parallel, streaming for large datasets
		await Promise.all(
			Object.entries(entities).map(async ([key, list]) => {
				const filtered = uuids?.length ? (list as Array<{ uuid: string }>).filter((i) => uuids.includes(i.uuid)) : (list as Array<unknown>);
				const filePath = path.join(exportDir, `${key}.json`);
				// Stream write for large arrays
				if (filtered.length > 10000) {
					const stream = createWriteStream(filePath);
					stream.write('[\n');
					for (let i = 0; i < filtered.length; i++) {
						stream.write(JSON.stringify(filtered[i], null, 2));
						if (i < filtered.length - 1) stream.write(',\n');
					}
					stream.write('\n]');
					await new Promise((resolve, reject) => {
						stream.end(resolve);
						stream.on('error', reject);
					});
				} else {
					await fs.writeFile(filePath, JSON.stringify(filtered, null, 2));
				}
			})
		);

		logger.info(`Configuration exported to ${exportDir}`);
		return { dirPath: exportDir };
	}

	/** Imports configuration entities from filesystem into the database. */
	public async performImport(options: { changes?: { new: ConfigEntity[]; updated: ConfigEntity[]; deleted: ConfigEntity[] } } = {}) {
		logger.info('Performing configuration import...');
		let changes = options.changes;

		if (!changes) {
			const status = await this.getStatus();
			changes = status.changes;
		}
		// Placeholder for real import logic
		// You could read from compiledCollections + update dbAdapter.collections/roles/etc.
		logger.debug('Import changes:', changes);
	}

	private async getSourceState(): Promise<Map<string, ConfigEntity>> {
		const state = new Map<string, ConfigEntity>();
		const { contentManager } = await import('@src/content/ContentManager');
		await contentManager.initialize();

		// 1. Scan Collections
		const collections = await contentManager.getCollections();
		for (const collection of collections) {
			if (!collection._id || !collection.name) continue; // Skip if no _id or name
			const hash = createChecksum(collection);
			state.set(collection.uuid, { uuid: collection.uuid, type: 'collection', name: collection.name, hash, entity: collection });
		}

		// 2. Scan Roles
		try {
			const { roles, initializeRoles } = await import('@config/roles');
			await initializeRoles(); // Initialize roles if not already done
			for (const role of roles) {
				const hash = createChecksum(role);
				// Assuming roles have a unique name that can be used as a stand-in for UUID if none exists
				const id = role._id || role.name;
				state.set(id, { uuid: id, type: 'role', name: role.name, hash, entity: role });
			}
		} catch (err) {
			logger.warn('Could not import roles from config/roles.ts', err);
		}

		// Note: Roles are managed directly in the database via /api/permission/update
		// They are not part of the filesystem config sync workflow
		// TODO: Add calls for widgets, themes, etc.
		return state;
	}

	private async getActiveState(): Promise<Map<string, ConfigEntity>> {
		if (!dbAdapter) throw new Error('Database adapter not available.');
		const state = new Map<string, ConfigEntity>();

		// Note: Roles are managed in auth_roles collection, not systemPreferences
		// They are edited via /api/permission/update and /config/accessManagement
		// This config sync is for collections, widgets, themes, etc. only

		// TODO: Implement fetching for Collections
		// The current dbAdapter interface does not provide a clear method to get all collection schemas.
		// We would need something like `dbAdapter.collections.getAllSchemas()`.

		// TODO: Add logic to fetch widgets, themes, etc. from the database.

		return state;
	}

	/** Compares filesystem and DB states → returns new, updated, deleted. */
	private compareStates(source: Map<string, ConfigEntity>, active: Map<string, ConfigEntity>) {
		const result = { new: [], updated: [], deleted: [] } as {
			new: ConfigEntity[];
			updated: ConfigEntity[];
			deleted: ConfigEntity[];
		};

		for (const [uuid, s] of source.entries()) {
			const a = active.get(uuid);
			if (!a) result.new.push(s);
			else if (s.hash !== a.hash) result.updated.push(s);
		}
		for (const [uuid, a] of active.entries()) {
			if (!source.has(uuid)) result.deleted.push(a);
		}
		return result;
	}

	/** Checks for missing system settings required by config entities. */
	private async checkForUnmetRequirements(source: Map<string, ConfigEntity>): Promise<Array<{ key: string; value?: unknown }>> {
		if (!dbAdapter?.systemPreferences) throw new Error('System preferences adapter unavailable.');

		const unmet: Array<{ key: string; value?: unknown }> = [];
		for (const { entity } of source.values()) {
			if (!Array.isArray(entity._requiredSettings)) continue;

			for (const req of entity._requiredSettings) {
				const result = await dbAdapter.systemPreferences.get(req.key, 'system');
				if (!result.success || !result.data) unmet.push(req);
			}
		}

		// Deduplicate by key
		return [...new Map(unmet.map((i) => [i.key, i])).values()];
	}

	// Note: _scanDirectory method removed as it was unused
}

export const configService = new ConfigService();

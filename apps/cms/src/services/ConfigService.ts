/**
 * @file shared/services/src/ConfigService.ts
 * @description Service layer for handling all configuration synchronization logic.
 */

// Node.js imports removed for browser compatibility
// import fs from 'fs/promises';
// import { createWriteStream } from 'fs';
// import path from 'path';
import { createChecksum } from '@shared/utils/crypto';
import { logger } from '@shared/utils/logger';
import type { IContentManager, ConfigEntity, ConfigSyncStatus } from '@cms-types';

class ConfigService {
	private contentManager: IContentManager | null = null;

	/** Sets the content manager implementation (injected from app side) */
	public setContentManager(manager: IContentManager): void {
		this.contentManager = manager;
	}
	public getContentManager(): IContentManager | null {
		return this.contentManager;
	}

	/** Returns current sync status between filesystem and database. */
	public async getStatus(): Promise<ConfigSyncStatus> {
		logger.debug('Fetching configuration sync status...');
		const [source, active] = await Promise.all([this.getSourceState(), this.getActiveState()]);

		const changes = this.compareStates(source, active);
		const unmetRequirements = await this.checkForUnmetRequirements(source);

		return {
			status: changes.new.length > 0 || changes.updated.length > 0 || changes.deleted.length > 0 ? 'changes_detected' : 'in_sync',
			changes,
			unmetRequirements
		};
	}

	public async performExport({ uuids }: { uuids?: string[] } = {}): Promise<{ dirPath: string }> {
		logger.info('Exporting configuration...');
		const path = await import('path');
		const fs = await import('fs/promises');
		const exportDir = path.resolve(process.cwd(), 'config/backup', `export_${Date.now()}`);
		await fs.mkdir(exportDir, { recursive: true });

		const [collections] = await Promise.all([Promise.resolve([])]);
		const entities = { collections };

		await Promise.all(
			Object.entries(entities).map(async ([key, list]) => {
				const filtered = uuids?.length ? (list as Array<{ uuid: string }>).filter((i) => uuids.includes(i.uuid)) : (list as Array<unknown>);
				const filePath = path.join(exportDir, `${key}.json`);
				if (filtered.length > 10000) {
					const { createWriteStream } = await import('fs');
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

	public async performImport(options: { changes?: { new: ConfigEntity[]; updated: ConfigEntity[]; deleted: ConfigEntity[] } } = {}) {
		logger.info('Performing configuration import...');
		let changes = options.changes;

		if (!changes) {
			const status = await this.getStatus();
			changes = status.changes;
		}

		logger.info('Perfoming import...');
		const { dbAdapter } = await import('@shared/database/db');

		if (!dbAdapter) throw new Error('Database adapter not available.');

		const toUpsert = [...changes.new, ...changes.updated];
		for (const item of toUpsert) {
			if (item.type === 'collection') {
				try {
					await dbAdapter.crud.upsert('collections', { name: item.name } as any, item.entity as any);
					logger.info(`Imported collection: ${item.name}`);
				} catch (err) {
					logger.error(`Failed to import collection ${item.name}:`, err);
				}
			}
		}

		for (const item of changes.deleted) {
			if (item.type === 'collection') {
				try {
					await dbAdapter.crud.delete('collections', item.uuid as any);
					logger.info(`Deleted collection: ${item.name}`);
				} catch (err) {
					logger.error(`Failed to delete collection ${item.name}:`, err);
				}
			}
		}

		logger.info('Configuration import completed.');
	}

	private async getSourceState(): Promise<Map<string, ConfigEntity>> {
		const state = new Map<string, ConfigEntity>();
		if (!this.contentManager) {
			logger.warn('ConfigService: getSourceState called but contentManager not set. Returning empty state.');
			return state;
		}

		await this.contentManager.initialize();
		const collections = await this.contentManager.getCollections();
		for (const collection of collections) {
			if (!collection._id || !collection.name) continue;
			const hash = createChecksum(collection);
			state.set(collection._id, {
				uuid: collection._id,
				type: 'collection',
				name: collection.name,
				hash,
				entity: collection as unknown as Record<string, unknown>
			});
		}

		return state;
	}

	private async getActiveState(): Promise<Map<string, ConfigEntity>> {
		const { dbAdapter } = await import('@shared/database/db');
		if (!dbAdapter) throw new Error('Database adapter not available.');
		const state = new Map<string, ConfigEntity>();

		try {
			const collectionsResult = await dbAdapter.crud.findMany('collections', {});

			if (collectionsResult.success && Array.isArray(collectionsResult.data)) {
				for (const collection of collectionsResult.data as any[]) {
					if (!collection._id || !collection.name) continue;
					const hash = createChecksum(collection);
					state.set(collection._id, {
						uuid: collection._id,
						type: 'collection',
						name: collection.name,
						hash,
						entity: collection
					});
				}
			}
		} catch (err) {
			logger.error('Failed to fetch active state from DB:', err);
		}

		return state;
	}

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

	private async checkForUnmetRequirements(source: Map<string, ConfigEntity>): Promise<Array<{ key: string; value?: unknown }>> {
		const { dbAdapter } = await import('@shared/database/db');
		if (!dbAdapter?.systemPreferences) throw new Error('System preferences adapter unavailable.');

		const unmet: Array<{ key: string; value?: unknown }> = [];
		for (const { entity } of source.values()) {
			if (!Array.isArray(entity._requiredSettings)) continue;

			for (const req of entity._requiredSettings) {
				const result = await dbAdapter.systemPreferences.get(req.key, 'system');
				if (!result.success || !result.data) unmet.push(req);
			}
		}

		return [...new Map(unmet.map((i) => [i.key, i])).values()];
	}
}

export const configService = new ConfigService();
export type { ConfigEntity, ConfigSyncStatus };

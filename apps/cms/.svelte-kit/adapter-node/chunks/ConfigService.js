import { c as createChecksum } from './crypto.js';
import { logger } from './logger.js';
class ConfigService {
	contentManager = null;
	/** Sets the content manager implementation (injected from app side) */
	setContentManager(manager) {
		this.contentManager = manager;
	}
	/** Returns current sync status between filesystem and database. */
	async getStatus() {
		const { dbAdapter } = await import('./db.js').then((n) => n.e);
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
	async performExport({ uuids } = {}) {
		logger.info('Exporting configuration...');
		const path = await import('path');
		const fs = await import('fs/promises');
		const exportDir = path.resolve(process.cwd(), 'config/backup', `export_${Date.now()}`);
		await fs.mkdir(exportDir, { recursive: true });
		const [collections] = await Promise.all([Promise.resolve([])]);
		const entities = { collections };
		await Promise.all(
			Object.entries(entities).map(async ([key, list]) => {
				const filtered = uuids?.length ? list.filter((i) => uuids.includes(i.uuid)) : list;
				const filePath = path.join(exportDir, `${key}.json`);
				if (filtered.length > 1e4) {
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
	async performImport(options = {}) {
		logger.info('Performing configuration import...');
		let changes = options.changes;
		if (!changes) {
			const status = await this.getStatus();
			changes = status.changes;
		}
		logger.info('Perfoming import...');
		const { dbAdapter } = await import('./db.js').then((n) => n.e);
		if (!dbAdapter) throw new Error('Database adapter not available.');
		const toUpsert = [...changes.new, ...changes.updated];
		for (const item of toUpsert) {
			if (item.type === 'collection') {
				try {
					await dbAdapter.crud.upsert('collections', { name: item.name }, item.entity);
					logger.info(`Imported collection: ${item.name}`);
				} catch (err) {
					logger.error(`Failed to import collection ${item.name}:`, err);
				}
			}
		}
		for (const item of changes.deleted) {
			if (item.type === 'collection') {
				try {
					await dbAdapter.crud.delete('collections', item.uuid);
					logger.info(`Deleted collection: ${item.name}`);
				} catch (err) {
					logger.error(`Failed to delete collection ${item.name}:`, err);
				}
			}
		}
		logger.info('Configuration import completed.');
	}
	async getSourceState() {
		const state = /* @__PURE__ */ new Map();
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
				entity: collection
			});
		}
		return state;
	}
	async getActiveState() {
		const { dbAdapter } = await import('./db.js').then((n) => n.e);
		if (!dbAdapter) throw new Error('Database adapter not available.');
		const state = /* @__PURE__ */ new Map();
		try {
			const collectionsResult = await dbAdapter.crud.findMany('collections', {});
			if (collectionsResult.success && Array.isArray(collectionsResult.data)) {
				for (const collection of collectionsResult.data) {
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
	compareStates(source, active) {
		const result = { new: [], updated: [], deleted: [] };
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
	async checkForUnmetRequirements(source) {
		const { dbAdapter } = await import('./db.js').then((n) => n.e);
		if (!dbAdapter?.systemPreferences) throw new Error('System preferences adapter unavailable.');
		const unmet = [];
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
const configService = new ConfigService();
export { configService };
//# sourceMappingURL=ConfigService.js.map

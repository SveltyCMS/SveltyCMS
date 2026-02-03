/**
 * @file src/databases/webhookWrapper.ts
 * @description A Smart Proxy wrapper for the Database Adapter to trigger webhooks centrally.
 * This ensures that all mutations (CRUD, Media) trigger the appropriate webhooks
 * regardless of which API route or service initiates the change.
 */

import type { IDBAdapter } from './dbInterface';
import { logger } from '@utils/logger.server';

// Constants for identifying events
const CONTENT_COLLECTION_PREFIX = 'collection_';

export async function wrapAdapterWithWebhooks(adapter: IDBAdapter): Promise<IDBAdapter> {
	// Dynamically import webhookService to avoid circular dependency with db.ts
	const { webhookService } = await import('@src/services/webhookService');

	logger.info('🔌 Webhook Proxy Wrapper active on Database Adapter');

	// --- Wrap CRUD Operations ---
	const originalCrud = adapter.crud;
	adapter.crud = {
		...originalCrud,

		insert: async (collection, data) => {
			const res = await originalCrud.insert(collection, data);
			if (res.success && (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === 'MediaItem')) {
				const event = collection === 'MediaItem' ? 'media:upload' : 'entry:create';
				webhookService.trigger(event as any, { collection, data: res.data });
			}
			return res;
		},

		insertMany: async (collection, data) => {
			const res = await originalCrud.insertMany(collection, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				res.data.forEach((item) => {
					webhookService.trigger('entry:create', { collection, data: item });
				});
			}
			return res;
		},

		update: async (collection, id, data) => {
			const res = await originalCrud.update(collection, id, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				// Detect status changes for publish/unpublish events
				let event: any = 'entry:update';
				if ('status' in data) {
					if (data.status === 'publish') event = 'entry:publish';
					else if (data.status === 'unpublish') event = 'entry:unpublish';
				}
				webhookService.trigger(event, { collection, id, data: res.data });
			}
			return res;
		},

		updateMany: async (collection, query, data) => {
			const res = await originalCrud.updateMany(collection, query, data);
			// For bulk updates, we don't know the full data of each item easily without re-querying.
			// We trigger a generic bulk update event or multiple updates if possible.
			// For now, we trigger one generic event or we can skip if it's too heavy.
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				webhookService.trigger('entry:update', { collection, query, changes: data, modifiedCount: res.data.modifiedCount });
			}
			return res;
		},

		delete: async (collection, id) => {
			const res = await originalCrud.delete(collection, id);
			if (res.success && (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === 'MediaItem')) {
				const event = collection === 'MediaItem' ? 'media:delete' : 'entry:delete';
				webhookService.trigger(event as any, { collection, id });
			}
			return res;
		},

		deleteMany: async (collection, query) => {
			const res = await originalCrud.deleteMany(collection, query);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				webhookService.trigger('entry:delete', { collection, query, deletedCount: res.data.deletedCount });
			}
			return res;
		},

		upsert: async (collection, query, data) => {
			const res = await originalCrud.upsert(collection, query, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				// We don't know if it was an insert or update easily without looking at the result
				webhookService.trigger('entry:update', { collection, query, data: res.data });
			}
			return res;
		}
	};

	// --- Wrap Media Operations ---
	const originalMedia = adapter.media.files;
	adapter.media.files = {
		...originalMedia,
		upload: async (file) => {
			const res = await originalMedia.upload(file);
			if (res.success) {
				webhookService.trigger('media:upload', { data: res.data });
			}
			return res;
		},
		uploadMany: async (files) => {
			const res = await originalMedia.uploadMany(files);
			if (res.success) {
				res.data.forEach((file) => webhookService.trigger('media:upload', { data: file }));
			}
			return res;
		},
		delete: async (id) => {
			const res = await originalMedia.delete(id);
			if (res.success) {
				webhookService.trigger('media:delete', { id });
			}
			return res;
		},
		deleteMany: async (ids) => {
			const res = await originalMedia.deleteMany(ids);
			if (res.success) {
				webhookService.trigger('media:delete', { ids });
			}
			return res;
		}
	};

	return adapter;
}

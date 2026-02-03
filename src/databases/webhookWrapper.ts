/**
 * @file src/databases/webhookWrapper.ts
 * @description A Smart Proxy wrapper for the Database Adapter to trigger webhooks centrally.
 * This ensures that all mutations (CRUD, Media) trigger the appropriate webhooks
 * regardless of which API route or service initiates the change.
 *
 * IMPORTANT: Uses Proxy instead of object spread to preserve prototype methods
 * (count, findOne, findMany, etc.) on class-based adapter instances.
 */

import type { IDBAdapter, ICrudAdapter, IMediaAdapter } from './dbInterface';
import { logger } from '@utils/logger.server';

// Constants for identifying events
const CONTENT_COLLECTION_PREFIX = 'collection_';

export async function wrapAdapterWithWebhooks(adapter: IDBAdapter): Promise<IDBAdapter> {
	// Dynamically import webhookService to avoid circular dependency with db.ts
	const { webhookService } = await import('@src/services/webhookService');

	logger.info('🔌 Webhook Proxy Wrapper active on Database Adapter');

	// --- Wrap CRUD Operations ---
	// Use a Proxy instead of object spread to preserve prototype methods (count, findOne, findMany, etc.)
	// Object spread only copies own enumerable properties, losing all prototype methods on class instances.
	const originalCrud = adapter.crud;

	const crudOverrides: Record<string, Function> = {
		insert: async (collection: string, data: any) => {
			const res = await originalCrud.insert(collection, data);
			if (res.success && (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === 'MediaItem')) {
				const event = collection === 'MediaItem' ? 'media:upload' : 'entry:create';
				webhookService.trigger(event as any, { collection, data: res.data });
			}
			return res;
		},

		insertMany: async (collection: string, data: any) => {
			const res = await originalCrud.insertMany(collection, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				res.data.forEach((item: any) => {
					webhookService.trigger('entry:create', { collection, data: item });
				});
			}
			return res;
		},

		update: async (collection: string, id: any, data: any) => {
			const res = await originalCrud.update(collection, id, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				let event: any = 'entry:update';
				if ('status' in data) {
					if (data.status === 'publish') event = 'entry:publish';
					else if (data.status === 'unpublish') event = 'entry:unpublish';
				}
				webhookService.trigger(event, { collection, id, data: res.data });
			}
			return res;
		},

		updateMany: async (collection: string, query: any, data: any) => {
			const res = await originalCrud.updateMany(collection, query, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				webhookService.trigger('entry:update', { collection, query, changes: data, modifiedCount: res.data.modifiedCount });
			}
			return res;
		},

		delete: async (collection: string, id: any) => {
			const res = await originalCrud.delete(collection, id);
			if (res.success && (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === 'MediaItem')) {
				const event = collection === 'MediaItem' ? 'media:delete' : 'entry:delete';
				webhookService.trigger(event as any, { collection, id });
			}
			return res;
		},

		deleteMany: async (collection: string, query: any) => {
			const res = await originalCrud.deleteMany(collection, query);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				webhookService.trigger('entry:delete', { collection, query, deletedCount: res.data.deletedCount });
			}
			return res;
		},

		upsert: async (collection: string, query: any, data: any) => {
			const res = await originalCrud.upsert(collection, query, data);
			if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
				webhookService.trigger('entry:update', { collection, query, data: res.data });
			}
			return res;
		}
	};

	adapter.crud = new Proxy(originalCrud, {
		get(target, prop, receiver) {
			// Return webhook-wrapped version for mutation methods
			if (typeof prop === 'string' && prop in crudOverrides) {
				return crudOverrides[prop];
			}
			// Forward all other property/method access to the original, preserving `this` binding
			const value = Reflect.get(target, prop, receiver);
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		}
	}) as typeof originalCrud;

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
				res.data.forEach((file: any) => webhookService.trigger('media:upload', { data: file }));
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

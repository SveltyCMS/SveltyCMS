/**
 * @file src/databases/webhookWrapper.ts
 * @description A Smart Proxy wrapper for the Database Adapter to trigger webhooks centrally.
 * This ensures that all mutations (CRUD, Media) trigger the appropriate webhooks
 * regardless of which API route or service initiates the change.
 *
 * IMPORTANT: This wrapper uses lazy property access to avoid triggering
 * "DB not connected" errors during initialization. The adapter getters are only
 * accessed when the wrapped methods are actually called (after connection).
 */

import type { IDBAdapter, ICrudAdapter, IMediaAdapter } from './dbInterface';
import { logger } from '@utils/logger.server';

// Constants for identifying events
const CONTENT_COLLECTION_PREFIX = 'collection_';

export async function wrapAdapterWithWebhooks(adapter: IDBAdapter): Promise<IDBAdapter> {
	// Dynamically import webhookService to avoid circular dependency with db.ts
	const { webhookService } = await import('@src/services/webhookService');

	logger.info('🔌 Webhook Proxy Wrapper active on Database Adapter');

	// --- Wrap CRUD Operations (Lazy Access) ---
	// We use Object.defineProperty to create a getter that wraps the original
	// This ensures we only access adapter.crud when it's actually used (after connect)

	const originalCrudDescriptor = Object.getOwnPropertyDescriptor(adapter, 'crud');

	Object.defineProperty(adapter, 'crud', {
		get(): ICrudAdapter {
			// Access the original crud (will throw if not connected, which is correct behavior)
			const originalCrud = originalCrudDescriptor?.get
				? originalCrudDescriptor.get.call(adapter)
				: (adapter as any)._crud || (adapter as any)._cachedCrud;

			if (!originalCrud) {
				throw new Error('CRUD adapter not available');
			}

			// Return wrapped version
			return {
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
						res.data.forEach((item: any) => {
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
						webhookService.trigger('entry:update', { collection, query, data: res.data });
					}
					return res;
				}
			};
		},
		configurable: true,
		enumerable: true
	});

	// --- Wrap Media Operations (Lazy Access) ---
	const originalMediaDescriptor = Object.getOwnPropertyDescriptor(adapter, 'media');

	Object.defineProperty(adapter, 'media', {
		get(): IMediaAdapter {
			// Access the original media (will throw if not connected, which is correct behavior)
			const originalMedia = originalMediaDescriptor?.get
				? originalMediaDescriptor.get.call(adapter)
				: (adapter as any)._media || (adapter as any)._cachedMedia;

			if (!originalMedia) {
				throw new Error('Media adapter not available');
			}

			const originalFiles = originalMedia.files;

			// Return wrapped version
			return {
				...originalMedia,
				files: {
					...originalFiles,
					upload: async (file) => {
						const res = await originalFiles.upload(file);
						if (res.success) {
							webhookService.trigger('media:upload', { data: res.data });
						}
						return res;
					},
					uploadMany: async (files) => {
						const res = await originalFiles.uploadMany(files);
						if (res.success) {
							res.data.forEach((file: any) => webhookService.trigger('media:upload', { data: file }));
						}
						return res;
					},
					delete: async (id) => {
						const res = await originalFiles.delete(id);
						if (res.success) {
							webhookService.trigger('media:delete', { id });
						}
						return res;
					},
					deleteMany: async (ids) => {
						const res = await originalFiles.deleteMany(ids);
						if (res.success) {
							webhookService.trigger('media:delete', { ids });
						}
						return res;
					}
				}
			};
		},
		configurable: true,
		enumerable: true
	});

	return adapter;
}

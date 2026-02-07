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

	// --- Wrap CRUD Operations (Lazy Access) ---
	let originalCrudDescriptor: PropertyDescriptor | undefined;
	let proto = adapter;
	while (proto && !originalCrudDescriptor) {
		originalCrudDescriptor = Object.getOwnPropertyDescriptor(proto, 'crud');
		if (originalCrudDescriptor) break;
		proto = Object.getPrototypeOf(proto);
	}

	Object.defineProperty(adapter, 'crud', {
		get(): ICrudAdapter {
			const originalCrud = originalCrudDescriptor?.get
				? originalCrudDescriptor.get.call(adapter)
				: (adapter as any)._crud || (adapter as any)._cachedCrud || (adapter as any).crud;

			if (!originalCrud) {
				throw new Error('CRUD adapter not available');
			}

			// Define mutations to intercept
			const wrappedMethods: Partial<ICrudAdapter> = {
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

			// Return Proxy to preserve all other methods (count, findOne, etc.)
			return new Proxy(originalCrud, {
				get(target, prop, receiver) {
					if (prop in wrappedMethods) {
						return (wrappedMethods as any)[prop];
					}
					const value = Reflect.get(target, prop, receiver);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		}
	});

	// --- Wrap Media Operations (Lazy Access) ---
	let originalMediaDescriptor: PropertyDescriptor | undefined;
	let mediaProto = adapter;
	while (mediaProto && !originalMediaDescriptor) {
		originalMediaDescriptor = Object.getOwnPropertyDescriptor(mediaProto, 'media');
		if (originalMediaDescriptor) break;
		mediaProto = Object.getPrototypeOf(mediaProto);
	}

	Object.defineProperty(adapter, 'media', {
		get(): IMediaAdapter {
			const originalMedia = originalMediaDescriptor?.get
				? originalMediaDescriptor.get.call(adapter)
				: (adapter as any)._media || (adapter as any)._cachedMedia || (adapter as any).media;

			if (!originalMedia) {
				throw new Error('Media adapter not available');
			}

			const originalFiles = originalMedia.files;

			// Define mutations to intercept for files
			const wrappedFiles: Partial<IMediaAdapter['files']> = {
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
			};

			// Return Proxy for media to preserve all methods, including wrapped files
			return new Proxy(originalMedia, {
				get(target, prop, receiver) {
					if (prop === 'files') {
						// Wrap files object with its own proxy
						return new Proxy(originalFiles, {
							get(fTarget, fProp, fReceiver) {
								if (fProp in wrappedFiles) {
									return (wrappedFiles as any)[fProp];
								}
								const fValue = Reflect.get(fTarget, fProp, fReceiver);
								return typeof fValue === 'function' ? fValue.bind(fTarget) : fValue;
							}
						});
					}
					const value = Reflect.get(target, prop, receiver);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		}
	});

	return adapter;
}

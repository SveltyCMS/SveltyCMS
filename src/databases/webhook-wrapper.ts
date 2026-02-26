/**
 * @file src\databases\webhook-wrapper.ts
 * @description A Smart Proxy wrapper for the Database Adapter to trigger webhooks centrally.
 * This ensures that all mutations (CRUD, Media) trigger the appropriate webhooks
 * regardless of which API route or service initiates the change.
 *
 * IMPORTANT: Uses Proxy instead of object spread to preserve prototype methods
 * (count, findOne, findMany, etc.) on class-based adapter instances.
 */

import type { WebhookEvent } from '@src/services/webhook-service';
import { logger } from '@utils/logger.server';
import type { ICrudAdapter, IDBAdapter, IMediaAdapter } from './db-interface';

// Constants for identifying events
const CONTENT_COLLECTION_PREFIX = 'collection_';

export async function wrapAdapterWithWebhooks(adapter: IDBAdapter): Promise<IDBAdapter> {
	// Dynamically import webhookService to avoid circular dependency with db.ts
	const { webhookService } = await import('@src/services/webhook-service');

	logger.info('🔌 Webhook Proxy Wrapper active on Database Adapter');

	// --- Wrap CRUD Operations (Lazy Access) ---
	// Capture the original property value or getter before redefining
	let originalCrud: ICrudAdapter | undefined;

	// Check instance first
	if (Object.hasOwn(adapter, 'crud')) {
		originalCrud = adapter.crud;
	} else {
		// Check prototype chain
		let proto = Object.getPrototypeOf(adapter);
		while (proto) {
			const desc = Object.getOwnPropertyDescriptor(proto, 'crud');
			if (desc) {
				if (desc.get) {
					originalCrud = desc.get.call(adapter);
				} else {
					originalCrud = desc.value;
				}
				break;
			}
			proto = Object.getPrototypeOf(proto);
		}
	}

	if (!originalCrud) {
		// Fallback for some adapter structures
		const internalAdapter = adapter as unknown as Record<string, ICrudAdapter>;
		originalCrud = internalAdapter._crud || internalAdapter._cachedCrud;
	}

	if (originalCrud) {
		const capturedCrud = originalCrud; // Closure capture

		Object.defineProperty(adapter, 'crud', {
			get(): ICrudAdapter {
				// Define mutations to intercept
				const wrappedMethods: Partial<ICrudAdapter> = {
					// --- Explicitly Proxy Read Methods (Fix for Proxy ambiguity) ---
					count: async (collection, query) => {
						return await capturedCrud.count(collection, query);
					},
					findOne: async (collection, query, options) => {
						return await capturedCrud.findOne(collection, query, options);
					},
					findMany: async (collection, query, options) => {
						return await capturedCrud.findMany(collection, query, options);
					},
					findByIds: async (collection, ids, options) => {
						return await capturedCrud.findByIds(collection, ids, options);
					},
					exists: async (collection, query) => {
						return await capturedCrud.exists(collection, query);
					},
					aggregate: async (collection, pipeline) => {
						return await capturedCrud.aggregate(collection, pipeline);
					},

					// --- Wrapped Mutation Methods ---
					insert: async (collection, data) => {
						const res = await capturedCrud.insert(collection, data);
						if (res.success && (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === 'MediaItem')) {
							const event: WebhookEvent = collection === 'MediaItem' ? 'media:upload' : 'entry:create';
							webhookService.trigger(event, {
								collection,
								data: res.data
							});
						}
						return res;
					},

					insertMany: async (collection, data) => {
						const res = await capturedCrud.insertMany(collection, data);
						if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
							for (const item of res.data) {
								webhookService.trigger('entry:create', {
									collection,
									data: item
								});
							}
						}
						return res;
					},

					update: async (collection, id, data) => {
						const res = await capturedCrud.update(collection, id, data);
						if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
							let event: WebhookEvent = 'entry:update';
							if ('status' in data) {
								if (data.status === 'publish') {
									event = 'entry:publish';
								} else if (data.status === 'unpublish') {
									event = 'entry:unpublish';
								}
							}
							webhookService.trigger(event, { collection, id, data: res.data });
						}
						return res;
					},

					updateMany: async (collection, query, data) => {
						const res = await capturedCrud.updateMany(collection, query, data);
						if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
							webhookService.trigger('entry:update', {
								collection,
								query,
								changes: data,
								modifiedCount: res.data.modifiedCount
							});
						}
						return res;
					},

					delete: async (collection, id) => {
						const res = await capturedCrud.delete(collection, id);
						if (res.success && (collection.startsWith(CONTENT_COLLECTION_PREFIX) || collection === 'MediaItem')) {
							const event: WebhookEvent = collection === 'MediaItem' ? 'media:delete' : 'entry:delete';
							webhookService.trigger(event, { collection, id });
						}
						return res;
					},

					deleteMany: async (collection, query) => {
						const res = await capturedCrud.deleteMany(collection, query);
						if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
							webhookService.trigger('entry:delete', {
								collection,
								query,
								deletedCount: res.data.deletedCount
							});
						}
						return res;
					},

					upsert: async (collection, query, data) => {
						const res = await capturedCrud.upsert(collection, query, data);
						if (res.success && collection.startsWith(CONTENT_COLLECTION_PREFIX)) {
							webhookService.trigger('entry:update', {
								collection,
								query,
								data: res.data
							});
						}
						return res;
					}
				};

				// Return Proxy to preserve all other methods (count, findOne, etc.)
				return new Proxy(capturedCrud, {
					get(target, prop, receiver) {
						if (typeof prop === 'string' && prop in wrappedMethods) {
							return wrappedMethods[prop as keyof ICrudAdapter];
						}
						const value = Reflect.get(target, prop, receiver);
						return typeof value === 'function' ? value.bind(target) : value;
					}
				});
			}
		});
	} else {
		logger.warn('Could not wrap CRUD adapter - original object not found');
	}

	// --- Wrap Media Operations (Lazy Access) ---
	let originalMedia: IMediaAdapter | undefined;

	// Check instance first
	if (Object.hasOwn(adapter, 'media')) {
		originalMedia = adapter.media;
	} else {
		// Check prototype chain
		let proto = Object.getPrototypeOf(adapter);
		while (proto) {
			const desc = Object.getOwnPropertyDescriptor(proto, 'media');
			if (desc) {
				if (desc.get) {
					originalMedia = desc.get.call(adapter);
				} else {
					originalMedia = desc.value;
				}
				break;
			}
			proto = Object.getPrototypeOf(proto);
		}
	}

	if (originalMedia) {
		const capturedMedia = originalMedia; // Closure capture

		Object.defineProperty(adapter, 'media', {
			get(): IMediaAdapter {
				const originalFiles = capturedMedia.files;

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
							for (const file of res.data) {
								webhookService.trigger('media:upload', { data: file });
							}
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
				return new Proxy(capturedMedia, {
					get(target, prop, receiver) {
						if (prop === 'files') {
							// Wrap files object with its own proxy
							return new Proxy(originalFiles, {
								get(fTarget, fProp, fReceiver) {
									if (typeof fProp === 'string' && fProp in wrappedFiles) {
										return wrappedFiles[fProp as keyof IMediaAdapter['files']];
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
	} else {
		logger.warn('Could not wrap Media adapter - original object not found');
	}

	return adapter;
}

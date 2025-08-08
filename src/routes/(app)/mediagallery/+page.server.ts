/**
 * @file src/routes/(app)/mediagallery/+page.server.ts
 * @description Server-side logic for the media gallery page.
 *
 * This module handles:
 * - Fetching media files from various collections (images, documents, audio, video)
 * - Fetching virtual folders
 * - File upload processing for different media types
 * - Error handling and logging
 *
 * The load function prepares data for the media gallery, including user information,
 * a list of all media files, and virtual folders. The actions object defines the
 * server-side logic for handling file uploads.
 */

import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Utils
import mime from 'mime-types';
import { saveImage, saveDocument, saveAudio, saveVideo } from '@utils/media/mediaProcessing';
import { constructUrl } from '@utils/media/mediaUtils';
import type { SystemVirtualFolder } from '@root/src/databases/dbInterface';
import type { MediaAccess } from '@root/src/utils/media/mediaModels';

// Auth
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger, type LoggableValue } from '@utils/logger.svelte';

interface StackItem {
	parent: Record<string, unknown> | Array<unknown> | null;
	key: string;
	value: unknown;
}

function convertIdToString(obj: Record<string, unknown> | Array<unknown>): Record<string, unknown> | Array<unknown> {
	const stack: StackItem[] = [{ parent: null, key: '', value: obj }];
	const seen = new WeakSet();
	const root: Record<string, unknown> | Array<unknown> = Array.isArray(obj) ? [] : {};

	while (stack.length) {
		const { parent, key, value } = stack.pop()!;

		// If value is not an object, assign directly
		if (value === null || typeof value !== 'object') {
			if (parent) parent[key] = value;
			continue;
		}

		// Handle circular references
		if (seen.has(value)) {
			if (parent) parent[key] = value;
			continue;
		}
		seen.add(value);

		// Initialize object or array
		const result: Record<string, unknown> | Array<unknown> = Array.isArray(value) ? [] : {};
		if (parent) parent[key] = result;

		// Process each key/value pair or array element
		for (const k in value) {
			if (value[k] === null) {
				root[k] = null;
			} else if (k === '_id' || k === 'parent') {
				root[k] = value[k]?.toString() || null;
				// Convert _id or parent to string
			} else if (Buffer.isBuffer(value[k])) {
				root[k] = value[k].toString('hex'); // Convert Buffer to hex string
			} else if (typeof value[k] === 'object') {
				// Add object to the stack for further processing
				stack.push({ parent: result, key: k, value: value[k] });
			} else {
				root[k] = value[k]; // Assign primitive values
			}
		}
	}

	return root;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	// Add url parameter
	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw error(500, 'Internal Server Error');
	}

	try {
		// User is already validated in hooks.server.ts
		const { user } = locals;
		if (!user) {
			throw redirect(302, '/login');
		}

		const folderId = url.searchParams.get('folderId'); // Get folderId from URL
		logger.info(`Loading media gallery for folderId: ${folderId || 'root'}`);

		// Fetch all virtual folders first to find the current one
		const allVirtualFoldersResult = await dbAdapter.systemVirtualFolder.getAll();

		if (!allVirtualFoldersResult.success) {
			logger.error('Failed to fetch virtual folders', allVirtualFoldersResult.error);
			throw error(500, 'Failed to fetch virtual folders');
		}

		const serializedVirtualFolders = allVirtualFoldersResult.data.map((folder) => convertIdToString(folder));

		// Determine current folder
		const currentFolder = folderId ? serializedVirtualFolders.find((f) => f._id === folderId) || null : null;
		logger.debug('Current folder determined:', currentFolder);

		// Fetch from all media collections since MediaItem doesn't exist
		const mediaCollections = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
		const allMediaResults: Record<string, unknown>[] = [];

		for (const collection of mediaCollections) {
			try {
				const query: Record<string, string | boolean | null> = {
					folderId: folderId || null,
					// Filter out deleted items
					$or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
				};
				const result = await dbAdapter.crud.findMany(collection, query);

				if (result.success && result.data) {
					// Add collection type to each item for processing
					const itemsWithType = result.data.map((item: Record<string, unknown>) => ({
						...item,
						collection: collection
					}));
					allMediaResults.push(...itemsWithType);
				}
			} catch (collectionError) {
				// Log but don't fail if a collection doesn't exist
				logger.warn(`Collection ${collection} not found or error fetching:`, collectionError);
			}
		}

		logger.info(`Fetched \x1b[31m${allMediaResults.length}\x1b[0m total media items from all collections`);

		if (allMediaResults.length === 0) {
			logger.info('No media items found in any collection');
		}

		// Deduplicate media items by hash since same items might exist in multiple collections
		const deduplicatedMedia = allMediaResults.reduce((acc: Record<string, unknown>[], item) => {
			const existingItem = acc.find((existing) => existing.hash === item.hash);
			if (!existingItem) {
				acc.push(item);
			}
			return acc;
		}, []);

		logger.info(`After deduplication: \x1b[31m${deduplicatedMedia.length}\x1b[0m unique media items`);

		// Process and flatten media results - Filter and validate media items before processing
		const processedMedia = deduplicatedMedia
			.filter((item) => {
				if (!item) return false;
				const isValid =
					item.hash &&
					item.filename &&
					item.mimeType &&
					typeof item.hash === 'string' &&
					typeof item.filename === 'string' &&
					typeof item.mimeType === 'string';

				if (!isValid) {
					logger.warn('Skipping invalid media item', {
						item,
						reason: 'Missing required fields or invalid types'
					});
				}
				return isValid;
			})
			.map((item) => {
				try {
					const extension = mime.extension(item.mimeType!) || '';
					const filename = item.filename!.replace(`.${extension}`, '');

					if (!publicEnv.MEDIA_FOLDER) {
						logger.error('Media folder configuration missing');
						throw new Error('Media folder configuration missing');
					}

					// Build thumbnail URL via helper (no hard-coded routes)
					const effectivePath = (item as Record<string, string | undefined>).path ?? '/global';
					const thumbnailUrl = constructUrl(effectivePath, item.hash!, filename, extension, 'images', 'thumbnail');

					return {
						...item,
						path: item.path ?? 'global',
						name: item.filename ?? 'unnamed-media',
						// Use the item's path if available when constructing the original URL
						url: constructUrl((item.path ?? '/global') as string, item.hash!, filename, extension, 'images', 'original'),
						thumbnail: {
							url: thumbnailUrl
						}
					};
				} catch (err) {
					logger.error('Error processing media item', {
						item,
						error: err instanceof Error ? err.message : String(err)
					});
					return null;
				}
			})
			.filter((item): item is NonNullable<typeof item> => item !== null);

		logger.info(`Fetched ${processedMedia.length} media items for folder ${folderId || 'root'}`);
		logger.info(`Fetched ${serializedVirtualFolders.length} total virtual folders`);

		const returnData = {
			user: {
				// Ensure user data is serializable
				role: user.role,
				_id: user._id.toString(), // Convert user ID to string
				avatar: user.avatar
			},
			media: processedMedia, // Use the processed and filtered media
			systemVirtualFolders: serializedVirtualFolders as SystemVirtualFolder[], // All folders for the VirtualFolders component
			currentFolder: currentFolder as SystemVirtualFolder | null // The specific folder object for the current view
		};

		return returnData;
	} catch (err) {
		const message = `Error in media gallery load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};

export const actions: Actions = {
	// Default action for file upload
	default: async ({ request, locals }) => {
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw error(500, 'Internal Server Error');
		}

		try {
			const user = locals.user;
			if (!user) {
				logger.warn('No user found in locals during file upload');
				throw redirect(302, '/login');
			}

			const formData = await request.formData();
			const files = formData.getAll('files');

			// Map of file types to their respective save functions
			const save_media_file = {
				application: saveDocument,
				audio: saveAudio,
				font: saveDocument,
				example: saveDocument,
				image: saveImage,
				message: saveDocument,
				model: saveDocument,
				multipart: saveDocument,
				text: saveDocument,
				video: saveVideo
			};

			const collection_names: Record<string, string> = {
				application: 'media_documents',
				audio: 'media_audio',
				font: 'media_documents',
				example: 'media_documents',
				image: 'media_images',
				message: 'media_documents',
				model: 'media_documents',
				multipart: 'media_documents',
				text: 'media_documents',
				video: 'media_videos'
			};
			const access = {
				userId: user._id,
				roleId: user.role,
				permissions: locals.user?.permissions
			} as MediaAccess;
			for (const file of files) {
				if (file instanceof File) {
					const type = file.type.split('/')[0] as keyof typeof save_media_file;
					if (type in save_media_file) {
						const { fileInfo } = await save_media_file[type](file, collection_names[type], user._id, access);
						const insertResult = await dbAdapter.crud.insertMany(collection_names[type], [{ ...fileInfo, user: user._id }]);

						if (!insertResult.success) {
							if (insertResult.error?.message?.includes('duplicate')) {
								throw new Error(`A file with name "${file.name}" already exists`);
							}
							throw new Error(insertResult.error?.message || 'Failed to save file');
						}
						logger.info(`File uploaded successfully: ${file.name}`);
					} else {
						logger.warn(`Unsupported file type: ${file.type}`);
					}
				}
			}

			// TODO: Add back invalidation when upgrading SvelteKit
			return { success: true };
		} catch (err) {
			let userMessage = 'Error uploading file';
			if (err instanceof Error) {
				if (err.message.includes('duplicate')) {
					userMessage = err.message;
				} else if (err.message.includes('invalid file type')) {
					userMessage = 'Unsupported file type';
				} else {
					userMessage = err.message;
				}
			}
			logger.error(`Error during file upload: ${err instanceof Error ? err.message : String(err)}`);
			throw error(400, userMessage);
		}
	},

	// Action to delete a media file
	deleteMedia: async ({ request }) => {
		logger.warn('Request Body', await request.json());
		const image = (await request.json())?.image;
		logger.debug('Received delete request for image:', image);

		if (!image || !image._id) {
			logger.error('Invalid image data received');
			throw error(400, 'Invalid image data received');
		}

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			throw error(500, 'Internal Server Error');
		}

		try {
			logger.info(`Deleting image: ${image._id}`);
			const success = await dbAdapter.deleteMedia(image._id.toString());

			if (success) {
				logger.info('Image deleted successfully');
				// TODO: Add back invalidation when upgrading SvelteKit
				return { success: true }; // Return true on success
			} else {
				// Log the failure but maybe don't throw a 500, return success: false?
				// Or keep throwing error if deletion failure is critical. Let's keep the error for now.
				logger.error('Failed to delete image from database.');
				throw error(500, 'Failed to delete image');
			}
		} catch (err) {
			logger.error('Error deleting image:', err as LoggableValue);
			throw error(500, 'Internal Server Error');
		}
	}
};

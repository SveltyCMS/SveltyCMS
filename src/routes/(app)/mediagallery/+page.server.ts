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

// Use DB-backed public settings with safe fallbacks
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Utils
import type { SystemVirtualFolder, QueryFilter, MediaItem } from '@root/src/databases/dbInterface';
import type { DatabaseId } from '@root/src/content/types';
import type { MediaAccess } from '@root/src/utils/media/mediaModels';
import { MediaService } from '@src/services/MediaService';
import { constructUrl } from '@utils/media/mediaUtils';
import mime from 'mime-types';

// Auth
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger, type LoggableValue } from '@utils/logger.server';

interface StackItem {
	parent: Record<string, unknown> | Array<unknown> | null;
	key: string;
	value: unknown;
}

function convertIdToString(obj: unknown): unknown {
	const stack: StackItem[] = [{ parent: null, key: '', value: obj }];
	const seen = new WeakSet();
	const root: unknown = {};

	while (stack.length) {
		const { parent, key, value } = stack.pop()!;

		// If value is not an object, assign directly
		if (value === null || typeof value !== 'object') {
			if (parent) (parent as Record<string, unknown>)[key] = value;
			continue;
		}

		// Handle circular references
		if (seen.has(value)) {
			if (parent) (parent as Record<string, unknown>)[key] = value;
			continue;
		}
		seen.add(value);

		// Initialize object
		const result: Record<string, unknown> = {};
		if (parent) (parent as Record<string, unknown>)[key] = result;

		// Process each key/value pair
		for (const k in value as Record<string, unknown>) {
			const val = (value as Record<string, unknown>)[k];
			if (val === null) {
				result[k] = null;
			} else if (k === '_id' || k === 'parent') {
				result[k] = val?.toString() || null;
				// Convert _id or parent to string
			} else if (Buffer.isBuffer(val)) {
				result[k] = val.toString('hex'); // Convert Buffer to hex string
			} else if (typeof val === 'object') {
				// Add object to the stack for further processing
				stack.push({ parent: result, key: k, value: val });
			} else {
				result[k] = val; // Assign primitive values
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
		const { user, isAdmin, roles: tenantRoles } = locals;
		if (!user) {
			throw redirect(302, '/login');
		}

		// Check if user has permission to access media gallery
		const hasMediaPermission =
			isAdmin ||
			Object.values(tenantRoles).some(
				(role) =>
					((role as { permissions?: string[] }).permissions || []).includes('media:read') ||
					((role as { permissions?: string[] }).permissions || []).includes('media:write')
			);

		if (!hasMediaPermission) {
			logger.warn(`User ${user._id} does not have permission to access media gallery`);
			throw error(403, 'Insufficient permissions to access media gallery');
		}

		const folderId = url.searchParams.get('folderId'); // Get folderId from URL
		logger.info(`Loading media gallery for folderId: ${folderId || 'root'}`);

		// Fetch all virtual folders first to find the current one
		const allVirtualFoldersResult = await dbAdapter.systemVirtualFolder.getAll();

		if (!allVirtualFoldersResult.success) {
			logger.error('Failed to fetch virtual folders', allVirtualFoldersResult.error);
			throw error(500, 'Failed to fetch virtual folders');
		}

		// Ensure data is an array
		const virtualFoldersData = Array.isArray(allVirtualFoldersResult.data) ? allVirtualFoldersResult.data : [];

		const serializedVirtualFolders = virtualFoldersData.map((folder) => convertIdToString(folder as unknown));

		// Determine current folder
		const currentFolder = folderId ? serializedVirtualFolders.find((f) => (f as Record<string, unknown>)._id === folderId) || null : null;
		logger.trace('Current folder determined:', currentFolder);

		// Fetch from all media collections including the primary MediaItem collection
		const mediaCollections = ['MediaItem', 'media_images', 'media_documents', 'media_audio', 'media_videos'];
		const allMediaResults: Record<string, unknown>[] = [];

		for (const collection of mediaCollections) {
			try {
				const query: QueryFilter<MediaItem> = {
					folderId: folderId as DatabaseId | null,
					// Filter out deleted items
					$or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
				};
				const result = await dbAdapter.crud.findMany(collection, query);

				if (result.success && result.data) {
					// Add collection type to each item for processing
					const itemsWithType = result.data.map((item) => ({
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

		logger.info(`Fetched ${allMediaResults.length} total media items from all collections`);

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

		logger.info(`After deduplication: ${deduplicatedMedia.length} unique media items`);

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
					const mediaItem = item as unknown as MediaItem;
					const extension = mime.extension(mediaItem.mimeType) || '';
					const filename = mediaItem.filename.replace(`.${extension}`, '');

					// MEDIA_FOLDER may not be eagerly available; use a safe default
					const mediaFolder = publicEnv.MEDIA_FOLDER || 'mediaFiles';
					if (!mediaFolder) {
						logger.warn('MEDIA_FOLDER not set; proceeding with defaults');
					}

					// Build thumbnail URL via helper (no hard-coded routes)
					const effectivePath = mediaItem.path ?? '/global';
					const thumbnailUrl = constructUrl(effectivePath, mediaItem.hash, filename, extension, 'thumbnail');

					return {
						...mediaItem,
						type: mediaItem.mimeType.split('/')[0], // Derive from mimeType
						path: mediaItem.path ?? 'global',
						name: mediaItem.filename ?? 'unnamed-media',
						// Use the item's path if available when constructing the original URL
						url: constructUrl(mediaItem.path ?? '/global', mediaItem.hash, filename, extension, 'original'),
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
	// Upload action for file upload
	upload: async ({ request, locals }) => {
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

			const mediaService = new MediaService(dbAdapter);

			const access: MediaAccess = 'public'; // or 'private'/'protected' based on your needs

			for (const file of files) {
				if (file instanceof File) {
					try {
						// Use MediaService.saveMedia which handles all media types
						await mediaService.saveMedia(file, user._id, access, 'global');
						logger.info(`File uploaded successfully: ${file.name}`);
					} catch (fileError) {
						const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
						if (errorMessage.includes('duplicate')) {
							logger.warn(`A file with name "${file.name}" already exists`);
							throw new Error(`A file with name "${file.name}" already exists`);
						}
						throw new Error(errorMessage);
					}
				}
			}

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
		try {
			const formData = await request.formData();
			const imageDataStr = formData.get('imageData');

			logger.info('Delete request received, imageDataStr:', imageDataStr);

			if (!imageDataStr || typeof imageDataStr !== 'string') {
				logger.error('Invalid image data received - not a string');
				throw error(400, 'Invalid image data received');
			}

			const image = JSON.parse(imageDataStr);
			logger.warn('Parsed image data:', image);
			logger.trace('Received delete request for image:', image);

			if (!image || !image._id) {
				logger.error('Invalid image data received - no _id');
				throw error(400, 'Invalid image data received');
			}

			if (!dbAdapter) {
				logger.error('Database adapter is not initialized.');
				throw error(500, 'Internal Server Error');
			}

			// Move file to trash before deleting from database
			try {
				if (image.url) {
					const { moveMediaToTrash } = await import('@utils/media/mediaStorage');
					await moveMediaToTrash(image.url);
					logger.info('File moved to trash:', image.url);
				}

				// Also move thumbnails to trash if they exist
				if (image.thumbnails) {
					const { moveMediaToTrash } = await import('@utils/media/mediaStorage');
					for (const size in image.thumbnails) {
						if (image.thumbnails[size]?.url) {
							await moveMediaToTrash(image.thumbnails[size].url);
							logger.info('Thumbnail moved to trash:', image.thumbnails[size].url);
						}
					}
				}
			} catch (trashError) {
				logger.error('Error moving files to trash:', trashError);
				// Continue with database deletion even if trash move fails
			}

			// Determine which collection to delete from - default to MediaItem if not specified
			const collection = image.collection || 'MediaItem';
			logger.info(`Deleting image from collection '${collection}': ${image._id}`);

			const result = await dbAdapter.crud.delete(collection, image._id.toString());

			if (result.success) {
				logger.info('Image deleted successfully from', collection);
				// TODO: Add back invalidation when upgrading SvelteKit
				return { success: true }; // Return true on success
			} else {
				logger.error('Failed to delete image from database:', result);
				throw error(500, result.message || 'Failed to delete image');
			}
		} catch (err) {
			logger.error('Error in deleteMedia action:', err as LoggableValue);
			throw error(500, err instanceof Error ? err.message : 'Internal Server Error');
		}
	},

	remoteUpload: async ({ request, locals }) => {
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
			const remoteUrls = JSON.parse(formData.get('remoteUrls') as string) as string[];

			if (!remoteUrls || !Array.isArray(remoteUrls) || remoteUrls.length === 0) {
				throw new Error('No URLs provided');
			}

			const mediaService = new MediaService(dbAdapter);
			const access: MediaAccess = 'public'; // or 'private'/'protected' based on your needs

			for (const url of remoteUrls) {
				try {
					const response = await fetch(url);
					if (!response.ok) {
						logger.warn(`Failed to fetch remote URL: ${url}`);
						continue;
					}
					const arrayBuffer = await response.arrayBuffer();
					const buffer = Buffer.from(arrayBuffer);
					const contentType = response.headers.get('content-type') || 'application/octet-stream';
					const filename = url.substring(url.lastIndexOf('/') + 1);

					const file = new File([buffer], filename, { type: contentType });

					// Use MediaService.saveMedia which handles all media types
					await mediaService.saveMedia(file, user._id, access, 'global');
					logger.info(`Remote file uploaded successfully: ${file.name}`);
				} catch (fileError) {
					const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
					if (errorMessage.includes('duplicate')) {
						logger.warn(`A file from URL "${url}" already exists`);
					} else {
						logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
					}
					// Continue with next URL instead of throwing
					continue;
				}
			}

			return { success: true };
		} catch (err) {
			let userMessage = 'Error uploading file';
			if (err instanceof Error) {
				userMessage = err.message;
			}
			logger.error(`Error during remote file upload: ${err instanceof Error ? err.message : String(err)}`);
			throw error(400, userMessage);
		}
	}
};

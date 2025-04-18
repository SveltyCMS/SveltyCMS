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

// Removed unused import: import { publicEnv } from '@root/config/public';

import { error, redirect, invalidateAll } from '@sveltejs/kit'; // Import invalidateAll
import type { Actions, PageServerLoad } from './$types';

// Utils
import { saveImage, saveDocument, saveAudio, saveVideo } from '@utils/media/mediaProcessing';
import { constructUrl } from '@utils/media/mediaUtils';

// Auth
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger, type LoggableValue } from '@utils/logger.svelte';

// Helper function to convert _id and other nested objects to string
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
		// logger.debug('Stack: ', stack)

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

export const load: PageServerLoad = async ({ locals, url }) => { // Add url parameter
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
		const folderResult = await dbAdapter.virtualFolders.getAll();
		if (!folderResult.success) {
			logger.error(`Failed to fetch virtual folders: ${folderResult.error.message}`);
			throw error(500, 'Failed to fetch folders');
		}
		const allVirtualFolders = folderResult.data || [];
		const serializedVirtualFolders = allVirtualFolders.map((folder) => convertIdToString(folder));

		// Determine current folder
		const currentFolder = folderId ? serializedVirtualFolders.find((f) => f._id === folderId) || null : null;
		logger.debug('Current folder determined:', currentFolder);

		// --- Fetch Media Files based on currentFolder ---
		const media_types = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		const media_promises = media_types.map((type) => {
			// Base query: filter by parent folder ID (null for root)
			// Assuming media items have a 'parent' field storing the folder _id
			const query: Record<string, string | null> = { parent: folderId || null }; // Use more specific type

			// Special handling for media_remote if needed (adjust as per your schema)
			// if (type === 'media_remote') {
			// 	query.folder = publicEnv.MEDIA_FOLDER; // Example if remote media uses a different field
			// }

			logger.debug(`Querying ${type} with:`, query);
			return dbAdapter.crud.findMany(type, query);
		});

		const mediaResults = await Promise.all(media_promises); // Use const

		logger.debug('Raw media results from DB:', mediaResults);

		// Process and flatten media results
		const processedMedia = mediaResults
			.map((arr, index) => {
				if (!arr) return []; // Handle potential null/undefined results from findMany
				return arr.map((item) => {
					const mediaType = media_types[index]; // Get the full collection name (e.g., 'media_images')
					const simpleType = mediaType.split('_')[1]; // Get the simple type (e.g., 'images')
					const thumbnailFilename = item.thumbnail?.url; // Assuming thumbnail.url stores the filename like 'image.jpg'
					const extension = thumbnailFilename ? thumbnailFilename.split('.').pop() : '';

					return convertIdToString({
						...item,
						path: item.path ?? 'global', // Ensure path exists
						name: item.name ?? item.filename ?? 'unnamed-media', // Ensure name exists
						type: simpleType, // Use simple type like 'images', 'documents'
						// Construct URLs using item.hash and thumbnail filename
						url: thumbnailFilename
							? constructUrl('global', item.hash, thumbnailFilename, extension, mediaType) // Pass full mediaType
							: '',
						thumbnailUrl: thumbnailFilename
							? constructUrl('global', item.hash, `${thumbnailFilename}-thumbnail`, extension, mediaType) // Pass full mediaType
							: ''
					});
				});
			})
			.flat() // Flatten the array of arrays into a single array
			.filter((item): item is Record<string, unknown> => item !== null); // Type guard to filter out nulls if any

		logger.info(`Fetched \x1b[34m${processedMedia.length}\x1b[0m media items for folder ${folderId || 'root'}`);
		logger.info(`Fetched \x1b[34m${serializedVirtualFolders.length}\x1b[0m total virtual folders`);

		logger.debug('Media gallery data and virtual folders loaded successfully');
		const returnData = {
			user: { // Ensure user data is serializable
				role: user.role,
				_id: user._id.toString(), // Convert user ID to string
				avatar: user.avatar
			},
			media: processedMedia, // Use the processed and filtered media
			virtualFolders: serializedVirtualFolders, // All folders for the VirtualFolders component
			currentFolder: currentFolder // The specific folder object for the current view
		};

		// Added Debugging: Log the returnData
		logger.debug('Returning data from load function:', returnData);

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

			for (const file of files) {
				if (file instanceof File) {
					const type = file.type.split('/')[0] as keyof typeof save_media_file;
					if (type in save_media_file) {
						const { fileInfo } = await save_media_file[type](file, collection_names[type], user._id);
						await dbAdapter.insertMany(collection_names[type], [{ ...fileInfo, user: user._id }]);
						logger.info(`File uploaded successfully: ${file.name}`);
					} else {
						logger.warn(`Unsupported file type: ${file.type}`);
					}
				}
			}

			invalidateAll(); // Invalidate all load functions after successful uploads
			return { success: true };
		} catch (err) {
			const message = `Error during file upload: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
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
				invalidateAll(); // Invalidate data after successful deletion
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

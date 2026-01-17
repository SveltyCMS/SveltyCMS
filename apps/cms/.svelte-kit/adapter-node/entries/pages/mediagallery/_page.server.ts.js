import { publicEnv } from '../../../chunks/globalSettings.svelte.js';
import { error, redirect } from '@sveltejs/kit';
import { g as getSanitizedFileName, M as MediaService } from '../../../chunks/MediaService.server.js';
import { buildUrl } from '../../../chunks/mediaUtils.js';
import { a as getImageSizes, m as moveMediaToTrash } from '../../../chunks/mediaStorage.server.js';
import { d as dbAdapter } from '../../../chunks/db.js';
import { l as logger } from '../../../chunks/logger.server.js';
function convertIdToString(obj) {
	const stack = [{ parent: null, key: '', value: obj }];
	const seen = /* @__PURE__ */ new WeakSet();
	const root = {};
	while (stack.length) {
		const { parent, key, value } = stack.pop();
		if (value === null || typeof value !== 'object') {
			if (parent) parent[key] = value;
			continue;
		}
		if (seen.has(value)) {
			if (parent) parent[key] = value;
			continue;
		}
		seen.add(value);
		const result = {};
		if (parent) parent[key] = result;
		for (const k in value) {
			const val = value[k];
			if (val === null) {
				result[k] = null;
			} else if (k === '_id' || k === 'parent') {
				result[k] = val?.toString() || null;
			} else if (Buffer.isBuffer(val)) {
				result[k] = val.toString('hex');
			} else if (typeof val === 'object') {
				stack.push({ parent: result, key: k, value: val });
			} else {
				result[k] = val;
			}
		}
	}
	return root;
}
const load = async ({ locals, url }) => {
	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		throw error(500, 'Internal Server Error');
	}
	try {
		const { user, isAdmin, roles: tenantRoles } = locals;
		if (!user) {
			throw redirect(302, '/login');
		}
		const hasMediaPermission =
			isAdmin ||
			Object.values(tenantRoles).some((role) => (role.permissions || []).includes('media:read') || (role.permissions || []).includes('media:write'));
		if (!hasMediaPermission) {
			logger.warn(`User ${user._id} does not have permission to access media gallery`);
			throw error(403, 'Insufficient permissions to access media gallery');
		}
		const folderId = url.searchParams.get('folderId');
		logger.info(`Loading media gallery for folderId: ${folderId || 'root'}`);
		const allVirtualFoldersResult = await dbAdapter.systemVirtualFolder.getAll();
		if (!allVirtualFoldersResult.success) {
			logger.error('Failed to fetch virtual folders', allVirtualFoldersResult.error);
			throw error(500, 'Failed to fetch virtual folders');
		}
		const virtualFoldersData = Array.isArray(allVirtualFoldersResult.data) ? allVirtualFoldersResult.data : [];
		const serializedVirtualFolders = virtualFoldersData.map((folder) => convertIdToString(folder));
		const currentFolder = folderId ? serializedVirtualFolders.find((f) => f._id === folderId) || null : null;
		logger.trace('Current folder determined:', currentFolder);
		const mediaCollections = ['MediaItem', 'media_images', 'media_documents', 'media_audio', 'media_videos'];
		const allMediaResults = [];
		for (const collection of mediaCollections) {
			try {
				const query = {
					folderId,
					// Filter out deleted items
					$or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
				};
				const result = await dbAdapter.crud.findMany(collection, query);
				if (result.success && result.data) {
					const itemsWithType = result.data.map((item) => ({
						...item,
						collection
					}));
					allMediaResults.push(...itemsWithType);
				}
			} catch (collectionError) {
				logger.warn(`Collection ${collection} not found or error fetching:`, collectionError);
			}
		}
		logger.info(`Fetched ${allMediaResults.length} total media items from all collections`);
		if (allMediaResults.length === 0) {
			logger.info('No media items found in any collection');
		}
		const deduplicatedMedia = allMediaResults.reduce((acc, item) => {
			const existingItem = acc.find((existing) => existing.hash === item.hash);
			if (!existingItem) {
				acc.push(item);
			}
			return acc;
		}, []);
		logger.info(`After deduplication: ${deduplicatedMedia.length} unique media items`);
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
					const mediaItem = item;
					const { fileNameWithoutExt, ext } = getSanitizedFileName(mediaItem.filename);
					const filename = fileNameWithoutExt;
					const extension = ext;
					const mediaFolder = publicEnv.MEDIA_FOLDER || 'mediaFiles';
					if (!mediaFolder);
					const rawPath = mediaItem.path ?? 'global';
					let cleanPath = rawPath.replace(/^\/+/, '').replace(/^files\//, '');
					const basePath = cleanPath.split('/')[0] || 'global';
					const thumbnailUrl = buildUrl(basePath, mediaItem.hash, filename, extension, basePath, 'thumbnail');
					return {
						...mediaItem,
						type: mediaItem.mimeType.split('/')[0],
						// Derive from mimeType
						path: mediaItem.path ?? 'global',
						name: mediaItem.filename ?? 'unnamed-media',
						// Use the item's path if available when constructing the original URL
						url: buildUrl(basePath, mediaItem.hash, filename, extension, basePath),
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
			.filter((item) => item !== null);
		logger.info(`Fetched ${processedMedia.length} media items for folder ${folderId || 'root'}`);
		logger.info(`Fetched ${serializedVirtualFolders.length} total virtual folders`);
		const returnData = {
			user: {
				// Ensure user data is serializable
				role: user.role,
				_id: user._id.toString(),
				// Convert user ID to string
				avatar: user.avatar
			},
			media: processedMedia,
			// Use the processed and filtered media
			systemVirtualFolders: serializedVirtualFolders,
			// All folders for the VirtualFolders component
			currentFolder
			// The specific folder object for the current view
		};
		return returnData;
	} catch (err) {
		const message = `Error in media gallery load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
const actions = {
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
			const access = 'public';
			for (const file of files) {
				if (file instanceof File) {
					try {
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
			try {
				const sanitizePath = (p) => {
					if (!p) return '';
					let clean = p;
					clean = clean.replace(/^\/files\//, '').replace(/^files\//, '');
					clean = clean.replace(/^mediaFolder\//, '');
					return clean.replace(/^\/+/, '');
				};
				const targetPath = image.path || image.url;
				if (targetPath) {
					const cleanPath = sanitizePath(targetPath);
					const pathParts = cleanPath.split('/');
					if (pathParts.length >= 3) {
						const basePath = pathParts[0];
						const fileName = pathParts[pathParts.length - 1];
						const configuredSizes = getImageSizes();
						const standardFolders = ['original', 'thumbnail'];
						const dynamicFolders = Object.keys(configuredSizes);
						const allSizes = [.../* @__PURE__ */ new Set([...standardFolders, ...dynamicFolders])];
						logger.info(`Deleting all variants for file: ${fileName} in ${basePath} - Sizes: ${allSizes.join(', ')}`);
						for (const size of allSizes) {
							const sizePath = `${basePath}/${size}/${fileName}`;
							try {
								await moveMediaToTrash(sizePath);
								logger.info(`Deleted ${size} variant:`, sizePath);
							} catch (sizeErr) {
								logger.debug(`No ${size} variant found (or already deleted):`, sizePath);
							}
						}
					} else {
						await moveMediaToTrash(cleanPath);
						logger.info('File moved to trash (fallback):', cleanPath);
					}
				} else {
					logger.warn('No path or url found for file deletion:', image._id);
				}
				if (image.thumbnails) {
					for (const size in image.thumbnails) {
						if (image.thumbnails[size]?.url) {
							const cleanThumbUrl = sanitizePath(image.thumbnails[size].url);
							try {
								await moveMediaToTrash(cleanThumbUrl);
								logger.debug('Additional thumbnail cleaned up:', cleanThumbUrl);
							} catch {}
						}
					}
				}
			} catch (trashError) {
				logger.error('Error moving files to trash:', trashError);
			}
			const collection = image.collection || 'MediaItem';
			logger.info(`Deleting image from collection '${collection}': ${image._id}`);
			const result = await dbAdapter.crud.delete(collection, image._id.toString());
			if (result.success) {
				logger.info('Image deleted successfully from', collection);
				return { success: true };
			} else {
				logger.error('Failed to delete image from database:', result);
				throw error(500, result.message || 'Failed to delete image');
			}
		} catch (err) {
			logger.error('Error in deleteMedia action:', err);
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
			const remoteUrls = JSON.parse(formData.get('remoteUrls'));
			if (!remoteUrls || !Array.isArray(remoteUrls) || remoteUrls.length === 0) {
				throw new Error('No URLs provided');
			}
			const mediaService = new MediaService(dbAdapter);
			const access = 'public';
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
					await mediaService.saveMedia(file, user._id, access, 'global');
					logger.info(`Remote file uploaded successfully: ${file.name}`);
				} catch (fileError) {
					const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
					if (errorMessage.includes('duplicate')) {
						logger.warn(`A file from URL "${url}" already exists`);
					} else {
						logger.error(`Failed to upload file from ${url}: ${errorMessage}`);
					}
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
export { actions, load };
//# sourceMappingURL=_page.server.ts.js.map

import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import path from 'path';
import sharp from 'sharp';
import { M as MediaType } from './mediaModels.js';
import { s as sanitize, a as sha256 } from './utils.js';
import { logger } from './logger.js';
import { l as logger$1 } from './logger.server.js';
import { b as saveFileToDisk, c as saveResizedImages } from './mediaStorage.server.js';
import { validateMediaFileServer } from './mediaUtils.js';
import { cacheService } from './CacheService.js';
function sanitizedFilename(original) {
	if (!original || typeof original !== 'string') {
		throw new Error('Invalid filename');
	}
	const dot = original.lastIndexOf('.');
	const name = dot > 0 ? original.slice(0, dot) : original;
	const ext = dot > 0 ? original.slice(dot + 1).toLowerCase() : '';
	logger.trace('Filename sanitized', { original, name, ext });
	return { name: sanitize(name), ext };
}
function getSanitizedFileName(filename) {
	const { name, ext } = sanitizedFilename(filename);
	return { fileNameWithoutExt: name, ext };
}
async function hashFileContent(buffer) {
	if (!buffer || buffer.byteLength === 0) {
		throw error(400, 'Cannot hash empty buffer');
	}
	try {
		const arr = buffer instanceof Buffer ? buffer : new Uint8Array(buffer);
		const hash = await sha256(arr);
		const short = hash.slice(0, 20);
		logger$1.debug('File hashed', { size: buffer.byteLength, hash: short });
		return short;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger$1.error('Hashing failed', { size: buffer.byteLength, error: msg });
		throw error(500, `Hashing error: ${msg}`);
	}
}
async function extractMetadata(buffer) {
	try {
		const sharp2 = (await import('sharp')).default;
		const meta = await sharp2(buffer).metadata();
		logger$1.debug('Metadata extracted', {
			format: meta.format,
			size: meta.size,
			width: meta.width,
			height: meta.height
		});
		return meta;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger$1.error('Metadata extraction failed', { size: buffer.length, error: msg });
		throw error(500, `Metadata error: ${msg}`);
	}
}
class MediaService {
	db;
	initialized = false;
	// Define your allowed types regex
	mimeTypePattern = /^(image|video|audio)\/(jpeg|png|gif|svg\+xml|webp|mp4|webm|ogg|mpeg)|(application\/pdf)$/;
	constructor(db) {
		this.db = db;
		this.checkDatabaseConnection();
	}
	// Check if database is connected
	checkDatabaseConnection() {
		if (!this.db) {
			const message = 'Database adapter is not available';
			logger.error(message);
			throw error(500, message);
		}
		this.initialized = true;
	}
	// Ensure service is initialized before operations
	ensureInitialized() {
		if (!this.initialized) {
			this.checkDatabaseConnection();
		}
	}
	/**
	 * Uploads a file to storage (disk or cloud)
	 */
	async uploadFile(buffer, fileName, mimeType, userId, basePath, watermarkOptions) {
		const startTime = performance.now();
		try {
			logger.debug('Starting file upload', { fileName, fileSize: buffer.length, userId });
			let imageBuffer = buffer;
			if (watermarkOptions && mimeType.startsWith('image/')) {
				try {
					const watermarkImagePath = path.join(process.cwd(), 'static', watermarkOptions.url);
					const watermarkBuffer = await sharp(watermarkImagePath)
						.resize({
							width: Math.floor((await sharp(imageBuffer).metadata()).width * (watermarkOptions.scale / 100))
						})
						.png()
						.toBuffer();
					imageBuffer = await sharp(imageBuffer)
						.composite([
							{
								input: watermarkBuffer,
								gravity: watermarkOptions.position,
								blend: 'over'
							}
						])
						.toBuffer();
					logger.info('Watermark applied successfully', { fileName });
				} catch (wmError) {
					logger.error('Could not apply watermark', { fileName, error: wmError });
				}
			}
			const hash = await hashFileContent(imageBuffer);
			const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
			const sanitizedFileName = fileNameWithoutExt;
			const originalSubfolder = 'original';
			const originalFileName = `${sanitizedFileName}-${hash}.${ext}`;
			const relativePath = path.posix.join(basePath, originalSubfolder, originalFileName);
			logger.debug('Saving original file', { relativePath, basePath, subfolder: originalSubfolder });
			const publicUrl = await saveFileToDisk(imageBuffer, relativePath);
			const isImage = mimeType.startsWith('image/');
			let resizedImages = {};
			if (isImage && ext !== 'svg') {
				logger.debug('Processing image variants', { fileName, mimeType });
				resizedImages = await saveResizedImages(imageBuffer, hash, sanitizedFileName, ext, basePath);
			}
			logger.info('File upload completed', {
				fileName,
				url: publicUrl,
				relativePath,
				fileSize: imageBuffer.length,
				isImage,
				resizedVariants: Object.keys(resizedImages),
				totalProcessingTime: performance.now() - startTime
			});
			return { url: publicUrl, path: relativePath, hash, resized: resizedImages };
		} catch (err) {
			const message = `Error uploading file: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				fileName,
				error: err,
				stack: err instanceof Error ? err.stack : void 0,
				processingTime: performance.now() - startTime
			});
			throw new Error(message);
		}
	}
	/**
	 * Saves a file to storage and creates a database record.
	 */
	// Saves a media file and its associated data
	async saveMedia(file, userId, access, basePath = 'global', watermarkOptions, originalId) {
		const startTime = performance.now();
		this.ensureInitialized();
		logger.trace('Starting media upload process', {
			filename: file.name,
			fileSize: file.size,
			mimeType: file.type
		});
		if (!file) {
			const message = 'File is required';
			logger.error(message, { processingTime: performance.now() - startTime });
			throw Error(message);
		}
		const buffer = Buffer.from(await file.arrayBuffer());
		const mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream';
		const validation = validateMediaFileServer(buffer, file.name, this.mimeTypePattern, 50 * 1024 * 1024);
		if (!validation.valid) {
			const message = `File validation failed: ${validation.message}`;
			logger.error(message, {
				fileName: file.name,
				fileSize: file.size,
				processingTime: performance.now() - startTime
			});
			throw Error(message);
		}
		try {
			const { url, path: path2, hash, resized } = await this.uploadFile(buffer, file.name, mimeType, userId, basePath, watermarkOptions);
			const sharpMeta = await sharp(buffer).metadata();
			const advancedMetadata = {
				format: sharpMeta.format,
				width: sharpMeta.width,
				height: sharpMeta.height,
				space: sharpMeta.space,
				channels: sharpMeta.channels,
				density: sharpMeta.density,
				hasProfile: sharpMeta.hasProfile,
				hasAlpha: sharpMeta.hasAlpha,
				exif: sharpMeta.exif?.toString('base64'),
				// Store as base64 to avoid binary issues
				iptc: sharpMeta.iptc?.toString('base64'),
				// Store as base64
				icc: sharpMeta.icc?.toString('base64')
			};
			const mediaType = this.getMediaType(mimeType);
			if (!mediaType) {
				const message = 'Invalid media type';
				logger.error(message, { mimeType, processingTime: performance.now() - startTime });
				throw Error(message);
			}
			const media = {
				type: mediaType,
				hash,
				filename: file.name,
				path: path2,
				// Store the relative path
				url,
				// Store the public URL
				mimeType,
				size: file.size,
				user: userId,
				createdAt: /* @__PURE__ */ new Date().toISOString(),
				updatedAt: /* @__PURE__ */ new Date().toISOString(),
				metadata: {
					originalFilename: file.name,
					uploadedBy: userId,
					uploadTimestamp: /* @__PURE__ */ new Date().toISOString(),
					processingTimeMs: performance.now() - startTime,
					advancedMetadata
				},
				originalId,
				versions: [
					{
						version: 1,
						url,
						createdAt: /* @__PURE__ */ new Date().toISOString(),
						createdBy: userId
					}
				],
				access,
				thumbnails: resized || {}
			};
			const cleanMedia = this.createCleanMediaObject(media);
			logger.debug('Saving media to database', {
				filename: cleanMedia.filename,
				mimeType: cleanMedia.mimeType,
				collection: 'MediaItem'
				// <-- Log the correct collection
			});
			const result = await this.db.crud.insert('MediaItem', cleanMedia);
			if (!result.success) {
				throw result.error;
			}
			const mediaId = result.data._id;
			logger.debug('Media saved to database', {
				mediaId,
				processingTime: performance.now() - startTime
			});
			const findResult = await this.db.crud.findOne('MediaItem', { _id: mediaId });
			if (!findResult.success) {
				throw findResult.error;
			}
			const savedMedia = findResult.data;
			if (savedMedia) {
				await cacheService.set(`media:${mediaId}`, savedMedia, 3600);
			} else {
				logger.warn('Saved media not found in database', { mediaId });
			}
			logger.info('Media processing completed successfully', {
				mediaId,
				originalUrl: savedMedia.path,
				thumbnails: Object.keys(savedMedia.thumbnails ?? {}),
				totalProcessingTime: performance.now() - startTime
			});
			return savedMedia;
		} catch (err) {
			const message = `Error saving media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				fileName: file?.name,
				error: err,
				stack: err instanceof Error ? err.stack : void 0,
				processingTime: performance.now() - startTime
			});
			throw error(500, message);
		}
	}
	createCleanMediaObject(object) {
		return {
			filename: object.filename,
			// originalFilename: object.filename, // Removed as it's not in MediaItem/MediaBase
			hash: object.hash,
			path: object.path,
			size: object.size,
			mimeType: object.mimeType,
			thumbnails: object.thumbnails || {},
			metadata: object.metadata || {},
			access: object.access,
			// Mapped access
			user: object.user,
			type: object.type
			// Cast to avoid complex union matching issues here
			// createdBy: object.user as DatabaseId,
			// updatedBy: object.user as DatabaseId,
			// originalId: object.originalId
		};
	}
	// Updates a media item with new data
	async updateMedia(id, updates) {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		if (!updates || typeof updates !== 'object') {
			throw Error('Invalid updates: Must be a valid MediaItem partial object');
		}
		try {
			const result = await this.db.crud.update('MediaItem', id, updates);
			if (!result.success) {
				throw result.error;
			}
			await cacheService.delete(`media:${id}`);
			logger.info('Media updated successfully', { id });
		} catch (err) {
			const message = `Error updating media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}
	// Deletes a media item
	async deleteMedia(id) {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		try {
			const result = await this.db.crud.delete('MediaItem', id);
			if (!result.success) {
				throw result.error;
			}
			await cacheService.delete(`media:${id}`);
			logger.info('Media deleted successfully', { id });
		} catch (err) {
			const message = `Error deleting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}
	// Sets access permissions for a media item
	async setMediaAccess(id, access) {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		try {
			const result = await this.db.crud.update('MediaItem', id, { access });
			if (!result.success) {
				throw result.error;
			}
			await cacheService.delete(`media:${id}`);
			logger.info('Media access updated successfully', { id, access });
		} catch (err) {
			const message = `Error setting media access: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}
	// Retrieves a media item by its ID, enforcing access control
	async getMedia(id, user, roles) {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		try {
			const cachedMedia = await cacheService.get(`media:${id}`);
			if (cachedMedia) {
				const isAdmin2 = roles.some((r) => r.isAdmin);
				if (isAdmin2 || cachedMedia.user === user._id || cachedMedia.access === 'public') {
					logger.info('Media retrieved from cache', { id });
					return this.enrichMediaWithUrl(cachedMedia);
				}
			}
			const result = await this.db.crud.findOne('MediaItem', { _id: id });
			if (!result.success) {
				throw result.error;
			}
			const media = result.data;
			if (!media) {
				throw error(404, 'Media not found');
			}
			const isAdmin = roles.some((r) => r.isAdmin);
			const isOwner = media.user === user._id;
			const isPublic = media.access === 'public';
			if (!isAdmin && !isOwner && !isPublic) {
				logger.warn('Access denied to media item', { mediaId: id, userId: user._id, roles: roles.map((r) => r.name) });
				throw error(403, 'Access denied');
			}
			await cacheService.set(`media:${id}`, media, 3600);
			return this.enrichMediaWithUrl(media);
		} catch (err) {
			const message = `Error getting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			if (typeof err === 'object' && err !== null && 'status' in err) {
				const status = err.status;
				if (status === 403 || status === 404) throw err;
			}
			throw error(500, message);
		}
	}
	// Helper to add URL to media object
	enrichMediaWithUrl(media) {
		let url = media.path;
		if (url.startsWith('http://') || url.startsWith('https://'));
		else if (!url.startsWith('/')) {
			url = `/files/${url}`;
		}
		return {
			...media,
			url
		};
	}
	// Bulk delete media items
	async bulkDeleteMedia(ids) {
		this.ensureInitialized();
		if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
			throw Error('Invalid ids: Must be an array of non-empty strings');
		}
		try {
			const convertedIds = ids.map((id) => id);
			const result = await this.db.crud.deleteMany('MediaItem', { _id: { $in: convertedIds } });
			if (!result.success) {
				throw result.error;
			}
			await Promise.all(ids.map((id) => cacheService.delete(`media:${id}`)));
			logger.info('Bulk media deletion successful', { count: ids.length });
		} catch (err) {
			const message = `Error bulk deleting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}
	// Search media items
	async searchMedia(query, page = 1, limit = 20) {
		this.ensureInitialized();
		try {
			const searchCriteria = {
				$or: [{ filename: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
			};
			const options = { offset: (page - 1) * limit, limit };
			const [mediaResult, totalResult] = await Promise.all([
				this.db.crud.findMany('MediaItem', searchCriteria, options),
				this.db.crud.count('MediaItem', searchCriteria)
			]);
			if (!mediaResult.success) {
				throw mediaResult.error;
			}
			if (!totalResult.success) {
				throw totalResult.error;
			}
			return { media: mediaResult.data, total: totalResult.data };
		} catch (err) {
			const message = `Error searching media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}
	// List media items
	async listMedia(page = 1, limit = 20) {
		this.ensureInitialized();
		try {
			const options = { offset: (page - 1) * limit, limit };
			const [mediaResult, totalResult] = await Promise.all([this.db.crud.findMany('MediaItem', {}, options), this.db.crud.count('MediaItem', {})]);
			if (!mediaResult.success) {
				throw mediaResult.error;
			}
			if (!totalResult.success) {
				throw totalResult.error;
			}
			return { media: mediaResult.data, total: totalResult.data };
		} catch (err) {
			const message = `Error listing media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}
	// Determines the media type based on the MIME type
	getMediaType(mimeType) {
		if (!mimeType) throw Error('Mime type is required');
		if (mimeType.startsWith('image/')) {
			return MediaType.Image;
		} else if (mimeType.startsWith('video/')) {
			return MediaType.Video;
		} else if (mimeType.startsWith('audio/')) {
			return MediaType.Audio;
		} else if (mimeType === 'application/pdf') {
			return MediaType.Document;
		} else {
			if (mimeType.startsWith('application/') || mimeType.startsWith('text/')) {
				return MediaType.Document;
			}
			throw Error(`Unsupported media type: ${mimeType}`);
		}
	}
	async saveRemoteMedia(url, userId, access, basePath = 'global') {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch remote file: ${response.statusText}`);
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		const fileName = path.basename(new URL(url).pathname);
		const mimeType = response.headers.get('content-type') || mime.lookup(fileName) || 'application/octet-stream';
		const file = new File([buffer], fileName, { type: mimeType });
		return this.saveMedia(file, userId, access, basePath);
	}
}
export { MediaService as M, extractMetadata as e, getSanitizedFileName as g };
//# sourceMappingURL=MediaService.server.js.map

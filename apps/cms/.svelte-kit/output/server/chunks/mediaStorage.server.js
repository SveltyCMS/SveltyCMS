import { publicEnv } from './globalSettings.svelte.js';
import path from 'path';
import mime from 'mime-types';
import { getPublicSettingSync } from './settingsService.js';
import { l as logger } from './logger.server.js';
import { error } from '@sveltejs/kit';
let s3Client = null;
let cloudinary = null;
function getConfig() {
	const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE');
	const mediaFolder = getPublicSettingSync('MEDIA_FOLDER') || '';
	const normalizedFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
	return {
		storageType,
		bucketName: getPublicSettingSync('MEDIA_BUCKET_NAME'),
		mediaFolder: normalizedFolder,
		region: getPublicSettingSync('MEDIA_CLOUD_REGION'),
		endpoint: getPublicSettingSync('MEDIA_CLOUD_ENDPOINT'),
		publicUrl: getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL'),
		accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
		secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY,
		cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME
	};
}
function isCloud() {
	const type = getPublicSettingSync('MEDIA_STORAGE_TYPE');
	return type === 's3' || type === 'r2' || type === 'cloudinary';
}
async function getS3Client(config) {
	if (s3Client) return s3Client;
	const { S3Client } = await import('@aws-sdk/client-s3');
	const { NodeHttpHandler } = await import('@smithy/node-http-handler');
	const { Agent: HttpsAgent } = await import('https');
	const { Agent: HttpAgent } = await import('http');
	if (!config.accessKeyId || !config.secretAccessKey) {
		throw error(500, 'S3/R2 credentials missing');
	}
	s3Client = new S3Client({
		region: config.region || 'auto',
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		},
		requestHandler: new NodeHttpHandler({
			httpsAgent: new HttpsAgent({
				keepAlive: true,
				timeout: 6e4,
				maxSockets: 50
			}),
			httpAgent: new HttpAgent({
				keepAlive: true,
				timeout: 6e4,
				maxSockets: 50
			})
		})
	});
	return s3Client;
}
async function getCloudinary(config) {
	if (cloudinary) return cloudinary;
	const lib = await import('cloudinary');
	cloudinary = lib.v2;
	cloudinary.config({
		cloud_name: config.cloudinaryCloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET,
		secure: true
	});
	return cloudinary;
}
function getPath(relativePath) {
	const config = getConfig();
	const clean = relativePath.replace(/^\/+/, '');
	return config.mediaFolder ? `${config.mediaFolder}/${clean}` : clean;
}
function getUrl(relativePath) {
	const config = getConfig();
	if (config.storageType === 'local') return `/files/${relativePath.replace(/^\/+/, '')}`;
	if (!config.publicUrl) {
		if (config.storageType === 'cloudinary') return '';
		throw error(500, 'Cloud public URL not configured');
	}
	const fullPath = getPath(relativePath);
	return `${config.publicUrl.replace(/\/+$/, '')}/${fullPath}`;
}
async function upload(buffer, relativePath) {
	const config = getConfig();
	const fullPath = getPath(relativePath);
	logger.debug('Cloud upload start', { type: config.storageType, path: fullPath });
	if (config.storageType === 's3' || config.storageType === 'r2') {
		const client = await getS3Client(config);
		const { PutObjectCommand } = await import('@aws-sdk/client-s3');
		const mime2 = (await import('./mediaUtils.js')).getMimeType(relativePath) || 'application/octet-stream';
		await client.send(
			new PutObjectCommand({
				Bucket: config.bucketName,
				Key: fullPath,
				Body: buffer,
				ContentType: mime2
			})
		);
		return getUrl(relativePath);
	}
	if (config.storageType === 'cloudinary') {
		const cld = await getCloudinary(config);
		const publicId = relativePath.replace(/\.[^.]+$/, '');
		return new Promise((resolve, reject) => {
			const stream = cld.uploader.upload_stream(
				{
					public_id: publicId,
					folder: config.mediaFolder,
					resource_type: 'auto',
					overwrite: true
				},
				(err, res) => {
					if (err) return reject(err);
					resolve(res.secure_url);
				}
			);
			stream.end(buffer);
		});
	}
	throw error(500, 'Invalid storage type for cloud upload');
}
async function remove(relativePath) {
	const config = getConfig();
	const fullPath = getPath(relativePath);
	if (config.storageType === 's3' || config.storageType === 'r2') {
		const client = await getS3Client(config);
		const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
		try {
			await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: fullPath }));
		} catch (e) {
			logger.warn('S3 delete failed', { error: e });
		}
		return;
	}
	if (config.storageType === 'cloudinary') {
		const cld = await getCloudinary(config);
		const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, '')}`;
		await cld.uploader.destroy(publicId);
		return;
	}
}
async function exists(relativePath) {
	const config = getConfig();
	const fullPath = getPath(relativePath);
	try {
		if (config.storageType === 's3' || config.storageType === 'r2') {
			const client = await getS3Client(config);
			const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
			await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: fullPath }));
			return true;
		}
		if (config.storageType === 'cloudinary') {
			const cld = await getCloudinary(config);
			const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, '')}`;
			await cld.api.resource(publicId);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}
const DEFAULT_SIZES = { sm: 600, md: 900, lg: 1200 };
const SIZES = {
	...DEFAULT_SIZES,
	...(publicEnv.IMAGE_SIZES ?? {}),
	original: 0,
	thumbnail: 200
};
function getImageSizes() {
	return SIZES;
}
const MEDIA_ROOT = getPublicSettingSync('MEDIA_FOLDER') ?? 'mediaFiles';
async function saveFile(buffer, relPath) {
	if (isCloud()) {
		await upload(buffer, relPath);
		return getUrl(relPath);
	}
	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, relPath);
	await fs.mkdir(path.dirname(full), { recursive: true });
	await fs.writeFile(full, buffer);
	return `/files/${relPath}`;
}
async function deleteFile(url) {
	let rel = url;
	if (url.startsWith('http')) rel = new URL(url).pathname;
	if (isCloud()) {
		const cfg = getConfig();
		if (cfg && 'prefix' in cfg && typeof cfg.prefix === 'string' && rel.startsWith(`/${cfg.prefix}/`)) {
			rel = rel.slice(cfg.prefix.length + 1);
		}
		await remove(rel);
		return;
	}
	if (rel.startsWith('/files/')) rel = rel.slice(7);
	rel = rel.replace(/^\/+/, '');
	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, rel);
	await fs.unlink(full).catch(() => {});
}
const moveMediaToTrash = deleteFile;
const saveAvatarImage = saveAvatar;
const saveFileToDisk = saveFile;
const saveResizedImages = saveResized;
async function fileExists(rel) {
	if (isCloud()) {
		return await exists(rel);
	}
	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, rel);
	try {
		await fs.access(full);
		return true;
	} catch {
		return false;
	}
}
async function getFile(rel) {
	if (isCloud()) {
		throw new Error('getFile not implemented for cloud');
	}
	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, rel);
	return await fs.readFile(full);
}
async function saveResized(buffer, hash, baseName, ext, baseDir) {
	const sharp = (await import('sharp')).default;
	const meta = await sharp(buffer).metadata();
	const result = {};
	const format = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.format ?? 'original';
	const quality = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.quality ?? 80;
	for (const [key, w] of Object.entries(SIZES)) {
		if (w === 0) continue;
		let instance = sharp(buffer).resize(w, null, { fit: 'cover', position: 'center' });
		let outExt = ext;
		let mimeType = mime.lookup(ext) || 'application/octet-stream';
		if (format !== 'original') {
			instance = instance.toFormat(format, { quality });
			outExt = format;
			mimeType = `image/${format}`;
		}
		const fileName = `${baseName}-${hash}.${outExt}`;
		const relPath = path.posix.join(baseDir, key, fileName);
		const resizedBuf = await instance.toBuffer();
		const url = await saveFile(resizedBuf, relPath);
		const height = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : void 0;
		result[key] = {
			url,
			width: w,
			height: height ?? w,
			size: resizedBuf ? resizedBuf.length : 0,
			mimeType
		};
	}
	return result;
}
async function saveAvatar(file, userId) {
	const buf = Buffer.from(await file.arrayBuffer());
	const ext = path.extname(file.name) || '.jpg';
	const sharp = (await import('sharp')).default;
	const resized = await sharp(buf).resize(200, 200, { fit: 'cover', position: 'center' }).toBuffer();
	const rel = `avatars/${userId}${ext}`;
	return await saveFile(resized, rel);
}
export {
	getImageSizes as a,
	saveFileToDisk as b,
	saveResizedImages as c,
	deleteFile as d,
	fileExists as f,
	getFile as g,
	moveMediaToTrash as m,
	saveAvatarImage as s
};
//# sourceMappingURL=mediaStorage.server.js.map

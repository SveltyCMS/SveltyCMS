/**
 * @file src/utils/media/mediaStorage.server.ts
 * @description Core media storage (local + cloud) with resizing & avatar handling
 *
 * Features:
 * - Unified local/cloud save/delete
 * - Sharp-based resizing
 * - Avatar processing (200x200)
 * - Safe path handling
 * - No DB logic
 */

import { publicEnv } from '@src/stores/globalSettings.svelte';
import path from 'path';
import mime from 'mime-types';

import { getPublicSettingSync } from '@src/services/settingsService';

import { isCloud, upload, remove, getUrl, getConfig, exists } from './cloudStorage';

import type { ResizedImage } from './mediaModels';

// Image sizes
// Image sizes
const DEFAULT_SIZES = { sm: 600, md: 900, lg: 1200 } as const;
const SIZES = {
	...DEFAULT_SIZES,
	...(publicEnv.IMAGE_SIZES ?? {}),
	original: 0,
	thumbnail: 200
};

/** Get configured image sizes */
export function getImageSizes() {
	return SIZES;
}

const MEDIA_ROOT = getPublicSettingSync('MEDIA_FOLDER') ?? 'mediaFolder';

/** Save buffer to storage (local or cloud) */
export async function saveFile(buffer: Buffer, relPath: string): Promise<string> {
	if (isCloud()) {
		await upload(buffer, relPath);
		return getUrl(relPath);
	}

	// Local
	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, relPath);
	await fs.mkdir(path.dirname(full), { recursive: true });
	await fs.writeFile(full, buffer);

	return `/files/${relPath}`;
}

/** Delete file from storage */
export async function deleteFile(url: string): Promise<void> {
	let rel = url;

	if (url.startsWith('http')) rel = new URL(url).pathname;

	if (isCloud()) {
		// Strip prefix if needed (cloud handles full key)
		const cfg = getConfig();
		if (cfg && 'prefix' in cfg && typeof cfg.prefix === 'string' && rel.startsWith(`/${cfg.prefix}/`)) {
			rel = rel.slice(cfg.prefix.length + 1);
		}
		await remove(rel);
		return;
	}

	// Local
	if (rel.startsWith('/files/')) rel = rel.slice(7);
	rel = rel.replace(/^\/+/, '');

	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, rel);
	await fs.unlink(full).catch(() => {}); // best effort
}

/** Alias for backward compatibility */
export const moveMediaToTrash = deleteFile;
export const saveAvatarImage = saveAvatar;
export const saveFileToDisk = saveFile;
export const saveResizedImages = saveResized;

/** Check if file exists */
export async function fileExists(rel: string): Promise<boolean> {
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

/** Get file buffer */
export async function getFile(rel: string): Promise<Buffer> {
	if (isCloud()) {
		throw new Error('getFile not implemented for cloud');
	}
	const fs = await import('fs/promises');
	const full = path.join(process.cwd(), MEDIA_ROOT, rel);
	return await fs.readFile(full);
}

/** Resize & save image variants */
export async function saveResized(
	buffer: Buffer,
	hash: string,
	baseName: string,
	ext: string,
	baseDir: string
): Promise<Record<string, ResizedImage>> {
	const sharp = (await import('sharp')).default;
	const meta = await sharp(buffer).metadata();
	const result: Record<string, ResizedImage> = {};

	const format = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.format ?? 'original';
	const quality = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY?.quality ?? 80;

	for (const [key, w] of Object.entries(SIZES)) {
		if (w === 0) continue; // skip original

		let instance = sharp(buffer).resize(w, null, { fit: 'cover', position: 'center' });

		let outExt = ext;
		let mimeType = mime.lookup(ext) || 'application/octet-stream';

		if (format !== 'original') {
			instance = instance.toFormat(format as 'webp' | 'avif', { quality });
			outExt = format;
			mimeType = `image/${format}`;
		}

		const fileName = `${baseName}-${hash}.${outExt}`;
		const relPath = path.posix.join(baseDir, key, fileName);

		const resizedBuf = await instance.toBuffer();
		const url = await saveFile(resizedBuf, relPath);

		const height = meta.height ? Math.round((w / (meta.width ?? w)) * meta.height) : undefined;

		result[key] = {
			url,
			width: w,
			height: height ?? w,
			size: resizedBuf ? (resizedBuf as any).length : 0,
			mimeType
		};
	}

	return result;
}

/** Save avatar (200x200) */
export async function saveAvatar(file: File, userId: string): Promise<string> {
	const buf = Buffer.from(await file.arrayBuffer());
	const ext = path.extname(file.name) || '.jpg';

	const sharp = (await import('sharp')).default;
	const resized = await sharp(buf).resize(200, 200, { fit: 'cover', position: 'center' }).toBuffer();

	const rel = `avatars/${userId}${ext}`;
	return await saveFile(resized, rel);
}

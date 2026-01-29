/**
 * @file src/utils/media/mediaUtils.ts
 * @description Client-safe media utilities (MIME, URL construction, validation)
 */

import { publicEnv } from '@src/stores/globalSettings.svelte';
import { formatBytes, removeExtension } from '@utils/utils';
// import { logger } from '@utils/logger';

import type { MediaBase } from './mediaModels';

/** Browser-compatible MIME lookup */
export function getMimeType(name: string): string | null {
	const ext = name.toLowerCase().split('.').pop();
	if (!ext) return null;

	const map: Record<string, string> = {
		// Images
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		avif: 'image/avif',
		bmp: 'image/bmp',
		ico: 'image/x-icon',

		// Documents
		pdf: 'application/pdf',
		txt: 'text/plain',

		// Audio
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
		aac: 'audio/aac',
		flac: 'audio/flac',
		m4a: 'audio/mp4',

		// Video
		mp4: 'video/mp4',
		webm: 'video/webm',
		mov: 'video/quicktime'
	};

	return map[ext] ?? null;
}

/** Construct public media URL */
export function mediaUrl(item: MediaBase, size?: string): string {
	if (!item?.url) return '';

	if (publicEnv.MEDIASERVER_URL) {
		// Remove leading /files/ from item.url if present when using external media server
		const cleanUrl = item.url.replace(/^\/files\//, '');
		return `${publicEnv.MEDIASERVER_URL.replace(/\/+$/, '')}/${cleanUrl}`;
	}

	if (size && 'thumbnails' in item && (item.thumbnails as any)?.[size]?.url) {
		return (item.thumbnails as any)[size].url;
	}

	// Check if URL already has /files/ prefix to avoid duplication
	if (item.url.startsWith('/files/')) {
		return item.url;
	}

	// Check if it's an absolute URL (http/https)
	if (item.url.startsWith('http://') || item.url.startsWith('https://')) {
		return item.url;
	}

	return `/files/${item.url}`;
}

/** Build URL from parts (hash-based naming) */
export function buildUrl(path: string, hash: string, filename: string, ext: string, category: string, size?: string): string {
	if (!path || !hash || !filename || !ext || !category) return '';

	const base = removeExtension(filename);
	const file = `${base}-${hash}.${ext}`;

	let rel: string;

	if (path === 'global') {
		rel = size ? `${category}/sizes/${size}/${file}` : `${category}/original/${file}`;
	} else if (path === 'unique') {
		rel = `${category}/original/${file}`;
	} else {
		rel = size ? `${path}/${size}/${file}` : `${path}/${file}`;
	}

	return publicEnv.MEDIASERVER_URL ? `${publicEnv.MEDIASERVER_URL.replace(/\/+$/, '')}/files/${rel}` : `/files/${rel}`;
}

/** Client-side file validation */
export function validateFile(file: File, allowedPattern: RegExp, maxSize = 10 * 1024 * 1024): { valid: boolean; message?: string } {
	const type = getMimeType(file.name) ?? file.type;

	if (!type || !allowedPattern.test(type)) {
		return { valid: false, message: `Invalid type: ${type}` };
	}

	if (file.size > maxSize) {
		return { valid: false, message: `Size exceeds ${formatBytes(maxSize)}` };
	}

	return { valid: true };
}

/** Server-side buffer validation */
export function validateBuffer(
	buffer: Buffer,
	name: string,
	allowedPattern: RegExp,
	maxSize = 10 * 1024 * 1024
): { valid: boolean; message?: string } {
	const type = getMimeType(name) ?? 'application/octet-stream';

	if (!allowedPattern.test(type)) {
		return { valid: false, message: `Invalid type: ${type}` };
	}

	if (buffer.length > maxSize) {
		return { valid: false, message: `Size exceeds ${formatBytes(maxSize)}` };
	}

	return { valid: true };
}

/** Aliases for backward compatibility */
export const validateMediaFileServer = validateBuffer;
export const constructUrl = mediaUrl;
export const constructMediaUrl = mediaUrl;

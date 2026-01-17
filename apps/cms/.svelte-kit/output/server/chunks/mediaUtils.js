import { publicEnv } from './globalSettings.svelte.js';
import { r as removeExtension, f as formatBytes } from './utils.js';
function getMimeType(name) {
	const ext = name.toLowerCase().split('.').pop();
	if (!ext) return null;
	const map = {
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
function mediaUrl(item, size) {
	if (!item?.url) return '';
	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL.replace(/\/+$/, '')}/${item.url}`;
	}
	if (size && 'thumbnails' in item && item.thumbnails?.[size]?.url) {
		return item.thumbnails[size].url;
	}
	return `/files/${item.url}`;
}
function buildUrl(path, hash, filename, ext, category, size) {
	if (!hash || !filename || !ext || !category) return '';
	const base = removeExtension(filename);
	const file = `${base}-${hash}.${ext}`;
	let rel;
	if (path === 'global') {
		rel = size ? `${category}/sizes/${size}/${file}` : `${category}/original/${file}`;
	} else if (path === 'unique') {
		rel = `${category}/original/${file}`;
	} else {
		rel = size ? `${path}/${size}/${file}` : `${path}/${file}`;
	}
	return publicEnv.MEDIASERVER_URL ? `${publicEnv.MEDIASERVER_URL.replace(/\/+$/, '')}/files/${rel}` : `/files/${rel}`;
}
function validateBuffer(buffer, name, allowedPattern, maxSize = 10 * 1024 * 1024) {
	const type = getMimeType(name) ?? 'application/octet-stream';
	if (!allowedPattern.test(type)) {
		return { valid: false, message: `Invalid type: ${type}` };
	}
	if (buffer.length > maxSize) {
		return { valid: false, message: `Size exceeds ${formatBytes(maxSize)}` };
	}
	return { valid: true };
}
const validateMediaFileServer = validateBuffer;
const constructMediaUrl = mediaUrl;
export { buildUrl, constructMediaUrl, getMimeType, mediaUrl, validateBuffer, validateMediaFileServer };
//# sourceMappingURL=mediaUtils.js.map

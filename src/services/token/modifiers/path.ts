/**
 * @file src/services/token/modifiers/path.ts
 * @description Path manipulation modifiers for file paths and URLs
 */

import type { ModifierFunction } from '../types';

/**
 * Gets the basename (filename) from a path
 * @param value File path or URL
 * @example {{entry.image | basename}} - Returns "image.jpg" from "/path/to/image.jpg"
 */
export const basename: ModifierFunction = (value: unknown): string => {
	const path = String(value);
	if (!path) return '';
	
	// Remove query string and hash
	const cleanPath = path.split('?')[0].split('#')[0];
	
	// Extract filename
	const parts = cleanPath.split('/').filter(Boolean);
	return parts.length > 0 ? parts[parts.length - 1] : '';
};

/**
 * Gets the directory path from a file path
 * @param value File path or URL
 * @example {{entry.image | dirname}} - Returns "/path/to" from "/path/to/image.jpg"
 */
export const dirname: ModifierFunction = (value: unknown): string => {
	const path = String(value);
	if (!path) return '';
	
	// Remove query string and hash
	const cleanPath = path.split('?')[0].split('#')[0];
	
	// Extract directory
	const parts = cleanPath.split('/').filter(Boolean);
	if (parts.length <= 1) return '/';
	
	parts.pop(); // Remove filename
	return '/' + parts.join('/');
};

/**
 * Gets the file extension from a path
 * @param value File path or URL
 * @example {{entry.image | extension}} - Returns "jpg" from "/path/to/image.jpg"
 */
export const extension: ModifierFunction = (value: unknown): string => {
	const path = String(value);
	if (!path) return '';
	
	// Remove query string and hash
	const cleanPath = path.split('?')[0].split('#')[0];
	
	// Extract extension
	const filename = basename({}, [cleanPath]);
	const lastDot = filename.lastIndexOf('.');
	
	if (lastDot === -1 || lastDot === filename.length - 1) {
		return '';
	}
	
	return filename.substring(lastDot + 1).toLowerCase();
};

/**
 * Gets the filename without extension
 * @param value File path or URL
 * @example {{entry.image | filename}} - Returns "image" from "/path/to/image.jpg"
 */
export const filename: ModifierFunction = (value: unknown): string => {
	const path = String(value);
	if (!path) return '';
	
	// Remove query string and hash
	const cleanPath = path.split('?')[0].split('#')[0];
	
	// Extract filename
	const parts = cleanPath.split('/').filter(Boolean);
	const basenameValue = parts.length > 0 ? parts[parts.length - 1] : '';
	
	// Extract extension
	const lastDot = basenameValue.lastIndexOf('.');
	if (lastDot === -1 || lastDot === basenameValue.length - 1) {
		return basenameValue;
	}
	
	return basenameValue.substring(0, lastDot);
};

/**
 * Joins path segments
 * @param value Base path
 * @param params Additional path segments to join
 * @example {{entry.base | path("sub", "file.txt")}} - Joins paths together
 */
export const path: ModifierFunction = (value: unknown, params?: string[]): string => {
	const base = String(value).trim();
	if (!params || params.length === 0) return base;
	
	// Remove leading/trailing slashes from base
	const cleanBase = base.replace(/^\/+|\/+$/g, '');
	
	// Clean all path segments
	const segments = [cleanBase, ...params]
		.map(seg => seg.trim().replace(/^\/+|\/+$/g, ''))
		.filter(Boolean);
	
	return '/' + segments.join('/');
};

/**
 * Removes query string and hash from URL
 * @param value URL or path
 * @example {{entry.url | cleanurl}} - Removes ?query=1#hash from URL
 */
export const cleanurl: ModifierFunction = (value: unknown): string => {
	const url = String(value);
	if (!url) return '';
	return url.split('?')[0].split('#')[0];
};

/**
 * Path modifiers array for registration
 */
export const pathModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'basename', fn: basename },
	{ name: 'dirname', fn: dirname },
	{ name: 'extension', fn: extension },
	{ name: 'filename', fn: filename },
	{ name: 'path', fn: path },
	{ name: 'cleanurl', fn: cleanurl }
];


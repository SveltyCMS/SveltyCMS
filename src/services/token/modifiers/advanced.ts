/**
 * @file src/services/token/modifiers/advanced.ts
 * @description Advanced modifiers for image manipulation and relational data
 */

import type { ModifierFunction } from '../types';
import { logger } from '@utils/logger';
import { publicEnv } from '@src/stores/globalSettings.svelte';

/**
 * Image style modifier - transforms image URLs based on style name
 * @param value Image ID or path
 * @param params Style name (e.g., 'thumbnail', 'banner')
 */
export const imageStyle: ModifierFunction = async (
	value: unknown,
	params?: string[]
): Promise<string> => {
	if (!value || typeof value !== 'string') {
		return '';
	}

	const styleName = params && params[0] ? params[0] : 'original';
	
	// Try to get media server URL (works in both browser and server contexts)
	let mediaServerUrl: string | undefined;
	try {
		// In browser, publicEnv is available
		if (typeof window !== 'undefined') {
			mediaServerUrl = publicEnv?.MEDIASERVER_URL;
		} else {
			// In server context, we'd need to import differently or pass via context
			// For now, return original value if not available
		}
	} catch {
		// publicEnv might not be available in all contexts
	}

	if (!mediaServerUrl) {
		logger.warn('MEDIASERVER_URL not configured, returning original value');
		return String(value);
	}

	// Construct URL with style parameter
	// Format: {MEDIASERVER_URL}/media/{imageId}?style={styleName}
	try {
		// If value is already a full URL, extract the ID
		let imageId = value;
		if (value.includes('/')) {
			const parts = value.split('/');
			imageId = parts[parts.length - 1];
			// Remove query params if present
			imageId = imageId.split('?')[0];
		}

		return `${mediaServerUrl}/media/${imageId}?style=${styleName}`;
	} catch (error) {
		logger.error('Error applying image_style modifier:', error);
		return String(value);
	}
};

/**
 * Related modifier - fetches related data from another collection
 * Note: This is a placeholder for future implementation
 * In a real implementation, this would query the database for related entries
 * 
 * @param value Related entry ID
 * @param params Field name to retrieve from related entry
 */
export const related: ModifierFunction = async (
	value: unknown,
	params?: string[]
): Promise<string> => {
	if (!value || typeof value !== 'string') {
		return '';
	}

	const fieldName = params && params[0] ? params[0] : 'name';

	// TODO: Implement actual database query to fetch related entry
	// For now, return a placeholder
	logger.warn('related() modifier not yet fully implemented');
	return `[Related: ${fieldName} from ${value}]`;
};

/**
 * Advanced modifiers array for registration
 */
export const advancedModifiers: Array<{ name: string; fn: ModifierFunction }> = [
	{ name: 'image_style', fn: imageStyle },
	{ name: 'related', fn: related }
];


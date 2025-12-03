/**
 * @file src/utils/media/advancedSearch.ts
 * @description Advanced search capabilities for media files
 */

import type { MediaBase, MediaImage } from './mediaModels';

export interface SearchCriteria {
	// Text search
	filename?: string;
	tags?: string[];

	// Dimensions
	minWidth?: number;
	maxWidth?: number;
	minHeight?: number;
	maxHeight?: number;
	aspectRatio?: 'landscape' | 'portrait' | 'square';

	// File properties
	minSize?: number; // bytes
	maxSize?: number; // bytes
	fileTypes?: string[]; // MIME types

	// Dates
	uploadedAfter?: Date;
	uploadedBefore?: Date;

	// Color (simplified - would need color extraction on upload)
	dominantColor?: string; // hex color

	// Metadata
	hasEXIF?: boolean;
	camera?: string;
	location?: string;

	// Duplicates
	showDuplicatesOnly?: boolean;
	hashMatch?: string;
}

export interface SearchResult {
	files: MediaBase[];
	totalCount: number;
	matchedCriteria: string[];
}

// Perform advanced search on media files
export function advancedSearch(files: MediaBase[], criteria: SearchCriteria): SearchResult {
	const matchedCriteria: string[] = [];

	const results = files.filter((file) => {
		let matches = true;

		// Filename search (case-insensitive)
		if (criteria.filename) {
			matches = matches && file.filename.toLowerCase().includes(criteria.filename.toLowerCase());
			if (matches) matchedCriteria.push(`Filename: "${criteria.filename}"`);
		}

		// Tags search
		if (criteria.tags && criteria.tags.length > 0) {
			const fileTags = (file.metadata?.tags || []) as string[];
			const hasAllTags = criteria.tags.every((tag) => fileTags.some((ft) => ft.toLowerCase() === tag.toLowerCase()));
			matches = matches && hasAllTags;
			if (matches) matchedCriteria.push(`Tags: ${criteria.tags.join(', ')}`);
		}

		// Dimensions (for images)
		if ('width' in file && 'height' in file) {
			const imageFile = file as MediaImage;

			if (criteria.minWidth !== undefined) {
				matches = matches && (imageFile.width || 0) >= criteria.minWidth;
				if (matches) matchedCriteria.push(`Min width: ${criteria.minWidth}px`);
			}

			if (criteria.maxWidth !== undefined) {
				matches = matches && (imageFile.width || 0) <= criteria.maxWidth;
				if (matches) matchedCriteria.push(`Max width: ${criteria.maxWidth}px`);
			}

			if (criteria.minHeight !== undefined) {
				matches = matches && (imageFile.height || 0) >= criteria.minHeight;
				if (matches) matchedCriteria.push(`Min height: ${criteria.minHeight}px`);
			}

			if (criteria.maxHeight !== undefined) {
				matches = matches && (imageFile.height || 0) <= criteria.maxHeight;
				if (matches) matchedCriteria.push(`Max height: ${criteria.maxHeight}px`);
			}

			// Aspect ratio
			if (criteria.aspectRatio && imageFile.width && imageFile.height) {
				const ratio = imageFile.width / imageFile.height;
				let matchesRatio = false;

				if (criteria.aspectRatio === 'landscape') matchesRatio = ratio > 1.1;
				else if (criteria.aspectRatio === 'portrait') matchesRatio = ratio < 0.9;
				else if (criteria.aspectRatio === 'square') matchesRatio = ratio >= 0.9 && ratio <= 1.1;

				matches = matches && matchesRatio;
				if (matches) matchedCriteria.push(`Aspect ratio: ${criteria.aspectRatio}`);
			}
		}

		// File size
		if (criteria.minSize !== undefined) {
			matches = matches && (file.size || 0) >= criteria.minSize;
			if (matches) matchedCriteria.push(`Min size: ${formatBytes(criteria.minSize)}`);
		}

		if (criteria.maxSize !== undefined) {
			matches = matches && (file.size || 0) <= criteria.maxSize;
			if (matches) matchedCriteria.push(`Max size: ${formatBytes(criteria.maxSize)}`);
		}

		// File types
		if (criteria.fileTypes && criteria.fileTypes.length > 0) {
			matches = matches && criteria.fileTypes.includes(file.mimeType);
			if (matches) matchedCriteria.push(`Type: ${criteria.fileTypes.join(', ')}`);
		}

		// Upload dates
		if (criteria.uploadedAfter) {
			const fileDate = new Date(file.createdAt);
			matches = matches && fileDate >= criteria.uploadedAfter;
			if (matches) matchedCriteria.push(`After: ${criteria.uploadedAfter.toLocaleDateString()}`);
		}

		if (criteria.uploadedBefore) {
			const fileDate = new Date(file.createdAt);
			matches = matches && fileDate <= criteria.uploadedBefore;
			if (matches) matchedCriteria.push(`Before: ${criteria.uploadedBefore.toLocaleDateString()}`);
		}

		// EXIF metadata
		if (criteria.hasEXIF !== undefined) {
			const hasMetadata = !!file.metadata?.exif;
			matches = matches && hasMetadata === criteria.hasEXIF;
			if (matches) matchedCriteria.push(criteria.hasEXIF ? 'Has EXIF' : 'No EXIF');
		}

		if (criteria.camera) {
			const cameraMatch = file.metadata?.exif?.Make || file.metadata?.exif?.Model;
			matches = matches && !!cameraMatch && cameraMatch.toLowerCase().includes(criteria.camera.toLowerCase());
			if (matches) matchedCriteria.push(`Camera: ${criteria.camera}`);
		}

		// Duplicate detection
		if (criteria.showDuplicatesOnly) {
			const duplicateCount = files.filter((f) => f.hash === file.hash).length;
			matches = matches && duplicateCount > 1;
			if (matches) matchedCriteria.push('Duplicates only');
		}

		if (criteria.hashMatch) {
			matches = matches && file.hash === criteria.hashMatch;
			if (matches) matchedCriteria.push(`Hash: ${criteria.hashMatch.substring(0, 8)}...`);
		}

		return matches;
	});

	// Remove duplicate criteria
	const uniqueCriteria = [...new Set(matchedCriteria)];

	return {
		files: results,
		totalCount: results.length,
		matchedCriteria: uniqueCriteria
	};
}

// Get search suggestions based on existing files
export function getSearchSuggestions(files: MediaBase[]): {
	tags: string[];
	cameras: string[];
	dimensions: { width: number; height: number }[];
	sizesRanges: { min: number; max: number; label: string }[];
} {
	const tags = new Set<string>();
	const cameras = new Set<string>();
	const dimensions: { width: number; height: number }[] = [];

	for (const file of files) {
		// Collect tags
		if (file.metadata?.tags) {
			(file.metadata.tags as string[]).forEach((tag) => tags.add(tag));
		}

		// Collect cameras
		if (file.metadata?.exif?.Make || file.metadata?.exif?.Model) {
			const camera = `${file.metadata.exif.Make || ''} ${file.metadata.exif.Model || ''}`.trim();
			if (camera) cameras.add(camera);
		}

		// Collect common dimensions (for images)
		if ('width' in file && 'height' in file) {
			const img = file as MediaImage;
			if (img.width && img.height) {
				dimensions.push({ width: img.width, height: img.height });
			}
		}
	}

	// Common size ranges
	const sizesRanges = [
		{ min: 0, max: 100 * 1024, label: '< 100 KB' },
		{ min: 100 * 1024, max: 1024 * 1024, label: '100 KB - 1 MB' },
		{ min: 1024 * 1024, max: 5 * 1024 * 1024, label: '1 MB - 5 MB' },
		{ min: 5 * 1024 * 1024, max: 10 * 1024 * 1024, label: '5 MB - 10 MB' },
		{ min: 10 * 1024 * 1024, max: Infinity, label: '> 10 MB' }
	];

	return {
		tags: Array.from(tags).sort(),
		cameras: Array.from(cameras).sort(),
		dimensions: dimensions.slice(0, 10), // Top 10 common dimensions
		sizesRanges
	};
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

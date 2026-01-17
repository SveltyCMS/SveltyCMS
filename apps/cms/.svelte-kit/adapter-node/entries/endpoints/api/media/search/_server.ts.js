import { error, json } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
function advancedSearch(files, criteria) {
	const matched = [];
	const result = [];
	for (const file of files) {
		let ok = true;
		if (criteria.filename) {
			ok &&= file.filename.toLowerCase().includes(criteria.filename.toLowerCase());
			if (ok) matched.push(`Filename: "${criteria.filename}"`);
		}
		if (criteria.tags?.length) {
			const fileTags = file.metadata?.tags ?? [];
			ok &&= criteria.tags.every((t) => fileTags.some((ft) => ft.toLowerCase() === t.toLowerCase()));
			if (ok) matched.push(`Tags: ${criteria.tags.join(', ')}`);
		}
		if ('width' in file && 'height' in file) {
			const img = file;
			if (criteria.minWidth !== void 0) ok &&= img.width >= criteria.minWidth;
			if (criteria.maxWidth !== void 0) ok &&= img.width <= criteria.maxWidth;
			if (criteria.minHeight !== void 0) ok &&= img.height >= criteria.minHeight;
			if (criteria.maxHeight !== void 0) ok &&= img.height <= criteria.maxHeight;
			if (criteria.aspectRatio && img.width && img.height) {
				const ratio = img.width / img.height;
				const isLandscape = ratio > 1.1;
				const isPortrait = ratio < 0.9;
				const isSquare = ratio >= 0.9 && ratio <= 1.1;
				ok &&= criteria.aspectRatio === 'landscape' ? isLandscape : criteria.aspectRatio === 'portrait' ? isPortrait : isSquare;
				if (ok) matched.push(`Aspect: ${criteria.aspectRatio}`);
			}
		}
		if (criteria.minSize !== void 0) ok &&= (file.size ?? 0) >= criteria.minSize;
		if (criteria.maxSize !== void 0) ok &&= (file.size ?? 0) <= criteria.maxSize;
		if (criteria.fileTypes?.length) ok &&= criteria.fileTypes.includes(file.mimeType);
		if (criteria.uploadedAfter) ok &&= new Date(file.createdAt) >= criteria.uploadedAfter;
		if (criteria.uploadedBefore) ok &&= new Date(file.createdAt) <= criteria.uploadedBefore;
		if (criteria.hasEXIF !== void 0) ok &&= !!file.metadata?.exif === criteria.hasEXIF;
		if (criteria.camera) {
			const exif = file.metadata?.exif;
			const cam = `${exif?.Make ?? ''} ${exif?.Model ?? ''}`.trim().toLowerCase();
			ok &&= cam.includes(criteria.camera.toLowerCase());
		}
		if (criteria.location) {
			const exif = file.metadata?.exif;
			const loc = (exif?.location ?? '').toLowerCase();
			ok &&= loc.includes(criteria.location.toLowerCase());
		}
		if (criteria.showDuplicatesOnly) {
			const dupCount = files.filter((f) => f.hash === file.hash).length;
			ok &&= dupCount > 1;
		}
		if (criteria.dominantColor) {
			const metadata = file.metadata;
			ok &&= !!metadata?.dominantColor && metadata.dominantColor.toLowerCase().includes(criteria.dominantColor.toLowerCase());
		}
		if (ok) result.push(file);
	}
	return {
		files: result,
		total: result.length,
		matched: [...new Set(matched)]
	};
}
function getSuggestions(files) {
	const tags = /* @__PURE__ */ new Set();
	const cameras = /* @__PURE__ */ new Set();
	const dimensions = /* @__PURE__ */ new Map();
	for (const file of files) {
		file.metadata?.tags?.forEach((t) => tags.add(t));
		const exif = file.metadata?.exif;
		if (exif) {
			const cam = `${exif.Make ?? ''} ${exif.Model ?? ''}`.trim();
			if (cam) cameras.add(cam);
		}
		if ('width' in file && 'height' in file) {
			const key = `${file.width}x${file.height}`;
			dimensions.set(key, (dimensions.get(key) ?? 0) + 1);
		}
	}
	return {
		tags: Array.from(tags).sort(),
		cameras: Array.from(cameras).sort(),
		commonDimensions: Array.from(dimensions.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([dim]) => dim),
		sizeRanges: [
			{ min: 0, max: 1e5, label: '< 100 KB' },
			{ min: 1e5, max: 1e6, label: '100 KB – 1 MB' },
			{ min: 1e6, max: 5e6, label: '1 – 5 MB' },
			{ min: 5e6, max: 1e7, label: '5 – 10 MB' },
			{ min: 1e7, max: Infinity, label: '> 10 MB' }
		]
	};
}
const getSearchSuggestions = getSuggestions;
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}
		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}
		const body = await request.json();
		const { criteria } = body;
		if (!criteria || typeof criteria !== 'object') {
			throw error(400, 'Invalid request: search criteria is required');
		}
		logger.info('Advanced search requested', {
			userId: user._id,
			criteria: Object.keys(criteria),
			tenantId
		});
		const result = await dbAdapter.crud.findMany('MediaItem', {});
		if (!result.success) {
			throw error(500, 'Failed to fetch media files');
		}
		const files = result.data;
		const searchResult = advancedSearch(files, criteria);
		logger.info('Advanced search completed', {
			totalFiles: files.length,
			matchedFiles: searchResult.files.length,
			matchedCriteria: searchResult.matched
		});
		return json({
			success: true,
			...searchResult
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : 500;
		logger.error('Advanced search failed', {
			error: message,
			userId: user?._id,
			tenantId
		});
		throw error(status, message);
	}
};
const GET = async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}
		if (!dbAdapter) {
			throw error(500, 'Database adapter not initialized');
		}
		logger.info('Search suggestions requested', { userId: user._id, tenantId });
		const result = await dbAdapter.crud.findMany('MediaItem', {});
		if (!result.success) {
			throw error(500, 'Failed to fetch media files');
		}
		const files = result.data;
		const suggestions = getSearchSuggestions(files);
		logger.info('Search suggestions generated', {
			tags: suggestions.tags.length,
			cameras: suggestions.cameras.length,
			dimensions: suggestions.commonDimensions.length
		});
		return json({
			success: true,
			suggestions
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : 500;
		logger.error('Failed to get search suggestions', {
			error: message,
			userId: user?._id,
			tenantId
		});
		throw error(status, message);
	}
};
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map

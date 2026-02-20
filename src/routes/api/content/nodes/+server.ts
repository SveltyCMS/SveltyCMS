/**
 * @file src\routes\api\content\nodes\+server.ts
 * @description API endpoint for fetching node children.
 *
 * Security: Protected by hooks, admin-only.
 */

import { contentManager } from '@src/content/content-manager';
import { json } from '@sveltejs/kit';

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const GET = apiHandler(async ({ url, locals }) => {
	const parentId = url.searchParams.get('parentId');
	const tenantId = locals.tenantId;

	if (!parentId) {
		throw new AppError('parentId is required', 400, 'VALIDATION_ERROR');
	}

	const children = contentManager.getNodeChildren(parentId, tenantId);

	const navigationChildren = children.map((node) => ({
		_id: node._id,
		name: node.name,
		path: node.path,
		icon: node.icon,
		nodeType: node.nodeType,
		order: node.order,
		parentId: node.parentId,
		translations: node.translations,
		hasChildren: node.children && node.children.length > 0
	}));

	return json({ nodes: navigationChildren });
});

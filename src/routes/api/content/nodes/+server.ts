/**
 * @file src\routes\api\content\nodes\+server.ts
 * @description API endpoint for fetching node children.
 *
 * Security: Protected by hooks, admin-only.
 */
import { json } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	const parentId = url.searchParams.get('parentId');
	const tenantId = locals.tenantId;

	if (!parentId) {
		return json({ error: 'parentId is required' }, { status: 400 });
	}

	try {
		const children = contentManager.getNodeChildren(parentId, tenantId);

		// Map to NavigationNode format if needed, or just return ContentNode[]
		// The client expects NavigationNode likely.
		// Let's use the same strip logic or just return what getNodeChildren returns (ContentNode[])
		// But ContentNode has heavy fields? No, getNodeChildren returns ContentNode which might have collectionDef.
		// We should strip it down to NavigationNode to be lightweight.

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
	} catch (err) {
		return json({ error: 'Failed to fetch nodes' }, { status: 500 });
	}
};

import { json } from '@sveltejs/kit';
import { contentManager } from '../../../../../chunks/ContentManager.js';
const GET = async ({ url, locals }) => {
	const parentId = url.searchParams.get('parentId');
	const tenantId = locals.tenantId;
	if (!parentId) {
		return json({ error: 'parentId is required' }, { status: 400 });
	}
	try {
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
	} catch (err) {
		return json({ error: 'Failed to fetch nodes' }, { status: 500 });
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map

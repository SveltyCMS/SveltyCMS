import type { ContentNode } from '@src/content/types';

export interface TreeViewItem {
	id: string;
	name: string;
	nodeType: 'category' | 'collection';
	path: string;
	parent: string | null;
	order?: number;
	icon?: string;
	children?: TreeViewItem[];
}

/**
 * Converts a flat list of ContentNodes to a nested TreeViewItem structure.
 * Note: standard svelte-treeview might expect flat list with 'parent' props,
 * but this utility seems to return a flat list or nested?
 * The test says "should convert a flat list of root nodes" -> result length 2.
 * "should convert nested nodes" -> result length 3 (flat list with parent refs).
 * So it returns a FLAT list of TreeViewItems.
 */
export function toTreeViewData(nodes: ContentNode[], parentId: string | null = null, parentPath: string | null = null): TreeViewItem[] {
	let result: TreeViewItem[] = [];

	nodes.forEach((node) => {
		const currentPath = parentPath ? `${parentPath}.${node._id}` : node._id.toString();
		const item: TreeViewItem = {
			id: node._id.toString(),
			name: node.name,
			nodeType: node.nodeType as 'category' | 'collection',
			path: currentPath,
			parent: parentId,
			order: node.order,
			icon: node.icon
		};
		result.push(item);

		if (node.children && node.children.length > 0) {
			result = result.concat(toTreeViewData(node.children, node._id.toString(), currentPath)); // Recurse with flat concatenation
		} else if (node.nodeType === 'category') {
			// Logic in test "nested nodes" expects result[1].path to be 'cat1.col1'.
			// If input nodes are already nested (ContentNode has children), we flatten them.
			// See helper below if deeper logic is needed.
		}
	});
	return result; // But wait, test 'should convert nested nodes' pass in nested ContentNodes.
}

/**
 * Converts TreeViewItems back to nested ContentNodes
 */
export function fromTreeViewData(items: TreeViewItem[]): ContentNode[] {
	const nodeMap = new Map<string, ContentNode>();
	const rootNodes: ContentNode[] = [];

	// First pass: create nodes
	items.forEach((item) => {
		const node: ContentNode = {
			_id: item.id as any,
			name: item.name,
			nodeType: item.nodeType,
			icon: item.icon,
			order: item.order || 0,
			children: []
			// These will be populated or left undefined
			// parentId is optional in ContentNode
		} as unknown as ContentNode;
		nodeMap.set(item.id, node);
	});

	// Second pass: structure them
	items.forEach((item) => {
		const node = nodeMap.get(item.id)!;
		if (item.parent) {
			const parent = nodeMap.get(item.parent);
			if (parent) {
				parent.children = parent.children || [];
				parent.children.push(node);
				node.parentId = item.parent as any;
			} else {
				// Orphan, add to root
				rootNodes.push(node);
			}
		} else {
			rootNodes.push(node);
		}
	});

	return rootNodes;
}

/**
 * Converts TreeViewItems to flat ContentNodes (for DB storage presumably)
 */
export function toFlatContentNodes(items: TreeViewItem[]): ContentNode[] {
	// This seems similar to fromTreeViewData but maybe just flat list with parentIds?
	// Test says: expect result length 2, parentId set.
	return items
		.map(
			(item, index) =>
				({
					_id: item.id as any,
					name: item.name,
					nodeType: item.nodeType,
					icon: item.icon,
					order: item.order !== undefined ? item.order : index, // Fallback to index if needed, or maintain order
					parentId: item.parent as any // string | null -> any to satisfy type?
				}) as ContentNode
		)
		.map((n) => {
			if (!n.parentId) delete n.parentId;
			return n;
		});
}

/**
 * Recalculates path and parent properties based on new hierarchy/order
 */
export function recalculatePaths(items: TreeViewItem[]): TreeViewItem[] {
	// This usually implies we have a list where 'parent' might be changed,
	// and we need to update 'path' and 'order'.
	// Or maybe we treat the input list as the source of truth for order?

	// Sort logic from test: "update order based on sibling position"
	// But wait, the input list order matters?
	// "Should be sorted by order: c(1), b(3), a(5) -> new orders 0, 1, 2"
	// This implies we re-sort them based on current 'order' prop IF provided, then re-index?
	// OR we just take the list order?
	// Test says: items list order is a(5), b(3), c(1). Result orders: c->0, b->1, a->2.
	// So it logic sorts by existing order then re-assigns 0,1,2.

	// Implementation:
	// 1. Group by parent
	// 2. Sort siblings by order
	// 3. Update order to 0, 1, 2...
	// 4. Update paths recursively

	const byParent = new Map<string | null, TreeViewItem[]>();
	items.forEach((item) => {
		const pid = item.parent || null;
		if (!byParent.has(pid)) byParent.set(pid, []);
		byParent.get(pid)!.push(item);
	});

	// Sort siblings
	for (const siblings of byParent.values()) {
		siblings.sort((a, b) => (a.order || 0) - (b.order || 0));
	}

	const result: TreeViewItem[] = [];

	function processLevel(parentId: string | null, parentPath: string | null) {
		const siblings = byParent.get(parentId) || [];
		siblings.forEach((item, index) => {
			item.order = index; // Re-index
			item.path = parentPath ? `${parentPath}.${item.id}` : item.id;

			result.push(item);

			processLevel(item.id, item.path);
		});
	}

	processLevel(null, null);

	return result;
}

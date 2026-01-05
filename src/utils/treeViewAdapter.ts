/**
 * @file src/utils/treeViewAdapter.ts
 * @description Adapter for converting ContentNode to TreeView data.
 *
 * This module provides functions for converting ContentNode structures to TreeView data
 * and vice versa. It is used for hierarchical organization of content in the CMS.
 */

import type { ContentNode } from '@databases/dbInterface';

export interface TreeViewItem extends Record<string, any> {
	id: string;
	name: string;
	parent: string | null;
	// children is NOT part of the flat item structure for TreeView
	// element references are handled by TreeView via path/id
	nodeType: 'category' | 'collection';
	icon?: string;
	path: string;
	order?: number;
	_id?: any; // Preserve original ID reference
	// Drag-and-drop control
	isDraggable?: boolean;
	isDropAllowed?: boolean;
}

/**
 * Flattens a recursive ContentNode structure into a flat array for svelte-treeview
 */
export function toTreeViewData(nodes: ContentNode[], parentPath: string = ''): TreeViewItem[] {
	let result: TreeViewItem[] = [];

	for (const node of nodes) {
		// Access properties safely. ContentNode uses _id usually.
		// We cast to any to be flexible about input types during migration
		const n = node as any;
		const id = String(n.id || n._id || crypto.randomUUID());

		// Create LTree path: e.g. "root.child.grandchild"
		const path = parentPath ? `${parentPath}.${id}` : id;

		// Destructure to exclude children from the rest spread
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { children, ...rest } = n;

		const item: TreeViewItem = {
			...rest,
			id,
			name: n.name || 'Untitled',
			nodeType: n.type || n.nodeType || 'collection',
			icon: n.icon,
			path: path,
			parent: parentPath ? parentPath.split('.').pop() || null : null,
			// Enable drag-and-drop for all items
			isDraggable: true,
			isDropAllowed: true
		};

		result.push(item);

		if (children && Array.isArray(children) && children.length > 0) {
			const childItems = toTreeViewData(children, path);
			result = result.concat(childItems);
		}
	}

	return result;
}

/**
 * Reconstructs recursive ContentNode structure from flat TreeView items
 */
export function fromTreeViewData(flatItems: TreeViewItem[]): ContentNode[] {
	const nodeMap = new Map<string, ContentNode>();
	const roots: ContentNode[] = [];

	// Create nodes
	for (const item of flatItems) {
		const { path, parent, text, ...rest } = item;

		const node: any = {
			...rest,
			// Restore _id if available, else map id
			_id: rest._id || item.id,
			// Ensure children array exists
			children: []
		};

		// delete internal tree props if they leaked
		delete node.path;
		delete node.parent;
		delete node.text;

		nodeMap.set(String(item.id), node as ContentNode);
	}

	// Build hierarchy
	for (const item of flatItems) {
		const node = nodeMap.get(String(item.id));
		if (!node) continue;

		if (item.path && item.path.includes('.')) {
			const segments = item.path.split('.');
			segments.pop(); // remove self
			const parentId = segments.pop(); // get parent id

			if (parentId) {
				const parent = nodeMap.get(parentId);
				if (parent && parent.children) {
					parent.children.push(node);
				} else {
					roots.push(node);
				}
			} else {
				roots.push(node);
			}
		} else {
			roots.push(node);
		}
	}

	return roots;
}

/**
 * Converts flat TreeView items directly to flat ContentNodes for the backend.
 * Handles parentId mapping and recalculates order based on sibling position.
 */
export function toFlatContentNodes(flatItems: TreeViewItem[]): ContentNode[] {
	// Group items by parent to calculate order within siblings
	const siblingGroups = new Map<string, TreeViewItem[]>();

	for (const item of flatItems) {
		const parentKey = item.parent || '__root__';
		if (!siblingGroups.has(parentKey)) {
			siblingGroups.set(parentKey, []);
		}
		siblingGroups.get(parentKey)!.push(item);
	}

	// Sort each sibling group by their path order (lexicographic within same level)
	for (const [, siblings] of siblingGroups) {
		siblings.sort((a, b) => {
			// Sort by path to maintain visual order
			const aSegments = a.path.split('.');
			const bSegments = b.path.split('.');
			// Compare the last segment (their position at this level)
			return aSegments[aSegments.length - 1].localeCompare(bSegments[bSegments.length - 1]);
		});
	}

	// Create order lookup
	const orderLookup = new Map<string, number>();
	for (const [, siblings] of siblingGroups) {
		siblings.forEach((item, index) => {
			orderLookup.set(item.id, index);
		});
	}

	return flatItems.map((item) => {
		// Extract parentId from path (second-to-last segment)
		let parentId: string | undefined;
		if (item.path && item.path.includes('.')) {
			const segments = item.path.split('.');
			segments.pop(); // Remove self
			parentId = segments.pop(); // Get parent id
		}

		return {
			...item,
			_id: item._id || item.id,
			id: undefined, // ContentNode uses _id
			parentId: parentId,
			name: item.name,
			icon: item.icon,
			nodeType: item.nodeType,
			path: item.path,
			order: orderLookup.get(item.id) ?? 0,

			// Clean up internal props
			parent: undefined,
			text: undefined
		} as unknown as ContentNode;
	});
}

/**
 * Recalculates paths for TreeView items after a drag-and-drop operation.
 * This is essential because svelte-treeview may not automatically maintain
 * consistent paths after complex moves.
 *
 * @param items Flat array of TreeView items with potentially stale paths
 * @returns Items with recalculated paths based on parent relationships
 */
export function recalculatePaths(items: TreeViewItem[]): TreeViewItem[] {
	// Build a map of id -> item for quick lookup
	const itemMap = new Map<string, TreeViewItem>();
	for (const item of items) {
		itemMap.set(item.id, { ...item });
	}

	// Group by parent to determine order
	const childrenByParent = new Map<string, TreeViewItem[]>();
	for (const item of items) {
		const parentKey = item.parent || '__root__';
		if (!childrenByParent.has(parentKey)) {
			childrenByParent.set(parentKey, []);
		}
		childrenByParent.get(parentKey)!.push(itemMap.get(item.id)!);
	}

	// Sort children within each parent group by their current order/path

	// Recursively assign new paths starting from roots
	function assignPaths(parentId: string | null, parentPath: string): void {
		const key = parentId || '__root__';
		const children = childrenByParent.get(key);
		if (!children) return;

		children.forEach((child, index) => {
			const newPath = parentPath ? `${parentPath}.${child.id}` : child.id;
			const item = itemMap.get(child.id);
			if (item) {
				item.path = newPath;
				item.order = index;
				item.parent = parentId;
			}
			// Recurse into children
			assignPaths(child.id, newPath);
		});
	}

	// Start from roots
	assignPaths(null, '');

	return Array.from(itemMap.values());
}

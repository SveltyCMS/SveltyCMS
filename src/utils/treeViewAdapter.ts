/**
 * @file src/utils/treeViewAdapter.ts
 * @description Adapter for converting ContentNode to TreeView data.
 *
 * This module provides functions for converting ContentNode structures to TreeView data
 * and vice versa. It is used for hierarchical organization of content in the CMS.
 */

import type { ContentNode } from '@root/src/databases/dbInterface';

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
			parent: parentPath ? parentPath.split('.').pop() || null : null
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
 * Handles parentId mapping, order, and path regeneration.
 */
export function toFlatContentNodes(flatItems: TreeViewItem[]): ContentNode[] {
	return flatItems.map((item) => {
		const parentId = item.parent || undefined;
		return {
			...item,
			_id: item._id || item.id,
			id: undefined, // ContentNode uses _id usually
			parentId: parentId,
			name: item.name,
			icon: item.icon,
			nodeType: item.nodeType,
			path: item.path,
			order: typeof item.order === 'number' ? item.order : 0,

			// Clean up internal props
			parent: undefined,
			text: undefined
		} as unknown as ContentNode;
	});
}

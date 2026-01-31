/**
 * @file src/lib/utils/treeOperations.ts
 * @description Tree structure operations with integrity validation
 * 
 * Provides:
 * - Tree building from flat node arrays
 * - Cycle detection for parent-child relationships
 * - Tree integrity validation (duplicate IDs, path collisions)
 * - Tree flattening and traversal utilities
 */

import type { SerializableContentNode } from '$lib/utils/serialization';

/**
 * Enhanced tree node with hierarchy information
 */
export interface TreeNode {
	id: string;
	data: SerializableContentNode;
	children: TreeNode[];
	level: number;
	isDraggable?: boolean;
	isDropAllowed?: boolean;
}

/**
 * Tree integrity error types
 */
export class TreeIntegrityError extends Error {
	constructor(
		message: string,
		public code: 'CYCLE_DETECTED' | 'INVALID_PARENT' | 'DUPLICATE_ID' | 'PATH_COLLISION'
	) {
		super(message);
		this.name = 'TreeIntegrityError';
	}
}

/**
 * Build a tree structure from flat array of nodes
 * @param nodes - Flat array of serializable content nodes
 * @returns Array of root tree nodes with nested children
 */
export function buildTree(nodes: SerializableContentNode[]): TreeNode[] {
	const map = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];

	// First pass: create all nodes
	nodes.forEach((node) => {
		map.set(node._id, {
			id: node._id,
			data: node,
			children: [],
			level: 0,
			isDraggable: true,
			isDropAllowed: true
		});
	});

	// Second pass: build hierarchy
	nodes.forEach((node) => {
		const treeNode = map.get(node._id)!;
		if (node.parentId && map.has(node.parentId)) {
			const parent = map.get(node.parentId)!;
			parent.children.push(treeNode);
			treeNode.level = parent.level + 1;
		} else {
			roots.push(treeNode);
		}
	});

	// Sort children by order
	const sortFn = (a: TreeNode, b: TreeNode) => a.data.order - b.data.order;
	roots.sort(sortFn);
	map.forEach((node) => node.children.sort(sortFn));

	return roots;
}

/**
 * Detect if moving a node would create a cycle
 * @param nodes - All tree nodes
 * @param movingId - ID of the node being moved
 * @param targetParentId - ID of the proposed new parent
 * @returns true if a cycle would be created
 */
export function detectCycle(nodes: TreeNode[], movingId: string, targetParentId: string | null): boolean {
	if (!targetParentId) return false;

	// Can't move a node to be its own parent
	if (movingId === targetParentId) return true;

	// Build a parent lookup map for efficiency
	const parentMap = new Map<string, string | null>();
	function mapParents(nodeList: TreeNode[], parent: string | null = null) {
		for (const node of nodeList) {
			parentMap.set(node.id, parent);
			mapParents(node.children, node.id);
		}
	}
	mapParents(nodes);

	// Check if targetParentId is a descendant of movingId
	let current = targetParentId;
	const visited = new Set<string>();

	while (current) {
		if (current === movingId) return true;
		if (visited.has(current)) return true; // Already a cycle in the tree
		visited.add(current);
		current = parentMap.get(current) || null;
	}

	return false;
}

/**
 * Validate tree integrity
 * Checks for duplicate IDs and path collisions
 */
export function validateTreeIntegrity(nodes: SerializableContentNode[]): TreeIntegrityError | null {
	// Check for duplicate IDs
	const ids = new Set<string>();
	for (const node of nodes) {
		if (ids.has(node._id)) {
			return new TreeIntegrityError(`Duplicate ID: ${node._id}`, 'DUPLICATE_ID');
		}
		ids.add(node._id);
	}

	// Check for path collisions
	const paths = new Set<string>();
	for (const node of nodes) {
		if (node.path && paths.has(node.path)) {
			return new TreeIntegrityError(`Path collision: ${node.path}`, 'PATH_COLLISION');
		}
		if (node.path) {
			paths.add(node.path);
		}
	}

	return null;
}

/**
 * Flatten a tree structure back to a flat array
 * Useful for saving operations
 */
export function flattenTree(roots: TreeNode[]): SerializableContentNode[] {
	const result: SerializableContentNode[] = [];

	function traverse(nodes: TreeNode[], parentId: string | null = null) {
		nodes.forEach((node, index) => {
			result.push({
				...node.data,
				parentId: parentId || undefined,
				order: index
			});
			traverse(node.children, node.id);
		});
	}

	traverse(roots);
	return result;
}

/**
 * Find a node by ID in a tree structure
 */
export function findNodeById(roots: TreeNode[], id: string): TreeNode | null {
	for (const root of roots) {
		if (root.id === id) return root;
		const found = findNodeById(root.children, id);
		if (found) return found;
	}
	return null;
}

/**
 * Get all ancestors of a node
 */
export function getAncestors(roots: TreeNode[], nodeId: string): string[] {
	const ancestors: string[] = [];

	function findPath(nodes: TreeNode[], targetId: string, path: string[]): boolean {
		for (const node of nodes) {
			if (node.id === targetId) {
				ancestors.push(...path);
				return true;
			}
			if (findPath(node.children, targetId, [...path, node.id])) {
				return true;
			}
		}
		return false;
	}

	findPath(roots, nodeId, []);
	return ancestors;
}

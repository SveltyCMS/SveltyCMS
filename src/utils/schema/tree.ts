/**
 * @file src/utils/schema/tree.ts
 * @description Utilities for validating content tree integrity (cycle detection, collisions)
 */

import type { ContentNode } from '@content/types';

export interface TreeError {
	type: 'cycle' | 'duplicate_id' | 'path_collision';
	nodeId: string;
	message: string;
}

/**
 * Validates the integrity of a content tree structure.
 * Checks for:
 * 1. Cycles (parent -> child -> parent)
 * 2. Duplicate IDs
 * 3. Path collisions
 */
export function validateTreeIntegrity(nodes: ContentNode[]): TreeError | null {
	const visitedIds = new Set<string>();
	const visitedPaths = new Set<string>();

	function traverse(node: ContentNode, ancestors: Set<string>): TreeError | null {
		// 1. Cycle Detection
		if (ancestors.has(node._id)) {
			return {
				type: 'cycle',
				nodeId: node._id,
				message: `Cycle detected: Node ${node.name} (${node._id}) is its own ancestor.`
			};
		}

		// 2. Duplicate ID Detection
		if (visitedIds.has(node._id)) {
			return {
				type: 'duplicate_id',
				nodeId: node._id,
				message: `Duplicate ID detected: ${node._id}`
			};
		}
		visitedIds.add(node._id);

		// 3. Path Collision Detection
		if (node.path) {
			if (visitedPaths.has(node.path)) {
				return {
					type: 'path_collision',
					nodeId: node._id,
					message: `Path collision detected: ${node.path}`
				};
			}
			visitedPaths.add(node.path);
		}

		if (node.children) {
			const newAncestors = new Set(ancestors);
			newAncestors.add(node._id);

			for (const child of node.children) {
				const error = traverse(child, newAncestors);
				if (error) return error;
			}
		}

		return null;
	}

	for (const node of nodes) {
		const error = traverse(node, new Set());
		if (error) return error;
	}

	return null;
}

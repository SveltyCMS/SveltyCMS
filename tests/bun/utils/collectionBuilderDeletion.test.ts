/**
 * @file tests/bun/utils/collectionBuilderDeletion.test.ts
 * @description Unit tests for Collection Builder deletion logic.
 * Tests the category deletion behavior where:
 * - Subcategories are promoted to root
 * - Collections are moved to root
 * - The category itself is deleted
 */

import { describe, expect, test } from 'bun:test';
import type { ContentNode, DatabaseId } from '../../../src/content/types';

// Helper to convert string to DatabaseId for testing
function toDatabaseId(id: string): DatabaseId {
	return id as DatabaseId;
}

// Mock ContentNode data for testing
function createMockContentNode(overrides: Record<string, unknown> = {}): ContentNode {
	return {
		_id: toDatabaseId(overrides._id as string || 'test-id'),
		name: overrides.name || 'Test Node',
		nodeType: overrides.nodeType || 'collection',
		icon: overrides.icon || 'mdi:folder',
		order: overrides.order ?? 0,
		parentId: overrides.parentId as DatabaseId | undefined,
		...overrides
	} as ContentNode;
}

/**
 * Simulates the category deletion logic from +page.svelte
 * Returns the updated nodes array after deletion
 */
function simulateCategoryDeletion(currentConfig: ContentNode[], nodeToDelete: ContentNode): ContentNode[] {
	if (nodeToDelete.nodeType !== 'category') {
		// Simple collection deletion
		return currentConfig.filter((n) => n._id !== nodeToDelete._id);
	}

	// Category deletion logic:
	// 1. Find all descendants (subcategories and collections)
	const descendants: ContentNode[] = [];
	const findDescendants = (parentId: string) => {
		currentConfig.forEach((n) => {
			if (n.parentId === parentId) {
				descendants.push(n);
				// Recursively find children
				findDescendants(n._id);
			}
		});
	};
	findDescendants(nodeToDelete._id);

	// 2. Update descendants to be root-level
	let updatedConfig = currentConfig.map((n) => {
		if (descendants.find((d) => d._id === n._id)) {
			return { ...n, parentId: undefined };
		}
		return n;
	});

	// 3. Filter out the deleted category
	updatedConfig = updatedConfig.filter((n) => n._id !== nodeToDelete._id);

	return updatedConfig;
}

describe('Collection Builder - Category Deletion', () => {
	test('should delete a simple category without children', () => {
		const nodes: ContentNode[] = [
			createMockContentNode({ _id: 'cat1', name: 'Category 1', nodeType: 'category' }),
			createMockContentNode({ _id: 'cat2', name: 'Category 2', nodeType: 'category' })
		];

		const result = simulateCategoryDeletion(nodes, nodes[0]);

		expect(result).toHaveLength(1);
		expect(result[0]._id).toBe(toDatabaseId('cat2'));
	});

	test('should move collections to root when deleting their parent category', () => {
		const nodes: ContentNode[] = [
			createMockContentNode({ _id: 'cat1', name: 'Category 1', nodeType: 'category' }),
			createMockContentNode({ _id: 'col1', name: 'Collection 1', nodeType: 'collection', parentId: toDatabaseId('cat1') }),
			createMockContentNode({ _id: 'col2', name: 'Collection 2', nodeType: 'collection', parentId: toDatabaseId('cat1') })
		];

		const result = simulateCategoryDeletion(nodes, nodes[0]);

		expect(result).toHaveLength(2);
		expect(result[0].nodeType).toBe('collection');
		expect(result[0].parentId).toBeUndefined();
		expect(result[1].nodeType).toBe('collection');
		expect(result[1].parentId).toBeUndefined();
	});

	test('should promote subcategories to root when deleting parent category', () => {
		const nodes: ContentNode[] = [
			createMockContentNode({ _id: 'cat1', name: 'Category 1', nodeType: 'category' }),
			createMockContentNode({ _id: 'cat2', name: 'Subcategory 1', nodeType: 'category', parentId: toDatabaseId('cat1') }),
			createMockContentNode({ _id: 'cat3', name: 'Subcategory 2', nodeType: 'category', parentId: toDatabaseId('cat1') })
		];

		const result = simulateCategoryDeletion(nodes, nodes[0]);

		expect(result).toHaveLength(2);
		expect(result[0].nodeType).toBe('category');
		expect(result[0].parentId).toBeUndefined();
		expect(result[1].nodeType).toBe('category');
		expect(result[1].parentId).toBeUndefined();
	});

	test('should handle deeply nested structures', () => {
		const nodes: ContentNode[] = [
			createMockContentNode({ _id: 'root', name: 'Root Category', nodeType: 'category' }),
			createMockContentNode({ _id: 'level1', name: 'Level 1 Category', nodeType: 'category', parentId: toDatabaseId('root') }),
			createMockContentNode({ _id: 'col1', name: 'Collection in L1', nodeType: 'collection', parentId: toDatabaseId('level1') }),
			createMockContentNode({ _id: 'level2', name: 'Level 2 Category', nodeType: 'category', parentId: toDatabaseId('level1') }),
			createMockContentNode({ _id: 'col2', name: 'Collection in L2', nodeType: 'collection', parentId: toDatabaseId('level2') })
		];

		const result = simulateCategoryDeletion(nodes, nodes[0]); // Delete root

		// All descendants should be promoted to root
		expect(result).toHaveLength(4);
		result.forEach((node) => {
			expect(node.parentId).toBeUndefined();
		});
	});

	test('should delete a collection without affecting others', () => {
		const nodes: ContentNode[] = [
			createMockContentNode({ _id: 'cat1', name: 'Category 1', nodeType: 'category' }),
			createMockContentNode({ _id: 'col1', name: 'Collection 1', nodeType: 'collection', parentId: toDatabaseId('cat1') }),
			createMockContentNode({ _id: 'col2', name: 'Collection 2', nodeType: 'collection', parentId: toDatabaseId('cat1') })
		];

		const result = simulateCategoryDeletion(nodes, nodes[1]); // Delete col1

		expect(result).toHaveLength(2);
		expect(result.find((n) => n._id === toDatabaseId('cat1'))).toBeDefined();
		expect(result.find((n) => n._id === toDatabaseId('col2'))).toBeDefined();
		expect(result.find((n) => n._id === toDatabaseId('col1'))).toBeUndefined();
	});

	test('should not affect siblings when deleting a category', () => {
		const nodes: ContentNode[] = [
			createMockContentNode({ _id: 'cat1', name: 'Category 1', nodeType: 'category' }),
			createMockContentNode({ _id: 'cat2', name: 'Category 2', nodeType: 'category' }),
			createMockContentNode({ _id: 'col1', name: 'Collection 1', nodeType: 'collection', parentId: toDatabaseId('cat1') }),
			createMockContentNode({ _id: 'col2', name: 'Collection 2', nodeType: 'collection', parentId: toDatabaseId('cat2') })
		];

		const result = simulateCategoryDeletion(nodes, nodes[0]); // Delete cat1

		expect(result).toHaveLength(3);
		// cat2 and its collection should remain untouched
		expect(result.find((n) => n._id === toDatabaseId('cat2'))?.parentId).toBeUndefined();
		expect(result.find((n) => n._id === toDatabaseId('col2'))?.parentId).toBe(toDatabaseId('cat2'));
		// col1 should be promoted to root
		expect(result.find((n) => n._id === toDatabaseId('col1'))?.parentId).toBeUndefined();
	});
});

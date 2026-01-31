/**
 * @file tests/bun/utils/treeOperations.test.ts
 * @description Unit tests for tree operations utilities
 */

import { describe, expect, test } from 'bun:test';
import {
	buildTree,
	detectCycle,
	validateTreeIntegrity,
	flattenTree,
	findNodeById,
	getAncestors,
	TreeIntegrityError
} from '../../../src/lib/utils/treeOperations';
import type { SerializableContentNode } from '../../../src/lib/utils/serialization';

describe('Tree Operations', () => {
	describe('buildTree', () => {
		test('should build a flat tree from nodes without parents', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Root 1',
					path: '/root1',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					name: 'Root 2',
					path: '/root2',
					nodeType: 'category',
					order: 1,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const tree = buildTree(nodes);

			expect(tree).toHaveLength(2);
			expect(tree[0].id).toBe('1');
			expect(tree[0].level).toBe(0);
			expect(tree[0].children).toHaveLength(0);
		});

		test('should build a nested tree structure', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Parent',
					path: '/parent',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'Child',
					path: '/parent/child',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '3',
					parentId: '2',
					name: 'Grandchild',
					path: '/parent/child/grandchild',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const tree = buildTree(nodes);

			expect(tree).toHaveLength(1);
			expect(tree[0].id).toBe('1');
			expect(tree[0].children).toHaveLength(1);
			expect(tree[0].children[0].id).toBe('2');
			expect(tree[0].children[0].level).toBe(1);
			expect(tree[0].children[0].children).toHaveLength(1);
			expect(tree[0].children[0].children[0].id).toBe('3');
			expect(tree[0].children[0].children[0].level).toBe(2);
		});

		test('should sort children by order', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Parent',
					path: '/parent',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'Child C',
					path: '/parent/c',
					nodeType: 'collection',
					order: 2,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '3',
					parentId: '1',
					name: 'Child A',
					path: '/parent/a',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '4',
					parentId: '1',
					name: 'Child B',
					path: '/parent/b',
					nodeType: 'collection',
					order: 1,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const tree = buildTree(nodes);

			expect(tree[0].children).toHaveLength(3);
			expect(tree[0].children[0].data.name).toBe('Child A');
			expect(tree[0].children[1].data.name).toBe('Child B');
			expect(tree[0].children[2].data.name).toBe('Child C');
		});
	});

	describe('detectCycle', () => {
		test('should return false for no cycle', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Parent',
					path: '/parent',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'Child',
					path: '/parent/child',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const hasCycle = detectCycle(nodes, '2', '1');
			expect(hasCycle).toBe(false);
		});

		test('should return true when moving node to its own child', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Parent',
					path: '/parent',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'Child',
					path: '/parent/child',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const hasCycle = detectCycle(nodes, '1', '2');
			expect(hasCycle).toBe(true);
		});

		test('should return true when moving node to itself', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Node',
					path: '/node',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const hasCycle = detectCycle(nodes, '1', '1');
			expect(hasCycle).toBe(true);
		});

		test('should return false when moving to null parent', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Node',
					path: '/node',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const hasCycle = detectCycle(nodes, '1', null);
			expect(hasCycle).toBe(false);
		});

		test('should detect deep cycle', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'A',
					path: '/a',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'B',
					path: '/a/b',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '3',
					parentId: '2',
					name: 'C',
					path: '/a/b/c',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			// Try to move A (grandparent) to be child of C (grandchild)
			const hasCycle = detectCycle(nodes, '1', '3');
			expect(hasCycle).toBe(true);
		});
	});

	describe('validateTreeIntegrity', () => {
		test('should return null for valid tree', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Node 1',
					path: '/node1',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					name: 'Node 2',
					path: '/node2',
					nodeType: 'collection',
					order: 1,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const error = validateTreeIntegrity(nodes);
			expect(error).toBeNull();
		});

		test('should detect duplicate IDs', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Node 1',
					path: '/node1',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '1',
					name: 'Node 2',
					path: '/node2',
					nodeType: 'collection',
					order: 1,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const error = validateTreeIntegrity(nodes);
			expect(error).toBeInstanceOf(TreeIntegrityError);
			expect(error?.code).toBe('DUPLICATE_ID');
		});

		test('should detect path collisions', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Node 1',
					path: '/same-path',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					name: 'Node 2',
					path: '/same-path',
					nodeType: 'collection',
					order: 1,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const error = validateTreeIntegrity(nodes);
			expect(error).toBeInstanceOf(TreeIntegrityError);
			expect(error?.code).toBe('PATH_COLLISION');
		});
	});

	describe('flattenTree', () => {
		test('should flatten tree back to array', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'Parent',
					path: '/parent',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'Child',
					path: '/parent/child',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const tree = buildTree(nodes);
			const flattened = flattenTree(tree);

			expect(flattened).toHaveLength(2);
			expect(flattened[0]._id).toBe('1');
			expect(flattened[1]._id).toBe('2');
			expect(flattened[1].parentId).toBe('1');
		});

		test('should preserve order', () => {
			const nodes: SerializableContentNode[] = [
				{
					_id: '1',
					name: 'First',
					path: '/first',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					name: 'Second',
					path: '/second',
					nodeType: 'category',
					order: 1,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const tree = buildTree(nodes);
			const flattened = flattenTree(tree);

			expect(flattened[0].order).toBe(0);
			expect(flattened[1].order).toBe(1);
		});
	});

	describe('findNodeById', () => {
		test('should find root node', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Root',
					path: '/root',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const found = findNodeById(nodes, '1');
			expect(found).not.toBeNull();
			expect(found?.id).toBe('1');
		});

		test('should find nested node', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Parent',
					path: '/parent',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'Child',
					path: '/parent/child',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const found = findNodeById(nodes, '2');
			expect(found).not.toBeNull();
			expect(found?.id).toBe('2');
		});

		test('should return null for non-existent node', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Root',
					path: '/root',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const found = findNodeById(nodes, '999');
			expect(found).toBeNull();
		});
	});

	describe('getAncestors', () => {
		test('should return empty array for root node', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'Root',
					path: '/root',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const ancestors = getAncestors(nodes, '1');
			expect(ancestors).toHaveLength(0);
		});

		test('should return all ancestors', () => {
			const nodes = buildTree([
				{
					_id: '1',
					name: 'A',
					path: '/a',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '2',
					parentId: '1',
					name: 'B',
					path: '/a/b',
					nodeType: 'category',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					_id: '3',
					parentId: '2',
					name: 'C',
					path: '/a/b/c',
					nodeType: 'collection',
					order: 0,
					updatedAt: '2024-01-01T00:00:00Z',
					createdAt: '2024-01-01T00:00:00Z'
				}
			]);

			const ancestors = getAncestors(nodes, '3');
			expect(ancestors).toHaveLength(2);
			expect(ancestors).toContain('1');
			expect(ancestors).toContain('2');
		});
	});
});

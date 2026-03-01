/**
 * @file tests/bun/utils/treeViewAdapter.test.ts
 * @description Unit tests for the TreeView adapter that converts ContentNode
 * structures to/from svelte-treeview format. Tests cover path generation,
 * parent-child relationships, and path recalculation after DnD operations.
 */

import { describe, expect, test } from 'bun:test';
import type { ContentNode } from '@src/content/types';
import { fromTreeViewData, recalculatePaths, type TreeViewItem, toFlatContentNodes, toTreeViewData } from '@src/utils/tree-view-adapter';

// Mock ContentNode data for testing
// Uses Record type to avoid branded type issues in test code
function createMockContentNode(overrides: Record<string, unknown> = {}): ContentNode {
	return {
		_id: overrides._id || 'test-id',
		name: overrides.name || 'Test Node',
		nodeType: overrides.nodeType || 'collection',
		icon: overrides.icon || 'mdi:folder',
		order: overrides.order ?? 0,
		parentId: overrides.parentId,
		children: (overrides.children as ContentNode[]) || [],
		...overrides
	} as ContentNode;
}

describe('TreeView Adapter', () => {
	describe('toTreeViewData', () => {
		test('should convert a flat list of root nodes', () => {
			const nodes: ContentNode[] = [
				createMockContentNode({
					_id: 'cat1',
					name: 'Category 1',
					nodeType: 'category'
				}),
				createMockContentNode({
					_id: 'cat2',
					name: 'Category 2',
					nodeType: 'category'
				})
			];

			const result = toTreeViewData(nodes);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('cat1');
			expect(result[0].path).toBe('cat1');
			expect(result[0].parent).toBeNull();
			expect(result[1].id).toBe('cat2');
			expect(result[1].path).toBe('cat2');
			expect(result[1].parent).toBeNull();
		});

		test('should convert nested nodes with proper paths', () => {
			const nodes: ContentNode[] = [
				createMockContentNode({
					_id: 'cat1',
					name: 'Category 1',
					nodeType: 'category',
					children: [
						createMockContentNode({
							_id: 'col1',
							name: 'Collection 1',
							nodeType: 'collection'
						}),
						createMockContentNode({
							_id: 'col2',
							name: 'Collection 2',
							nodeType: 'collection'
						})
					]
				})
			];

			const result = toTreeViewData(nodes);

			expect(result).toHaveLength(3);

			// Root item
			expect(result[0].id).toBe('cat1');
			expect(result[0].path).toBe('cat1');
			expect(result[0].parent).toBeNull();

			// Children
			expect(result[1].id).toBe('col1');
			expect(result[1].path).toBe('cat1.col1');
			expect(result[1].parent).toBe('cat1');

			expect(result[2].id).toBe('col2');
			expect(result[2].path).toBe('cat1.col2');
			expect(result[2].parent).toBe('cat1');
		});

		test('should handle deeply nested structures', () => {
			const nodes: ContentNode[] = [
				createMockContentNode({
					_id: 'root',
					name: 'Root',
					nodeType: 'category',
					children: [
						createMockContentNode({
							_id: 'level1',
							name: 'Level 1',
							nodeType: 'category',
							children: [
								createMockContentNode({
									_id: 'level2',
									name: 'Level 2',
									nodeType: 'collection'
								})
							]
						})
					]
				})
			];

			const result = toTreeViewData(nodes);

			expect(result).toHaveLength(3);
			expect(result[2].path).toBe('root.level1.level2');
			expect(result[2].parent).toBe('level1');
		});
	});

	describe('toFlatContentNodes', () => {
		test('should convert TreeView items to flat ContentNodes', () => {
			const treeItems: TreeViewItem[] = [
				{
					id: 'cat1',
					name: 'Category 1',
					nodeType: 'category',
					path: 'cat1',
					parent: null,
					icon: 'mdi:folder'
				},
				{
					id: 'col1',
					name: 'Collection 1',
					nodeType: 'collection',
					path: 'cat1.col1',
					parent: 'cat1',
					icon: 'mdi:file'
				}
			];

			const result = toFlatContentNodes(treeItems);

			expect(result).toHaveLength(2);
			expect(result[0]._id).toBe('cat1' as any);
			expect(result[0].parentId).toBeUndefined();
			expect(result[1]._id).toBe('col1' as any);
			expect(result[1].parentId).toBe('cat1' as any);
		});

		test('should calculate order based on sibling position', () => {
			const treeItems: TreeViewItem[] = [
				{
					id: 'cat1',
					name: 'Category 1',
					nodeType: 'category',
					path: 'cat1',
					parent: null
				},
				{
					id: 'cat2',
					name: 'Category 2',
					nodeType: 'category',
					path: 'cat2',
					parent: null
				},
				{
					id: 'cat3',
					name: 'Category 3',
					nodeType: 'category',
					path: 'cat3',
					parent: null
				}
			];

			const result = toFlatContentNodes(treeItems);

			expect(result[0].order).toBe(0);
			expect(result[1].order).toBe(1);
			expect(result[2].order).toBe(2);
		});

		test('should extract parentId from path', () => {
			const treeItems: TreeViewItem[] = [
				{ id: 'a', name: 'A', nodeType: 'category', path: 'a', parent: null },
				{
					id: 'b',
					name: 'B',
					nodeType: 'collection',
					path: 'a.b',
					parent: 'a'
				},
				{
					id: 'c',
					name: 'C',
					nodeType: 'collection',
					path: 'a.b.c',
					parent: 'b'
				}
			];

			const result = toFlatContentNodes(treeItems);

			expect(result[0].parentId).toBeUndefined();
			expect(result[1].parentId).toBe('a' as any);
			expect(result[2].parentId).toBe('b' as any);
		});
	});

	describe('recalculatePaths', () => {
		test('should recalculate paths for root items', () => {
			const items: TreeViewItem[] = [
				{
					id: 'a',
					name: 'A',
					nodeType: 'category',
					path: 'old-path-a',
					parent: null,
					order: 0
				},
				{
					id: 'b',
					name: 'B',
					nodeType: 'category',
					path: 'old-path-b',
					parent: null,
					order: 1
				}
			];

			const result = recalculatePaths(items);

			expect(result.find((i: any) => i.id === 'a')?.path).toBe('a');
			expect(result.find((i: any) => i.id === 'b')?.path).toBe('b');
		});

		test('should recalculate paths for nested items', () => {
			const items: TreeViewItem[] = [
				{
					id: 'parent',
					name: 'Parent',
					nodeType: 'category',
					path: 'x',
					parent: null,
					order: 0
				},
				{
					id: 'child1',
					name: 'Child 1',
					nodeType: 'collection',
					path: 'x.y',
					parent: 'parent',
					order: 0
				},
				{
					id: 'child2',
					name: 'Child 2',
					nodeType: 'collection',
					path: 'x.z',
					parent: 'parent',
					order: 1
				}
			];

			const result = recalculatePaths(items);

			expect(result.find((i: any) => i.id === 'parent')?.path).toBe('parent');
			expect(result.find((i: any) => i.id === 'child1')?.path).toBe('parent.child1');
			expect(result.find((i: any) => i.id === 'child2')?.path).toBe('parent.child2');
		});

		test('should update order based on sibling position', () => {
			const items: TreeViewItem[] = [
				{
					id: 'a',
					name: 'A',
					nodeType: 'category',
					path: 'a',
					parent: null,
					order: 5
				},
				{
					id: 'b',
					name: 'B',
					nodeType: 'category',
					path: 'b',
					parent: null,
					order: 3
				},
				{
					id: 'c',
					name: 'C',
					nodeType: 'category',
					path: 'c',
					parent: null,
					order: 1
				}
			];

			const result = recalculatePaths(items);

			// Should be sorted by order: c(1), b(3), a(5) -> new orders 0, 1, 2
			expect(result.find((i: any) => i.id === 'c')?.order).toBe(0);
			expect(result.find((i: any) => i.id === 'b')?.order).toBe(1);
			expect(result.find((i: any) => i.id === 'a')?.order).toBe(2);
		});

		test('should handle moving item to new parent', () => {
			// Simulate: child was under parent1, now moved to parent2
			const items: TreeViewItem[] = [
				{
					id: 'parent1',
					name: 'Parent 1',
					nodeType: 'category',
					path: 'parent1',
					parent: null,
					order: 0
				},
				{
					id: 'parent2',
					name: 'Parent 2',
					nodeType: 'category',
					path: 'parent2',
					parent: null,
					order: 1
				},
				{
					id: 'child',
					name: 'Child',
					nodeType: 'collection',
					path: 'parent1.child',
					parent: 'parent2',
					order: 0
				} // parent changed!
			];

			const result = recalculatePaths(items);

			// Child should now have path under parent2
			expect(result.find((i: any) => i.id === 'child')?.path).toBe('parent2.child');
			expect(result.find((i: any) => i.id === 'child')?.parent).toBe('parent2');
		});

		test('should handle moving item to root level', () => {
			const items: TreeViewItem[] = [
				{
					id: 'parent',
					name: 'Parent',
					nodeType: 'category',
					path: 'parent',
					parent: null,
					order: 0
				},
				{
					id: 'child',
					name: 'Child',
					nodeType: 'collection',
					path: 'parent.child',
					parent: null,
					order: 1
				} // parent set to null (moved to root)
			];

			const result = recalculatePaths(items);

			expect(result.find((i: any) => i.id === 'child')?.path).toBe('child');
			expect(result.find((i: any) => i.id === 'child')?.parent).toBeNull();
		});
	});

	describe('fromTreeViewData', () => {
		test('should reconstruct nested ContentNode structure', () => {
			const flatItems: TreeViewItem[] = [
				{
					id: 'cat1',
					name: 'Category',
					nodeType: 'category',
					path: 'cat1',
					parent: null
				},
				{
					id: 'col1',
					name: 'Collection',
					nodeType: 'collection',
					path: 'cat1.col1',
					parent: 'cat1'
				}
			];

			const result = fromTreeViewData(flatItems);

			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe('cat1' as any);
			expect(result[0].children).toHaveLength(1);
			expect(result[0].children?.[0]._id).toBe('col1' as any);
		});

		test('should handle orphaned nodes by placing at root', () => {
			const flatItems: TreeViewItem[] = [
				{
					id: 'orphan',
					name: 'Orphan',
					nodeType: 'collection',
					path: 'missing-parent.orphan',
					parent: null
				}
			];

			const result = fromTreeViewData(flatItems);

			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe('orphan' as any);
		});
	});

	describe('roundtrip conversion', () => {
		test('should maintain structure through toTreeViewData -> toFlatContentNodes', () => {
			const originalNodes: ContentNode[] = [
				createMockContentNode({
					_id: 'root',
					name: 'Root',
					nodeType: 'category',
					children: [
						createMockContentNode({
							_id: 'child1',
							name: 'Child 1',
							nodeType: 'collection'
						}),
						createMockContentNode({
							_id: 'child2',
							name: 'Child 2',
							nodeType: 'collection'
						})
					]
				})
			];

			const treeViewData = toTreeViewData(originalNodes);
			const flatNodes = toFlatContentNodes(treeViewData);

			expect(flatNodes).toHaveLength(3);
			expect(flatNodes.find((n: any) => n._id === ('root' as any))?.parentId).toBeUndefined();
			expect(flatNodes.find((n: any) => n._id === ('child1' as any))?.parentId).toBe('root' as any);
			expect(flatNodes.find((n: any) => n._id === ('child2' as any))?.parentId).toBe('root' as any);
		});
	});
});

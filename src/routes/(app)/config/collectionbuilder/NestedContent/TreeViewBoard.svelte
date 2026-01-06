<!--
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewBoard.svelte
@component
**Board component for managing nested collections using svelte-dnd-action**

### Props
- `contentNodes` {ContentNode[]} - Array of content nodes representing collections and categories
- `onNodeUpdate` {Function} - Callback function to handle updates to the content node
- `onEditCategory` {Function} - Callback function to handle editing of categories
- `onDeleteNode` {Function} - Callback function to handle node deletion
- `onDuplicateNode` {Function} - Callback function to handle node duplication

### Features:
- Drag and drop reordering of collections using svelte-dnd-action
- Support for nested categories with cross-level drag
- Search/Filter functionality
- Expand/Collapse all
- Enhanced visual feedback for drag & drop
-->
<script lang="ts">
	// Component
	import TreeViewNode from './TreeViewNode.svelte';

	// DB / Types
	import type { ContentNode } from '@databases/dbInterface';

	// Drag and Drop
	import { dndzone, TRIGGERS } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	// Adapter
	import { toTreeViewData, toFlatContentNodes, recalculatePaths, type TreeViewItem } from '@utils/treeViewAdapter';

	interface Props {
		contentNodes: ContentNode[];
		onNodeUpdate: (updatedNodes: ContentNode[]) => void;
		onEditCategory: (category: Partial<ContentNode>) => void;
		onDeleteNode?: (node: Partial<ContentNode>) => void;
		onDuplicateNode?: (node: Partial<ContentNode>) => void;
	}

	let { contentNodes = [], onNodeUpdate, onEditCategory, onDeleteNode, onDuplicateNode }: Props = $props();

	// Search state
	let searchText = $state('');

	// Local state for the tree data - flat structure for dnd-action
	let treeData = $state<TreeViewItem[]>([]);
	let initialized = false;

	// Expanded nodes tracking
	let expandedNodes = $state<Set<string>>(new Set());

	// Drag state for visual feedback
	let isDragging = $state(false);

	$effect(() => {
		if (contentNodes.length > 0 && (!initialized || treeData.length === 0)) {
			treeData = toTreeViewData(contentNodes);
			initialized = true;
			// Auto-expand root level nodes
			treeData.forEach((item) => {
				if (!item.parent) {
					expandedNodes.add(item.id);
				}
			});
			expandedNodes = new Set(expandedNodes);
		}
	});

	// Filter items based on search
	const filteredItems = $derived.by(() => {
		if (!searchText.trim()) return treeData;
		const searchLower = searchText.toLowerCase();
		return treeData.filter((item) => item.name.toLowerCase().includes(searchLower));
	});

	// Build hierarchical structure for rendering
	type EnhancedTreeViewItem = TreeViewItem & { children: EnhancedTreeViewItem[]; level: number };

	const hierarchicalData = $derived.by(() => {
		const items = filteredItems;
		const itemMap = new Map<string, EnhancedTreeViewItem>();

		// First pass: create enhanced items with children arrays
		items.forEach((item) => {
			itemMap.set(item.id, { ...item, children: [], level: 0 });
		});

		// Second pass: build hierarchy
		const roots: EnhancedTreeViewItem[] = [];
		items.forEach((item) => {
			const enhanced = itemMap.get(item.id);
			if (!enhanced) return; // Safety check

			if (item.parent && itemMap.has(item.parent)) {
				const parent = itemMap.get(item.parent);
				if (parent) {
					parent.children.push(enhanced);
					enhanced.level = parent.level + 1;
				}
			} else {
				roots.push(enhanced);
			}
		});

		return roots;
	});

	// Get root level items for top-level dnd zone
	const rootItems = $derived(hierarchicalData);

	// Expand all nodes
	function expandAll(): void {
		expandedNodes = new Set(treeData.map((item) => item.id));
	}

	// Collapse all nodes
	function collapseAll(): void {
		expandedNodes = new Set();
	}

	// Clear the search
	function clearSearch(): void {
		searchText = '';
	}

	// Toggle node expansion
	function toggleNode(id: string) {
		if (expandedNodes.has(id)) {
			expandedNodes.delete(id);
		} else {
			expandedNodes.add(id);
		}
		expandedNodes = new Set(expandedNodes);
	}

	// Handle drag and drop at root level
	function handleRootDndConsider(e: CustomEvent) {
		const { items, info } = e.detail;
		if (info.trigger === TRIGGERS.DRAG_STARTED) {
			isDragging = true;
		}
		updateRootItems(items);
	}

	function handleRootDndFinalize(e: CustomEvent) {
		const { items } = e.detail;
		isDragging = false;

		// Update items with null parent (root level)
		const updatedItems = items.map((item: EnhancedTreeViewItem) => ({
			...item,
			parent: null
		}));

		updateRootItems(updatedItems);
		saveTreeData();
	}

	function updateRootItems(newItems: EnhancedTreeViewItem[]) {
		// Get IDs of items now at root level
		const newRootIds = new Set(newItems.map((item) => item.id));

		// For each item that moved TO root, we need to keep its descendants
		// For items that moved AWAY from root, they'll be handled by the nested zone

		// Start with items that are NOT in the new root list AND not descendants of moved items
		const itemsToKeep: TreeViewItem[] = [];
		const processedIds = new Set<string>();

		// First, add all new root items with updated parent
		newItems.forEach((item, index) => {
			itemsToKeep.push({
				...stripEnhanced(item),
				parent: null,
				order: index
			});
			processedIds.add(item.id);

			// Also add all descendants of this item (they keep their relative parent refs)
			const descendants = getAllDescendants(item.id, treeData);
			descendants.forEach((desc) => {
				if (!processedIds.has(desc.id)) {
					itemsToKeep.push(desc);
					processedIds.add(desc.id);
				}
			});
		});

		// Add remaining items that weren't processed (items still in nested zones)
		treeData.forEach((item) => {
			if (!processedIds.has(item.id) && !newRootIds.has(item.id)) {
				// Check if this item's parent is still valid
				const parentStillExists = itemsToKeep.some((i) => i.id === item.parent);
				if (parentStillExists || item.parent === null) {
					itemsToKeep.push(item);
					processedIds.add(item.id);
				}
			}
		});

		treeData = recalculatePaths(itemsToKeep);
	}

	// Handle drag and drop at nested level
	function handleNestedDndConsider(e: CustomEvent, parentId: string) {
		const { items, info } = e.detail;
		if (info.trigger === TRIGGERS.DRAG_STARTED) {
			isDragging = true;
		}
		updateItemsAtLevel(items, parentId);
	}

	function handleNestedDndFinalize(e: CustomEvent, parentId: string) {
		const { items } = e.detail;
		isDragging = false;
		updateItemsAtLevel(items, parentId);
		saveTreeData();
	}

	function updateItemsAtLevel(newItems: EnhancedTreeViewItem[], parentId: string) {
		// Get IDs of items now at this level
		const newChildIds = new Set(newItems.map((item) => item.id));

		const itemsToKeep: TreeViewItem[] = [];
		const processedIds = new Set<string>();

		// Add items at this level with updated parent reference
		newItems.forEach((item, index) => {
			itemsToKeep.push({
				...stripEnhanced(item),
				parent: parentId,
				order: index
			});
			processedIds.add(item.id);

			// Also add all descendants of this item (they keep their relative parent refs)
			const descendants = getAllDescendants(item.id, treeData);
			descendants.forEach((desc) => {
				if (!processedIds.has(desc.id)) {
					itemsToKeep.push(desc);
					processedIds.add(desc.id);
				}
			});
		});

		// Add all other items that weren't affected
		treeData.forEach((item) => {
			if (!processedIds.has(item.id) && !newChildIds.has(item.id) && item.parent !== parentId) {
				itemsToKeep.push(item);
				processedIds.add(item.id);
			}
		});

		// Also add items that are still children of this parent but not in newItems
		// (they were removed from this zone, handled elsewhere)

		treeData = recalculatePaths(itemsToKeep);
	}

	// Helper: Get all descendants of an item
	function getAllDescendants(itemId: string, items: TreeViewItem[]): TreeViewItem[] {
		const descendants: TreeViewItem[] = [];
		const directChildren = items.filter((item) => item.parent === itemId);

		directChildren.forEach((child) => {
			descendants.push(child);
			descendants.push(...getAllDescendants(child.id, items));
		});

		return descendants;
	}

	// Helper: Strip enhanced properties from item
	function stripEnhanced(item: EnhancedTreeViewItem): TreeViewItem {
		const { children, level, ...base } = item;
		return base;
	}

	function saveTreeData() {
		// Convert back to ContentNodes and notify parent
		const contentNodes = toFlatContentNodes(treeData);

		// Defer update to prevent synchronous state update loop
		setTimeout(() => {
			onNodeUpdate(contentNodes);
		}, 50);
	}

	// Helper to convert EnhancedTreeViewItem to Partial<ContentNode> for callbacks
	function toPartialContentNode(item: TreeViewItem | EnhancedTreeViewItem): Partial<ContentNode> {
		// Extract only the properties needed for ContentNode
		const { children, level, parent, path, ...contentNodeProps } = item as any;
		return {
			...contentNodeProps,
			_id: item._id || item.id,
			parentId: parent
		};
	}

	// Flip animation duration
	const flipDurationMs = 300;
</script>

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-2">
	<!-- Search Input -->
	<div class="relative flex-1 min-w-[200px]">
		<iconify-icon icon="mdi:magnify" width="18" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
		<input type="text" placeholder="Search collections..." bind:value={searchText} class="input w-full h-12 pl-10 pr-8 rounded shadow-sm" />
		{#if searchText}
			<button
				type="button"
				onclick={clearSearch}
				class="absolute right-2 top-1/2 -translate-y-1/2 btn-icon preset-tonal hover:preset-filled transition-all"
				aria-label="Clear search"
			>
				<iconify-icon icon="mdi:close" width="16"></iconify-icon>
			</button>
		{/if}
	</div>

	<!-- Expand/Collapse Buttons -->
	<div class="flex gap-2">
		<button type="button" onclick={expandAll} class="btn preset-tonal hover:preset-filled transition-all shadow-sm" title="Expand All">
			<iconify-icon icon="mdi:unfold-more-horizontal" width="18"></iconify-icon>
			<span class="hidden sm:inline ml-1">Expand All</span>
		</button>
		<button type="button" onclick={collapseAll} class="btn preset-tonal hover:preset-filled transition-all shadow-sm" title="Collapse All">
			<iconify-icon icon="mdi:unfold-less-horizontal" width="18"></iconify-icon>
			<span class="hidden sm:inline ml-1">Collapse All</span>
		</button>
	</div>
</div>

<!-- Tree View with Drag and Drop -->
<div class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-2">
	{#if hierarchicalData.length === 0}
		<div class="text-center p-8 text-surface-500">
			{#if searchText}
				<iconify-icon icon="mdi:magnify-close" width="48" class="opacity-50 mb-2"></iconify-icon>
				<p>No results found for "{searchText}"</p>
			{:else}
				<iconify-icon icon="mdi:folder-open-outline" width="48" class="opacity-50 mb-2"></iconify-icon>
				<p>No categories or collections yet</p>
			{/if}
		</div>
	{:else}
		<!-- Root Level DnD Zone -->
		<div
			class="root-dnd-zone"
			use:dndzone={{
				items: rootItems,
				flipDurationMs,
				type: 'tree-items',
				dropFromOthersDisabled: false,
				dropTargetStyle: {}
			}}
			onconsider={handleRootDndConsider}
			onfinalize={handleRootDndFinalize}
		>
			{#each rootItems as item (item.id)}
				<div class="tree-node-wrapper" animate:flip={{ duration: flipDurationMs }}>
					{@render treeNode(item, 0)}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Drop to Root Zone (visible during drag) -->
	{#if isDragging}
		<div class="drop-to-root-zone">
			<iconify-icon icon="mdi:arrow-up" width="20"></iconify-icon>
			<span>Drop here to move to root level</span>
		</div>
	{/if}
</div>

<!-- Recursive Tree Node Renderer -->
{#snippet treeNode(item: EnhancedTreeViewItem, level: number)}
	<div class="tree-node-container" style="margin-left: {level * 0.75}rem">
		<!-- Render the node -->
		<TreeViewNode
			item={{ ...item, hasChildren: item.children && item.children.length > 0 }}
			isOpen={expandedNodes.has(item.id)}
			toggle={() => toggleNode(item.id)}
			onEditCategory={() => onEditCategory(toPartialContentNode(item))}
			onDelete={() => onDeleteNode?.(toPartialContentNode(item))}
			onDuplicate={() => onDuplicateNode?.(toPartialContentNode(item))}
		/>

		<!-- Render children if expanded and has children -->
		{#if expandedNodes.has(item.id) && item.children && item.children.length > 0}
			<div
				class="tree-children"
				use:dndzone={{
					items: item.children,
					flipDurationMs,
					type: 'tree-items',
					dropFromOthersDisabled: false,
					dropTargetStyle: {}
				}}
				onconsider={(e) => handleNestedDndConsider(e, item.id)}
				onfinalize={(e) => handleNestedDndFinalize(e, item.id)}
			>
				{#each item.children as child (child.id)}
					<div class="tree-node-wrapper" animate:flip={{ duration: flipDurationMs }}>
						{@render treeNode(child, level + 1)}
					</div>
				{/each}
			</div>
		{:else if expandedNodes.has(item.id) && item.nodeType === 'category'}
			<!-- Empty drop zone for categories with no children -->
			<div
				class="tree-children empty-drop-zone"
				use:dndzone={{
					items: [],
					flipDurationMs,
					type: 'tree-items',
					dropFromOthersDisabled: false,
					dropTargetStyle: {}
				}}
				onconsider={(e) => handleNestedDndConsider(e, item.id)}
				onfinalize={(e) => handleNestedDndFinalize(e, item.id)}
			>
				<span class="empty-hint">Drop items here</span>
			</div>
		{/if}
	</div>
{/snippet}

<style>
	/* Base Tree Styling */
	.collection-builder-tree {
		background: transparent;
		color: inherit;
		font-family: inherit;
		padding: 0.5rem;
		min-height: 200px;
	}

	/* Root DnD Zone */
	.root-dnd-zone {
		min-height: 100px;
	}

	/* Tree Node Wrapper for animations */
	.tree-node-wrapper {
		margin-bottom: 0.5rem;
	}

	/* Tree Node Container */
	.tree-node-container {
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	/* Tree Children Container */
	.tree-children {
		padding-left: 0.5rem;
		border-left: 2px solid rgb(var(--color-surface-300));
		margin-left: 0.5rem;
		margin-top: 0.5rem;
		min-height: 40px;
		transition: all 0.2s ease;
	}

	.tree-children.empty-drop-zone {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed rgb(var(--color-surface-300));
		border-left: 2px solid rgb(var(--color-surface-300));
		border-radius: 4px;
		background: rgb(var(--color-surface-50) / 0.3);
	}

	.empty-hint {
		color: rgb(var(--color-surface-500));
		font-size: 0.85rem;
		font-style: italic;
	}

	/* Drop to Root Zone */
	.drop-to-root-zone {
		margin-top: 1rem;
		padding: 1rem;
		border: 2px dashed rgb(var(--color-primary-500));
		border-radius: 8px;
		background: rgb(var(--color-primary-500) / 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: rgb(var(--color-primary-500));
		font-weight: 500;
		animation: pulse-border 1.5s ease-in-out infinite;
	}

	@keyframes pulse-border {
		0%,
		100% {
			border-color: rgb(var(--color-primary-500));
		}
		50% {
			border-color: rgb(var(--color-primary-300));
		}
	}

	/* Dragging State - Applied by svelte-dnd-action */
	:global(.tree-node-wrapper[aria-grabbed='true']) {
		opacity: 0.5;
		transform: scale(0.98);
	}

	/* Drop target visual feedback */
	:global(.tree-children:has([aria-grabbed='true'])) {
		background: rgb(var(--color-primary-500) / 0.05);
		border-left-color: rgb(var(--color-primary-500));
	}

	/* Hover Effects */
	.tree-node-container:hover {
		transform: translateX(2px);
	}

	/* Smooth Scrollbar */
	.collection-builder-tree {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-400)) transparent;
	}

	.collection-builder-tree::-webkit-scrollbar {
		width: 8px;
	}

	.collection-builder-tree::-webkit-scrollbar-track {
		background: transparent;
	}

	.collection-builder-tree::-webkit-scrollbar-thumb {
		background: rgb(var(--color-surface-400));
		border-radius: 4px;
	}

	.collection-builder-tree::-webkit-scrollbar-thumb:hover {
		background: rgb(var(--color-surface-500));
	}
</style>

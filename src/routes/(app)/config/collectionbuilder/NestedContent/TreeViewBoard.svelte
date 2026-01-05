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
- Support for nested categories
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
	import { dndzone } from 'svelte-dnd-action';
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

	// Expand all nodes
	function expandAll(): void {
		expandedNodes = new Set(treeData.map((item) => item.id));
	}

	// Collapse all nodes
	function collapseAll(): void {
		expandedNodes.clear();
		expandedNodes = new Set(expandedNodes);
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

	// Handle drag and drop at a specific level
	function handleDndConsider(e: CustomEvent, parentId: string | null) {
		const { items } = e.detail;
		updateItemsAtLevel(items, parentId);
	}

	function handleDndFinalize(e: CustomEvent, parentId: string | null) {
		const { items } = e.detail;
		updateItemsAtLevel(items, parentId);
		saveTreeData();
	}

	function updateItemsAtLevel(newItems: TreeViewItem[], parentId: string | null) {
		// Update treeData with the new order for items at this level
		const updatedData = [...treeData];

		// Separate items: those belonging to this parent vs others
		const otherItems = updatedData.filter((item) => (item.parent || null) !== parentId);

		// Update parent references for the reordered items
		const reorderedItems = newItems.map((item, index) => ({
			...item,
			parent: parentId,
			order: index // Ensure order is set based on position
		}));

		// Merge: keep other items in their original positions, append reordered items
		// This maintains the original ordering for items not affected by this drag operation
		const mergedItems = otherItems.concat(reorderedItems);

		// Sort to maintain a consistent ordering in the flat array
		// Items are sorted by their path depth and then by order within siblings
		mergedItems.sort((a, b) => {
			const aDepth = a.path.split('.').length;
			const bDepth = b.path.split('.').length;
			if (aDepth !== bDepth) return aDepth - bDepth;
			return (a.order ?? 0) - (b.order ?? 0);
		});

		treeData = mergedItems;

		// Recalculate paths and orders based on new structure
		treeData = recalculatePaths(treeData);
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
				No collections found matching "{searchText}"
			{:else}
				No collections yet. Create your first collection to get started.
			{/if}
		</div>
	{:else}
		{#each hierarchicalData as rootItem (rootItem.id)}
			{@render treeNode(rootItem, 0)}
		{/each}
	{/if}
</div>

<!-- Recursive Tree Node Renderer -->
{#snippet treeNode(item: EnhancedTreeViewItem, level: number)}
	<div class="tree-node-container" style="margin-left: {level * 2}rem">
		<!-- Render the node -->
		<TreeViewNode
			item={{...item}}
			isOpen={expandedNodes.has(item.id)}
			toggle={() => toggleNode(item.id)}
			onEditCategory={() => onEditCategory(toPartialContentNode(item))}
			onDelete={() => onDeleteNode?.(toPartialContentNode(item))}
			onDuplicate={() => onDuplicateNode?.(toPartialContentNode(item))}
		/>

		<!-- Render children if expanded -->
		{#if expandedNodes.has(item.id) && item.children.length > 0}
			<div
				class="tree-children mt-2"
				use:dndzone={{
					items: item.children,
					flipDurationMs: 300,
					type: `tree-level-${item.id}`,
					dropTargetStyle: {}
				}}
				onconsider={(e) => handleDndConsider(e, item.id)}
				onfinalize={(e) => handleDndFinalize(e, item.id)}
			>
				{#each item.children as child (child.id)}
					<div animate:flip={{ duration: 300 }}>
						{@render treeNode(child, level + 1)}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	/* Base Tree Styling */
	:global(.collection-builder-tree) {
		background: transparent;
		color: inherit;
		font-family: inherit;
		padding: 0.5rem;
	}

	/* Tree Node Container */
	.tree-node-container {
		margin-bottom: 0.5rem;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	/* Tree Children Container */
	.tree-children {
		padding-left: 1rem;
		border-left: 2px solid rgb(var(--color-surface-300));
		margin-left: 1rem;
	}

	/* Dragging State */
	:global(.tree-node-container.dragging) {
		opacity: 0.4;
		transform: scale(0.95);
		filter: blur(1px);
	}

	/* Drag Over Indication */
	:global(.tree-children.drag-over) {
		background-color: rgb(var(--color-primary-500) / 0.1);
		border-left-color: rgb(var(--color-primary-500));
		border-radius: 4px;
	}

	/* Empty Tree State */
	.collection-builder-tree:empty::before {
		content: 'Drop collections here';
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		color: rgb(var(--color-surface-500));
		font-style: italic;
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

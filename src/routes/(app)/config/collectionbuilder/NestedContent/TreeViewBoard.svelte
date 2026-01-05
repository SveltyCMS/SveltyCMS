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
	import { dndzone, SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';

	interface DndItem extends ContentNode {
		id: string; // For DnD tracking
		children?: DndItem[];
	}

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

	// Expanded state for categories
	let expandedMap = $state<Record<string, boolean>>({});

	// Local hierarchical state for the tree
	let treeItems = $state<DndItem[]>([]);

	// Convert flat ContentNodes to hierarchical DndItems
	function buildHierarchy(nodes: ContentNode[]): DndItem[] {
		const nodeMap = new Map<string, DndItem>();
		const roots: DndItem[] = [];

		// First pass: create all nodes with id property
		for (const node of nodes) {
			const dndItem: DndItem = {
				...node,
				id: node._id, // Use _id as stable id for DnD
				children: []
			};
			nodeMap.set(node._id, dndItem);
		}

		// Second pass: build hierarchy
		for (const node of nodes) {
			const dndItem = nodeMap.get(node._id)!;
			if (node.parentId) {
				const parent = nodeMap.get(node.parentId);
				if (parent) {
					parent.children = parent.children || [];
					parent.children.push(dndItem);
				} else {
					// Parent not found, treat as root
					roots.push(dndItem);
				}
			} else {
				roots.push(dndItem);
			}
		}

		// Sort by order within each level
		const sortByOrder = (items: DndItem[]) => {
			items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
			items.forEach((item) => {
				if (item.children && item.children.length > 0) {
					sortByOrder(item.children);
				}
			});
		};
		sortByOrder(roots);

		return roots;
	}

	// Flatten hierarchy to ContentNode list
	function flattenHierarchy(items: DndItem[], parentId?: string): ContentNode[] {
		const result: ContentNode[] = [];
		items.forEach((item, index) => {
			const { id, children, ...rest } = item;
			const contentNode: ContentNode = {
				...rest,
				_id: item._id,
				parentId: parentId as any, // Cast to DatabaseId
				order: index
			};
			result.push(contentNode);

			if (children && children.length > 0) {
				result.push(...flattenHierarchy(children, item._id));
			}
		});
		return result;
	}

	// Initialize tree from contentNodes
	$effect(() => {
		if (contentNodes.length >= 0) {
			treeItems = buildHierarchy(contentNodes);
		}
	});

	// Expand/collapse all
	function expandAll(): void {
		const allIds: Record<string, boolean> = {};
		const collectIds = (items: DndItem[]) => {
			items.forEach((item) => {
				if (item.nodeType === 'category') {
					allIds[item.id] = true;
				}
				if (item.children && item.children.length > 0) {
					collectIds(item.children);
				}
			});
		};
		collectIds(treeItems);
		expandedMap = allIds;
	}

	function collapseAll(): void {
		expandedMap = {};
	}

	// Clear the search
	function clearSearch(): void {
		searchText = '';
	}

	// Toggle expand/collapse for a category
	function toggleExpand(nodeId: string): void {
		expandedMap = {
			...expandedMap,
			[nodeId]: !expandedMap[nodeId]
		};
	}

	// DnD flip duration
	const flipDurationMs = 200;

	// Handle DnD consider (preview)
	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>, parentId?: string) {
		const items = e.detail.items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
		if (parentId) {
			// Update children of a specific parent
			updateItemsInTree(parentId, items);
		} else {
			// Update root items
			treeItems = items;
		}
	}

	// Handle DnD finalize (drop complete)
	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>, parentId?: string) {
		const items = e.detail.items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
		if (parentId) {
			updateItemsInTree(parentId, items);
		} else {
			treeItems = items;
		}

		// Flatten and notify parent component
		const flatNodes = flattenHierarchy(treeItems);
		onNodeUpdate(flatNodes);
	}

	// Update children of a specific item in the tree
	function updateItemsInTree(parentId: string, newChildren: DndItem[]) {
		const updateRecursive = (items: DndItem[]): DndItem[] => {
			return items.map((item) => {
				if (item.id === parentId) {
					return { ...item, children: newChildren };
				} else if (item.children && item.children.length > 0) {
					return { ...item, children: updateRecursive(item.children) };
				}
				return item;
			});
		};
		treeItems = updateRecursive(treeItems);
	}

	// Filter items by search text
	function filterItems(items: DndItem[], search: string): DndItem[] {
		if (!search) return items;
		const lowerSearch = search.toLowerCase();
		return items.filter((item) => {
			const matchesName = item.name?.toLowerCase().includes(lowerSearch);
			const matchesChildren = item.children && filterItems(item.children, search).length > 0;
			return matchesName || matchesChildren;
		});
	}

	// Get filtered items for display
	const displayItems = $derived(filterItems(treeItems, searchText));
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

<!-- Tree View using svelte-dnd-action -->
<div class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-4">
	{#snippet renderList(items: DndItem[], parentId?: string)}
		<section
			use:dndzone={{
				items,
				flipDurationMs,
				type: parentId || 'root',
				dropTargetStyle: {},
				dragDisabled: false
			}}
			onconsider={(e) => handleDndConsider(e, parentId)}
			onfinalize={(e) => handleDndFinalize(e, parentId)}
			class="dnd-section space-y-2"
		>
			{#each items as item (item.id)}
				<div class="dnd-item">
					<TreeViewNode
						{item}
						isOpen={expandedMap[item.id] || false}
						toggle={() => toggleExpand(item.id)}
						onEditCategory={() => onEditCategory(item)}
						onDelete={() => onDeleteNode?.(item)}
						onDuplicate={() => onDuplicateNode?.(item)}
					/>
					{#if item.nodeType === 'category' && item.children && item.children.length > 0 && expandedMap[item.id]}
						<div class="ml-8 mt-2">
							{@render renderList(item.children, item.id)}
						</div>
					{/if}
				</div>
			{/each}
		</section>
	{/snippet}

	{#if displayItems.length > 0}
		{@render renderList(displayItems)}
	{:else if searchText}
		<div class="text-center p-8 text-surface-500">
			<iconify-icon icon="mdi:magnify" width="48" class="opacity-30"></iconify-icon>
			<p class="mt-2">No results found for "{searchText}"</p>
		</div>
	{:else}
		<div class="text-center p-8 text-surface-500">
			<iconify-icon icon="mdi:folder-outline" width="48" class="opacity-30"></iconify-icon>
			<p class="mt-2">No categories or collections yet</p>
		</div>
	{/if}
</div>

<style>
	/* Base Tree Styling */
	.collection-builder-tree {
		min-height: 300px;
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

	/* DnD Section */
	:global(.dnd-section) {
		min-height: 60px;
		position: relative;
	}

	/* DnD Item */
	:global(.dnd-item) {
		transition: transform 0.2s ease, opacity 0.2s ease;
	}

	/* Dragging state */
	:global(.dnd-item.isDragging) {
		opacity: 0.5;
		transform: scale(0.95);
	}

	/* Drop target highlight */
	:global(.dnd-section.isDropTarget) {
		background: rgb(var(--color-primary-500) / 0.1);
		border-radius: 8px;
	}
</style>

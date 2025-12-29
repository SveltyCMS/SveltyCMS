<!--
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewBoard.svelte
@component
**Board component for managing nested collections using @keenmate/svelte-treeview**

### Props
- `contentNodes` {ContentNode[]} - Array of content nodes representing collections and categories
- `onNodeUpdate` {Function} - Callback function to handle updates to the content node
- `onEditCategory` {Function} - Callback function to handle editing of categories
- `onDeleteNode` {Function} - Callback function to handle node deletion
- `onDuplicateNode` {Function} - Callback function to handle node duplication

### Features:
- Drag and drop reordering of collections using TreeView
- Support for nested categories
- Search/Filter functionality
- Expand/Collapse all
- Context menu for actions
-->
<script lang="ts">
	// Component
	import TreeViewNode from './TreeViewNode.svelte';
	import { logger } from '@utils/logger';

	// DB / Types
	import type { ContentNode } from '@databases/dbInterface';

	// Tree View
	import { Tree } from '@keenmate/svelte-treeview';

	// Adapter
	import { toTreeViewData, toFlatContentNodes, recalculatePaths, type TreeViewItem } from '@utils/treeViewAdapter';

	interface Props {
		contentNodes: ContentNode[]; // ALREADY NESTED content nodes from the parent
		onNodeUpdate: (updatedNodes: ContentNode[]) => void; // Callback to inform parent of structural changes
		onEditCategory: (category: Partial<ContentNode>) => void;
		onDeleteNode?: (node: Partial<ContentNode>) => void;
		onDuplicateNode?: (node: Partial<ContentNode>) => void;
	}

	let { contentNodes = [], onNodeUpdate, onEditCategory, onDeleteNode, onDuplicateNode }: Props = $props();

	// Tree reference for programmatic control
	let treeRef: any = $state(null);

	// Search state
	let searchText = $state('');

	// Local state for the tree data
	let treeData = $state<TreeViewItem[]>([]);
	let initialized = false;

	$effect(() => {
		if (contentNodes.length > 0 && (!initialized || treeData.length === 0)) {
			treeData = toTreeViewData(contentNodes);
			initialized = true;
		}
	});

	/**
	 * Expand all nodes in the tree
	 */
	function expandAll(): void {
		treeRef?.expandAll();
	}

	/**
	 * Collapse all nodes in the tree
	 */
	function collapseAll(): void {
		treeRef?.collapseAll();
	}

	/**
	 * Clear the search and show all nodes
	 */
	function clearSearch(): void {
		searchText = '';
	}

	/**
	 * Handles the drop event from the TreeView.
	 */
	function handleNodeDrop(dropNode: any, draggedNode: any, position: string, _event: any, _operation: any) {
		try {
			logger.debug('TreeView drop:', { dropNode: dropNode?.data?.name, draggedNode: draggedNode?.data?.name, position });

			const draggedId = draggedNode?.data?.id || draggedNode?.id;
			const dropId = dropNode?.data?.id || dropNode?.id;

			if (!draggedId) {
				logger.warn('No dragged item ID found');
				return;
			}

			let updatedData = treeData.map((item) => ({ ...item }));

			const draggedIndex = updatedData.findIndex((item) => item.id === draggedId);
			if (draggedIndex === -1) {
				logger.warn('Dragged item not found in treeData');
				return;
			}

			const draggedItem = updatedData[draggedIndex];

			if (position === 'inside') {
				draggedItem.parent = dropId || null;
			} else if (position === 'before' || position === 'after') {
				const dropItem = updatedData.find((item) => item.id === dropId);
				draggedItem.parent = dropItem?.parent || null;
			}

			updatedData = recalculatePaths(updatedData);
			treeData = updatedData;

			const contentNodes = toFlatContentNodes(updatedData);
			onNodeUpdate(contentNodes);
		} catch (error) {
			logger.error('Error handling TreeView drop:', error);
		}
	}
</script>

<!-- Toolbar -->
<div class="mb-3 flex flex-wrap items-center gap-2">
	<!-- Search Input -->
	<div class="relative flex-1 min-w-[200px]">
		<iconify-icon icon="mdi:magnify" width="18" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
		<input type="text" placeholder="Search collections..." bind:value={searchText} class="input w-full pl-10 pr-8" />
		{#if searchText}
			<button
				type="button"
				onclick={clearSearch}
				class="absolute right-2 top-1/2 -translate-y-1/2 btn-icon btn-icon-sm variant-soft"
				aria-label="Clear search"
			>
				<iconify-icon icon="mdi:close" width="16"></iconify-icon>
			</button>
		{/if}
	</div>

	<!-- Expand/Collapse Buttons -->
	<div class="flex gap-1">
		<button type="button" onclick={expandAll} class="btn btn-sm variant-soft-surface" title="Expand All">
			<iconify-icon icon="mdi:unfold-more-horizontal" width="18"></iconify-icon>
			<span class="hidden sm:inline">Expand</span>
		</button>
		<button type="button" onclick={collapseAll} class="btn btn-sm variant-soft-surface" title="Collapse All">
			<iconify-icon icon="mdi:unfold-less-horizontal" width="18"></iconify-icon>
			<span class="hidden sm:inline">Collapse</span>
		</button>
	</div>
</div>

<!-- Tree View -->
<div class="tree-container h-auto w-auto max-w-full overflow-y-auto p-1">
	<Tree
		bind:this={treeRef}
		bind:data={treeData}
		nodeTemplate={itemTemplate}
		onNodeDrop={handleNodeDrop}
		pathMember="path"
		idMember="id"
		displayValueMember="name"
		dragOverNodeClass="drop-zone-highlight"
		isDraggableMember="isDraggable"
		isDropAllowedMember="isDropAllowed"
		expandLevel={3}
		shouldUseInternalSearchIndex={true}
		searchValueMember="name"
		bind:searchText
	/>
</div>

<!-- Custom Node Template for the Tree -->
{#snippet itemTemplate(node: any, toggle: () => void, isOpen: boolean)}
	<div class="w-full group">
		<TreeViewNode
			item={{ ...(node.data || node), hasChildren: node.hasChildren || (node.children && node.children.length > 0) }}
			{isOpen}
			{toggle}
			onEditCategory={() => onEditCategory(node.data || node)}
			onDelete={() => onDeleteNode?.(node.data || node)}
			onDuplicate={() => onDuplicateNode?.(node.data || node)}
		/>
	</div>
{/snippet}

<style>
	/* Tree container */
	.tree-container {
		position: relative;
	}

	/* Minimal overrides for TreeView to fit CMS theme */
	:global(.svelte-tree-view) {
		background: transparent;
		color: inherit;
		font-family: inherit;
		--tree-branch-width: 1px;
		--tree-level-indent: 4rem;
		--tree-row-height: auto;
	}

	:global(.svelte-tree-view .node) {
		margin-bottom: 0.25rem;
		transition: all 0.15s ease;
	}

	/* Dragging item ghost */
	:global(.svelte-tree-view .node.dragging) {
		opacity: 0.5;
		transform: scale(0.98);
	}

	/* Drop zone highlight when hovering over a node */
	:global(.svelte-tree-view .drop-zone-highlight) {
		position: relative;
	}

	:global(.svelte-tree-view .drop-zone-highlight .node) {
		outline: 2px dashed rgb(var(--color-primary-500) / 0.7);
		outline-offset: 2px;
		border-radius: 0.5rem;
		background: rgb(var(--color-primary-500) / 0.1);
	}

	/* Drop indicator lines for before/after positioning */
	:global(.svelte-tree-view .ltree-drop-before)::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, rgb(var(--color-success-500)), rgb(var(--color-primary-500)));
		border-radius: 2px;
		animation: pulse-line 1s ease-in-out infinite;
	}

	:global(.svelte-tree-view .ltree-drop-after)::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, rgb(var(--color-success-500)), rgb(var(--color-primary-500)));
		border-radius: 2px;
		animation: pulse-line 1s ease-in-out infinite;
	}

	:global(.svelte-tree-view .ltree-drop-inside) {
		outline: 2px solid rgb(var(--color-tertiary-500)) !important;
		background: rgb(var(--color-tertiary-500) / 0.15) !important;
	}

	/* Pulse animation for drop indicators */
	@keyframes pulse-line {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Make all items draggable by default */
	:global(.svelte-tree-view .node-content) {
		cursor: grab;
	}

	:global(.svelte-tree-view .node-content:active) {
		cursor: grabbing;
	}
</style>

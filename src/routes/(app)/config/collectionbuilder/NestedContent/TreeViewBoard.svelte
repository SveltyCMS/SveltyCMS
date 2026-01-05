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
- Enhanced visual feedback for drag & drop
-->
<script lang="ts">
	// Component
	import TreeViewNode from './TreeViewNode.svelte';
	import { logger } from '@utils/logger';

	// DB / Types
	import type { ContentNode } from '@databases/dbInterface';

	// Tree View
	import { Tree } from '@keenmate/svelte-treeview';
	import '../../../../../styles/treeview.css';
	import type { SearchOptions } from 'flexsearch';

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

	// Tree reference for programmatic control
	let treeRef: any = $state(null);

	// Search state
	let searchText = $state('');
	let searchTimeout: ReturnType<typeof setTimeout>;

	// Local state for the tree data
	let treeData = $state<TreeViewItem[]>([]);
	let initialized = false;

	$effect(() => {
		if (contentNodes.length > 0 && (!initialized || treeData.length === 0)) {
			treeData = toTreeViewData(contentNodes);
			initialized = true;
		}
	});

	$effect(() => {
		if (!treeRef) return;

		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const options: SearchOptions = {
				suggest: true,
				limit: 100
			};
			treeRef.searchNodes(searchText, options);
		}, 300);
	});

	// Expand all nodes in the tree
	function expandAll(): void {
		if (treeRef?.expandAll) {
			treeRef.expandAll();
		} else {
			logger.warn('expandAll not available on treeRef', treeRef);
		}
	}

	// Collapse all nodes in the tree
	function collapseAll(): void {
		if (treeRef?.collapseAll) {
			treeRef.collapseAll();
		} else {
			logger.warn('collapseAll not available on treeRef', treeRef);
		}
	}

	// Clear the search and show all nodes
	function clearSearch(): void {
		searchText = '';
	}

	// Manual toggle handler to ensure reliability
	function handleManualToggle(node: TreeViewItem) {
		if (treeRef) {
			treeRef.toggleNode(node.id);
		} else {
			logger.warn('treeRef not available for toggle', node);
		}
	}

	/**
	 * Handles the drop event from the TreeView - v4.5.0+ signature with position and operation
	 * @param dropNode - Target node (null for root drops)
	 * @param draggedNode - The node being dragged
	 * @param position - 'above' | 'below' | 'child'
	 * @param event - Browser drag event
	 * @param operation - 'move' | 'copy'
	 */
	function handleNodeDrop(
		dropNode: any,
		draggedNode: any,
		position: 'above' | 'below' | 'child',
		_event: DragEvent | TouchEvent,
		operation: 'move' | 'copy'
	) {
		try {
			logger.debug('TreeView drop:', {
				dropNode: dropNode?.data?.name || dropNode?.name || 'root',
				draggedNode: draggedNode?.data?.name || draggedNode?.name,
				position,
				operation
			});

			const draggedId = draggedNode?.data?.id || draggedNode?.id;
			const dropId = dropNode?.data?.id || dropNode?.id;

			if (!draggedId) {
				logger.warn('No dragged item ID found');
				return;
			}

			// Prevent drops on self
			if (draggedId === dropId && position !== 'child') {
				logger.warn('Cannot drop node on itself');
				return;
			}

			let updatedData = treeData.map((item) => ({ ...item }));

			const draggedIndex = updatedData.findIndex((item) => item.id === draggedId);
			if (draggedIndex === -1) {
				logger.warn('Dragged item not found in treeData');
				return;
			}

			const draggedItem = updatedData[draggedIndex];

			// Remove brought item from its original position
			updatedData.splice(draggedIndex, 1);

			// Re-find drop item index after removal to ensure accuracy
			const dropIndex = dropId ? updatedData.findIndex((item) => item.id === dropId) : -1;

			if (position === 'child' && dropId) {
				// Drop as child: Set parent and move to end of array (or after parent?)
				// For LTree, array order matters for siblings. If we make it a child,
				// its array position matters relative to other children of the same parent.
				// We'll append it to the end of the array to be safe, or after the drop node.
				draggedItem.parent = dropId;
				// Inserting after drop node keeps it close in the file
				updatedData.splice(dropIndex + 1, 0, draggedItem);
			} else if ((position === 'above' || position === 'below') && dropId) {
				const dropItem = updatedData[dropIndex]; // This is valid because we found index
				draggedItem.parent = dropItem.parent || null;

				// Calculate insertion index
				const insertIndex = position === 'above' ? dropIndex : dropIndex + 1;
				updatedData.splice(insertIndex, 0, draggedItem);
			} else {
				// Root drop or fallback
				draggedItem.parent = null;
				updatedData.push(draggedItem);
			}

			// Recalculate paths based on new parent relationships and array order
			updatedData = recalculatePaths(updatedData);
			treeData = updatedData;

			// Convert back to ContentNodes and notify parent
			const contentNodes = toFlatContentNodes(updatedData);

			// Defer update to prevent synchronous state update loop
			setTimeout(() => {
				onNodeUpdate(contentNodes);
			}, 50);
		} catch (error) {
			logger.error('Error handling TreeView drop:', error);
		}
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

<!-- Tree View -->
<div class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded">
	<Tree
		bind:this={treeRef}
		bind:data={treeData}
		nodeTemplate={itemTemplate}
		onNodeDrop={handleNodeDrop}
		pathMember="path"
		idMember="id"
		displayValueMember="name"
		expandLevel={2}
		shouldUseInternalSearchIndex={true}
		searchValueMember="name"
		{...{ isDragAndDropEnabled: true } as any}
		dropZoneLayout="around"
		dropZoneStart={33}
		dropZoneMaxWidth={120}
		isDropAllowed={() => true}
		childrenMember="children"
		dragOverNodeClass="ltree-dragover-glow"
		treeClass="custom-tree"
		nodeClass="custom-tree-node"
	/>
</div>

<!-- Custom Node Template for the Tree -->
{#snippet itemTemplate(node: any, _toggle: () => void, isOpen: boolean)}
	<div class="w-full">
		<TreeViewNode
			item={{
				...(node.data || node),
				hasChildren: node.hasChildren || (node.children && node.children.length > 0)
			}}
			{isOpen}
			toggle={() => handleManualToggle(node.data || node)}
			onEditCategory={() => onEditCategory(node.data || node)}
			onDelete={() => onDeleteNode?.(node.data || node)}
			onDuplicate={() => onDuplicateNode?.(node.data || node)}
		/>
	</div>
{/snippet}

<style>
	/* Base Tree Styling */
	:global(.collection-builder-tree .custom-tree) {
		background: transparent;
		color: inherit;
		font-family: inherit;
		padding: 0.5rem;
	}

	/* Tree Node Spacing */
	:global(.collection-builder-tree .custom-tree-node) {
		margin-bottom: 0.75rem !important;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	/* Last child remove bottom margin */
	:global(.collection-builder-tree .custom-tree-node:last-child) {
		margin-bottom: 0 !important;
	}

	/* Dragging State - Ghost/Original Item */
	:global(.collection-builder-tree .custom-tree-node.dragging) {
		opacity: 0.4;
		transform: scale(0.95);
		filter: blur(1px);
	}

	/* Drag Over Glow Mode - CORE FEATURE */
	:global(.collection-builder-tree .ltree-dragover-glow) {
		position: relative;
		z-index: 100;
	}

	/* Position Indicator: Above (Green) */
	:global(.collection-builder-tree .ltree-glow-above::before) {
		content: '';
		position: absolute;
		top: -6px;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, rgb(var(--color-success-500)) 0%, rgb(var(--color-success-400)) 100%);
		border-radius: 2px;
		box-shadow:
			0 0 12px rgb(var(--color-success-500) / 0.6),
			0 0 24px rgb(var(--color-success-400) / 0.3);
		animation: pulse-glow 1.5s ease-in-out infinite;
		z-index: 50;
	}

	/* Position Indicator: Below (Orange) */
	:global(.collection-builder-tree .ltree-glow-below::after) {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, rgb(var(--color-warning-500)) 0%, rgb(var(--color-warning-400)) 100%);
		border-radius: 2px;
		box-shadow:
			0 0 12px rgb(var(--color-warning-500) / 0.6),
			0 0 24px rgb(var(--color-warning-400) / 0.3);
		animation: pulse-glow 1.5s ease-in-out infinite;
		z-index: 50;
	}

	/* Position Indicator: Child (Purple) */
	:global(.collection-builder-tree .ltree-glow-child) {
		outline: 3px solid rgb(var(--color-tertiary-500));
		outline-offset: 3px;
		background: rgb(var(--color-tertiary-500) / 0.15);
		box-shadow:
			0 0 16px rgb(var(--color-tertiary-500) / 0.5),
			inset 0 0 24px rgb(var(--color-tertiary-400) / 0.2);
		border-radius: 8px;
		animation: pulse-border 1.5s ease-in-out infinite;
	}

	/* Glow Pulse Animation */
	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 1;
			transform: scaleY(1);
		}
		50% {
			opacity: 0.7;
			transform: scaleY(1.2);
		}
	}

	/* Border Pulse Animation */
	@keyframes pulse-border {
		0%,
		100% {
			outline-width: 3px;
			outline-offset: 3px;
		}
		50% {
			outline-width: 4px;
			outline-offset: 4px;
		}
	}

	/* Empty Tree Drop Zone */
	:global(.collection-builder-tree .ltree-drop-placeholder) {
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px dashed rgb(var(--color-surface-400));
		border-radius: 12px;
		background: rgb(var(--color-surface-50) / 0.5);
		margin: 1rem;
		transition: all 0.3s ease;
	}

	:global(.collection-builder-tree .ltree-drop-placeholder:hover) {
		border-color: rgb(var(--color-primary-500));
		background: rgb(var(--color-primary-50) / 0.3);
		box-shadow: 0 0 20px rgb(var(--color-primary-500) / 0.3);
	}

	:global(.collection-builder-tree .ltree-drop-placeholder-content) {
		padding: 2rem;
		text-align: center;
		color: rgb(var(--color-surface-600));
		font-size: 1.1rem;
	}

	/* Root Drop Zone (Bottom of Tree) */
	:global(.collection-builder-tree .ltree-root-drop-zone) {
		min-height: 60px;
		margin-top: 1rem;
		border: 2px dashed rgb(var(--color-surface-300));
		border-radius: 8px;
		background: rgb(var(--color-surface-50) / 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgb(var(--color-surface-500));
		font-size: 0.9rem;
		opacity: 0;
		transition: all 0.3s ease;
	}

	:global(.collection-builder-tree .ltree-root-drop-zone.drag-active) {
		opacity: 1;
		border-color: rgb(var(--color-primary-500));
		background: rgb(var(--color-primary-50) / 0.2);
	}

	/* Touch Ghost Element (Mobile) */
	:global(.ltree-touch-ghost) {
		position: fixed;
		pointer-events: none;
		z-index: 10000;
		opacity: 0.85;
		transform: scale(1.05);
		filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
		transition: transform 0.1s ease;
	}

	/* Loading Overlay */
	:global(.collection-builder-tree .ltree-loading-overlay) {
		position: absolute;
		inset: 0;
		background: rgb(var(--color-surface-900) / 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		border-radius: 8px;
	}

	/* Improved Node Content Dragging */
	:global(.collection-builder-tree .custom-tree-node .node-content) {
		cursor: grab;
		width: 100%;
		user-select: none;
	}

	:global(.collection-builder-tree .custom-tree-node .node-content:active) {
		cursor: grabbing;
	}

	/* Hover Effects */
	:global(.collection-builder-tree .custom-tree-node:not(.dragging):hover) {
		transform: translateY(-1px);
	}

	/* Focus/Active States */
	:global(.collection-builder-tree .custom-tree-node:focus-within) {
		outline: 2px solid rgb(var(--color-primary-500));
		outline-offset: 2px;
		border-radius: 8px;
	}

	/* Nested Level Indentation */
	:global(.collection-builder-tree .custom-tree-node[data-level='0']) {
		margin-left: 0;
	}

	:global(.collection-builder-tree .custom-tree-node[data-level='1']) {
		margin-left: 3rem;
	}

	:global(.collection-builder-tree .custom-tree-node[data-level='2']) {
		margin-left: 6rem;
	}

	:global(.collection-builder-tree .custom-tree-node[data-level='3']) {
		margin-left: 9rem;
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

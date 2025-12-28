<!--
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewBoard.svelte
@component
**Board component for managing nested collections using @keenmate/svelte-treeview**

### Props
- `contentNodes` {ContentNode[]} - Array of content nodes representing collections and categories
- `onNodeUpdate` {Function} - Callback function to handle updates to the content node
- `onEditCategory` {Function} - Callback function to handle editing of categories

### Features:
- Drag and drop reordering of collections using TreeView
- Support for nested categories
-->
<script lang="ts">
	// Component
	import TreeViewNode from './TreeViewNode.svelte';
	import { logger } from '@utils/logger';

	// DB / Types
	import type { ContentNode } from '@root/src/databases/dbInterface';

	// Tree View
	import { Tree } from '@keenmate/svelte-treeview';

	// Adapter
	import { toTreeViewData, toFlatContentNodes, type TreeViewItem } from '@utils/treeViewAdapter';

	interface Props {
		contentNodes: ContentNode[]; // ALREADY NESTED content nodes from the parent
		onNodeUpdate: (updatedNodes: ContentNode[]) => void; // Callback to inform parent of structural changes
		onEditCategory: (category: Partial<ContentNode>) => void;
	}

	let { contentNodes = [], onNodeUpdate, onEditCategory }: Props = $props();

	// Local state for the tree data, initialized from props
	// We use $state so it can be bound to the Tree component
	// We use $effect to sync from props if they change externally (e.g. initial load)
	let treeData = $state<TreeViewItem[]>([]);
	let initialized = false;

	$effect(() => {
		// Only update if empty or significantly different to avoid loops
		// Simple set on change from parent, but guard against loop if parent updates from our own event
		if (contentNodes.length > 0 && (!initialized || treeData.length === 0)) {
			treeData = toTreeViewData(contentNodes);
			initialized = true;
		}
	});

	/**
	 * Handles the drop event from the TreeView.
	 * Types based on user provided definition:
	 * Types based on user provided definition:
	 * (dropNode, draggedNode, position, event, operation) => void
	 */
	function handleNodeDrop(_dropNode: any, _draggedNode: any, _position: any, _event: any, _operation: any) {
		// The Tree's bind:data should have already updated `treeData` (or will shortly)
		// We wait a tick to ensure `treeData` is fresh, then persist
		setTimeout(() => {
			try {
				// Convert back to flat ContentNode[] for persistence
				const updatedNodes = toFlatContentNodes(treeData);
				// Notify parent
				onNodeUpdate(updatedNodes);
			} catch (error) {
				logger.error('Error handling TreeView drop:', error);
			}
		}, 0);
	}
</script>

<div class="tree-container h-auto w-auto max-w-full overflow-y-auto p-1">
	<Tree bind:data={treeData} nodeTemplate={itemTemplate} onNodeDrop={handleNodeDrop} pathMember="path" idMember="id" displayValueMember="name" />
</div>

<!-- Custom Node Template for the Tree -->
{#snippet itemTemplate(node: any, toggle: () => void, isOpen: boolean)}
	<div class="w-full">
		<TreeViewNode
			item={{ ...(node.data || node), hasChildren: node.hasChildren || (node.children && node.children.length > 0) }}
			{isOpen}
			{toggle}
			onEditCategory={() => onEditCategory(node.data || node)}
		/>
	</div>
{/snippet}

<style>
	/* Minimal overrides for TreeView to fit CMS theme */
	:global(.svelte-tree-view) {
		background: transparent;
		color: inherit;
		font-family: inherit;
		--tree-branch-width: 1px; /* Show faint lines for better hierarchy */
		--tree-level-indent: 4rem; /* Increase indentation for better visibility */
		--tree-row-height: auto;
	}
	:global(.svelte-tree-view .node) {
		margin-bottom: 0.25rem;
	}
	/* Ensure drag ghost looks okay */
	:global(.svelte-tree-view .node.dragging) {
		opacity: 0.5;
	}
</style>

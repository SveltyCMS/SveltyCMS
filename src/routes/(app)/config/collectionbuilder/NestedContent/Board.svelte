<!-- 
@files src/routes/(app)/config/collection/Board.svelte
@component
**Board component for managing nested collections**

Features:
- Drag and drop reordering of collections
- Support for nested categories
-->
<script lang="ts">
	// Component
	import Column from './Column.svelte';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { ContentNode, DatabaseId, NestedContentNode } from '@root/src/databases/dbInterface';
	import { constructNestedStructure } from '@root/src/content/utils';
	import type { DndItem } from './types';

	interface Props {
		contentNodes: ContentNode[]; // Flat list of all content nodes from the parent
		onNodeUpdate: (updatedNodes: ContentNode[]) => void; // Callback to inform parent of structural changes
		onEditCategory: (category: ContentNode) => void;
	}

	let { contentNodes = $bindable([]), onNodeUpdate, onEditCategory }: Props = $props();

	// Derived state: Transforms the flat `contentNodes` into a nested structure suitable for `dndzone`.
	// This structure includes `id` and `children` properties required by `svelte-dnd-action`.
	let structureState = $derived(createStructuredItems(constructNestedStructure(contentNodes)));

	// UI state for drag operations
	let isDragging = $state(false);
	let dragError = $state<string | null>(null);

	/**
	 * Converts a list of `NestedContentNode`s into `DndItem`s suitable for `svelte-dnd-action`.
	 * Recursively processes children to maintain the nested structure.
	 * @param nodes The nested content nodes.
	 * @returns An array of `DndItem`s.
	 */
	function createStructuredItems(nodes: NestedContentNode[]): DndItem[] {
		return nodes.map((node, index) => ({
			...node,
			id: node._id, // `svelte-dnd-action` requires an `id` property
			children: createStructuredItems(node.children ?? []),
			isCategory: node.nodeType === 'category',
			order: index // Assign order based on current visual position
		}));
	}

	/**
	 * Flattens a nested `DndItem` array back into a flat `ContentNode` array.
	 * This is crucial for saving to a flat database structure.
	 * It ensures `parentId` and `order` properties are correctly set for all nodes.
	 * @param dndItems The array of `DndItem`s (can be top-level or children).
	 * @param parentId The `_id` of the parent for the current set of items (undefined for top-level).
	 * @returns A flattened array of `ContentNode`s.
	 */
	function flattenNodes(dndItems: DndItem[], parentId: DatabaseId | undefined = undefined): ContentNode[] {
		let flatNodes: ContentNode[] = [];
		dndItems.forEach((dndItem, index) => {
			// Destructure to separate dnd-specific props from ContentNode props
			const { id, children, isCategory, ...rest } = dndItem;
			const contentNode: ContentNode = {
				_id: id as DatabaseId,
				parentId: parentId, // Set the current parentId
				order: index, // Set the order based on its position in the current list
				...rest
			};
			flatNodes.push(contentNode);

			// Recursively flatten children if they exist
			if (children && children.length > 0) {
				flatNodes = flatNodes.concat(flattenNodes(children, id as DatabaseId));
			}
		});
		return flatNodes;
	}

	/**
	 * Handles the `consider` event from `dndzone`. Updates the local `structureState`
	 * immediately for visual feedback during drag.
	 * @param e CustomEvent from `dndzone` containing drag details.
	 */
	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			// `e.detail.items` contains the items in their *potential* new order/location
			structureState = e.detail.items;
			dragError = null;
		} catch (error) {
			console.error('Error handling DnD consider in Board:', error);
			dragError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	/**
	 * Handles the `finalize` event from `dndzone`. This is where the actual state update occurs
	 * after a drag operation is completed.
	 * @param e CustomEvent from `dndzone` containing drag details.
	 */
	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = false;
		try {
			// `e.detail.items` contains the items in their *final* new order/location within this zone.
			const newOrderedItems = e.detail.items;

			// Flatten the entire potentially nested structure to update parentId and order for ALL affected nodes.
			const newFlatContentNodes = flattenNodes(newOrderedItems);

			// Propagate the complete updated flat list of nodes back to the parent component (`+page.svelte`).
			onNodeUpdate(newFlatContentNodes);
			dragError = null;
		} catch (error) {
			console.error('Error handling DnD finalize in Board:', error);
			dragError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		}
	}

	const flipDurationMs = 300;
</script>

<div class="h-auto w-auto max-w-full overflow-y-auto p-1" role="region" aria-label="Collection Board" aria-busy={isDragging}>
	{#if dragError}
		<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
			{dragError}
		</div>
	{/if}

	<div
		use:dndzone={{
			items: structureState, // Items for the current dnd zone
			dropTargetStyle: { outline: 'rgba(0, 255, 102, 0.7) solid 2px' }, // Visual cue for valid drop target
			flipDurationMs, // Animation duration
			centreDraggedOnCursor: true // Dragged item centers on cursor
		}}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
		class="min-h-[2em] px-1 py-5"
		role="list"
		aria-label="Collection Categories"
	>
		{#each structureState as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="my-1 w-full" role="listitem" aria-label={item.name}>
				<Column
					level={0}
					{item}
					children={item.children ?? []}
					onNodeReorder={handleDndFinalize}
					isCategory={item.nodeType === 'category'}
					{onEditCategory}
				/>
			</div>
		{/each}
	</div>
</div>

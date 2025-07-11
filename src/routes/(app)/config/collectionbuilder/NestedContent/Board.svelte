<!-- 
@files src/routes/(app)/config/collection/Board.svelte
@component
**Board component for managing nested collections**
-->
<script lang="ts">
	// Component
	import Column from './Column.svelte';

	// Store

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { ContentNode, DatabaseId, NestedContentNode } from '@root/src/databases/dbInterface';
	import { constructNestedStructure } from '@root/src/content/utils';
	import type { DndItem } from './types';
	// import { setDebugMode } from 'svelte-dnd-action';
	// setDebugMode(true);

	interface Props {
		contentNodes: ContentNode[];
		addOperation: (newNode: ContentNode) => void;
		onEditCategory: (category: ContentNode) => void;
	}

	let { contentNodes = $bindable([]), addOperation, onEditCategory }: Props = $props();

	// let nestedNodes = $derived(constructNestedStructure(contentStructure.value));
	//
	// // State variables
	// let structuredItems = $derived<DndItem[]>(createStructuredItems(nestedNodes));

	let structureState = $derived(createStructuredItems(constructNestedStructure(contentNodes)));

	let isDragging = $state(false);
	let dragError = $state<string | null>(null);

	// Convert contentNodes to format needed for dnd-actions
	function createStructuredItems(nodes: NestedContentNode[]): DndItem[] {
		return nodes.map((node) => ({
			...node,
			children: createStructuredItems(node.children ?? []),
			id: node._id,
			isCategory: node.nodeType === 'category'
		}));
	}

	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			const items = e.detail.items;
			const uniqueItems = Array.from(new Map(items.map((item) => [item._id, item])).values());
			structureState = uniqueItems;

			// const newConfig = convertToConfig(e.detail.items);
			// contentStructure.set(newConfig);
			dragError = null;
		} catch (error) {
			console.error('Error handling DnD consider:', error);
			dragError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		try {
			console.log('Main Finalize', e);

			const eventType = e.detail.info.trigger;
			if (eventType === 'droppedIntoAnother') {
				const itemRemoved = e.detail.info.id;
				// contentNodes = contentNodes.filter((item) => item._id !== itemRemoved);
			} else if (eventType === 'droppedIntoZone') {
				const itemAdded = e.detail.info.id;
				handleUpdate(itemAdded, undefined);
			}

			dragError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			dragError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	function handleUpdate(itemId: string, parentId: string | undefined) {
		try {
			const currentNode = contentNodes.find((node) => node._id === itemId);
			if (!currentNode) return;
			currentNode.parentId = parentId;
			addOperation(currentNode);

			console.log('Board updating items', contentNodes);
			dragError = null;
		} catch (error) {
			console.error('Error handling update:', error);
			dragError = error instanceof Error ? error.message : 'Error updating items';
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
			items: structureState,
			dropTargetStyle: { outline: 'rgba(0, 255, 102, 0.7) solid 2px' },
			flipDurationMs,
			centreDraggedOnCursor: true
		}}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
		class="min-h-[2em] px-1 py-5"
		role="list"
		aria-label="Collection Categories"
	>
		{#each structureState as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="my-1 w-full" role="listitem" aria-label={item.name}>
				<Column level={0} {item} children={item.children ?? []} onUpdate={handleUpdate} isCategory={item.nodeType === 'category'} {onEditCategory} />
			</div>
		{/each}
	</div>
</div>

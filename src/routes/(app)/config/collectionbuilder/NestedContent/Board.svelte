<!-- 
@files src/routes/(app)/config/collection/Board.svelte
@component
**Board component for managing nested collections**
-->
<script lang="ts">
	// Component
	import Column from './Column.svelte';

	// Store
	import { contentStructure } from '@src/stores/collectionStore.svelte';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { ContentNode, DatabaseId, NestedContentNode } from '@root/src/databases/dbInterface';
	import { constructNestedStructure } from '@root/src/content/utils';
	import type { DndItem } from './types';
	// import { setDebugMode } from 'svelte-dnd-action';
	// setDebugMode(true);

	interface Props {
		contentNodes: Record<string, ContentNode>;
		onEditCategory: (category: Partial<ContentNode>) => void;
	}

	let { contentNodes, onEditCategory }: Props = $props();

	// let nestedNodes = $derived(constructNestedStructure(contentStructure.value));
	//
	// // State variables
	// let structuredItems = $derived<DndItem[]>(createStructuredItems(nestedNodes));

	let structureState = $state(createStructuredItems(constructNestedStructure(contentStructure.value)));

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

	function convertToConfig(nodes: DndItem[]): Record<string, ContentNode> {
		const stack: { node: DndItem; parentPath?: string }[] = nodes.map((n) => ({ node: n, parentPath: n.parentPath }));
		const flatMap: Record<string, ContentNode> = {};

		while (stack.length) {
			const { node, parentPath } = stack.pop()!;
			const expectedPath = parentPath ? `${parentPath}/${node.name}` : `/${node.name}`;

			const needsUpdate = node.path !== expectedPath || node.parentPath !== parentPath;

			if (needsUpdate) {
				node.path = expectedPath;
				node.parentPath = parentPath;
			}

			// Strip out children to match ContentNode type
			const { children, ...contentNode } = node;
			flatMap[node.path] = { ...contentNode, _id: node.id as DatabaseId };

			if (children?.length) {
				for (let i = children.length - 1; i >= 0; i--) {
					stack.push({ node: children[i], parentPath: node.path });
				}
			}
		}

		// console.log(flatMap);

		return flatMap;
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		try {
			console.log('Main Finalize', e);
			// const eventType = e.detail.info.trigger;
			// if (eventType === 'droppedIntoAnother') {
			// 	const itemRemoved = e.detail.info.id;
			// 	const items = e.detail.items.filter((item) => item._id !== itemRemoved);
			//
			// 	structureState = items;
			// }

			// const items = e.detail.items;
			// const uniqueItems = Array.from(new Map(items.map((item) => [item._id, item])).values());
			// structureState = uniqueItems;

			// console.debug('Finalize Main', e);
			// structureState = e.detail.items;
			// const newConfig = convertToConfig(e.detail.items);
			//
			// console.log(newConfig);
			// contentStructure.set(newConfig);

			dragError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			dragError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	function handleUpdate(newItems: DndItem[], parent: DndItem) {
		try {
			console.log('Board updating items', newItems, parent);

			// const updatedItems = structureState.map((i) => (i.id === parent.id ? { ...i, children: newItems } : i));
			// structureState = updatedItems;
			// const newConfig = convertToConfig(updatedItems);
			//
			// console.log('updating items', newConfig);
			// contentStructure.set(newConfig);
			//
			dragError = null;
		} catch (error) {
			console.error('Error handling update:', error);
			dragError = error instanceof Error ? error.message : 'Error updating items';
		}
	}

	$effect(() => {
		// console.debug('ContenStrucutre', contentStructure.value)
		console.debug('nestedStructure', structureState);
	});

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

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
	import type { CollectionData } from '@root/src/content/types';
	import type { ContentNode, DatabaseId, NestedContentNode } from '@root/src/databases/dbInterface';
	import { contructNestedStructure } from '@root/src/content/utils';
	type DndItem = ContentNode & { id: string; children?: DndItem[] };

	interface Props {
		contentNodes: Record<string, ContentNode>;
		onEditCategory: (category: Partial<CollectionData>) => void;
	}

	let { contentNodes, onEditCategory }: Props = $props();

	let nestedNodes = $derived(contructNestedStructure(contentStructure.value));

	// State variables
	let structuredItems = $derived<DndItem[]>(createStructuredItems(nestedNodes));
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

		console.log(flatMap);

		return flatMap;
	}

	function handleDndFinalize() {
		try {
			const newConfig = convertToConfig(structuredItems);
			contentStructure.set(newConfig);

			dragError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			dragError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	function handleUpdate(newItems: DndItem[]) {
		try {
			const newConfig = convertToConfig(newItems);
			contentStructure.set(newConfig);

			dragError = null;
		} catch (error) {
			console.error('Error handling update:', error);
			dragError = error instanceof Error ? error.message : 'Error updating items';
		}
	}

	$effect(() => {
		console.debug('ContenStrucutre', contentStructure.value);
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
		use:dndzone={{ items: structuredItems, dragDisabled: false, flipDurationMs, centreDraggedOnCursor: true }}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
		class="min-h-[2em] pb-14"
		role="list"
		aria-label="Collection Categories"
	>
		{#each structuredItems as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="my-1 w-full" role="listitem" aria-label={item.name}>
				<Column
					name={item.name}
					path={item.path}
					icon={item.icon as string}
					items={item.children ?? []}
					onUpdate={(newItems) => {
						console.debug('upodate Items', newItems);
						const updatedItems = structuredItems.map((i) => (i.id === item.id ? { ...i, children: newItems } : i));
						handleUpdate(updatedItems);
					}}
					isCategory={item.nodeType === 'category'}
					{onEditCategory}
				/>
			</div>
		{/each}
	</div>
</div>

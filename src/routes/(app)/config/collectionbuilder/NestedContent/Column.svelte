<!-- 
@files src/routes/(app)/config/collection/Column.svelte
@component
**This component displays a collection with nested items support**

-->
<script lang="ts">
	import Column from './Column.svelte';
	import { goto } from '$app/navigation';
	import type { CollectionData } from '@src/content/types';

	// Stores
	import { mode, contentStructure } from '@root/src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	import type { ContentNode, DatabaseId } from '@root/src/databases/dbInterface';
	import type { DndItem } from './types';

	interface Props {
		item: DndItem;
		children: DndItem[];
		isCategory?: boolean;
		level: number;
		onEditCategory: (category: Partial<DndItem>) => void;
		onUpdate: (itemId: string, parentId: string) => void;
	}

	interface CategoryUpdateResponse {
		newCategoryName: string;
		newCategoryIcon: string;
	}

	let { item, children = $bindable([]), level, onUpdate, isCategory = false, onEditCategory }: Props = $props();

	let name = $derived(item.name);
	let path = $derived(item.path);
	let icon = $derived(item.icon);

	// State variables
	let isDragging = $state(false);
	let updateError = $state<string | null>(null);
	let isUpdating = $state(false);

	const modalStore = getModalStore();
	const flipDurationMs = 200;

	// Computed values
	let paddingLeft = $derived(level === 0 ? '0' : `${level * 1.5}rem`);

	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			const items = e.detail.items;
			const uniqueItems = Array.from(new Map(items.map((item) => [item._id, item])).values());

			console.debug('DndConsider', uniqueItems);
			children = uniqueItems;
			updateError = null;
		} catch (error) {
			console.error('Error handling DnD consider:', error);
			updateError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		try {
			console.debug('Finalize', e);
			const eventType = e.detail.info.trigger;
			if (eventType === 'droppedIntoAnother') {
				const itemRemoved = e.detail.info.id;
				const items = e.detail.items.filter((item) => item._id !== itemRemoved);
				children = items;
				// onUpdate(items, item);
			} else if (eventType === 'droppedIntoZone') {
				const itemAdded = e.detail.info.id;
				onUpdate(itemAdded, item.id);
			}

			updateError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			updateError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	async function handleCollectionClick(item: Pick<DndItem, 'path'>) {
		try {
			mode.set('edit');
			await goto(`/config/collectionbuilder/edit${item.path}`);
		} catch (error) {
			console.error('Error navigating to collection:', error);
			updateError = error instanceof Error ? error.message : 'Error navigating to collection';
		}
	}

	function handleCategoryEdit() {
		onEditCategory(item);
	}

	// Modal handling
</script>

<div class="my-0.5 w-full" style="padding-left: {paddingLeft}" role="listitem" aria-busy={isDragging || isUpdating}>
	{#if updateError}
		<div class="mb-2 rounded bg-error-500/10 p-2 text-error-500" role="alert">
			{updateError}
		</div>
	{/if}

	{#if isCategory}
		<div class="flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" role="button" aria-label="Drag to reorder"></iconify-icon>
				<iconify-icon {icon} width="18" class="text-error-500" aria-hidden="true"></iconify-icon>
				<span class="font-bold text-tertiary-500 dark:text-primary-500">{name}</span>
			</div>

			<button onclick={handleCategoryEdit} aria-label={`Edit category ${name}`} disabled={isUpdating}>
				<iconify-icon icon="mdi:pen" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			</button>
		</div>
	{:else}
		<div class="flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" role="button" aria-label="Drag to reorder"></iconify-icon>
				<iconify-icon {icon} width="18" class="text-error-500" aria-hidden="true"></iconify-icon>
				<span class="text-black dark:text-white">{name}</span>
			</div>
			<button onclick={() => handleCollectionClick({ path })} aria-label={`Edit collection ${name}`} disabled={isUpdating}>
				<iconify-icon icon="mdi:pen" width="18"></iconify-icon>
			</button>
		</div>
	{/if}

	{#if isCategory}
		<section
			use:dndzone={{ items: item.children ?? [], flipDurationMs, centreDraggedOnCursor: true }}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
			class="min-h-10 py-1"
			role="list"
			aria-label={`${isCategory ? 'Category' : 'Collection'} children`}
		>
			{#each children as child (child.id)}
				<div animate:flip={{ duration: flipDurationMs }} class="mx-0.5 p-0.5">
					<Column
						item={child}
						children={child.children ?? []}
						level={level + 0.25}
						isCategory={child.nodeType === 'category'}
						onUpdate={(newItems) => {
							onUpdate(newItems, child.id);
						}}
						{onEditCategory}
					/>
				</div>
			{/each}
		</section>
	{/if}
</div>

<!-- 
@files src/routes/(app)/config/collection/Column.svelte
@component
**This component displays a collection with nested items support**

Features:	
- Collection Name
- Collection Icon
- Collection Description
- Collection Status
- Collection Slug
- Collection Description
- Collection Permissions
- Collection Fields
- Collection Categories
-->

<script lang="ts">
	import Column from './Column.svelte'; // Recursive import for nested columns
	import { goto } from '$app/navigation';

	// Stores
	import { setMode } from '@stores/collectionStore.svelte';

	// Svelte DND-actions
	import type { DatabaseId } from '@src/databases/dbInterface';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { DndItem } from './types';

	interface Props {
		item: DndItem; // The current item this column represents
		children: DndItem[]; // The children of the current item (if it's a category)
		isCategory?: boolean;
		level: number; // Current nesting level for visual indentation
		onEditCategory: (category: Partial<DndItem>) => void;
		// Callback to the parent (Board or another Column) for any reorder/parent change
		// It will receive the ID of the dragged item, its *new* potential parent ID,
		// and the *updated list of children* for this specific column's dndzone.
		onNodeReorder: (itemId: string, newParentId: DatabaseId | undefined, updatedChildren: DndItem[]) => void;
	}

	let { item, children = $bindable([]), level, onNodeReorder, isCategory = false, onEditCategory }: Props = $props();

	// Derived properties for convenience
	let name = $derived(item.name);
	let path = $derived(item.path);
	let icon = $derived(item.icon);

	// UI state for drag operations and updates
	let isDragging = $state(false); // True if an item is being dragged within this column's dndzone
	let updateError = $state<string | null>(null);
	let isUpdating = $state(false); // Indicates if this column is actively processing an update (e.g., navigation)

	const flipDurationMs = 200;

	// Computed padding for visual indentation based on `level`
	let paddingLeft = $derived(level === 0 ? '0' : `${level * 1.5}rem`);

	/**
	 * Handles the `consider` event for this column's dndzone.
	 * Updates the `children` array visually during a drag.
	 * @param e CustomEvent from `dndzone`.
	 */
	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			// Update local `children` state to reflect the item's potential new position
			children = e.detail.items;
			updateError = null;
		} catch (error) {
			console.error('Error handling DnD consider in Column:', error);
			updateError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	/**
	 * Handles the `finalize` event for this column's dndzone.
	 * This is where the actual state update occurs after a drag operation is completed.
	 * ONLY updates the local children array - Board handles propagation.
	 * @param e CustomEvent from `dndzone`.
	 */
	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = false;
		try {
			// Update the children array with the final state
			// The $bindable binding will automatically propagate this to the parent's structureState
			children = e.detail.items;

			// DO NOT call onNodeReorder here - it causes conflicts
			// The Board's finalize handler will catch all changes through structureState

			updateError = null;
		} catch (error) {
			console.error('Error handling DnD finalize in Column:', error);
			updateError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		}
	} /**
	 * Handles click on a collection item, navigating to its edit page.
	 * @param item The DndItem (collection) to navigate to.
	 */
	async function handleCollectionClick(item: Pick<DndItem, 'path'>) {
		try {
			isUpdating = true; // Indicate loading/updating state
			setMode('edit');
			await goto(`/config/collectionbuilder/edit${item.path}`);
		} catch (error) {
			console.error('Error navigating to collection:', error);
			updateError = error instanceof Error ? error.message : 'Error navigating to collection';
		} finally {
			isUpdating = false;
		}
	}

	// Handles click on a category item, opening the edit category modal.
	function handleCategoryEdit() {
		onEditCategory(item);
	}
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
				<iconify-icon icon="mdi:drag" width="18" class="cursor-grab opacity-50" role="button" aria-label="Drag to reorder"></iconify-icon>
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
				<iconify-icon icon="mdi:drag" width="18" class="cursor-grab opacity-50" role="button" aria-label="Drag to reorder"></iconify-icon>
				<iconify-icon {icon} width="18" class="text-error-500" aria-hidden="true"></iconify-icon>
				<span class="text-black dark:text-white">{name}</span>
			</div>
			<button onclick={() => handleCollectionClick({ path })} aria-label={`Edit collection ${name}`} disabled={isUpdating}>
				<iconify-icon icon="mdi:pen" width="18"></iconify-icon>
			</button>
		</div>
	{/if}

	<!-- Categories always have a drop zone for nesting, even if empty -->
	<!-- Collections only show drop zone if they have children -->
	{#if isCategory || (children && children.length > 0)}
		<section
			use:dndzone={{
				items: children || [],
				flipDurationMs,
				centreDraggedOnCursor: true,
				dropTargetStyle: { outline: 'rgba(0, 255, 102, 0.7) solid 2px' }
			}}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
			class={isCategory ? 'min-h-[60px] rounded border-2 border-dashed border-surface-400/20 py-1' : 'min-h-10 py-1'}
			role="list"
			aria-label={`${isCategory ? 'Category' : 'Collection'} children`}
		>
			{#if children && children.length > 0}
				{#each children as child (child.id)}
					<div animate:flip={{ duration: flipDurationMs }} class="mx-0.5 p-0.5">
						<Column
							item={child}
							children={child.children ?? []}
							level={level + 1}
							isCategory={child.nodeType === 'category'}
							{onNodeReorder}
							{onEditCategory}
						/>
					</div>
				{/each}
			{:else if isCategory}
				<!-- Empty state for categories to show they can accept items -->
				<div class="flex items-center justify-center py-4 text-sm italic text-surface-400">Drop items here</div>
			{/if}
		</section>
	{/if}
</div>

<!-- 
@files src/routes/(app)/config/collection/Column.svelte
@description This component displays a collection with nested items support.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { CategoryData } from '@src/collections/types';

	// Stores
	import { mode, categories } from '@stores/collectionStore';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	export let name: string;
	export let icon: string;
	export let items: any[] = [];
	export let level = 0;
	export let onUpdate: (items: any[]) => void;
	export let isCategory = false;
	export let onEditCategory: (category: Pick<CategoryData, 'name' | 'icon'>) => void;

	const flipDurationMs = 200;

	function handleDndConsider(e: CustomEvent<{ items: any[] }>) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: any[] }>) {
		items = e.detail.items;
		onUpdate(items);
	}

	function handleCollectionClick(item: any) {
		mode.set('edit');
		goto(`/config/collectionbuilder/${item.name}`);
	}

	function handleCategoryEdit() {
		onEditCategory({ name, icon });
	}

	$: paddingLeft = level === 0 ? '0' : `${level * 1.5}rem`;

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import ModalAddCategory from './ModalCategory.svelte';

	// Modal
	async function editCategory(category: Pick<CategoryData, 'name' | 'icon'>): Promise<void> {
		const modalComponent: ModalComponent = {
			ref: ModalAddCategory,
			props: {
				existingCategory: category
			}
		};
		const d: ModalSettings = {
			type: 'component',
			title: m.column_edit_category(),
			body: m.column_modify_category(),
			component: modalComponent,
			response: async (updatedCategory) => {
				if (updatedCategory) {
					try {
						// Update local store
						categories.update((cats) => {
							const newCategories = { ...cats };
							Object.keys(newCategories).forEach((key) => {
								if (newCategories[key].name === category.name) {
									newCategories[key] = {
										...newCategories[key],
										name: updatedCategory.newCategoryName,
										icon: updatedCategory.newCategoryIcon
									};
								}
							});
							return newCategories;
						});

						// Persist to backend
						const response = await fetch('/api/save-categories', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify($categories)
						});

						if (!response.ok) {
							throw new Error('Failed to save category changes');
						}
					} catch (error) {
						console.error('Error saving category:', error);
						alert('Failed to save category changes. Please try again.');

						// Revert store changes on error
						categories.update((cats) => {
							const newCategories = { ...cats };
							Object.keys(newCategories).forEach((key) => {
								if (newCategories[key].name === updatedCategory.newCategoryName) {
									newCategories[key] = {
										...newCategories[key],
										name: category.name,
										icon: category.icon
									};
								}
							});
							return newCategories;
						});
					}
				}
			}
		};

		modalStore.trigger(d);
	}
</script>

<div class="my-1 w-full" style="padding-left: {paddingLeft}">
	{#if isCategory}
		<div class="flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" />
				<iconify-icon {icon} width="18" class="text-error-500" />
				<span class="font-bold text-tertiary-500 dark:text-primary-500">{name}</span>
			</div>

			<button on:click={handleCategoryEdit} aria-label="Edit">
				<iconify-icon icon="mdi:pen" width="18" class="text-tertiary-500 dark:text-primary-500" />
			</button>
		</div>
	{:else}
		<div class="my-0.5 flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" />
				<iconify-icon {icon} width="18" class="text-error-500" />
				<span class="text-black dark:text-white">{name}</span>
			</div>
			<button on:click={() => handleCollectionClick({ name })} aria-label="Edit">
				<iconify-icon icon="mdi:pen" width="18" />
			</button>
		</div>
	{/if}

	{#if items?.length > 0}
		<div class="min-h-[2em] w-full" use:dndzone={{ items, flipDurationMs }} on:consider={handleDndConsider} on:finalize={handleDndFinalize}>
			{#each items as item (item.id)}
				<div animate:flip={{ duration: flipDurationMs }} class="w-full">
					<svelte:self
						name={item.name}
						icon={item.icon}
						items={item.items || []}
						level={level + 1}
						isCategory={item.isCategory}
						onUpdate={(newItems) => {
							item.items = newItems;
							onUpdate(items);
						}}
						{onEditCategory}
					/>
				</div>
			{/each}
		</div>
	{/if}
</div>

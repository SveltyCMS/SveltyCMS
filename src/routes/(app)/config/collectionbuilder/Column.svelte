<!-- 
@files src/routes/(app)/config/collection/Column.svelte
@description This component displays a collection with nested items support.
-->
<script lang="ts">
	import { goto } from '$app/navigation';

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
	export let onEditCategory: (category: { name: string; icon: string }) => void;

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

		// Navigate to the route for viewing the collection's details
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
	function editCategory(category: any): void {
		const modalComponent: ModalComponent = {
			ref: ModalAddCategory,
			props: {
				existingCategory: category // Pass the entire category object
			}
		};
		const d: ModalSettings = {
			type: 'component',
			title: m.column_edit_category(),
			body: m.column_modify_category(),
			component: modalComponent,
			response: (updatedCategory) => {
				const categoryToEdit = currentCategories.filter((cat: any) => cat.name === category.name);
				if (updatedCategory) {
					if (categoryToEdit.length > 0) {
						categories.update((category) => {
							return category.map((existingCategory) => {
								if (existingCategory.name === categoryToEdit[0].name) {
									existingCategory.name = updatedCategory.newCategoryName;
									existingCategory.icon = updatedCategory.newCategoryIcon;
								}
								return existingCategory;
							});
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
				<iconify-icon icon="mdi:grid" width="18" class="opacity-50" />
				<iconify-icon {icon} width="18" class="text-error-500" />
				<span class="font-bold text-primary-500 dark:text-tertiary-500">{name}</span>
			</div>
			<div class="flex items-center gap-2">
				<button class="opacity-50 hover:opacity-100" on:click={handleCategoryEdit}>
					<iconify-icon icon="mdi:pen" width="18" />
				</button>
				<iconify-icon icon="mdi:dots-vertical" width="18" />
			</div>
		</div>
	{:else}
		<div class="my-0.5 flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" />
				<iconify-icon {icon} width="18" class="text-error-500" />
				<span class="text-black dark:text-white">{name}</span>
			</div>
			<button class="opacity-50 hover:opacity-100" on:click={() => handleCollectionClick({ name })}>
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

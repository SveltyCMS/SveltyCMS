<script lang="ts">
	// Stores
	import { mode, categories } from '@stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { goto } from '$app/navigation';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 200;
	function handleDndConsiderCards(e: any) {
		//console.warn('got', name);
		items = e.detail.items;
	}

	function handleDndFinalizeCards(e: any) {
		//console.warn('drop', name);
		onDrop(e.detail.items);
	}

	function handleCollectionClick(item: any) {
		// Define the logic for handling the click on a collection
		mode.set('edit');
		// collection.set(item.collections);
		goto(`/collection/${item.name}`);
	}

	export let currentCategories: any;

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

	export let name: string;
	export let items: any;
	export let icon: string;
	export let onDrop: any;
</script>

<div class="relative h-full w-full overflow-hidden">
	<!-- Column Categories -->
	<div class="flex h-10 items-center font-bold">
		<iconify-icon {icon} width="18" />
		<span class="dark:text-primary-500 ltr:ml-2 rtl:mr-2">{name}</span>
	</div>
	<div class="absolute top-2 flex ltr:right-1 rtl:left-1">
		<button class="text-black" on:click={() => editCategory({ name, icon })} aria-label="Edit Category">
			<iconify-icon icon="mdi:pen" width="18" class="hover:text-error-500 dark:text-white" />
		</button>
		<iconify-icon icon="mdi:drag" width="18" class="" />
	</div>
	<div
		class="h-[calc(100%-2.5em)] min-h-[1em] overflow-y-scroll ltr:-mr-2 rtl:-ml-2"
		use:dndzone={{ items: items, flipDurationMs, zoneTabIndex: -1 }}
		on:consider={handleDndConsiderCards}
		on:finalize={handleDndFinalizeCards}
	>
		<!-- Column Collections -->
		{#each items as item (item.id)}
			<div
				class="my-1 flex h-10 w-full items-center justify-between rounded-sm border border-surface-700 bg-surface-300 py-2 text-center text-xs font-bold hover:bg-surface-400 dark:text-white"
				animate:flip={{ duration: flipDurationMs }}
			>
				<iconify-icon icon="mdi:drag" width="18" class="ltr:pl-0.5 rtl:pr-0.5" />

				<span class="break-word flex items-center gap-2">
					<iconify-icon icon={item.icon} width="18" class="text-error-500" />
					{item.name}</span
				>

				<button class="btn" on:click={() => handleCollectionClick(item)}>
					<iconify-icon icon="mdi:pen" width="18" class="text-surface-500 hover:text-error-500" />
				</button>
			</div>
		{/each}
	</div>
</div>

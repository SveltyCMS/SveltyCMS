<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { goto } from '$app/navigation';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte'

	//skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import ModalAddCategory from './ModalCategory.svelte';
	import { currentCollection } from '@src/stores/store';

	function editCategory(category: any): void {
		const modalComponent: ModalComponent = {
			ref: ModalAddCategory,
			props: {
				existingCategory: category // Pass the entire category object
			}
		};

		const d: ModalSettings = {
			type: 'component',
			title: $LL.MODAL_Category_Title(),
			body: $LL.MODAL_Category_Body(),
			component: modalComponent,
			response: (updatedCategory) => {
				// Handle the response here
				category.name = updatedCategory.newCategoryName;
				category.icon = updatedCategory.newCategoryIcon;
			}
		};

		modalStore.trigger(d);
	}

	const flipDurationMs = 200;
	export let name: string;
	export let items: any;
	export let icon: string;
	export let onDrop: any;

	function handleDndConsiderCards(e) {
		//console.warn('got', name);
		items = e.detail.items;
	}

	function handleDndFinalizeCards(e) {
		//console.warn('drop', name);
		onDrop(e.detail.items);
	}

	function handleCollectionClick(collectionName: string) {
		// Define the logic for handling the click on a collection
		goto(`/collection/${collectionName}/edit`);
	}
</script>

<div class="relative h-full w-full overflow-hidden">
	<!-- Column Categories -->
	<div class="flex h-10 items-center font-bold">
		<iconify-icon {icon} width="18" />
		<span class="ml-2 dark:text-primary-500">{name}</span>
	</div>
	<div class="absolute right-1 top-2 flex">
		<button class="text-black" on:click={() => editCategory({ name, icon })} aria-label="Edit Category">
			<iconify-icon icon="mdi:pen" width="18" class="text-surface-400" />
		</button>
		<iconify-icon icon="mdi:drag" width="18" class="" />
	</div>
	<div
		class="-mr-2 h-[calc(100%-2.5em)] min-h-[1em] overflow-y-scroll"
		use:dndzone={{ items, flipDurationMs, zoneTabIndex: -1 }}
		on:consider={handleDndConsiderCards}
		on:finalize={handleDndFinalizeCards}
	>
		<!-- Column Collections -->
		{#each items as item (item.id)}
			<div
				class="my-1 flex h-10 w-full items-center justify-between rounded-sm border border-surface-700 bg-surface-300 py-2 text-center text-xs font-bold hover:bg-surface-400 dark:text-white"
				animate:flip={{ duration: flipDurationMs }}
			>
				<iconify-icon icon="mdi:drag" width="18" class=" pl-0.5" />

				<span class="break-word flex items-center gap-2">
					<iconify-icon icon={item.icon} width="18" class="text-error-500" />
					{item.name}</span
				>

				<button class="text-surface-400" on:click={() => handleCollectionClick(item.name)}>
					<iconify-icon icon="mdi:pen" width="18" class="pr-0.5" />
				</button>
			</div>
		{/each}
	</div>
</div>

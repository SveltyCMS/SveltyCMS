<script lang="ts">
	import type { Schema } from '$src/collections/types';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { storePopup } from '@skeletonlabs/skeleton';
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';
	import Icon from '@iconify/svelte';
	import { shape_fields } from '$src/lib/utils/utils_svelte';
	import showFieldsStore from '$src/lib/stores/fieldStore';
	import { createEventDispatcher } from 'svelte';
	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });
	const dispatch = createEventDispatcher();

	let categoriesPopup: PopupSettings[] = [];

	export let switchSideBar = false;
	export let filterCollections: string;
	export let collection: Schema;
	export let category = '';
	export let fields: Array<any>;

	export let data: Array<any>;

	$: filtered =
		data &&
		data.map((category) => {
			categoriesPopup.push({
				event: 'click',
				target: category.category,
				placement: 'bottom',
				closeQuery: '.listbox-item'
			});
			return {
				category: category.category,
				icon: category.icon,
				collections: category.collections.filter((collection: any) =>
					collection.name.toLowerCase().includes(filterCollections)
				)
			};
		});
</script>

{#each filtered as item, index}
	{#if switchSideBar}
		<!-- Desktop Collection Parent -->
		<button
			class="btn variant-filled w-48  mb-1 justify-between"
			use:popup={categoriesPopup[index]}
		>
			<span class="capitalize">
				<Icon icon={item.icon} width="24" class="text-error-600" />
			</span>
			<span class="capitalize">{item.category}</span>
			<span>
				<Icon icon={'fa-caret-down'} class="opacity-50" />
			</span>
		</button>
		{console.log(categoriesPopup[index])}
		{console.log(item.category)}

		<!-- Desktop Collection Childern -->
		<div class="card w-48 shadow-xl overflow-hidden " data-popup={item.category}>
			<ListBox padding="px-4 py-1" rounded="rounded-none" class="divide-surface-400 divide-y-2">
				{#each item.collections as _collection, collection_index}
					<ListBoxItem
						bind:group={item.category}
						name={_collection.name}
						value={_collection.name}
						on:click={async () => {
							$showFieldsStore.showField = true;
							dispatch('collection_click', { category_index: index, collection_index });
						}}
						class="hover:!bg-error-200"
					>
						<svelte:fragment slot="lead">
							<Icon icon={_collection.icon} width="24" class="text-error-600" />
						</svelte:fragment>
						{_collection.name}
					</ListBoxItem>
				{/each}
			</ListBox>
		</div>
	{:else}
		<!-- Collapsed/Mobile Collection Parent -->
		<button class="btn variant-filled mb-2 justify-between p-2" use:popup={categoriesPopup[index]}>
			<span class="capitalize">
				<Icon icon={item.icon} width="24" class="text-error-600" />
			</span>
			<span>
				<Icon icon={'fa-caret-down'} class="opacity-50" />
			</span>
		</button>
		<!-- Collapsed/Mobile Collection Child -->
		<div class="card shadow-xl overflow-hidden" data-popup={item.category}>
			<ListBox padding="p-0" rounded="rounded-none">
				{#each item.collections as _collection}
					<ListBoxItem
						bind:group={item.category}
						name={_collection.name}
						value={_collection.name}
						class="px-0 py-0 flex justify-center items-center flex-col hover:bg-[#65dfff] h-[50px] overflow-clip truncate text-clip text-[9px] switchSideBar-listbox"
					>
						{_collection.name}
						<svelte:fragment slot="lead">
							<Icon icon={_collection.icon} width="24" class="text-error-600 mb-2" />
						</svelte:fragment>
					</ListBoxItem>
				{/each}
			</ListBox>
		</div>
	{/if}
{/each}

<style>
	:global(.switchSideBar-listbox .listbox-label) {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 50px;
		overflow: clip;
		padding: 5px;
	}

	:global(.switchSideBar-listbox .listbox-label-content) {
		margin: 0 !important;
	}
</style>

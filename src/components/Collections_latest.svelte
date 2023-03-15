<script lang="ts">
	// Skeleton
	import { Accordion, AccordionItem } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { storePopup } from '@skeletonlabs/skeleton';
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';

	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });

	const dispatch = createEventDispatcher();
	import { createEventDispatcher } from 'svelte';

	let categoriesPopup: PopupSettings[] = [];

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	import type { Schema } from '$src/collections/types';

	// import { shape_fields } from '$src/lib/utils/utils_svelte';
	import showFieldsStore from '$src/lib/stores/fieldStore';

	export let switchSideBar = false;
	export let filterCollections: string;
	export let collection: Schema;
	export let category = '';
	export let fields: Array<any>;
	export let data: Array<any>;

	// search colletions filter
	$: filtered =
		data &&
		data.map((category) => {
			categoriesPopup.push({
				event: 'click',
				target: category.category,
				placement: 'right',
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

<Accordion
	autocollapse
	spacing="space-y-4 w-full"
	regionPanel="px-0"
	regionControl="bg-surface-200 dark:bg-surface-500"
>
	{#each filtered as item, index}
		{#if switchSideBar}
			<!-- Desktop Collection Parent -->
			<!-- TODO On search display ALL results -->
			<!-- TODO Fix onclick for first Open to Close as well -->
			<AccordionItem open={index === 0} data-popup={item.category}>
				<!-- Category Icon -->
				<svelte:fragment slot="lead">
					<Icon icon={item.icon} width="24" class="text-error-600" />
				</svelte:fragment>

				<!-- Category name -->
				<svelte:fragment slot="summary">
					<p class="uppercase">{item.category}</p>
				</svelte:fragment>

				<!-- Desktop Collection Childern -->
				<svelte:fragment slot="content">
					<ListBox rounded="rounded-none" class="divide-surface-400 divide-y">
						{#each item.collections as _collection, collection_index}
							<ListBoxItem
								bind:group={item.category}
								name={_collection.name}
								value={_collection.name}
								on:click={async () => {
									$showFieldsStore.showField = true;
									dispatch('collection_click', { category_index: index, collection_index });
								}}
								class="hover:!bg-surface-400 w-full"
							>
								<svelte:fragment slot="lead">
									<Icon icon={_collection.icon} width="24" class="text-error-600" />
								</svelte:fragment>
								{_collection.name}
							</ListBoxItem>
						{/each}
					</ListBox>
				</svelte:fragment>
			</AccordionItem>
			<div class="card variant-filled-secondary" data-popup={item.category}>
				Some text goes here.
				<!-- Append the arrow element -->
				<div class="arrow variant-filled-secondary" />
			</div>
		{:else}
			<!-- Mobile Collection Parent -->
			<AccordionItem open={index === 0} padding="py-2 px-4">
				<!-- Category Icon -->
				<svelte:fragment slot="lead">
					<Icon icon={item.icon} width="24" class="text-error-600" />
				</svelte:fragment>

				<!-- Category name -->
				<svelte:fragment slot="summary">
					<p class="uppercase hidden ">{item.category}</p>
				</svelte:fragment>

				<!-- Mobile Collection Childern -->
				<svelte:fragment slot="content">
					<ListBox rounded="rounded-none" class="divide-y space-y-0">
						{#each item.collections as _collection, collection_index}
							<ListBoxItem
								bind:group={item.category}
								name={_collection.name}
								value={_collection.name}
								on:click={async () => {
									$showFieldsStore.showField = true;
									dispatch('collection_click', { category_index: index, collection_index });
								}}
								class="flex justify-center items-center hover:!bg-surface-400"
							>
								<div class="overflow-clip truncate text-clip text-[9px]">{_collection.name}</div>
								<Icon icon={_collection.icon} width="24" class="text-error-600 mb-2 m-auto" />
							</ListBoxItem>
						{/each}
					</ListBox>
				</svelte:fragment>
			</AccordionItem>
		{/if}
	{/each}
</Accordion>

<style>
	/* :global(.accordion-control) {
		background-color: #fff;
		color: black;
	} */
</style>

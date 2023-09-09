<script lang="ts">
	import { mode, screenWidth, toggleLeftSidebar, collection, categories } from '@src/stores/store';
	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';

	let user: User = $page.data.user;

	export let modeSet: typeof $mode = 'view';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	//skeleton
	import { Accordion, AccordionItem } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { get } from 'svelte/store';

	const popupCollections: PopupSettings = {
		event: 'hover',
		target: 'popupHover',
		placement: 'right'
	};

	// Search Collections
	let search = '';

	interface Category {
		id: number;
		name: string;
		icon: string;
		collections: Collection[];
		open?: boolean;
	}

	interface Collection {
		id: number;
		name: string;
		permissions?: any;
		icon?: string;
		slug?: string;
		fields: any[];
		strict?: boolean;
		status?: 'published' | 'unpublished' | 'draft' | 'schedule' | 'cloned';
	}

	// Define filteredCategories variable as an array of Category objects
	let filteredCategories: Category[] = ($categories as Category[]) || [];

	// Define filterCategories function
	function filterCategories() {
		// Reduce $categories array to create new array of filtered categories
		filteredCategories = ($categories as Category[]).reduce((acc: Category[], category) => {
			// Filter collections in current category by name
			const filteredCollections = category.collections.filter((collection) =>
				collection.name.toLowerCase().includes(search.toLowerCase())
			);
			// Add new category object to accumulator with filtered collections and open property set to true if search is not empty
			if (
				filteredCollections.length > 0 ||
				(search === '' && category.name.toLowerCase().includes(search.toLowerCase()))
			) {
				// Add new category object to accumulator with filtered collections and open property set to true if search is not empty
				acc.push({
					...category,
					collections: filteredCollections,
					open: filteredCollections.length > 0 && search !== ''
				});
			}
			// Return accumulator
			return acc;
		}, []);
	}
</script>

<!-- displays all collection parents and their Children as accordion -->
<div class="mt-2">
	<!-- Search -->
	{#if $toggleLeftSidebar === 'collapsed'}
		<!-- show the search icon button -->
		<button
			type="button"
			on:click={() => {
				toggleLeftSidebar.click('full');
				// searchShow = true;
			}}
			class="variant-filled-surface btn mb-2 w-full"
		>
			<iconify-icon icon="ic:outline-search" width="24" />
		</button>
	{:else}
		<!-- show the expanding search input -->
		<input
			type="text"
			bind:value={search}
			on:input={filterCategories}
			placeholder={$LL.SBL_Search()}
			class="input variant-outline-surface mb-2 w-full border !border-surface-400"
		/>
	{/if}

	<!-- TODO: Apply Tooltip for collapsed  -->
	<Accordion regionControl="bg-surface-500 uppercase text-white hover:!bg-surface-400">
		<!-- Collection Parents -->
		{#each filteredCategories as category}
			<AccordionItem
				bind:open={category.open}
				regionPanel={`divide-y divide-black my-0 ${
					category.collections.length > 5
						? $toggleLeftSidebar === 'full'
							? 'max-h-72'
							: 'max-h-[256px]'
						: ''
				} overflow-y-auto`}
				class="divide-y rounded-md bg-surface-100 dark:bg-surface-300"
			>
				<svelte:fragment slot="lead">
					<!-- TODO: Tooltip not fully working -->
					<iconify-icon
						icon={category.icon}
						width="24"
						class="text-error-500"
						use:popup={popupCollections}
					/>
				</svelte:fragment>

				<svelte:fragment slot="summary"
					>{#if $toggleLeftSidebar === 'full'}
						<!-- TODO: Translation not updating -->
						<p>{category.name}</p>
					{/if}
					<div class="card variant-filled-secondary p-4" data-popup="popupHover">
						<p>{category.name}</p>
						<div class="variant-filled-secondary arrow" />
					</div>
				</svelte:fragment>

				<!-- Collection Children -->
				<svelte:fragment slot="content">
					<!-- filtered by User Role Permission -->
					{#each category.collections.filter((c) => c?.permissions?.[user?.role]?.read != false) as _collection, index}
						{#if $toggleLeftSidebar === 'full'}
							<!-- switchSideBar expanded -->
							<div
								role="button"
								tabindex={index}
								class="-mx-4 flex flex-row items-center py-1 pl-3 hover:bg-surface-400 hover:text-white dark:text-black hover:dark:text-white"
								on:keydown
								on:click={() => {
									mode.set(modeSet);
									collection.set(_collection);
								}}
							>
								<iconify-icon icon={_collection.icon} width="24" class="px-2 py-1 text-error-600" />
								<p class="mr-auto text-center capitalize">{_collection.name}</p>
							</div>
						{:else}
							<!-- switchSideBar collapsed -->
							<div
								role="button"
								tabindex={index}
								class="-mx-4 flex flex-col items-center py-1 hover:bg-surface-400 hover:text-white dark:text-black hover:dark:text-white"
								on:keydown
								on:click={() => {
									mode.set(modeSet);
									collection.set(_collection);
								}}
							>
								<p class="text-xs capitalize">{_collection.name}</p>
								<iconify-icon icon={_collection.icon} width="24" class="text-error-600" />
							</div>
						{/if}
					{/each}
				</svelte:fragment>
			</AccordionItem>
		{/each}
	</Accordion>

	<!-- Gallery -->
	{#if $toggleLeftSidebar === 'full'}
		<!-- switchSideBar expanded -->
		<a
			href="/mediagallery"
			class="btn mt-1.5 flex flex-row items-center justify-start bg-surface-600 py-2 pl-2 text-white"
			on:click={() => {
				if (get(screenWidth) === 'mobile') {
					toggleLeftSidebar.clickBack();
				}
			}}
		>
			<iconify-icon icon="bi:images" width="24" class="px-2 py-1 text-primary-600" />
			<p class="mr-auto text-center uppercase">{$LL.CollectionCategory_Media()}</p>
		</a>
	{:else}
		<!-- switchSideBar collapsed -->
		<a
			href="/mediagallery"
			class="variant-filled-surface btn mt-2 flex flex-col items-center py-1 pl-2"
			on:click={() => {
				if (get(screenWidth) === 'mobile') {
					toggleLeftSidebar.clickBack();
				}
			}}
		>
			<p class="text-xs uppercase">{$LL.CollectionCategory_Media()}</p>
			<iconify-icon icon="bi:images" width="24" class="text-primary-600" />
		</a>
	{/if}
</div>

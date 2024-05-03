<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { goto, pushState } from '$app/navigation';

	// Stores
	import { page } from '$app/stores';
	import { mode, collection, categories, headerActionButton, shouldShowNextButton } from '@stores/store';
	import { handleSidebarToggle, screenWidth, sidebarState, toggleSidebar } from '@stores/sidebarStore';
	import { get } from 'svelte/store';

	// Auth
	import type { User } from '@src/auth/types';
	const user: User = $page.data.user;

	export let modeSet: typeof $mode = 'view';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Accordion, AccordionItem } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	const popupCollections: PopupSettings = {
		event: 'hover',
		target: 'popupHover',
		placement: 'right'
	};

	// Search Collections
	let search = '';
	let searchShow = false;

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
	function filterCategories(search: any, categories: any) {
		// Reduce $categories array to create new array of filtered categories
		filteredCategories = categories.reduce((acc: any, category: any) => {
			// Filter collections in current category by name
			const filteredCollections = category.collections.filter((collection: any) => {
				// Check if collection and collection.name are not undefined before accessing the name property
				return collection && collection.name && collection.name.toLowerCase().includes(search.toLowerCase());
			});

			// Add new category object to accumulator with filtered collections and open property set to true if search is not empty
			if (filteredCollections.length > 0 || (search === '' && category.name.toLowerCase().includes(search.toLowerCase()))) {
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

		// Filter out categories with no visible collections
		filteredCategories = filteredCategories.filter((category) => category.collections.length > 0);

		// Return filtered categories
		return filteredCategories;
	}
</script>

<!-- displays all collection parents and their Children as accordion -->
<div class="mt-2 overflow-y-auto">
	<!-- Search -->
	{#if $sidebarState.left === 'collapsed'}
		<button
			type="button"
			on:click={() => {
				if (get(screenWidth) === 'mobile') {
					toggleSidebar('left', 'hidden');
				} else {
					sidebarState.update((state) => ({ ...state, left: 'full' }));
				}
				searchShow = true;
			}}
			class="input btn mb-2 w-full"
		>
			<iconify-icon icon="ic:outline-search" width="24" />
		</button>
	{:else}
		<div class="input-group input-group-divider mb-2 grid grid-cols-[auto_1fr_auto]">
			<input
				type="text"
				placeholder={m.collections_search()}
				bind:value={search}
				on:input={(e) => {
					filterCategories(e.currentTarget.value, $categories);
				}}
				on:keydown={(e) => e.key === 'Enter'}
				on:focus={() => (searchShow = false)}
				class="input h-12 w-64 outline-none transition-all duration-500 ease-in-out"
			/>
			{#if search}
				<button
					on:click={() => {
						search = '';
						filterCategories('', $categories);
					}}
					on:keydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							search = '';
							filterCategories('', $categories);
						}
					}}
					class="variant-filled-surface w-12"
				>
					<iconify-icon icon="ic:outline-search-off" width="24" />
				</button>
			{/if}
		</div>
	{/if}

	<!-- TODO: Apply Tooltip for collapsed  -->
	<Accordion autocollapse regionControl="btn bg-surface-400 dark:bg-surface-500 uppercase text-white hover:!bg-surface-300">
		<!-- Collection Parents -->
		{#each filteredCategories as category}
			<AccordionItem
				bind:open={category.open}
				regionPanel={`divide-y dark:divide-black my-0  overflow-y-auto`}
				class="divide-y rounded-md bg-surface-300 dark:divide-black "
			>
				<svelte:fragment slot="lead">
					<!-- TODO: Tooltip not fully working -->
					<iconify-icon icon={category.icon} width="24" class="text-error-500 rtl:ml-2" use:popup={popupCollections} />
				</svelte:fragment>

				<svelte:fragment slot="summary">
					{#if $sidebarState.left === 'full'}
						<!-- TODO: Translation not updating -->
						<p class="text-white">{category.name}</p>
					{/if}
					<div class="card variant-filled-secondary p-4" data-popup="popupHover">
						<p>{category.name}</p>
						<div class="variant-filled-secondary arrow" />
					</div>
				</svelte:fragment>

				<!-- Collection Children -->
				<svelte:fragment slot="content">
					<!-- filtered by User Role Permission -->

					{#each category.collections.filter((c) => modeSet == 'edit' || c?.permissions?.[user.role]?.read != false) as _collection, index}
						{#if $sidebarState.left === 'full'}
							<!-- switchSideBar expanded -->
							<div
								role="button"
								tabindex={index}
								class="-mx-4 flex flex-row items-center bg-surface-300 py-1 pl-3 hover:bg-surface-400 hover:text-white dark:text-black hover:dark:text-white"
								on:keydown
								on:click={() => {
									if ($mode === 'edit') {
										mode.set('view');
										handleSidebarToggle();
									} else {
										mode.set(modeSet);
										handleSidebarToggle();
										shouldShowNextButton.set(true);
									}

									collection.set({
										..._collection,
										icon: _collection.icon || 'default-icon' // Provide a default icon value if icon is undefined
									});
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
									if ($mode === 'edit') {
										mode.set('view');
										handleSidebarToggle();
									} else {
										mode.set(modeSet);
										handleSidebarToggle();
									}

									collection.set({
										..._collection,
										icon: _collection.icon || 'default-icon' // Provide a default icon value if icon is undefined
									});
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
	{#if $sidebarState.left === 'full'}
		<!-- switchSideBar expanded -->
		<button
			class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
			on:click={() => {
				mode.set('media');
				// Navigate to the media gallery route
				goto('/mediagallery');
				// Optionally, close the sidebar if it's on mobile
				if (get(screenWidth) === 'mobile') {
					toggleSidebar('left', 'hidden');
				}
			}}
		>
			<iconify-icon icon="bi:images" width="24" class="px-2 py-1 text-primary-600 rtl:ml-2" />
			<p class="mr-auto text-center uppercase">{m.Collections_MediaGallery()}</p>
		</button>
	{:else}
		<!-- switchSideBar collapsed -->
		<button
			class="btn mt-2 flex w-full flex-col items-center bg-surface-400 py-1 pl-2 hover:!bg-surface-400 hover:text-white dark:bg-surface-500 dark:text-white"
			on:click={() => {
				mode.set('media');
				// Navigate to the media gallery route
				goto('/mediagallery');
				// Optionally, close the sidebar if it's on mobile
				handleSidebarToggle();
				if (get(screenWidth) === 'mobile') {
					toggleSidebar('left', 'hidden');
				}
			}}
		>
			<p class="text-xs uppercase text-white">{m.Collections_MediaGallery()}</p>
			<iconify-icon icon="bi:images" width="24" class="text-primary-500" />
		</button>
	{/if}
</div>

<!-- 
@file src/components/Collections.svelte
@description Collections component with support for nested categories.
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Stores
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { shouldShowNextButton } from '@stores/store';
	import { mode, collection, categories } from '@stores/collectionStore';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';

	// Types
	import type { Schema, CollectionNames, Category, FilteredCategory } from '@src/collections/types';

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

	// Import VirtualFolders component
	import VirtualFolders from '@components/VirtualFolders.svelte';

	// Search Collections
	let search = '';
	let searchShow = false;

	let filteredCategories: FilteredCategory[] = [];

	// Define filterCategories function with support for nested categories
	function filterCategories(search: string, categories: Category[]): FilteredCategory[] {
		if (!categories || !Array.isArray(categories)) {
			console.debug('Categories is not an array:', categories);
			return [];
		}

		// Helper function to get category level from path
		function getCategoryLevel(path: string): number {
			return path.split('/').length - 1;
		}

		// Reduce categories array to create new array of filtered categories
		const filtered = categories.reduce((acc: FilteredCategory[], category: Category) => {
			// Filter collections in current category by name
			const filteredCollections = category.collections.filter((collection: Schema) => {
				return collection && collection.name && collection.name.toLowerCase().includes(search.toLowerCase());
			});

			// Add category if it matches search or has matching collections
			if (filteredCollections.length > 0 || (search === '' && category.name.toLowerCase().includes(search.toLowerCase()))) {
				acc.push({
					...category,
					collections: filteredCollections,
					open: filteredCollections.length > 0 && search !== '',
					level: getCategoryLevel(category.name)
				});
			}

			return acc;
		}, []);

		// Sort categories by level and then by order
		filtered.sort((a, b) => {
			if (a.level === b.level) {
				return a.order - b.order;
			}
			return (a.level || 0) - (b.level || 0);
		});

		console.debug('Filtered categories:', filtered);
		return filtered;
	}

	// Subscribe to categories store changes
	$: {
		console.debug('Categories store value:', $categories);
		if ($categories && Array.isArray($categories)) {
			filteredCategories = filterCategories(search, $categories);
			console.debug('Filtered categories after update:', filteredCategories);
		}
	}

	// Determine if the current mode is 'media'
	$: isMediaMode = $mode === 'media';

	onMount(() => {
		console.debug('Component mounted, initial categories:', $categories);
		if ($categories && Array.isArray($categories)) {
			filteredCategories = filterCategories(search, $categories);
		}
	});

	// Helper function to get indentation class based on level
	function getIndentClass(level: number = 0): string {
		return `pl-${level * 4}`;
	}
</script>

<!-- displays all collection parents and their Children as accordion -->
<div class="mt-2 overflow-y-auto">
	{#if !isMediaMode}
		<!-- Search -->
		{#if $sidebarState.left === 'collapsed'}
			<button
				type="button"
				on:click={() => {
					if (get(screenSize) === 'sm') {
						toggleSidebar('left', 'hidden');
					} else {
						sidebarState.update((state) => ({ ...state, left: 'full' }));
					}
					searchShow = true;
				}}
				class="input btn mb-2 w-full"
				aria-label="Search Collections"
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
						aria-label="Clear search"
					>
						<iconify-icon icon="ic:outline-search-off" width="24" />
					</button>
				{/if}
			</div>
		{/if}

		<!-- Collections Accordion -->
		<Accordion autocollapse regionControl="btn bg-surface-400 dark:bg-surface-500 uppercase text-white hover:!bg-surface-300">
			<!-- Collection Parents -->
			{#if filteredCategories.length > 0}
				{#each filteredCategories as category (category.id)}
					<AccordionItem
						bind:open={category.open}
						regionPanel={`divide-y dark:divide-black my-0 overflow-y-auto`}
						class={`divide-y rounded-md bg-surface-300 dark:divide-black ${getIndentClass(category.level)}`}
					>
						<svelte:fragment slot="lead">
							<iconify-icon icon={category.icon} width="24" class="text-error-500 rtl:ml-2" use:popup={popupCollections} />
						</svelte:fragment>

						<svelte:fragment slot="summary">
							{#if $sidebarState.left === 'full'}
								<p class="text-white">{category.name.split('/').pop()}</p>
							{/if}
							<div class="card variant-filled-secondary p-4" data-popup="popupHover">
								<p>{category.name.split('/').pop()}</p>
								<div class="variant-filled-secondary arrow" />
							</div>
						</svelte:fragment>

						<!-- Collection Children -->
						<svelte:fragment slot="content">
							<!-- filtered by User Role Permission -->
							{#each category.collections.filter((c) => modeSet == 'edit' || c?.permissions?.[user?.role]?.read != false) as _collection, index}
								{#if $sidebarState.left === 'full'}
									<!-- Sidebar Expanded -->
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

											collection.set(_collection);
										}}
									>
										<iconify-icon icon={_collection.icon} width="24" class="px-2 py-1 text-error-600" />
										<p class="mr-auto text-center capitalize">{_collection.name}</p>
									</div>
								{:else}
									<!-- Sidebar Collapsed -->
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
			{:else}
				<div class="p-4 text-center text-gray-500">No collections found</div>
			{/if}
		</Accordion>

		<!-- Media Gallery Button -->
		{#if $sidebarState.left === 'full'}
			<!-- Sidebar Expanded -->
			<button
				class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
				on:click={() => {
					mode.set('media');
					// Navigate to the media gallery route
					goto('/mediagallery');
					// Optionally, close the sidebar if it's on mobile
					if (get(screenSize) === 'sm') {
						toggleSidebar('left', 'hidden');
					}
				}}
			>
				<iconify-icon icon="bi:images" width="24" class="px-2 py-1 text-primary-600 rtl:ml-2" />
				<p class="mr-auto text-center uppercase">{m.Collections_MediaGallery()}</p>
			</button>
		{:else}
			<!-- Sidebar Collapsed -->
			<button
				class="btn mt-2 flex w-full flex-col items-center bg-surface-400 py-1 pl-2 hover:!bg-surface-400 hover:text-white dark:bg-surface-500 dark:text-white"
				on:click={() => {
					mode.set('media');
					// Navigate to the media gallery route
					goto('/mediagallery');
					// Optionally, close the sidebar if it's on mobile
					handleSidebarToggle();
					if (get(screenSize) === 'sm') {
						toggleSidebar('left', 'hidden');
					}
				}}
			>
				<p class="text-xs uppercase text-white">{m.Collections_MediaGallery()}</p>
				<iconify-icon icon="bi:images" width="24" class="text-primary-500" />
			</button>
		{/if}
	{:else}
		<!-- When in media mode, display virtual folders and a 'Return to Collections' button -->
		<!-- 'Return to Collections' Button -->
		{#if $sidebarState.left === 'full'}
			<!-- Sidebar Expanded -->
			<button
				class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
				on:click={() => {
					// Switch back to collections mode
					mode.set('view'); // or the appropriate mode for collections
					// Optionally, close the sidebar if it's on mobile
					if (get(screenSize) === 'sm') {
						toggleSidebar('left', 'hidden');
					}
				}}
			>
				<iconify-icon icon="bi:collection" width="24" class="px-2 py-1 text-error-500 rtl:ml-2" />
				<p class="mr-auto text-center uppercase">Collections</p>
			</button>
		{:else}
			<!-- Display Virtual Folders -->
			<VirtualFolders />
		{/if}
	{/if}
</div>

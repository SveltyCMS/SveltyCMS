<!-- 
@file src/components/Collections.svelte
@description Collections component with support for nested categories.
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Types
	import type { Schema, CategoryData, Category } from '@src/collections/types';

	// Stores
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { shouldShowNextButton } from '@stores/store';
	import { mode, collection, categories, collections } from '@stores/collectionStore';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';

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

	interface FilteredCategoryData extends Category {
		open?: boolean;
		level?: number;
		path?: string;
	}

	let filteredCategories: FilteredCategoryData[] = [];

	// Function to get collections for a category
	function getCollectionsForCategory(path: string): Schema[] {
		return Object.values($collections).filter((col) => {
			if (!col.path) return false;
			return col.path === path;
		});
	}

	// Function to flatten and filter categories
	function filterCategories(search: string, cats: Category[]): FilteredCategoryData[] {
		if (!cats || cats.length === 0) {
			console.debug('Categories array is empty');
			return [];
		}

		// Create flattened categories with levels
		const flattened: FilteredCategoryData[] = cats.map((cat) => ({
			...cat,
			level: 0,
			open: false,
			path: cat.name
		}));

		// Filter categories based on search
		const filtered = flattened.filter((category) => {
			const nameMatch = category.name.toLowerCase().includes(search.toLowerCase());
			const collectionsMatch = category.collections?.some((col) => col.name?.toLowerCase().includes(search.toLowerCase()));
			return nameMatch || collectionsMatch || search === '';
		});

		// Sort categories by name
		filtered.sort((a, b) => a.name.localeCompare(b.name));

		return filtered;
	}

	// Subscribe to categories and collections store changes
	$: {
		if ($categories && $collections) {
			filteredCategories = filterCategories(search, $categories);
		}
	}

	// Determine if the current mode is 'media'
	$: isMediaMode = $mode === 'media';

	onMount(() => {
		if ($categories && $collections) {
			filteredCategories = filterCategories(search, $categories);
		}
	});

	// Helper function to get indentation class based on level
	function getIndentClass(level: number = 0): string {
		return `pl-${level * 4}`;
	}

	// Handle collection selection
	function handleCollectionSelect(_collection: Schema) {
		if ($mode === 'edit') {
			mode.set('view');
			handleSidebarToggle();
		} else {
			mode.set(modeSet);
			handleSidebarToggle();
			shouldShowNextButton.set(true);
		}
		collection.set(_collection);
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
								<p class="text-white">{category.name}</p>
							{/if}
							<div class="card variant-filled-secondary p-4" data-popup="popupHover">
								<p>{category.name}</p>
								<div class="variant-filled-secondary arrow" />
							</div>
						</svelte:fragment>

						<!-- Collection Children -->
						<svelte:fragment slot="content">
							{#if category.collections && category.collections.length > 0}
								{#each category.collections.filter((c) => modeSet == 'edit' || c?.permissions?.[user?.role]?.read != false) as _collection, index}
									{#if $sidebarState.left === 'full'}
										<!-- Sidebar Expanded -->
										<div
											role="button"
											tabindex={index}
											class="-mx-4 flex flex-row items-center bg-surface-300 py-1 pl-3 hover:bg-surface-400 hover:text-white dark:text-black hover:dark:text-white"
											on:keydown
											on:click={() => handleCollectionSelect(_collection)}
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
											on:click={() => handleCollectionSelect(_collection)}
										>
											<p class="text-xs capitalize">{_collection.name}</p>
											<iconify-icon icon={_collection.icon} width="24" class="text-error-600" />
										</div>
									{/if}
								{/each}
							{/if}
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
					goto('/mediagallery');
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
					goto('/mediagallery');
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
		{#if $sidebarState.left === 'full'}
			<!-- Sidebar Expanded -->
			<button
				class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
				on:click={() => {
					mode.set('view');
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

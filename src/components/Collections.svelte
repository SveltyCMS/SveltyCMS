<!-- 
@file src/components/Collections.svelte
@component
**Collections component to display & filter collections and categories.**

```tsx
<Collections />
```

@props
- `mode` - The current mode of the component. Can be 'view', 'edit', 'create', 'delete', 'modify', or 'media'.

Features: 
- display collections
- search collections with clear button
- support for nested categories with autocollapse
- responsive sidebar integration
- media gallery support
- improved subcategory search and padding	
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Types
	import type { Schema, CollectionData, Category } from '@src/collections/types';

	// Stores
	import { get } from 'svelte/store';
	import { shouldShowNextButton } from '@stores/store';
	import { mode, collection, categories, collections } from '@root/src/stores/collectionStore.svelte';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@root/src/stores/sidebarStore.svelte';
	import { screenSize } from '@root/src/stores/screenSizeStore.svelte';

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

	type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

	// Props
	let modeSet = $state<ModeType>('view');

	// Search Collections
	let search = $state('');
	let searchShow = $state(false);

	interface FilteredCategory extends Category {
		open: boolean;
		level: number;
	}

	let filteredCategories = $state<FilteredCategory[]>([]);

	// Function to flatten and filter categories with improved subcategory search
	function filterCategories(searchTerm: string, cats: Record<string, CollectionData>): FilteredCategory[] {
		if (!cats || Object.keys(cats).length === 0) return [];

		function processCategory(category: CollectionData, level: number = 0): FilteredCategory | null {
			const processed: FilteredCategory = {
				id: category.id,
				name: category.name,
				icon: category.icon,
				collections: [],
				level,
				open: searchTerm !== '', // Auto-open categories when searching
				subcategories: {}
			};

			// Process subcategories
			let hasMatchingContent = false;
			if (category.subcategories) {
				Object.entries(category.subcategories).forEach(([key, subCat]) => {
					if (subCat.isCollection) {
						const collectionSchema = collections.value[subCat.id] || collections.value[key];

						if (collectionSchema) {
							const collection = {
								...collectionSchema,
								id: subCat.id,
								name: subCat.name || collectionSchema.name, // Use the friendly name from subcategory
								icon: subCat.icon || collectionSchema.icon,
								fields: collectionSchema.fields || []
							};

							if (searchTerm === '' || (collection.name as string).toLowerCase().includes(searchTerm.toLowerCase())) {
								processed.collections.push(collection);
								hasMatchingContent = true;
							}
						}
					} else {
						const processedSub = processCategory(subCat, level + 1);
						if (processedSub) {
							processed.subcategories![key] = processedSub;
							hasMatchingContent = true;
						}
					}
				});
			}

			const searchLower = searchTerm.toLowerCase();
			const nameMatches = category.name.toLowerCase().includes(searchLower);

			return searchTerm === '' || nameMatches || hasMatchingContent ? processed : null;
		}

		// Process only root categories (Collections and Menu)
		return Object.entries(cats)
			.filter(([name]) => name === 'Collections' || name === 'Menu')
			.map(([, cat]) => processCategory(cat))
			.filter((cat): cat is FilteredCategory => cat !== null);
	}

	// Subscribe to categories and collections store changes and handle search
	$effect(() => {
		if ($categories && collections.value) {
			filteredCategories = filterCategories(search, $categories);
		}
	});

	// Handle search input
	function handleSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		search = target.value;
		filteredCategories = filterCategories(search, $categories);
	}

	// Clear search
	function clearSearch() {
		search = '';
		filteredCategories = filterCategories('', $categories);
		// Focus the search input after clearing
		const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
		if (searchInput) searchInput.focus();
	}

	// Determine if the current mode is 'media'
	let isMediaMode = $derived(mode.value === 'media');

	onMount(() => {
		if ($categories && collections.value) {
			filteredCategories = filterCategories('', $categories);
		}
	});

	// Helper function to get indentation class based on level
	function getIndentClass(level: number): string {
		return `pl-${level * 2}`; // Reduced padding for better space utilization
	}

	// Handle collection selection
	function handleCollectionSelect(_collection: Schema) {
		if (mode.value === 'edit') {
			mode.set('view');
		} else {
			mode.set(modeSet);
			shouldShowNextButton.set(true);
		}
		collection.set(_collection);
		handleSidebarToggle();
	}

	// Generate unique key for collection items
	function getCollectionKey(_collection: Schema, categoryId: string): string {
		// The collection should already have an ID from the category processing
		return `${categoryId}-${String(_collection.name)}-${_collection.id}`;
	}

	// Track open states for subcategories
	let subCategoryOpenStates = $state<Record<string, boolean>>({});

	// Handle subcategory accordion state
	function handleSubcategoryToggle(categoryId: string, subcategoryKey: string) {
		const key = `${categoryId}-${subcategoryKey}`;
		subCategoryOpenStates[key] = !subCategoryOpenStates[key];
	}

	// Handle keyboard events
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			const target = event.currentTarget as HTMLElement;
			target.click();
		}
	}
</script>

<div class="mt-2">
	{#if !isMediaMode}
		<!-- Search Input -->
		{#if sidebarState.sidebar.value.left === 'collapsed'}
			<button
				type="button"
				onclick={() => {
					if (get(screenSize) === 'sm') {
						toggleSidebar('left', 'hidden');
					} else {
						sidebarState.sidebar.update((state) => ({ ...state, left: 'full' }));
					}
					searchShow = true;
				}}
				class="input btn mb-2 w-full"
				aria-label="Search Collections"
			>
				<iconify-icon icon="ic:outline-search" width="24"></iconify-icon>
			</button>
		{:else}
			<div class="input-group input-group-divider mb-2 grid grid-cols-[1fr_auto]">
				<input
					type="text"
					placeholder={m.collections_search()}
					bind:value={search}
					oninput={handleSearch}
					onfocus={() => (searchShow = false)}
					class="input h-12 outline-none transition-all duration-500 ease-in-out"
				/>
				<button onclick={clearSearch} class="variant-filled-surface w-12" aria-label="Clear search">
					<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
				</button>
			</div>
		{/if}

		<!-- Collections Accordion -->
		<Accordion
			autocollapse
			spacing="space-y-1"
			rounded="rounded-container-token"
			padding="py-2 px-4"
			regionControl="btn bg-surface-400 dark:bg-surface-500 uppercase text-white hover:!bg-surface-300"
			hover="hover:bg-primary-hover-token"
			caretOpen="rotate-180"
		>
			{#if filteredCategories.length > 0}
				{#each filteredCategories as category (category.name)}
					<AccordionItem
						bind:open={category.open}
						regionPanel="divide-y dark:divide-black my-0"
						class={`divide-y rounded-md bg-surface-300 dark:divide-black ${getIndentClass(category.level)}`}
					>
						{#snippet lead()}
							<iconify-icon icon={category.icon} width="24" class="text-error-500 rtl:ml-2" use:popup={popupCollections}></iconify-icon>
						{/snippet}

						{#snippet summary()}
							{#if sidebarState.sidebar.value.left === 'full'}
								<p class="text-white">{category.name}</p>
							{/if}
							<div class="card variant-filled-secondary p-4" data-popup="popupHover">
								<p>{category.name}</p>
								<div class="variant-filled-secondary arrow"></div>
							</div>
						{/snippet}

						{#snippet content()}
							<!-- Collections in this category -->
							{#if category.collections?.length}
								{#each category.collections as _collection (getCollectionKey(_collection, category.name.toString()))}
									<div
										role="button"
										tabindex={0}
										class="-mx-4 flex {sidebarState.sidebar.value.left === 'full'
											? 'flex-row items-center pl-3'
											: 'flex-col items-center'} py-1 hover:bg-surface-400 hover:text-white"
										onkeydown={handleKeydown}
										onclick={() => handleCollectionSelect(_collection)}
									>
										{#if sidebarState.sidebar.value.left === 'full'}
											<iconify-icon icon={_collection.icon} width="24" class="px-2 py-1 text-error-600"></iconify-icon>
											<p class="mr-auto text-center capitalize">{_collection.name}</p>
										{:else}
											<p class="text-xs capitalize">{_collection.name}</p>
											<iconify-icon icon={_collection.icon} width="24" class="text-error-600"></iconify-icon>
										{/if}
									</div>
								{/each}
							{/if}

							<!-- Subcategories with Autocollapse -->
							{#if category.subcategories && Object.keys(category.subcategories).length > 0}
								<Accordion
									autocollapse
									spacing="space-y-1"
									rounded="rounded-container-token"
									padding="py-1"
									regionControl="btn bg-surface-300 dark:bg-surface-400 uppercase text-white hover:!bg-surface-300"
									hover="hover:bg-primary-hover-token"
									caretOpen="rotate-180"
									class="-mr-4"
								>
									{#each Object.entries(category.subcategories) as [key, subCategory] (key)}
										<div class={getIndentClass(category.level + 1)}>
											<AccordionItem
												bind:open={subCategoryOpenStates[`${category.name}-${key}`]}
												onclick={() => handleSubcategoryToggle(category.name.toString(), key)}
												regionPanel="divide-y dark:divide-black my-0"
												class="divide-y rounded-md bg-surface-300 dark:bg-surface-400"
											>
												{#snippet lead()}
													<iconify-icon icon={subCategory.icon} width="24" class="text-error-500 rtl:ml-2" use:popup={popupCollections}
													></iconify-icon>
												{/snippet}

												{#snippet summary()}
													{#if sidebarState.sidebar.value.left === 'full'}
														<p class="uppercase text-white">{subCategory.name}</p>
													{/if}
													<div class="card variant-filled-secondary p-4" data-popup="popupHover">
														<p class="uppercase">{subCategory.name}</p>
														<div class="variant-filled-secondary arrow"></div>
													</div>
												{/snippet}

												{#snippet content()}
													{#if subCategory.collections?.length}
														{#each subCategory.collections as _collection (getCollectionKey(_collection, subCategory.name.toString()))}
															<div
																role="button"
																tabindex={0}
																class="-mx-4 flex {sidebarState.sidebar.value.left === 'full'
																	? 'flex-row items-center pl-3'
																	: 'flex-col items-center'} py-1 hover:bg-surface-400 hover:text-white"
																onkeydown={handleKeydown}
																onclick={() => handleCollectionSelect(_collection)}
															>
																{#if sidebarState.sidebar.value.left === 'full'}
																	<iconify-icon icon={_collection.icon} width="24" class="px-2 py-1 text-error-600"></iconify-icon>
																	<p class="mr-auto text-center capitalize">{_collection.name}</p>
																{:else}
																	<p class="text-xs capitalize">{_collection.name}</p>
																	<iconify-icon icon={_collection.icon} width="24" class="text-error-600"></iconify-icon>
																{/if}
															</div>
														{/each}
													{/if}
												{/snippet}
											</AccordionItem>
										</div>
									{/each}
								</Accordion>
							{/if}
						{/snippet}
					</AccordionItem>
				{/each}
			{:else}
				<div class="p-4 text-center text-gray-500">No collections found</div>
			{/if}
		</Accordion>

		<!-- Media Gallery Button -->
		<button
			class="btn mt-1 flex w-full {sidebarState.sidebar.value.left === 'full'
				? 'flex-row justify-start pl-2'
				: 'flex-col'} items-center bg-surface-400 py-{sidebarState.sidebar.value.left === 'full'
				? '2'
				: '1'} hover:!bg-surface-400 hover:text-white dark:bg-surface-500"
			onclick={() => {
				mode.set('media');
				goto('/mediagallery');
				if (get(screenSize) === 'sm') {
					toggleSidebar('left', 'hidden');
				}
				if (sidebarState.sidebar.value.left !== 'full') handleSidebarToggle();
			}}
		>
			{#if sidebarState.sidebar.value.left === 'full'}
				<iconify-icon icon="bi:images" width="24" class="px-2 py-1 text-primary-600 rtl:ml-2"></iconify-icon>
				<p class="mr-auto text-center uppercase text-white">{m.Collections_MediaGallery()}</p>
			{:else}
				<p class="text-xs uppercase text-white">{m.Collections_MediaGallery()}</p>
				<iconify-icon icon="bi:images" width="24" class="text-primary-500"></iconify-icon>
			{/if}
		</button>
	{:else if sidebarState.sidebar.value.left === 'full'}
		<button
			class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
			onclick={() => {
				mode.set('view');
				if (get(screenSize) === 'sm') {
					toggleSidebar('left', 'hidden');
				}
			}}
		>
			<iconify-icon icon="bi:collection" width="24" class="px-2 py-1 text-error-500 rtl:ml-2"></iconify-icon>
			<p class="mr-auto text-center uppercase">Collections</p>
		</button>
	{:else}
		<!-- Display Virtual Folders -->
		<VirtualFolders />
	{/if}
</div>

<!--
@file src/components/Collections.svelte
@component
**Collections component to display & filter collections and categories.**


Features:
- display collections
- search collections with clear button
- support for nested categories with autocollapse
- responsive sidebar integration
- media gallery support
-->

<script lang="ts">
	import { goto } from '$app/navigation';

	// Types
	import type { Schema } from '@src/content/types';
	import type { contentStructureSchema } from '@src/databases/dbInterface';

	// Stores
	import { get } from 'svelte/store';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	import { mode, collections, contentStructure } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';

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

	let structureNodes = $derived.by(() => {
		return contentStructure.value ? Array.from(Object.values(contentStructure.value)) : [];
	});
	let modeSet = $state<ModeType>('view');
	// Search Collections
	let search = $state('');
	let searchShow = $state(false);
	let isMediaMode = $state(false);

	// Update isMediaMode when modeSet changes
	$effect(() => {
		isMediaMode = modeSet === 'media';
	});

	// Handle collection selection
	function handleCollectionSelect(selectedCollection: contentStructureSchema | Schema) {
		if (mode.value === 'edit') {
			mode.set('view');
		} else {
			mode.set(modeSet);
		}

		if ('isCollection' in selectedCollection) {
			// For contentStructureSchema, we need to find the actual Schema
			goto(`/${contentLanguage.value}${selectedCollection.path.toString()}`);
		}
		handleSidebarToggle();
		shouldShowNextButton.set(true);
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

	function clearSearch() {
		search = '';
	}

	function getIndentClass(level: number) {
		return `pl-${level * 2}px`;
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
			{#if structureNodes.length > 0}
				{#each structureNodes as category (category.id)}
					<AccordionItem
						bind:open={category.open}
						regionPanel="divide-y dark:divide-black my-0"
						class={`divide-y rounded-md bg-surface-300 dark:divide-black ${getIndentClass(0)}`}
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
							{#if category.collections.length}
								{#each category.collections as _collection (getCollectionKey(_collection, category.name))}
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
							{#if category.subcategories && category.subcategories.size > 0}
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
									{#each Array.from(category.subcategories.entries()) as [subCategoryKey, subCategory]}
										{@const subCategoryOpenStateKey = `${category.name}-${subCategory.name}`}
										<div class={getIndentClass(1)}>
											<AccordionItem
												bind:open={subCategoryOpenStates[subCategoryOpenStateKey]}
												onclick={() => handleSubcategoryToggle(category.id.toString(), subCategory.name)}
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
													{#if subCategory.collections && subCategory.collections.length}
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
				<div class="p-4 text-center text-gray-500">{m.collection_no_collections_found()}</div>
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

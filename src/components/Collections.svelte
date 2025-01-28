<!--
@file src/components/Collections.svelte
@component
**Collections component to display & filter collections and categories using TreeView.**

Features:
- Display collections and categories using TreeView from Skeleton.
- Search functionality with clear button.
- Support for nested categories with expand/collapse.
- Responsive sidebar integration.
- Media gallery support.
-->

<script lang="ts">
	import { goto } from '$app/navigation';

	// Types
	// Types
	import type { Schema } from '@src/content/types';
	import type { ContentStructureNode } from '@src/databases/dbInterface';

	// Stores
	import { get } from 'svelte/store';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	import { mode, contentStructure, collection } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface CollectionTreeNode extends ContentStructureNode {
		id: string;
		isExpanded: boolean;
		onClick: () => void;
		children?: CollectionTreeNode[];
	}

	let structureNodes: CollectionTreeNode[] = $derived.by(() => {
		function mapNode(node: ContentStructureNode): CollectionTreeNode {
			const isCategory = node.nodeType === 'category';
			const children = isCategory && node.children ? node.children.map((child: ContentStructureNode) => mapNode(child)) : undefined;

			return {
				...node,
				id: node._id,
				isExpanded: collection.value._id === node._id,
				onClick: () => handleCollectionSelect(node),
				children
			};
		}

		return contentStructure.value.map((node) => mapNode(node));
	});

	let search = $state('');
	let isMediaMode = $state(false);

	// Update isMediaMode when mode changes
	$effect(() => {
		isMediaMode = mode.value === 'media';
		if (structureNodes.length > 0) {
			// The search prop in TreeView will handle the filtering
			search = search.toLowerCase().trim();
		}
	});

	// Handle collection selection
	function handleCollectionSelect(selectedCollection: ContentStructureNode | Schema) {
		if ('nodeType' in selectedCollection && selectedCollection.nodeType === 'collection') {
			goto(`/${contentLanguage.value}${selectedCollection.path?.toString()}`);
		}
		handleSidebarToggle();
		shouldShowNextButton.set(true);
	}

	function clearSearch() {
		search = '';
	}
</script>

<div class="mt-2">
	{#if !isMediaMode}
		<!-- Search Input -->
		<div class="input-group input-group-divider mb-2 grid grid-cols-[1fr_auto]">
			<input
				type="text"
				placeholder="Search collections..."
				bind:value={search}
				class="input h-12 outline-none transition-all duration-500 ease-in-out"
			/>
			<button onclick={clearSearch} class="variant-filled-surface w-12" aria-label="Clear search">
				<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
			</button>
		</div>

		<!-- Collections TreeView -->
		{#if structureNodes.length > 0}
			<TreeView k={0} nodes={structureNodes} selectedId={collection.value._id} compact={sidebarState.sidebar.value.left !== 'full'} {search}
			></TreeView>
		{:else}
			<div class="p-4 text-center text-gray-500">{m.collection_no_collections_found()}</div>
		{/if}

		<!-- Media Gallery Button -->
		<button
			class="btn mt-1 flex w-full rounded {sidebarState.sidebar.value.left === 'full'
				? 'flex-row justify-start'
				: 'flex-col'} items-center bg-surface-400 dark:bg-surface-500 py-{sidebarState.sidebar.value.left === 'full'
				? '1.5'
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
	{:else}
		<!-- Back to Collections Button -->
		<button
			class="btn mt-1 flex w-full items-center bg-surface-400 py-2 hover:!bg-surface-500 hover:text-white dark:bg-surface-600"
			onclick={() => {
				mode.set('view');
				if (get(screenSize) === 'sm') {
					toggleSidebar('left', 'hidden');
				}
			}}
		>
			<iconify-icon icon="bi:collection" width="24" class="px-2 py-1 text-error-500"></iconify-icon>
			<p class="mr-auto text-center uppercase">Collections</p>
		</button>
		<!-- Display Virtual Folders as TreeView -->
		<TreeView k={1} nodes={structureNodes} selectedId={collection.value._id} compact={sidebarState.sidebar.value.left !== 'full'} {search}></TreeView>
	{/if}
</div>

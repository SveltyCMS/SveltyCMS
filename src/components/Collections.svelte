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
	import type { Schema } from '@src/content/types';
	import type { contentStructureSchema } from '@src/databases/dbInterface';

	// Stores
	import { get } from 'svelte/store';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	import { mode, collections, contentStructure, collection } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import TreeView from './TreeView.svelte';

	// Skeleton

	let structureNodes = $derived.by(() => {
		function mapNode(node: any) {
			const folder = node.children && node.children.length > 0;
			return {
				id: node._id,
				value: node.path,
				name: node.name,
				icon: node.icon,
				onClick: (_) => handleCollectionSelect(node),
				children: folder ? node.children.map((child) => mapNode(child)) : undefined
			};
		}

		return contentStructure.value.map((node) => mapNode(node));
	});
	let search = '';
	let searchShow = false;

	// Handle collection selection
	function handleCollectionSelect(selectedCollection: contentStructureSchema | Schema) {
		if (selectedCollection.nodeType === 'collection') {
			goto(`/${contentLanguage.value}${selectedCollection.path.toString()}`);
		}
		handleSidebarToggle();
		shouldShowNextButton.set(true);
	}

	// Filtered nodes based on search input
	function getFilteredNodes(nodes) {
		if (!search) return nodes;
		return nodes.filter(
			(node) => node.name.toLowerCase().includes(search.toLowerCase()) || (node.children && getFilteredNodes(node.children).length > 0)
		);
	}

	function clearSearch() {
		search = '';
	}
</script>

<div class="mt-2">
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
		<TreeView k={0} nodes={structureNodes} selectedId={collection.value._id}></TreeView>
	{:else}
		<div class="p-4 text-center text-gray-500">No collections found.</div>
	{/if}

	<!-- Media Gallery Button -->
	<button
		class="btn mt-1 flex w-full items-center bg-surface-400 py-2 hover:!bg-surface-500 hover:text-white"
		onclick={() => {
			mode.set('media');
			goto('/mediagallery');
			if (get(screenSize) === 'sm') {
				toggleSidebar('left', 'hidden');
			}
		}}
	>
		<iconify-icon icon="bi:images" width="24" class="px-2 py-1 text-primary-600"></iconify-icon>
		<p class="mr-auto text-center uppercase">Media Gallery</p>
	</button>
</div>

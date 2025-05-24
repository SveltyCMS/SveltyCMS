<!-- 
@file src/components/Collections.svelte
@component
**Collections component to display & filter collections and categories using TreeView.**

@example
<Collections />

#### Props
- `collection` - The collection object to display data from.
- `mode` - The current mode of the component. Can be 'view', 'edit', 'create', 'delete', 'modify', or 'media'.

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
	// Update ContentNode type to include the path property
	import type { ContentNode } from '@src/databases/dbInterface';

	// Stores
	import { get } from 'svelte/store';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	import { mode, contentStructure, collection } from '@src/stores/collectionStore.svelte';
	import { uiStateManager, toggleUIElement, handleUILayoutToggle } from '@src/stores/UIStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';

	import { constructNestedStructure } from '../content/utils';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Extend ContentNode to ensure path property is available
	interface ExtendedContentNode extends ContentNode {
		path?: string;
	}

	interface CollectionTreeNode extends Partial<ExtendedContentNode> {
		id: string;
		name: string;
		isExpanded: boolean;
		onClick: () => void;
		children?: CollectionTreeNode[];
		icon?: string;
		path?: string;
		badge?: {
			count?: number;
			status?: 'draft' | 'published' | 'archived';
			color?: string;
			visible?: boolean;
		};
	}

	let nestedStructure = $derived(constructNestedStructure(contentStructure.value));

	let collectionStructureNodes: CollectionTreeNode[] = $derived.by(() => {
		function mapNode(node: ExtendedContentNode): CollectionTreeNode {
			const isCategory = node.nodeType === 'category' || node.translations?.some((t) => t.translationName === 'category');
			// Get translation for current language or fallback to default name
			const translation = node.translations?.find((trans) => trans.languageTag === contentLanguage.value);
			const label = translation?.translationName || node.name;

			let children;
			if (isCategory && (node as any).children) {
				children = (node as any).children.map((child: ExtendedContentNode) => ({
					...mapNode(child),
					// Ensure children use their own translations
					name: child.translations?.find((t) => t.languageTag === contentLanguage.value)?.translationName || child.name
				}));
			}

			return {
				...node,
				name: label,
				id: node._id,
				icon: node.icon,
				isExpanded: collection.value?._id === node._id,
				onClick: () => handleCollectionSelect(node),
				children,
				badge: isCategory
					? {
							count: (node as any).children?.filter((child: any) => (child as any).nodeType === 'collection').length || 0,
							// Only show count for categories (parent nodes)
							visible: !(node as any).isExpanded // Show when expanded
						}
					: undefined
			};
		}

		return nestedStructure.map((node) => mapNode(node));
	});

	// Create virtual folder nodes for the media gallery - these act as filters only
	let virtualFolderNodes: CollectionTreeNode[] = $state([]);

	// Load virtual folders when entering media mode
	$effect(() => {
		if (mode.value === 'media') {
			loadVirtualFolders();
		}
	});

	async function loadVirtualFolders() {
		try {
			const response = await fetch('/api/virtualFolder');
			const data = await response.json();

			// Always create a root folder node
			const rootNode: CollectionTreeNode = {
				id: 'root',
				name: 'Media Root',
				path: 'mediaFiles', // Use the MEDIA_FOLDER value
				isExpanded: true,
				onClick: () => handleVirtualFolderSelect('root'),
				icon: 'bi:house-door',
				badge: {
					visible: false
				}
			};

			if (data.success && data.data.folders && data.data.folders.length > 0) {
				// Map existing virtual folders as children of root
				const folderNodes = data.data.folders.map((folder: any) => ({
					id: folder._id,
					name: folder.name,
					path: folder.path,
					isExpanded: false,
					onClick: () => handleVirtualFolderSelect(folder._id),
					icon: 'bi:folder',
					badge: {
						visible: false
					}
				}));

				// Add folders as children of root
				rootNode.children = folderNodes;
				virtualFolderNodes = [rootNode];
			} else {
				// No virtual folders exist, just show root
				virtualFolderNodes = [rootNode];
			}
		} catch (err) {
			console.error('Failed to load virtual folders:', err);
			// Even on error, show the root folder
			virtualFolderNodes = [
				{
					id: 'root',
					name: 'Media Root',
					path: 'mediaFiles',
					isExpanded: true,
					onClick: () => handleVirtualFolderSelect('root'),
					icon: 'bi:house-door',
					badge: {
						visible: false
					}
				}
			];
		}
	}

	function handleVirtualFolderSelect(folderId: string) {
		console.log('Virtual folder selected:', folderId);
		// TODO: Implement folder selection logic
		// This should filter media files based on the selected virtual folder
	}

	let search = $state('');
	let isMediaMode = $derived(mode.value === 'media');

	// Update when search changes or mode changes
	$effect(() => {
		if (search) {
			// The search prop in TreeView will handle the filtering
			search = search.toLowerCase().trim();
		}
	});

	// Add an effect to update the UI when mode changes
	$effect(() => {
		// Reset selection when switching between modes
		if (mode.value === 'media') {
			// When switching to media mode, ensure proper UI state
			if (uiStateManager.uiState.value.leftSidebar !== 'full') {
				handleUILayoutToggle();
			}
		}
	});

	// Handle collection selection
	function handleCollectionSelect(selectedCollection: ExtendedContentNode | Schema) {
		if ('nodeType' in selectedCollection && selectedCollection.nodeType === 'collection') {
			mode.set('view');
			collection.set(null);
			// Always include the language parameter in the URL
			goto(`/${contentLanguage.value}${selectedCollection.path?.toString()}`);
		}
		shouldShowNextButton.set(true);
	}

	function clearSearch() {
		search = '';
	}
</script>

<div class="mt-2">
	{#if !isMediaMode}
		<!-- Search Input -->
		<div
			class="{uiStateManager.uiState.value.leftSidebar === 'full'
				? 'mb-2 w-full'
				: 'mb-1 max-w-[125px]'} input-group input-group-divider grid grid-cols-[1fr_auto]"
		>
			<input
				type="text"
				placeholder="Search collections..."
				bind:value={search}
				class="input {uiStateManager.uiState.value.leftSidebar === 'full' ? 'h-12' : 'h-10'} outline-hidden transition-all duration-500 ease-in-out"
			/>
			<button onclick={clearSearch} class="variant-filled-surface w-12" aria-label="Clear search">
				<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
			</button>
		</div>

		<!-- Collections TreeView -->
		{#if collectionStructureNodes.length > 0}
			<TreeView
				k={0}
				nodes={collectionStructureNodes}
				selectedId={collection.value?._id ?? undefined}
				compact={uiStateManager.uiState.value.leftSidebar !== 'full'}
				{search}
				iconColorClass="text-error-500"
			></TreeView>
		{:else}
			<div class="p-4 text-center text-gray-500">{m.collection_no_collections_found()}</div>
		{/if}

		<!-- Media Gallery Button -->
		<button
			class="btn mt-1 flex w-full rounded-sm {uiStateManager.uiState.value.leftSidebar === 'full'
				? 'flex-row '
				: 'flex-col'} items-center border border-surface-500 py-{uiStateManager.uiState.value.leftSidebar === 'full'
				? '3'
				: '1'} hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			onclick={() => {
				mode.set('media');
				goto('/mediagallery');
				if (get(screenSize) === 'sm') {
					toggleUIElement('leftSidebar', 'hidden');
				}
				if (uiStateManager.uiState.value.leftSidebar !== 'full') handleUILayoutToggle();
			}}
		>
			{#if uiStateManager.uiState.value.leftSidebar === 'full'}
				<iconify-icon icon="bi:images" width="24" class="text-primary-600 rtl:ml-2"></iconify-icon>
				<p class="dark:text-white">{m.Collections_MediaGallery()}</p>
			{:else}
				<p class="darktext-white text-xs">{m.Collections_MediaGallery()}</p>
				<iconify-icon icon="bi:images" width="20" class="text-primary-500"></iconify-icon>
			{/if}
		</button>
	{/if}

	{#if isMediaMode}
		<!-- Back to Collections Button -->
		<button
			class="btn my-1 flex w-full rounded-sm {uiStateManager.uiState.value.leftSidebar === 'full'
				? 'flex-row '
				: 'flex-col'} items-center border border-surface-500 py-{uiStateManager.uiState.value.leftSidebar === 'full'
				? '3'
				: '1'} hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			onclick={() => {
				collection.set(null);
				mode.set('view');

				if (get(screenSize) === 'sm') {
					toggleUIElement('leftSidebar', 'hidden');
				}
				goto(`/`);
			}}
		>
			{#if uiStateManager.uiState.value.leftSidebar === 'full'}
				<iconify-icon icon="bi:collection" width="24" class="text-error-500 rtl:ml-2"></iconify-icon>
				<p class="mr-auto text-center">Collections</p>
			{:else}
				<p class="darktext-white text-xs">Collections</p>
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
			{/if}
		</button>

		<!-- Display Virtual Folders as TreeView -->
		{#if virtualFolderNodes.length > 0}
			<TreeView
				k={1}
				nodes={virtualFolderNodes}
				selectedId={collection.value?._id}
				compact={uiStateManager.uiState.value.leftSidebar !== 'full'}
				{search}
				iconColorClass="text-primary-500"
			></TreeView>
		{:else}
			<div class="p-4 text-center text-gray-500">No virtual folders found</div>
		{/if}
	{/if}
</div>

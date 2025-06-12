<!-- 
@file src/components/Collections.svelte
@component
**Enhanced Collections component with improved performance, accessibility, and UX.**

@example
<Collections />

#### Props
- `collection` - The collection object to display data from.
- `mode` - The current mode of the component. Can be 'view', 'edit', 'create', 'delete', 'modify', or 'media'.

Features:
- Display collections and categories using TreeView from Skeleton.
- Advanced search with debouncing and filtering.
- Support for nested categories with expand/collapse.
- Responsive sidebar integration.
- Media gallery with folder management.
- Keyboard navigation support.
- Loading states and error handling.
- Drag & drop support for media files.
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
		children?: ExtendedContentNode[];
		lastModified?: Date;
		fileCount?: number;
		status?: 'draft' | 'published' | 'archived';
	}

	// Tree node interface with additional properties
	interface CollectionTreeNode {
		id: string;
		name: string;
		isExpanded: boolean;
		onClick: () => void;
		children?: CollectionTreeNode[];
		icon?: string;
		badge?: {
			count?: number;
			status?: 'draft' | 'published' | 'archived';
			color?: string;
			visible?: boolean;
		};
		nodeType?: 'category' | 'collection' | 'virtual';
		path?: string;
		lastModified?: Date;
		isLoading?: boolean;
		hasError?: boolean;
		depth?: number;
	}

	// State management
	let search = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let debouncedSearch = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());
	let virtualFolderNodes: CollectionTreeNode[] = $state([]);
	let selectedVirtualFolder = $state<string | null>(null);

	// Derived states
	let nestedStructure = $derived(constructNestedStructure(contentStructure.value));
	let isMediaMode = $derived(mode.value === 'media');
	let isFullSidebar = $derived(uiStateManager.uiState.value.leftSidebar === 'full');

	// Debounced search effect
	$effect(() => {
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		searchDebounceTimer = setTimeout(() => {
			debouncedSearch = search.toLowerCase().trim();
		}, 300);

		return () => {
			if (searchDebounceTimer) {
				clearTimeout(searchDebounceTimer);
			}
		};
	});

	// Collection counting with caching
	const collectionCountCache = new Map<string, number>();

	function countAllCollections(node: ExtendedContentNode): number {
		if (collectionCountCache.has(node._id)) {
			return collectionCountCache.get(node._id)!;
		}

		let count = 0;
		if (!node.children) {
			collectionCountCache.set(node._id, 0);
			return 0;
		}

		for (const child of node.children) {
			if (child.nodeType === 'collection') {
				count++;
			} else if (child.nodeType === 'category') {
				count += countAllCollections(child);
			}
		}

		collectionCountCache.set(node._id, count);
		return count;
	}

	// Node mapping with better performance
	let collectionStructureNodes: CollectionTreeNode[] = $derived.by(() => {
		function mapNode(node: ExtendedContentNode, depth = 0): CollectionTreeNode {
			const isCategory = node.nodeType === 'category';
			// Get translation for current language or fallback to default name
			const translation = node.translations?.find((trans) => trans.languageTag === contentLanguage.value);
			const label = translation?.translationName || node.name;

			const nodeId = node._id;
			const isExpanded = expandedNodes.has(nodeId) || collection.value?._id === nodeId;

			let children: CollectionTreeNode[] | undefined;
			if (isCategory && node.children) {
				children = node.children.map((child) => mapNode(child, depth + 1));
			}

			// Add badge
			const badge = isCategory
				? {
						count: countAllCollections(node),
						visible: true, // Always show badges for categories
						status: node.status,
						color: isExpanded ? 'bg-surface-400' : getStatusColor(node.status) // Grey when expanded
					}
				: undefined;

			return {
				...node,
				name: label,
				id: nodeId,
				isExpanded,
				onClick: () => handleCollectionSelect(node),
				children,
				badge,
				depth,
				lastModified: node.lastModified
			};
		}

		return nestedStructure.map((node) => mapNode(node));
	});

	// Get status color for badges
	function getStatusColor(status?: string): string {
		switch (status) {
			case 'published':
				return 'bg-success-500';
			case 'draft':
				return 'bg-warning-500';
			case 'archived':
				return 'bg-surface-500';
			default:
				return 'bg-primary-500';
		}
	}

	// Virtual folder loading with better error handling
	async function loadVirtualFolders() {
		isLoading = true;
		error = null;

		const createRootNode = (): CollectionTreeNode => ({
			id: 'root',
			name: 'Media Root',
			path: 'mediaFiles',
			isExpanded: true,
			onClick: () => handleVirtualFolderSelect('root'),
			icon: 'bi:house-door',
			badge: { visible: false },
			nodeType: 'virtual',
			depth: 0
		});

		try {
			const response = await fetch('/api/virtualFolder');

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			const rootNode = createRootNode();

			if (data.success && data.data.folders?.length > 0) {
				rootNode.children = data.data.folders.map(
					(folder: any): CollectionTreeNode => ({
						id: folder._id,
						name: folder.name,
						path: folder.path,
						isExpanded: expandedNodes.has(folder._id),
						onClick: () => handleVirtualFolderSelect(folder._id),
						icon: 'bi:folder',
						badge: {
							visible: false,
							count: folder.fileCount || 0
						},
						nodeType: 'virtual',
						depth: 1,
						lastModified: folder.lastModified ? new Date(folder.lastModified) : undefined
					})
				);
			}

			virtualFolderNodes = [rootNode];
		} catch (err) {
			console.error('Failed to load virtual folders:', err);
			error = err instanceof Error ? err.message : 'Failed to load virtual folders';
			virtualFolderNodes = [createRootNode()];
		} finally {
			isLoading = false;
		}
	}

	// Virtual folder selection with state management
	function handleVirtualFolderSelect(folderId: string) {
		selectedVirtualFolder = folderId;

		if (folderId !== 'root') {
			expandedNodes.add(folderId);
		}

		const event = new CustomEvent('virtualFolderSelected', {
			detail: { folderId, path: virtualFolderNodes.find((n) => n.id === folderId)?.path }
		});
		document.dispatchEvent(event);

		console.log('Virtual folder selected:', folderId);
	}

	// Collection selection with better navigation
	function handleCollectionSelect(selectedCollection: ExtendedContentNode | Schema) {
		if ('nodeType' in selectedCollection) {
			if (selectedCollection.nodeType === 'collection') {
				mode.set('view');
				collection.set(null);
				goto(`/${contentLanguage.value}${selectedCollection.path?.toString()}`);
				shouldShowNextButton.set(true);
			} else if (selectedCollection.nodeType === 'category') {
				toggleNodeExpansion(selectedCollection._id);
			}
		}
	}

	// Search clearing
	function clearSearch() {
		search = '';
		debouncedSearch = '';
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}
	}

	// Keyboard navigation support
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			clearSearch();
		}
	}

	// Toggle node expansion
	function toggleNodeExpansion(nodeId: string) {
		if (expandedNodes.has(nodeId)) {
			expandedNodes.delete(nodeId);
		} else {
			expandedNodes.add(nodeId);
		}
	}

	// Effects
	$effect(() => {
		if (mode.value === 'media') {
			loadVirtualFolders();
			if (!isFullSidebar) {
				handleUILayoutToggle();
			}
		}
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (searchDebounceTimer) {
				clearTimeout(searchDebounceTimer);
			}
		};
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="collections-container mt-2" role="navigation" aria-label="Collections navigation">
	{#if !isMediaMode}
		<!-- Search Input -->
		<div class="{isFullSidebar ? 'mb-2 w-full' : 'mb-1 max-w-[125px]'} input-group input-group-divider grid grid-cols-[1fr_auto]">
			<div class="relative">
				<input
					type="text"
					placeholder="Search collections..."
					bind:value={search}
					class="input {isFullSidebar ? 'h-12' : 'h-10'} outline-hidden pr-8 transition-all duration-500 ease-in-out"
					aria-label="Search collections"
					autocomplete="off"
				/>
				{#if search}
					<div class="absolute right-2 top-1/2 -translate-y-1/2 transform">
						<div class="h-2 w-2 animate-pulse rounded-full bg-primary-500"></div>
					</div>
				{/if}
			</div>
			<button
				onclick={clearSearch}
				class="variant-filled-surface w-12 transition-colors hover:variant-filled-primary"
				aria-label="Clear search"
				disabled={!search}
			>
				<iconify-icon icon={search ? 'ic:outline-clear' : 'ic:outline-search-off'} width="20"></iconify-icon>
			</button>
		</div>

		<!-- Collections TreeView with Loading State -->
		{#if isLoading}
			<div class="p-4 text-center">
				<div class="flex items-center justify-center space-x-2">
					<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500"></div>
					<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.1s"></div>
					<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.2s"></div>
				</div>
				<p class="mt-2 text-sm text-surface-600">Loading collections...</p>
			</div>
		{:else if error}
			<div class="p-4 text-center text-error-500">
				<iconify-icon icon="ic:outline-error" width="24"></iconify-icon>
				<p class="mt-1 text-sm">{error}</p>
				<button class="variant-filled-error btn btn-sm mt-2" onclick={() => window.location.reload()}> Retry </button>
			</div>
		{:else if collectionStructureNodes.length > 0}
			<TreeView
				k={0}
				nodes={collectionStructureNodes}
				selectedId={collection.value?._id ?? undefined}
				compact={!isFullSidebar}
				search={debouncedSearch}
				iconColorClass="text-error-500"
				showBadges={isFullSidebar}
			></TreeView>
		{:else}
			<div class="p-4 text-center text-surface-500">
				<iconify-icon icon="bi:collection" width="32" class="opacity-50"></iconify-icon>
				<p class="mt-2 text-sm">{m.collection_no_collections_found()}</p>
			</div>
		{/if}

		<!-- Media Gallery Button -->
		<button
			class="btn mt-1 flex w-full rounded-sm {isFullSidebar ? 'flex-row' : 'flex-col'} items-center border border-surface-500 py-{isFullSidebar
				? '3'
				: '1'} group transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			onclick={() => {
				mode.set('media');
				goto('/mediagallery');
				if (get(screenSize) === 'sm') {
					toggleUIElement('leftSidebar', 'hidden');
				}
				if (!isFullSidebar) handleUILayoutToggle();
			}}
			aria-label="Open media gallery"
		>
			{#if isFullSidebar}
				<iconify-icon icon="bi:images" width="24" class="text-primary-600 transition-transform group-hover:scale-110 rtl:ml-2"></iconify-icon>
				<span class="ml-2 dark:text-white">{m.Collections_MediaGallery()}</span>
			{:else}
				<span class="mb-1 text-xs">{m.Collections_MediaGallery()}</span>
				<iconify-icon icon="bi:images" width="20" class="text-primary-500 transition-transform group-hover:scale-110"></iconify-icon>
			{/if}
		</button>
	{/if}

	{#if isMediaMode}
		<!-- Back to Collections Button -->
		<button
			class="btn my-1 flex w-full rounded-sm {isFullSidebar ? 'flex-row' : 'flex-col'} items-center border border-surface-500 py-{isFullSidebar
				? '3'
				: '1'} group transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			onclick={() => {
				collection.set(null);
				mode.set('view');
				selectedVirtualFolder = null;
				expandedNodes.clear(); // Clear method triggers reactivity automatically

				if (get(screenSize) === 'sm') {
					toggleUIElement('leftSidebar', 'hidden');
				}
				goto('/');
			}}
			aria-label="Back to collections"
		>
			{#if isFullSidebar}
				<iconify-icon icon="bi:arrow-left" width="20" class="mr-2 text-error-500 transition-transform group-hover:-translate-x-1"></iconify-icon>
				<iconify-icon icon="bi:collection" width="24" class="mr-2 text-error-500"></iconify-icon>
				<span class="text-center">Collections</span>
			{:else}
				<span class="mb-1 text-xs">Collections</span>
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
			{/if}
		</button>

		<!-- Enhanced Virtual Folders Display -->
		{#if isLoading}
			<div class="p-4 text-center">
				<div class="flex items-center justify-center space-x-2">
					<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500"></div>
					<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.1s"></div>
					<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.2s"></div>
				</div>
				<p class="mt-2 text-sm text-surface-600">Loading media folders...</p>
			</div>
		{:else if error}
			<div class="p-4 text-center text-error-500">
				<iconify-icon icon="ic:outline-error" width="24"></iconify-icon>
				<p class="mt-1 text-sm">{error}</p>
				<button class="variant-filled-error btn btn-sm mt-2" onclick={loadVirtualFolders}> Retry </button>
			</div>
		{:else if virtualFolderNodes.length > 0}
			<TreeView
				k={1}
				nodes={virtualFolderNodes}
				selectedId={selectedVirtualFolder}
				compact={!isFullSidebar}
				search={debouncedSearch}
				iconColorClass="text-primary-500"
				showBadges={isFullSidebar}
			></TreeView>
		{:else}
			<div class="p-4 text-center text-surface-500">
				<iconify-icon icon="bi:folder" width="32" class="opacity-50"></iconify-icon>
				<p class="mt-2 text-sm">No media folders found</p>
				<button class="variant-filled-primary btn btn-sm mt-2" onclick={() => goto('/mediagallery/create-folder')}> Create Folder </button>
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Smooth animations for expansion states */
	:global(.tree-node) {
		transition: all 0.2s ease-in-out;
	}

	/* Custom scrollbar for sidebar */
	.collections-container {
		scrollbar-width: thin;
		scrollbar-color: rgba(var(--color-primary-500) / 0.3) transparent;
	}

	.collections-container::-webkit-scrollbar {
		width: 4px;
	}

	.collections-container::-webkit-scrollbar-thumb {
		background-color: rgba(var(--color-primary-500) / 0.3);
		border-radius: 2px;
	}
</style>

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
-->

<script lang="ts" module>
	export interface CollectionTreeNode {
		id: string;
		name: string;
		isExpanded: boolean;
		onClick: () => void;
		children?: CollectionTreeNode[];
		icon?: string;
		badge?: {
			count?: number;
			status?: 'archive' | 'draft' | 'publish' | 'schedule' | 'clone' | 'test' | 'delete';
			color?: string;
			visible?: boolean;
			icon?: string; // Warning icon for inactive widgets
			title?: string; // Tooltip text
		};
		nodeType?: 'category' | 'collection' | 'virtual';
		path?: string;
		lastModified?: Date;
		isLoading?: boolean;
		hasError?: boolean;
		depth?: number;
		order?: number; // Add order property for sorting
		parentId?: string;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// Types
	import type { ContentNode, FieldInstance, Schema, StatusType, Translation } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// Stores
	import { collection, contentStructure, mode, setCollection, setMode } from '@stores/collectionStore.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { handleUILayoutToggle, toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	// --- REMOVED `get` from 'svelte/store' ---
	// --- REMOVED `untrack` from 'svelte' ---

	// Utils
	import { debounce } from '@utils/utils';
	import { validateSchemaWidgets } from '@utils/widgetValidation';
	import { activeWidgets } from '@stores/widgetStore.svelte';
	import { get } from 'svelte/store';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface ExtendedContentNode extends Omit<ContentNode, 'children' | 'order'> {
		path?: string;
		children?: ExtendedContentNode[];
		lastModified?: Date;
		fileCount?: number;
		status?: StatusType;
		fields?: FieldInstance[];
		order?: number;
	}

	const { systemVirtualFolders = [] } = $props<{ systemVirtualFolders: CollectionTreeNode[] }>();

	// State management
	let search = $state('');
	let debouncedSearch = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());
	let selectedSystemVirtualFolder = $state<string | null>(null);
	let navigationTimeout: ReturnType<typeof setTimeout> | undefined;

	// Debounce function
	const debouncedSearchUpdate = debounce.create(
		((searchValue: string) => {
			debouncedSearch = searchValue.toLowerCase().trim();
		}) as (...args: unknown[]) => unknown,
		150
	);

	// --- Derived States ---
	let nestedStructure = $derived(contentStructure.value || []);
	let isMediaMode = $derived(mode.value === 'media');
	let isFullSidebar = $derived(uiStateManager.uiState.value.leftSidebar === 'full');
	// currentPath derived intentionally removed; use page.url.pathname directly where needed

	// Effect for debouncing search
	$effect(() => {
		debouncedSearchUpdate(search);
	});

	// --- OPTIMIZED: collectionStructureNodes is now $derived ---
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let collectionCountCache = new Map<string, number>();

	let collectionStructureNodes = $derived(() => {
		const structure = nestedStructure;
		const lang = contentLanguage.value;
		const expanded = expandedNodes;
		const selectedId = collection.value?._id;
		const activeWidgetList = get(activeWidgets);

		collectionCountCache.clear();

		function countAllCollections(node: ExtendedContentNode): number {
			const cacheKey = node._id;
			if (collectionCountCache.has(cacheKey)) {
				return collectionCountCache.get(cacheKey)!;
			}
			if (!node.children) {
				collectionCountCache.set(cacheKey, 0);
				return 0;
			}
			let count = 0;
			for (const child of node.children) {
				if (child.nodeType === 'collection') {
					count++;
				} else if (child.nodeType === 'category') {
					count += countAllCollections(child);
				}
			}
			collectionCountCache.set(cacheKey, count);
			return count;
		}

		function mapNode(node: ExtendedContentNode, depth = 0): CollectionTreeNode {
			const isCategory = node.nodeType === 'category';
			const translation = node.translations?.find((trans: Translation) => trans.languageTag === lang);
			const label = translation?.translationName || node.name;
			const nodeId = node._id;
			const isExpanded = expanded.has(nodeId) || selectedId === nodeId;

			let hasInactiveWidgets = false;
			if (!isCategory && node.fields) {
				const validation = validateSchemaWidgets({ ...node, fields: node.fields } as Schema, activeWidgetList);
				hasInactiveWidgets = !validation.valid;
			}

			let children: CollectionTreeNode[] | undefined;
			if (isCategory && node.children) {
				const sortedChildren = [...node.children].sort((a, b) => (a.order || 0) - (b.order || 0));
				children = sortedChildren.map((child) => mapNode(child, depth + 1));
			}

			const allowedStatus = ['archive', 'draft', 'publish', 'schedule', 'clone', 'test', 'delete'] as const;
			const badge = isCategory
				? {
						count: countAllCollections(node),
						visible: true,
						status: allowedStatus.includes(node.status as (typeof allowedStatus)[number])
							? (node.status as (typeof allowedStatus)[number])
							: undefined,
						color: isExpanded ? 'bg-surface-400' : getStatusColor(node.status)
					}
				: hasInactiveWidgets
					? {
							visible: true,
							color: 'bg-warning-500',
							icon: 'mdi:alert-circle',
							title: 'This collection uses inactive widgets'
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
				order: node.order || 0,
				lastModified: node.lastModified
			};
		}

		const sortedRootNodes = [...structure].sort((a, b) => (a.order || 0) - (b.order || 0));
		return sortedRootNodes.map((node) => mapNode(node));
	});

	// --- OPTIMIZED: systemVirtualFolderNodes is now $derived ---
	let systemVirtualFolderNodes = $derived(() => {
		if (!isMediaMode) return [];

		const rootNode: CollectionTreeNode = {
			id: 'root',
			name: 'Media Root',
			path: 'mediaFiles',
			isExpanded: true,
			onClick: () => handleSystemVirtualFolderSelect('root'),
			icon: 'bi:house-door',
			badge: { visible: false },
			nodeType: 'virtual',
			depth: 0
		};

		if (systemVirtualFolders && systemVirtualFolders.length > 0) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const folderMap = new Map<string, CollectionTreeNode>();

			systemVirtualFolders.forEach((folder: CollectionTreeNode) => {
				folderMap.set(folder.id, {
					...folder,
					isExpanded: expandedNodes.has(folder.id),
					onClick: () => handleSystemVirtualFolderSelect(folder.id),
					children: [],
					depth: 0
				});
			});

			const tree: CollectionTreeNode[] = [];
			systemVirtualFolders.forEach((folder: CollectionTreeNode) => {
				const node = folderMap.get(folder.id)!;
				if (folder.parentId && folderMap.has(folder.parentId)) {
					const parent = folderMap.get(folder.parentId)!;
					parent.children!.push(node);
				} else {
					tree.push(node);
				}
			});

			const setDepth = (nodes: CollectionTreeNode[], depth: number) => {
				nodes.sort((a, b) => (a.order || 0) - (b.order || 0));
				nodes.forEach((node) => {
					node.depth = depth;
					if (node.children && node.children.length > 0) {
						setDepth(node.children, depth + 1);
					} else {
						node.children = undefined;
					}
				});
			};
			setDepth(tree, 1);
			rootNode.children = tree;
		}

		return [rootNode];
	});

	// Helper function for navigation
	async function navigateTo(path: string, options: { replaceState?: boolean } = {}): Promise<void> {
		if (navigationTimeout) {
			clearTimeout(navigationTimeout);
		}
		navigationTimeout = setTimeout(async () => {
			if (page.url.pathname === path) return;
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(path, { replaceState: options.replaceState });
		}, 50);
	}

	// Get status color for badges
	function getStatusColor(status?: StatusType): string {
		switch (status) {
			case StatusTypes.publish:
				return 'bg-success-500';
			case StatusTypes.draft:
				return 'bg-warning-500';
			case StatusTypes.archive:
				return 'bg-surface-500';
			default:
				return 'bg-primary-500';
		}
	}

	// Virtual folder selection
	function handleSystemVirtualFolderSelect(folderId: string) {
		selectedSystemVirtualFolder = folderId;

		if (folderId !== 'root') {
			expandedNodes = new Set([...expandedNodes, folderId]);
		}

		const event = new CustomEvent('systemVirtualFolderSelected', {
			detail: { folderId, path: systemVirtualFolderNodes().find((n: CollectionTreeNode) => n.id === folderId)?.path }
		});
		document.dispatchEvent(event);
	}

	// Collection selection
	function handleCollectionSelect(selectedCollection: ExtendedContentNode | Schema) {
		const isExtendedContentNode = (node: unknown): node is ExtendedContentNode =>
			typeof node === 'object' && node !== null && '_id' in node && 'nodeType' in node;

		if (isExtendedContentNode(selectedCollection)) {
			if (selectedCollection.nodeType === 'collection') {
				const currentCollectionId = collection.value?._id;
				if (currentCollectionId === selectedCollection._id) {
					return; // Already selected
				}

				setMode('view');
				setCollection(null);
				shouldShowNextButton.set(true);

				const cacheEvent = new CustomEvent('clearEntryListCache', {
					detail: { resetState: true, reason: 'collection-switch' }
				});
				document.dispatchEvent(cacheEvent);

				navigateTo(`/${contentLanguage.value}${selectedCollection.path?.toString()}`);
			} else if (selectedCollection.nodeType === 'category') {
				toggleNodeExpansion(selectedCollection._id);
			}
		}
	}

	// Search clearing
	function clearSearch() {
		search = '';
		debouncedSearch = '';
	}

	// Toggle node expansion
	function toggleNodeExpansion(nodeId: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const newSet = new Set(expandedNodes);
		if (newSet.has(nodeId)) {
			newSet.delete(nodeId);
		} else {
			newSet.add(nodeId);
		}
		expandedNodes = newSet;
	}

	// Function to handle drag & drop reordering
	async function handleDragDropReorder(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') {
		console.log('Drag/drop reorder logic triggered...', { draggedId, targetId, position });
	}

	// Effect to synchronize mode with route
	$effect(() => {
		const pathname = page.url.pathname;
		const currentMode = mode.value;

		if (pathname.includes('/mediagallery')) {
			if (currentMode !== 'media') {
				setMode('media');
			}
		} else {
			if (currentMode === 'media') {
				setMode('view');
			}
		}
	});

	// Effect for media mode UI
	$effect(() => {
		if (isMediaMode) {
			if (!isFullSidebar) {
				handleUILayoutToggle();
			}
		}
	});

	// Cleanup for navigation timeout
	$effect(() => {
		return () => {
			if (navigationTimeout) {
				clearTimeout(navigationTimeout);
			}
		};
	});
</script>

<div class="collections-container mt-2" role="navigation" aria-label="Collections navigation">
	{#if !isMediaMode || true}
		<!-- Search Input -->
		<div class="{isFullSidebar ? 'mb-2 w-full' : 'mb-1 max-w-[135px]'} input-group input-group-divider grid grid-cols-[1fr_auto]">
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
		{:else if collectionStructureNodes().length > 0}
			<!-- Collections Header in Media Mode -->
			{#if isMediaMode && isFullSidebar}
				<div class="mb-2 flex items-center border-b border-surface-300 pb-2">
					<iconify-icon icon="bi:collection" width="20" class="mr-2 text-error-500"></iconify-icon>
					<h3 class="text-sm font-medium text-surface-700 dark:text-surface-300">Collections</h3>
				</div>
			{/if}

			<TreeView
				k={0}
				nodes={collectionStructureNodes()}
				selectedId={collection.value?._id ?? null}
				compact={!isFullSidebar}
				search={debouncedSearch}
				iconColorClass="text-error-500"
				showBadges={true}
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
				setMode('media');
				navigateTo('/mediagallery');
				if (screenSize.value === 'SM') {
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
				<iconify-icon icon="bi:images" width="20" class="text-tertiary-500 transition-transform group-hover:scale-110 dark:text-primary-500"
				></iconify-icon>
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
				setCollection(null);
				setMode('view');
				selectedSystemVirtualFolder = null;
				expandedNodes = new Set();

				if (screenSize.value === 'SM') {
					toggleUIElement('leftSidebar', 'hidden');
				}
				navigateTo('/');
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
		{#if isFullSidebar}
			<div class="mb-2 mt-4 flex items-center border-b border-surface-300 pb-2">
				<iconify-icon icon="bi:folder" width="20" class="mr-2 text-primary-500"></iconify-icon>
				<h3 class="text-sm font-medium text-surface-700 dark:text-surface-300">Media Folders</h3>
			</div>
		{/if}
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
			</div>
		{:else if systemVirtualFolderNodes().length > 0}
			<TreeView
				k={1}
				nodes={systemVirtualFolderNodes()}
				selectedId={selectedSystemVirtualFolder}
				compact={!isFullSidebar}
				search={debouncedSearch}
				iconColorClass="text-primary-500"
				showBadges={isFullSidebar}
				allowDragDrop={true}
				onReorder={handleDragDropReorder}
			></TreeView>
		{:else}
			<div class="p-4 text-center text-surface-500">
				<iconify-icon icon="bi:folder" width="32" class="opacity-50"></iconify-icon>
				<p class="mt-2 text-sm">No media folders found</p>
				<button class="variant-filled-primary btn btn-sm mt-2" onclick={() => navigateTo('/mediagallery/create-folder')}> Create Folder </button>
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

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
		status?: 'draft' | 'publish' | 'archive';
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
			status?: 'draft' | 'publish' | 'archive';
			color?: string;
			visible?: boolean;
		};
		nodeType?: 'category' | 'collection' | 'virtual';
		path?: string;
		lastModified?: Date;
		isLoading?: boolean;
		hasError?: boolean;
		depth?: number;
		order?: number; // Add order property for sorting
	}

	// State management
	let search = $state('');
	let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let debouncedSearch = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());
	let systemVirtualFolderNodes: CollectionTreeNode[] = $state([]);
	let selectedSystemVirtualFolder = $state<string | null>(null);
	let hasLoadedSystemVirtualFolders = $state(false);

	// Derived states with memoization
	let lastContentStructure: any = null;
	let cachedNestedStructure: ExtendedContentNode[] = [];

	let nestedStructure = $derived.by(() => {
		// Only recalculate if content structure actually changed
		if (contentStructure.value !== lastContentStructure) {
			lastContentStructure = contentStructure.value;
			cachedNestedStructure = constructNestedStructure(contentStructure.value);
		}
		return cachedNestedStructure;
	});

	let isMediaMode = $derived(mode.value === 'media');
	let isFullSidebar = $derived(uiStateManager.uiState.value.leftSidebar === 'full');

	// Optimized debounced search effect
	$effect(() => {
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}

		// Use shorter debounce for better responsiveness
		searchDebounceTimer = setTimeout(() => {
			debouncedSearch = search.toLowerCase().trim();
		}, 150);

		return () => {
			if (searchDebounceTimer) {
				clearTimeout(searchDebounceTimer);
			}
		};
	});

	// Collection counting with persistent caching
	let collectionCountCache = new Map<string, number>();

	function countAllCollections(node: ExtendedContentNode): number {
		const cacheKey = node._id;
		if (collectionCountCache.has(cacheKey)) {
			return collectionCountCache.get(cacheKey)!;
		}

		let count = 0;
		if (!node.children) {
			collectionCountCache.set(cacheKey, 0);
			return 0;
		}

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

	// Clear cache when content structure changes
	function clearCountCache() {
		collectionCountCache.clear();
	}

	// Optimized node mapping with memoization
	let cachedCollectionNodes: CollectionTreeNode[] = [];
	let lastStructureVersion = '';

	let collectionStructureNodes: CollectionTreeNode[] = $derived.by(() => {
		// Create a version hash to detect real changes
		const currentVersion = JSON.stringify({
			structure: nestedStructure.map((n) => ({ id: n._id, name: n.name, nodeType: n.nodeType })),
			language: contentLanguage.value,
			selectedCollection: collection.value?._id,
			expandedNodes: Array.from(expandedNodes).sort()
		});

		// Return cached version if nothing meaningful changed
		if (currentVersion === lastStructureVersion && cachedCollectionNodes.length > 0) {
			return cachedCollectionNodes;
		}

		// Clear count cache only when structure actually changes
		if (currentVersion !== lastStructureVersion) {
			clearCountCache();
			lastStructureVersion = currentVersion;
		}

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

			// Add badge only for categories to reduce overhead
			const badge = isCategory
				? {
						count: countAllCollections(node),
						visible: true,
						status: node.status,
						color: isExpanded ? 'bg-surface-400' : getStatusColor(node.status)
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

		// Cache the result
		cachedCollectionNodes = nestedStructure.map((node) => mapNode(node));
		return cachedCollectionNodes;
	});

	// Get status color for badges
	function getStatusColor(status?: string): string {
		switch (status) {
			case 'publish':
				return 'bg-success-500';
			case 'draft':
				return 'bg-warning-500';
			case 'archive':
				return 'bg-surface-500';
			default:
				return 'bg-primary-500';
		}
	}

	// Virtual folder loading with better error handling
	async function loadSystemVirtualFolders() {
		isLoading = true;
		error = null;
		hasLoadedSystemVirtualFolders = true; // Prevent re-loading

		const createRootNode = (): CollectionTreeNode => ({
			id: 'root',
			name: 'Media Root',
			path: 'mediaFiles',
			isExpanded: true,
			onClick: () => handleSystemVirtualFolderSelect('root'),
			icon: 'bi:house-door',
			badge: { visible: false },
			nodeType: 'virtual',
			depth: 0
		});

		try {
			// Force cache bypass by adding a timestamp parameter
			const response = await fetch(`/api/systemVirtualFolder?t=${Date.now()}`);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			const rootNode = createRootNode();

			if (data.success && data.data?.length > 0) {
				const allFolders: any[] = data.data;
				const folderMap = new Map<string, CollectionTreeNode>();

				// Create nodes for each folder
				allFolders.forEach((folder) => {
					folderMap.set(folder._id, {
						id: folder._id,
						name: folder.name,
						path: folder.path,
						isExpanded: expandedNodes.has(folder._id),
						onClick: () => handleSystemVirtualFolderSelect(folder._id),
						icon: 'bi:folder',
						badge: {
							visible: false,
							count: folder.fileCount || 0
						},
						nodeType: 'virtual',
						depth: 0, // Will be set later
						lastModified: folder.lastModified ? new Date(folder.lastModified) : undefined,
						children: [],
						order: folder.order || 0 // Add order for sorting
					});
				});

				const tree: CollectionTreeNode[] = [];
				// Link children to parents
				allFolders.forEach((folder) => {
					const node = folderMap.get(folder._id)!;
					if (folder.parentId && folderMap.has(folder.parentId)) {
						const parent = folderMap.get(folder.parentId)!;
						if (!parent.children) parent.children = [];
						parent.children.push(node);
					} else {
						tree.push(node);
					}
				});

				// Set depth and handle empty children
				const setDepth = (nodes: CollectionTreeNode[], depth: number) => {
					// Sort nodes by order first
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

			systemVirtualFolderNodes = [rootNode];
			console.log('Virtual folders loaded successfully:', systemVirtualFolderNodes);
		} catch (err) {
			console.error('Failed to load virtual folders:', err);
			error = err instanceof Error ? err.message : 'Failed to load virtual folders';
			systemVirtualFolderNodes = [createRootNode()];
		} finally {
			isLoading = false;
		}
	}

	// Function to refresh virtual folders (public method)
	function refreshSystemVirtualFolders() {
		console.log('Refreshing virtual folders...');
		hasLoadedSystemVirtualFolders = false; // Reset the flag to allow reloading
		loadSystemVirtualFolders();
	}

	// Virtual folder selection with state management
	function handleSystemVirtualFolderSelect(folderId: string) {
		selectedSystemVirtualFolder = folderId;

		if (folderId !== 'root') {
			expandedNodes.add(folderId);
		}

		const event = new CustomEvent('systemVirtualFolderSelected', {
			detail: { folderId, path: systemVirtualFolderNodes.find((n) => n.id === folderId)?.path }
		});
		document.dispatchEvent(event);

		console.log('Virtual folder selected:', folderId);
	}

	// Optimized collection selection with debouncing
	let navigationTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleCollectionSelect(selectedCollection: ExtendedContentNode | Schema) {
		// Clear any pending navigation
		if (navigationTimeout) {
			clearTimeout(navigationTimeout);
		}

		if ('nodeType' in selectedCollection) {
			if (selectedCollection.nodeType === 'collection') {
				// Check if this collection is already selected to avoid unnecessary navigation
				const currentCollectionId = collection.value?._id;
				const isAlreadySelected = currentCollectionId === selectedCollection._id;

				if (isAlreadySelected) {
					console.log(`[Collections] Collection ${selectedCollection.name} is already selected, skipping navigation`);
					return;
				}

				// Immediately update UI state for responsiveness
				mode.set('view');
				collection.set(null);
				shouldShowNextButton.set(true);

				// Clear EntryList cache to prevent stale data
				const cacheEvent = new CustomEvent('clearEntryListCache', {
					detail: { resetState: true, reason: 'collection-switch' }
				});
				document.dispatchEvent(cacheEvent);

				// Debounce the actual navigation slightly to prevent rapid clicks
				navigationTimeout = setTimeout(() => {
					goto(`/${contentLanguage.value}${selectedCollection.path?.toString()}`);
				}, 50);
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

	// Function to handle drag & drop reordering
	async function handleDragDropReorder(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') {
		try {
			console.log('Drag drop reorder:', { draggedId, targetId, position });

			// Prevent dropping a folder into itself or its descendants
			if (draggedId === targetId) {
				console.warn('Cannot drop folder into itself');
				return;
			}

			// Find the dragged node and target node
			const findNodeInTree = (nodes: CollectionTreeNode[], id: string): CollectionTreeNode | null => {
				for (const node of nodes) {
					if (node.id === id) return node;
					if (node.children) {
						const found = findNodeInTree(node.children, id);
						if (found) return found;
					}
				}
				return null;
			};

			// Find parent of a node
			const findParentInTree = (
				nodes: CollectionTreeNode[],
				childId: string,
				parentNode: CollectionTreeNode | null = null
			): CollectionTreeNode | null => {
				for (const node of nodes) {
					if (node.children?.some((child) => child.id === childId)) {
						return node;
					}
					if (node.children) {
						const found = findParentInTree(node.children, childId, node);
						if (found) return found;
					}
				}
				return parentNode;
			};

			// Check if dragged folder is an ancestor of target (prevent circular reference)
			const isAncestor = (ancestorId: string, descendantId: string): boolean => {
				const descendant = findNodeInTree(systemVirtualFolderNodes, descendantId);
				if (!descendant) return false;

				const parent = findParentInTree(systemVirtualFolderNodes, descendantId);
				if (!parent) return false;

				if (parent.id === ancestorId) return true;
				return isAncestor(ancestorId, parent.id);
			};

			if (isAncestor(draggedId, targetId)) {
				console.warn('Cannot move folder into its descendant');
				return;
			}

			const draggedNode = findNodeInTree(systemVirtualFolderNodes, draggedId);
			const targetNode = findNodeInTree(systemVirtualFolderNodes, targetId);

			if (!draggedNode || !targetNode) {
				console.error('Could not find dragged or target node');
				return;
			}

			// Determine the new parent and calculate order updates
			let newParentId: string | null = null;
			let orderUpdates: Array<{ folderId: string; order: number; parentId?: string | null }> = [];

			if (position === 'inside') {
				// Moving inside the target folder - target becomes the parent
				newParentId = targetNode.id === 'root' ? null : targetNode.id;

				// Get existing children to determine the new order
				const targetChildren = targetNode.children || [];
				const newOrder = targetChildren.length; // Add to the end

				orderUpdates.push({
					folderId: draggedId,
					order: newOrder,
					parentId: newParentId
				});
			} else {
				// Moving before or after the target - same parent as target
				const targetParent = findParentInTree(systemVirtualFolderNodes, targetId);
				newParentId = targetParent ? (targetParent.id === 'root' ? null : targetParent.id) : null;

				// Get siblings at the target level
				const siblings = targetParent ? targetParent.children || [] : systemVirtualFolderNodes[0]?.children || [];
				const targetIndex = siblings.findIndex((node) => node.id === targetId);

				if (targetIndex === -1) {
					console.error('Target node not found in siblings');
					return;
				}

				// Calculate new orders for affected items
				let newOrder: number;
				if (position === 'before') {
					newOrder = targetIndex;
					// Shift existing items at or after this position
					siblings.forEach((sibling, index) => {
						if (index >= targetIndex && sibling.id !== draggedId) {
							orderUpdates.push({
								folderId: sibling.id,
								order: index + 1
							});
						}
					});
				} else {
					// after
					newOrder = targetIndex + 1;
					// Shift existing items after this position
					siblings.forEach((sibling, index) => {
						if (index > targetIndex && sibling.id !== draggedId) {
							orderUpdates.push({
								folderId: sibling.id,
								order: index + 1
							});
						}
					});
				}

				orderUpdates.push({
					folderId: draggedId,
					order: newOrder,
					parentId: newParentId
				});
			}

			console.log('Sending reorder request:', { newParentId, orderUpdates });

			// Send reorder request
			const response = await fetch('/api/systemVirtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'reorder',
					parentId: newParentId,
					orderUpdates: orderUpdates
				})
			});

			if (response.ok) {
				console.log('Drag drop reorder successful');
				// Refresh the folder list to show the new structure
				refreshSystemVirtualFolders();
			} else {
				const errorData = await response.json();
				console.error('Failed to reorder folders via drag & drop:', errorData);
				throw new Error(`Failed to reorder folders: ${errorData.error || 'Unknown error'}`);
			}
		} catch (error) {
			console.error('Error in drag drop reorder:', error);
		}
	}

	// Effects
	$effect(() => {
		if (mode.value === 'media' && !hasLoadedSystemVirtualFolders) {
			loadSystemVirtualFolders();
			if (!isFullSidebar) {
				handleUILayoutToggle();
			}
		}
	});

	// Listen for folder creation events
	$effect(() => {
		const handleFolderCreated = (event: CustomEvent) => {
			console.log('Folder created event received:', event.detail);
			if (isMediaMode) {
				console.log('Media mode active, refreshing system virtual folders...');
				refreshSystemVirtualFolders();
			}
		};

		// Listen for custom events from the media gallery
		document.addEventListener('folderCreated', handleFolderCreated as EventListener);

		return () => {
			document.removeEventListener('folderCreated', handleFolderCreated as EventListener);
		};
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (searchDebounceTimer) {
				clearTimeout(searchDebounceTimer);
			}
			if (navigationTimeout) {
				clearTimeout(navigationTimeout);
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
				selectedId={collection.value?._id ?? null}
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
				if (get(screenSize) === 'SM') {
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
				selectedSystemVirtualFolder = null;
				expandedNodes.clear(); // Clear method triggers reactivity automatically
				hasLoadedSystemVirtualFolders = false; // Reset loading flag

				if (get(screenSize) === 'SM') {
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
				<button class="variant-filled-error btn btn-sm mt-2" onclick={loadSystemVirtualFolders}> Retry </button>
			</div>
		{:else if systemVirtualFolderNodes.length > 0}
			<TreeView
				k={1}
				nodes={systemVirtualFolderNodes}
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

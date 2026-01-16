<!--
@file src/components/Collections.svelte
@component
**Collections component for navigating content categories and collections**

@example
<Collections />

#### Props
- None (uses global stores)

#### Features
- Display collections and categories using TreeView
- Advanced search with debouncing
- Support for nested categories with expand/collapse
- Widget validation warnings
- Keyboard navigation support
- Persistent expanded state
- Performance optimized with memoization
-->

<script lang="ts" module>
	export interface CollectionTreeNode {
		id: string;
		name: string;
		isExpanded?: boolean;
		onClick?: (node: CollectionTreeNode) => void;
		children?: CollectionTreeNode[];
		icon?: string;
		badge?: {
			count?: number;
			status?: 'archive' | 'draft' | 'publish' | 'schedule' | 'clone' | 'test' | 'delete';
			color?: string;
			visible?: boolean;
			icon?: string;
			title?: string;
		};
		nodeType?: string;
		path?: string;
		lastModified?: Date;
		isLoading?: boolean;
		hasError?: boolean;
		depth?: number;
		order?: number;
	}
</script>

<script lang="ts">
	import { logger } from '@utils/logger';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	// Types
	import type { ContentNode, FieldInstance, Schema, StatusType, Translation } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';

	// Stores
	import { collection, contentStructure, mode, setMode } from '@stores/collectionStore.svelte';
	import { uiStateManager } from '@stores/UIStore.svelte';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	import { activeWidgets } from '@stores/widgetStore.svelte';

	// Utils
	import { debounce } from '@utils/utils';
	import { validateSchemaWidgets } from '@utils/widgetValidation';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

	// i18n
	import * as m from '@src/paraglide/messages';
	import axios from 'axios';

	// Extended ContentNode interface
	interface ExtendedContentNode extends Omit<ContentNode, 'children' | 'order'> {
		path?: string;
		children?: ExtendedContentNode[];
		lastModified?: Date;
		fileCount?: number;
		status?: StatusType;
		fields?: FieldInstance[];
		order?: number;
	}

	// State management
	let search = $state('');
	let debouncedSearch = $state('');
	const isLoading = $state(false);
	const error = $state<string | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());
	let isSearching = $state(false);

	// Collection count cache for performance
	const collectionCountCache = new Map<string, number>();

	// Debounce search input
	const debouncedSearchUpdate = debounce.create(
		((searchValue: string) => {
			debouncedSearch = searchValue.toLowerCase().trim();
			isSearching = false;
		}) as (...args: unknown[]) => unknown,
		150
	);

	// Derived states
	const nestedStructure = $derived(contentStructure.value || []);
	const isFullSidebar = $derived(uiStateManager.uiState.value.leftSidebar === 'full');
	const currentLanguage = $derived(contentLanguage.value);
	const selectedCollectionId = $derived(collection.value?._id);
	const currentMode = $derived(mode.value);
	const currentActiveWidgets = $derived($activeWidgets);

	/**
	 * Count total collections in a category tree
	 */
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

	/**
	 * Get status color for badge
	 */
	function getStatusColor(status?: StatusType): string {
		const statusColorMap: Record<StatusType, string> = {
			[StatusTypes.publish]: 'bg-success-500',
			[StatusTypes.draft]: 'bg-warning-500',
			[StatusTypes.archive]: 'bg-surface-500',
			[StatusTypes.schedule]: 'bg-primary-500',
			[StatusTypes.clone]: 'bg-secondary-500',
			[StatusTypes.test]: 'bg-tertiary-500',
			[StatusTypes.delete]: 'bg-error-500',
			[StatusTypes.unpublish]: 'bg-warning-400'
		};

		return status ? statusColorMap[status] || 'bg-primary-500' : 'bg-primary-500';
	}

	/**
	 * Map content node to tree node structure
	 */
	function mapNode(node: ExtendedContentNode, activeWidgetList: any[], depth = 0): CollectionTreeNode {
		const isCategory = node.nodeType === 'category';
		const translation = node.translations?.find((trans: Translation) => trans.languageTag === currentLanguage);
		const label = translation?.translationName || node.name;
		const nodeId = node._id;
		const isExpanded = expandedNodes.has(nodeId) || selectedCollectionId === nodeId;

		// Check for inactive widgets in collections
		let hasInactiveWidgets = false;
		if (!isCategory && node.fields) {
			const validation = validateSchemaWidgets({ ...node, fields: node.fields } as Schema, activeWidgetList);
			hasInactiveWidgets = !validation.valid;
		}

		// Map children recursively
		let children: CollectionTreeNode[] | undefined;
		if (isCategory && node.children) {
			const sortedChildren = [...node.children].sort((a, b) => (a.order || 0) - (b.order || 0));
			children = sortedChildren.map((child) => mapNode(child, activeWidgetList, depth + 1));
		}

		// Create badge for categories or warning badge for collections
		const allowedStatus = ['archive', 'draft', 'publish', 'schedule', 'clone', 'test', 'delete'] as const;
		const badge = isCategory
			? {
					count: countAllCollections(node),
					visible: true,
					status: allowedStatus.includes(node.status as (typeof allowedStatus)[number]) ? (node.status as (typeof allowedStatus)[number]) : undefined,
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
			lastModified: node.lastModified,
			// Use human-readable path for preloading, fall back to UUID if path not available
			path: !isCategory ? `/${currentLanguage}${node.path || '/' + nodeId}` : undefined
		};
	}

	/**
	 * Build collection tree structure
	 */
	const collectionStructureNodes = $derived(() => {
		collectionCountCache.clear();
		const sortedRootNodes = [...nestedStructure].sort((a, b) => (a.order || 0) - (b.order || 0));
		return sortedRootNodes.map((node) => mapNode(node, currentActiveWidgets));
	});

	/**
	 * Navigate to a path with optional reload
	 */
	async function navigateTo(path: string, options: { replaceState?: boolean; forceReload?: boolean } = {}): Promise<void> {
		logger.debug('[Collections.navigateTo]', {
			targetPath: path,
			currentPath: page.url.pathname,
			forceReload: options.forceReload
		});

		// Force reload if needed
		if (options.forceReload || page.url.pathname === path) {
			await invalidateAll();
		}

		await goto(path, {
			replaceState: options.replaceState,
			invalidateAll: true
		});
	}

	/**
	 * Handle collection/category selection
	 */
	function handleCollectionSelect(selectedCollection: ExtendedContentNode | Schema): void {
		const isExtendedContentNode = (node: unknown): node is ExtendedContentNode =>
			typeof node === 'object' && node !== null && '_id' in node && 'nodeType' in node;

		if (!isExtendedContentNode(selectedCollection)) return;

		if (selectedCollection.nodeType === 'collection') {
			const currentCollectionId = collection.value?._id;
			const isSameCollection = currentCollectionId === selectedCollection._id;

			logger.debug('[Collections.handleCollectionSelect]', {
				selectedId: selectedCollection._id,
				selectedName: selectedCollection.name,
				isSameCollection
			});

			// Set mode to view
			setMode('view');
			shouldShowNextButton.set(true);

			// Clear entry list cache
			document.dispatchEvent(
				new CustomEvent('clearEntryListCache', {
					detail: { resetState: true, reason: 'collection-switch' }
				})
			);

			// Navigate to collection using human-readable path
			const targetPath = `/${currentLanguage}${selectedCollection.path}`;
			navigateTo(targetPath, { forceReload: isSameCollection });
		} else if (selectedCollection.nodeType === 'category') {
			toggleNodeExpansion(selectedCollection._id);
		}
	}

	/**
	 * Toggle node expansion state
	 */
	function toggleNodeExpansion(nodeId: string): void {
		const newSet = new Set(expandedNodes);
		if (newSet.has(nodeId)) {
			newSet.delete(nodeId);
		} else {
			newSet.add(nodeId);
		}
		expandedNodes = newSet;
	}

	/**
	 * Clear search input
	 */
	function clearSearch(): void {
		search = '';
		debouncedSearch = '';
	}

	// Effects

	// Debounce search input
	$effect(() => {
		if (search) {
			isSearching = true;
		}
		debouncedSearchUpdate(search);
	});

	// Synchronize mode with route
	$effect(() => {
		const pathname = page.url.pathname;
		// Only handle collection mode, media mode is handled by MediaFolders component
		if (!pathname.includes('/mediagallery') && currentMode === 'media') {
			setMode('view');
		}
	});

	/**
	 * Lazy load children on expand
	 */
	async function onNodeExpand(node: CollectionTreeNode) {
		if (node.children && node.children.length > 0) return; // Already loaded

		// Find the node in the store and update loading state
		// Note: This requires a recursive search/update in the store which might be complex.
		// Alternatively, we can just fetch and update the local derived state if possible,
		// but modifying the store is better for persistence.

		try {
			// Set loading state (this might need a store action to be reactive deep down)
			// For now, let's assume we can fetch and update.

			const response = await axios.get(`/api/content/nodes?parentId=${node.id}`);
			if (response.data && response.data.nodes) {
				const newChildren = response.data.nodes;

				// Helper to recursively find and update node in structure
				const updateNodeInStructure = (nodes: any[]): boolean => {
					for (const n of nodes) {
						if (n._id === node.id) {
							n.children = newChildren;
							return true;
						}
						if (n.children && updateNodeInStructure(n.children)) {
							return true;
						}
					}
					return false;
				};

				// Update store
				const currentStructure = [...contentStructure.value];
				if (updateNodeInStructure(currentStructure)) {
					contentStructure.value = currentStructure;
				}
			}
		} catch (err) {
			logger.error('Failed to load children', err);
		}
	}

	/**
	 * Preload adjacent nodes on hover
	 */
	function onNodeHover(node: CollectionTreeNode) {
		// We could call an API to warm cache, but for now just log or skip
		// contentManager is server-side, so we can't call preloadAdjacentCollections directly.
		// We could add an endpoint for this if needed.
		if (node) return; // Suppress unused warning
	}
</script>

<div class="mt-2 space-y-2" role="navigation" aria-label="Collections navigation">
	<!-- Search Input -->
	<div class="relative {isFullSidebar ? 'w-full' : 'max-w-[135px]'}" role="search">
		<!-- Input Field -->
		<input
			type="text"
			placeholder={isFullSidebar ? 'Search collections...' : 'Search...'}
			bind:value={search}
			class="w-full rounded border border-surface-300 bg-surface-50 px-3 pr-11 text-sm text-surface-900 outline-none transition-all duration-200 placeholder:text-surface-400 hover:border-surface-400 focus:border-tertiary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-50 dark:placeholder:text-surface-400 dark:hover:border-surface-500 dark:focus:border-primary-500 focus:dark:border-primary-500 {isFullSidebar
				? 'h-12 py-2'
				: 'h-10 py-1.5'}"
			aria-label="Search collections"
			autocomplete="off"
		/>

		<!-- Right Side Icon/Button -->
		<div class="absolute right-1 top-1/2 -translate-y-1/2">
			{#if isSearching}
				<!-- Searching Indicator (pulsing dot while typing) -->
				<div class="flex items-center justify-center {isFullSidebar ? 'h-8 w-8' : 'h-7 w-7'}" aria-hidden="true">
					<div class="h-2 w-2 animate-pulse rounded-full bg-tertiary-500 dark:bg-primary-500"></div>
				</div>
			{:else if search}
				<!-- Clear Button (when search is complete and has text) -->
				<button type="button" onclick={clearSearch} class="preset-glass btn {isFullSidebar ? 'h-10 w-10' : 'h-7 w-7'}" aria-label="Clear search">
					<iconify-icon icon="ic:round-close" width="16"></iconify-icon>
				</button>
			{:else}
				<!-- Search Icon (when empty) -->
				<div
					class="flex items-center justify-center rounded bg-surface-200 text-surface-600 dark:bg-surface-700 dark:text-surface-300 {isFullSidebar
						? 'h-12 w-12'
						: 'h-10 w-10'}"
				>
					<iconify-icon icon="ic:outline-search" width="24"></iconify-icon>
				</div>
			{/if}
		</div>
	</div>

	<!-- Collections TreeView -->
	<div class="collections-list" role="tree" aria-label="Collection tree">
		{#if isLoading}
			<div class="flex flex-col items-center justify-center space-y-3 p-6" role="status" aria-live="polite">
				<div class="flex items-center justify-center space-x-2">
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.1s"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.2s"></div>
				</div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Loading collections...</p>
			</div>
		{:else if error}
			<div class="flex flex-col items-center justify-center space-y-3 p-6 text-center" role="alert" aria-live="assertive">
				<iconify-icon icon="ic:outline-error" width="32" class="text-error-500"></iconify-icon>
				<p class="text-sm text-error-500">{error}</p>
				<button type="button" class="preset-filled-error-500 btn btn-sm" onclick={() => window.location.reload()}>
					<iconify-icon icon="ic:outline-refresh" width="16" class="mr-1"></iconify-icon>
					Retry
				</button>
			</div>
		{:else if collectionStructureNodes().length > 0}
			<TreeView
				k={0}
				nodes={collectionStructureNodes()}
				selectedId={selectedCollectionId ?? null}
				compact={!isFullSidebar}
				search={debouncedSearch}
				iconColorClass="text-error-500"
				showBadges={true}
				onExpand={onNodeExpand}
				onHover={onNodeHover}
			/>
		{:else}
			<div class="flex flex-col items-center justify-center space-y-2 p-6 text-center">
				<iconify-icon icon="bi:collection" width="32" class="text-surface-400 opacity-50"></iconify-icon>
				<p class="text-sm text-surface-500 dark:text-surface-400">{m.collection_no_collections_found()}</p>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Smooth animations for tree nodes */
	:global(.tree-node) {
		transition: all 0.2s ease-in-out;
	}

	/* Custom scrollbar styling */
	.collections-list {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-primary-500) / 0.3) transparent;
	}

	.collections-list::-webkit-scrollbar {
		width: 4px;
	}

	.collections-list::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-primary-500) / 0.3);
		border-radius: 2px;
	}

	.collections-list::-webkit-scrollbar-thumb:hover {
		background-color: rgb(var(--color-primary-500) / 0.5);
	}
</style>

<!--
@file src/components/Collections.svelte
@component
**Collections component for navigating content categories and collections**
@example
<Collections />

#### Props
- `collection` - The collection object to display data from.
- `mode` - The current mode of the component. Can be 'view', 'edit', 'create', 'delete', 'modify', or 'media'.

Features:
- Display collections and categories using TreeView
- Advanced search with debouncing
- Support for nested categories with expand/collapse
- Widget validation warnings
- Keyboard navigation support
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
			count?: number; // Number to display in the badge
			status?: 'archive' | 'draft' | 'publish' | 'schedule' | 'clone' | 'test' | 'delete'; // Badge status
			color?: string; // Badge color
			visible?: boolean; // Badge visibility
			icon?: string; // Badge Warning icon for inactive widgets
			title?: string; // Tooltip title
		};
		nodeType?: 'category' | 'collection'; // Type of the node
		path?: string; // Path of the collection/category
		lastModified?: Date; // Last modified date of the collection/category
		isLoading?: boolean; // Indicate if the node is in a loading state
		hasError?: boolean; // Indicate if there was an error loading this node
		depth?: number; // Add depth property for indentation
		order?: number; // Add order property for sorting
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';

	// Types
	import type { ContentNode, FieldInstance, Schema, StatusType, Translation } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';

	// Stores
	import { collection, contentStructure, mode, setMode } from '@stores/collectionStore.svelte';
	import { uiStateManager } from '@stores/UIStore.svelte';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';

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

	// State management
	let search = $state('');
	let debouncedSearch = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let expandedNodes = $state<Set<string>>(new Set());

	// Debounce function
	const debouncedSearchUpdate = debounce.create(
		((searchValue: string) => {
			debouncedSearch = searchValue.toLowerCase().trim();
		}) as (...args: unknown[]) => unknown,
		150
	);

	// --- Derived States ---
	let nestedStructure = $derived(contentStructure.value || []);
	let isFullSidebar = $derived(uiStateManager.uiState.value.leftSidebar === 'full');

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
				onClick: () => {
					console.log('[Collections] onClick fired for node:', label, nodeId);
					handleCollectionSelect(node);
				},
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

	// Helper function for navigation
	async function navigateTo(path: string, options: { replaceState?: boolean; forceReload?: boolean } = {}): Promise<void> {
		console.log('[navigateTo] Starting navigation', {
			targetPath: path,
			currentPath: page.url.pathname,
			forceReload: options.forceReload,
			willInvalidate: options.forceReload || page.url.pathname === path
		});

		// If forcing reload or path is same but we need fresh data
		if (options.forceReload || page.url.pathname === path) {
			console.log('[navigateTo] Calling invalidateAll before navigation');
			await invalidateAll(); // Force SSR to re-run
		}

		console.log('[navigateTo] Calling goto with invalidateAll: true');
		await goto(path, {
			replaceState: options.replaceState,
			invalidateAll: true // Force data reload
		});
		console.log('[navigateTo] Navigation completed');
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

	// Collection selection
	function handleCollectionSelect(selectedCollection: ExtendedContentNode | Schema) {
		const isExtendedContentNode = (node: unknown): node is ExtendedContentNode =>
			typeof node === 'object' && node !== null && '_id' in node && 'nodeType' in node;

		if (isExtendedContentNode(selectedCollection)) {
			if (selectedCollection.nodeType === 'collection') {
				const currentCollectionId = collection.value?._id;

				console.log('[handleCollectionSelect] Collection selected', {
					selectedId: selectedCollection._id,
					selectedName: selectedCollection.name,
					selectedPath: selectedCollection.path,
					currentCollectionId,
					isSameCollection: currentCollectionId === selectedCollection._id
				});

				// Always navigate to trigger SSR, even if same collection
				// The path might be the same but we need fresh data

				// Set mode to view for collection display
				setMode('view');

				// Don't clear collection - let the server load set the new one
				// This prevents the Loading flash
				shouldShowNextButton.set(true);

				// Clear cached entry list data
				const cacheEvent = new CustomEvent('clearEntryListCache', {
					detail: { resetState: true, reason: 'collection-switch' }
				});
				document.dispatchEvent(cacheEvent);

				// Navigate to the collection using UUID
				// The server will handle UUID lookup and the browser will show the path
				const targetPath = `/${contentLanguage.value}/${selectedCollection._id}`;
				console.log('[handleCollectionSelect] About to navigate to UUID:', targetPath);
				navigateTo(targetPath, { forceReload: currentCollectionId === selectedCollection._id });
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

	// Effect to synchronize mode with route
	$effect(() => {
		const pathname = page.url.pathname;
		const currentMode = mode.value;

		// Only handle collection mode, media mode is handled by MediaFolders component
		if (!pathname.includes('/mediagallery') && currentMode === 'media') {
			setMode('view');
		}
	});
</script>

<div class="collections-container mt-2" role="navigation" aria-label="Collections navigation">
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

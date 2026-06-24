<!--
@file src/components/collections.svelte
@description
Tree navigation for content categories and collections.
Provides an organized interface for navigating hierarchical content structures.

@component
**Collections** – Hierarchical tree navigation for content orchestration.

### Features:
- **Hierarchical Tree**: Nested categories and collections with count badges.
- **Search**: Debounced real-time search with clear functionality.
- **Validation**: Integrated widget validation warnings for schema health.
- **Navigation**: Click-based routing with expansion state persistence.
- **Responsive**: Compact and full sidebar modes support.

### features:
- hierarchical tree navigation
- real-time debounced search
- schema validation integration
- responsive layout support
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Loader from '@components/ui/loader.svelte';
	import Select from '@components/ui/select.svelte';
	// Components
	import TreeView from '@components/ui/tree-view.svelte';
	import type { ContentNode, Schema } from '@src/content/types';
	import { type StatusType, StatusTypes } from '@src/content/types';
	import { sortContentNodes } from '@src/content/content-utils';
	// Paraglide Messages
	import { collection_no_collections_found, collections_search } from '@src/paraglide/messages';
	import { collection, contentStructure, setMode } from '@src/stores/collection-store.svelte.ts';
	import { app } from '@src/stores/store.svelte';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { debounce } from '@utils/utils';
	import { validateSchemaWidgets } from '@widgets/widget-validation';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	interface ExtendedContentNode extends ContentNode {
		children?: ExtendedContentNode[];
		fileCount?: number;
		lastModified?: Date;
	}

	interface CollectionTreeNode {
		badge?: {
			count?: number;
			status?: 'archive' | 'draft' | 'publish' | 'schedule' | 'clone' | 'test' | 'delete';
			color?: string;
			visible?: boolean;
			icon?: string;
			title?: string;
		};
		children?: CollectionTreeNode[];
		depth: number;
		icon?: string;
		id: string;
		isExpanded: boolean;
		name: string;
		onClick: () => void;
		order: number;
		path?: string;
		actions?: {
			icon: string;
			label: string;
			onClick: (node: any, event: MouseEvent) => void;
			colorClass?: string;
		}[];
	}

	// Derived logged-in user ID
	const userId = $derived(page.data.user?.id || page.data.user?._id || 'guest');

	// Mutable state
	let search = $state('');
	let debouncedSearch = $state('');
	let isSearching = $state(false);
	let expandedNodes = new SvelteSet<string>();

	let favorites = $state<string[]>([]);
	let tagMap = $state<Record<string, string[]>>({});

	// Filter state
	let showOnlyFavorites = $state(false);
	let selectedTagFilter = $state('');

	// Tag modal state
	let showTagModal = $state(false);
	let activeCollectionIdForTagging = $state('');
	let activeCollectionLabelForTagging = $state('');
	let currentTagsInput = $state('');

	let previousActiveElement = $state<HTMLElement | null>(null);

	$effect(() => {
		if (showTagModal) {
			previousActiveElement = document.activeElement as HTMLElement;
			setTimeout(() => {
				const input = document.querySelector('input[aria-describedby="tags-help"]') as HTMLElement;
				if (input) {
					input.focus();
				}
			}, 50);
		} else {
			if (previousActiveElement) {
				previousActiveElement.focus();
				previousActiveElement = null;
			}
		}
	});

	function handleModalKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			showTagModal = false;
			return;
		}
		if (e.key === 'Tab') {
			const modalEl = document.querySelector('[role="dialog"]') as HTMLElement;
			if (!modalEl) return;
			const focusables = modalEl.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (focusables.length === 0) return;
			const first = focusables[0] as HTMLElement;
			const last = focusables[focusables.length - 1] as HTMLElement;
			if (e.shiftKey) {
				if (document.activeElement === first) {
					last.focus();
					e.preventDefault();
				}
			} else {
				if (document.activeElement === last) {
					first.focus();
					e.preventDefault();
				}
			}
		}
	}

	// Load from local storage when userId changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			const favsKey = `sveltycms_favs_${userId}`;
			const tagsKey = `sveltycms_tags_${userId}`;

			try {
				const favsData = localStorage.getItem(favsKey);
				favorites = favsData ? JSON.parse(favsData) : [];
			} catch (e) {
				favorites = [];
			}

			try {
				const tagsData = localStorage.getItem(tagsKey);
				tagMap = tagsData ? JSON.parse(tagsData) : {};
			} catch (e) {
				tagMap = {};
			}
		}
	});

	// Save to local storage when favorites changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			const favsKey = `sveltycms_favs_${userId}`;
			localStorage.setItem(favsKey, JSON.stringify(favorites));
		}
	});

	// Save to local storage when tagMap changes
	$effect(() => {
		if (typeof window !== 'undefined') {
			const tagsKey = `sveltycms_tags_${userId}`;
			localStorage.setItem(tagsKey, JSON.stringify(tagMap));
		}
	});

	// Compute all unique tags for filter dropdown
	const allTags = $derived.by(() => {
		const tagsSet = new Set<string>();
		for (const key in tagMap) {
			if (tagMap[key]) {
				tagMap[key].forEach(tag => tagsSet.add(tag));
			}
		}
		return Array.from(tagsSet).sort();
	});

	const tagFilterOptions = $derived(
		allTags.map((tag) => ({ value: tag, label: tag }))
	);

	function openTagEditor(collectionId: string, label: string) {
		activeCollectionIdForTagging = collectionId;
		activeCollectionLabelForTagging = label;
		const currentTags = tagMap[collectionId] || [];
		currentTagsInput = currentTags.join(', ');
		showTagModal = true;
	}

	function saveTags() {
		const parsedTags = currentTagsInput
			.split(',')
			.map(t => t.trim())
			.filter(t => t.length > 0);

		if (parsedTags.length > 0) {
			tagMap = {
				...tagMap,
				[activeCollectionIdForTagging]: parsedTags
			};
		} else {
			const newTagMap = { ...tagMap };
			delete newTagMap[activeCollectionIdForTagging];
			tagMap = newTagMap;
		}
		showTagModal = false;
	}

	let updateDebounced = debounce.create((value: unknown) => {
		debouncedSearch = (value as string).toLowerCase().trim();
		isSearching = false;
	}, 300);

	$effect(() => {
		if (search) {
			isSearching = true;
		}
		updateDebounced(search);
	});

	// Derived UI & data
	let isFullSidebar = $derived(ui.state.leftSidebar === 'full');
	let currentLanguage = $derived(app.contentLanguage);
	let selectedId = $derived(collection.value?._id ?? null);
	let activeWidgetList = $derived(widgets.activeWidgets);
	let structure = $derived(contentStructure.value ?? []);

	let treeNodes = $derived.by(() => {
		const localCountCache = new SvelteMap<string, number>();

		function countCollections(node: ExtendedContentNode): number {
			const key = node._id;
			if (localCountCache.has(key)) {
				return localCountCache.get(key)!;
			}

			if (!node.children || node.nodeType !== 'category') {
				localCountCache.set(key, 0);
				return 0;
			}

			let total = 0;
			for (const child of node.children) {
				if (child.nodeType === 'collection') {
					total++;
				} else if (child.nodeType === 'category') {
					total += countCollections(child);
				}
			}
			localCountCache.set(key, total);
			return total;
		}

		function getBadgeColor(status: StatusType | undefined = undefined): string {
			const map: Record<StatusType, string> = {
				[StatusTypes.publish]: 'bg-tertiary-500 dark:bg-primary-500',
				[StatusTypes.draft]: 'bg-warning-500',
				[StatusTypes.archive]: 'bg-surface-500',
				[StatusTypes.schedule]: 'bg-tertiary-500 dark:bg-primary-500',
				[StatusTypes.clone]: 'bg-secondary-500',
				[StatusTypes.delete]: 'bg-error-500',
				[StatusTypes.unpublish]: 'bg-warning-400'
			};
			return status ? (map[status] ?? 'bg-tertiary-500 dark:bg-primary-500') : 'bg-tertiary-500 dark:bg-primary-500';
		}

		function mapToTreeNode(node: ExtendedContentNode, depth = 0): CollectionTreeNode {
			const translation = node.translations?.find((t) => t.languageTag === currentLanguage);
			const label = translation?.translationName || node.name;
			const isCategory = node.nodeType === 'category';
			const isExpanded = expandedNodes.has(node._id) || selectedId === node._id;

			// Inactive widget warning for collections
			let hasInactiveWidgets = false;
			if (!isCategory && node.collectionDef?.fields) {
				const validation = validateSchemaWidgets(node.collectionDef as Schema, activeWidgetList);
				hasInactiveWidgets = !validation.valid;
			}

			// Children
			let children: CollectionTreeNode[] | undefined;
			if (isCategory && node.children) {
				const sorted = [...node.children].sort(sortContentNodes);
				children = sorted.map((child) => mapToTreeNode(child, depth + 1));
			}

			// Badge
			let badge: CollectionTreeNode['badge'];
			if (isCategory) {
				badge = {
					count: countCollections(node),
					visible: true,
					color: getBadgeColor(node.collectionDef?.status)
				};
			} else if (hasInactiveWidgets) {
				badge = {
					visible: true,
					color: 'bg-warning-500',
					icon: 'mdi:alert-circle',
					title: 'This collection uses inactive widgets'
				};
			}

			const isPinned = pinnedStore.isPinned(node._id);
			const isFav = favorites.includes(node._id);
			const actions = isCategory ? undefined : [
				{
					icon: isPinned ? 'bi:pin-angle-fill' : 'bi:pin-angle',
					label: isPinned ? 'Unpin Collection' : 'Pin Collection',
					colorClass: isPinned ? 'text-tertiary-500 dark:text-primary-500' : 'text-surface-500',
					onClick: (_treeNode: any, event: MouseEvent) => {
						event.stopPropagation();
						pinnedStore.togglePin({
							id: node._id,
							name: label,
							type: 'collection',
							path: `/${currentLanguage}${node.path || `/${node._id}`}`,
							icon: node.icon || 'bi:collection'
						});
					}
				},
				{
					icon: isFav ? 'bi:star-fill' : 'bi:star',
					label: isFav ? 'Remove Favorite' : 'Add Favorite',
					colorClass: isFav ? 'text-amber-500' : 'text-surface-500',
					onClick: (_treeNode: any, event: MouseEvent) => {
						event.stopPropagation();
						if (isFav) {
							favorites = favorites.filter(id => id !== node._id);
						} else {
							favorites = [...favorites, node._id];
						}
					}
				},
				{
					icon: 'bi:tag',
					label: 'Manage Tags',
					colorClass: 'text-surface-500 hover:text-tertiary-500 dark:text-primary-500',
					onClick: (_treeNode: any, event: MouseEvent) => {
						event.stopPropagation();
						openTagEditor(node._id, label);
					}
				}
			];

			return {
					id: node._id,
					name: label,
					type: isCategory ? 'category' : 'collection',
					isExpanded,
				onClick: () => selectNode(node),
				children,
				icon: node.icon || (isCategory ? 'bi:folder' : 'bi:collection'),
				badge,
				path: isCategory ? undefined : `/${currentLanguage}${node.path || `/${node._id}`}`,
				depth,
				order: node.order ?? 0,
				actions
			};
		}

		function filterNode(node: ExtendedContentNode): ExtendedContentNode | null {
			const isCategory = node.nodeType === 'category';
			if (isCategory) {
				if (!node.children || node.children.length === 0) {
					return null;
				}
				const filteredChildren = node.children
					.map(child => filterNode(child))
					.filter((child): child is ExtendedContentNode => child !== null);

				if (filteredChildren.length === 0) {
					return null;
				}
				return {
					...node,
					children: filteredChildren
				};
			} else {
				if (showOnlyFavorites && !favorites.includes(node._id)) {
					return null;
				}
				if (selectedTagFilter) {
					const nodeTags = tagMap[node._id] || [];
					if (!nodeTags.includes(selectedTagFilter)) {
						return null;
					}
				}
				return node;
			}
		}

		function buildTree(nodes: ExtendedContentNode[]): ExtendedContentNode[] {
			if (!nodes || nodes.length === 0) {
				return [];
			}

			const nodeMap = new SvelteMap<string, ExtendedContentNode>();
			const roots: ExtendedContentNode[] = [];

			// First pass: flattened map of all unique nodes
			function gatherNodes(itemList: ExtendedContentNode[]) {
				for (const item of itemList) {
					const id = String(item._id);
					if (!nodeMap.has(id)) {
						nodeMap.set(id, { ...item, children: [] });
						if (item.children && item.children.length > 0) {
							gatherNodes(item.children as ExtendedContentNode[]);
						}
					}
				}
			}

			gatherNodes(nodes);

			// Second pass: link using parentId
			nodeMap.forEach((node: ExtendedContentNode) => {
				if (node.parentId) {
					const parentId = String(node.parentId);
					const parent = nodeMap.get(parentId);
					if (parent) {
						parent.children = parent.children || [];
						if (!parent.children.some((c: ExtendedContentNode) => String(c._id) === String(node._id))) {
							parent.children.push(node);
						}
					} else {
						// Parent not in map, promote to root
						roots.push(node);
					}
				} else {
					// No parentId, it's a root
					roots.push(node);
				}
			});

			return roots;
		}

		const nestedStructure = buildTree(structure as ExtendedContentNode[]);

		const filteredNestedStructure = nestedStructure
			.map(n => filterNode(n))
			.filter((n): n is ExtendedContentNode => n !== null);

		const sorted = [...filteredNestedStructure].sort(sortContentNodes);
		return sorted.map((n) => mapToTreeNode(n));
	});

	async function navigate(path: string, force = false): Promise<void> {
		if (page.url.pathname === path && !force) {
			return;
		}
		if (force || page.url.pathname === path) {
			await invalidateAll();
		}

		await goto(path, { invalidateAll: true });
	}

	function selectNode(node: ExtendedContentNode): void {
		if (node.nodeType === 'category') {
			toggleExpand(node._id);
			return;
		}

		// Collection selected
		const same = selectedId === node._id;
		setMode('view');
		app.shouldShowNextButton = true;

		document.dispatchEvent(
			new CustomEvent('clearEntryListCache', {
				detail: { resetState: true, reason: 'collection-switch' }
			})
		);

		const target = `/${currentLanguage}${node.path || `/${node._id}`}`;
		navigate(target, same);
	}

	function toggleExpand(id: string): void {
		if (expandedNodes.has(id)) {
			expandedNodes.delete(id);
		} else {
			expandedNodes.add(id);
		}
	}


</script>

<div class="mt-2 space-y-2" role="navigation" aria-label="Collections">
	<!-- Favorites & Tags Filter Controls -->
	{#if isFullSidebar}
		<div class="flex items-center gap-2 px-1">
			<!-- Favorites Pill Toggle -->
			<Button variant="outline"
				type="button"
				onclick={() => showOnlyFavorites = !showOnlyFavorites}
				aria-label="Filter by Favorites"
			 size="sm" class="flex items-center gap-1.5 rounded-full border transition-all text-xs font-semibold py-1 px-3 {showOnlyFavorites ? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400' : 'bg-surface-500/10 border-transparent hover:bg-surface-500/20 text-surface-600 dark:text-surface-300'}">
				<iconify-icon icon={showOnlyFavorites ? 'bi:star-fill' : 'bi:star'} width="14" class={showOnlyFavorites ? 'text-amber-500' : ''}></iconify-icon>
				<span>Favorites</span>
			</Button>

			<!-- Tags Filter Dropdown -->
			{#if allTags.length > 0}
				<div class="relative flex-1">
					<Select
						bind:value={selectedTagFilter}
						options={tagFilterOptions}
						placeholder="All Tags"
						allowEmptySelection
						size="sm"
					/>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Search -->
	<div class="relative {isFullSidebar ? 'w-full' : 'w-12'}">
		<Input
			id="collections-search"
			type="search"
			bind:value={search}
			placeholder={collections_search()}
			inputClass="pe-11 {isFullSidebar ? 'h-12 py-3' : 'h-10 py-2'}"
			aria-label="Search collections"
		/>

		{#if isFullSidebar}
			<div class="absolute inset-e-0 top-0 flex h-full items-center">
				{#if isSearching}
					<div class="flex h-10 w-10 items-center justify-center">
						<Loader variant="circle" width="size-2" height="size-2" ariaLabel="Searching collections" />
					</div>
				{:else if search}
					<Button variant="outline"
						type="button"
						onclick={() => (search = '')}
						aria-label="Clear search"
					 class="rounded-full preset-outlined-surface-500 h-9 w-9 mt-0.5 me-0.5">
						<iconify-icon icon="ic:round-close" width={24}></iconify-icon>
					</Button>
				{:else}
					<!-- Search with icon -->
					<div class="flex items-center justify-center rounded-e bg-secondary-100 dark:bg-surface-700 h-9 w-9 mt-0.5 me-0.5">
						<iconify-icon icon="ic:outline-search" width={24}></iconify-icon>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Tree -->
	<div class="collections-list" role={treeNodes.length > 0 ? 'tree' : undefined} aria-label={treeNodes.length > 0 ? 'Collection tree' : undefined}>
		{#if treeNodes.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 p-6 text-center">
				{#if !widgets.isLoaded}
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
					<p class="text-xs text-surface-400">Loading collections…</p>
				{:else}
					<iconify-icon icon="bi:collection" width={24}></iconify-icon>
					{#if isFullSidebar}
						<p class="text-sm text-surface-500 dark:text-surface-50">{collection_no_collections_found()}</p>
					{/if}
				{/if}
			</div>
		{:else if !widgets.isLoaded}
			<div class="flex h-24 items-center justify-center">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
			</div>
		{:else}
			<TreeView nodes={treeNodes} {selectedId} compact={!isFullSidebar} search={debouncedSearch} iconColorClass="text-error-500" showBadges={true} />
		{/if}
	</div>
</div>

<!-- Premium Tag Editor Modal Dialog Overlay -->
{#if showTagModal}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="tag-modal-title"
		tabindex="-1"
		onkeydown={handleModalKeyDown}
	>
		<div
			class="card w-full max-w-md p-6 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-2xl relative"
			role="document"
		>
			<Button variant="ghost"
				type="button"
				onclick={() => showTagModal = false}
				aria-label="Close dialog"
			 class="p-0! min-w-0 -xs absolute top-4 inset-e-4 rounded-full hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-500">
				<iconify-icon icon="bi:x" width="20"></iconify-icon>
			</Button>

			<h3 id="tag-modal-title" class="text-lg font-bold text-surface-900 dark:text-white mb-2">
				Manage Tags
			</h3>
			<p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
				Manage tags for <span class="font-bold text-tertiary-500 dark:text-primary-500">{activeCollectionLabelForTagging}</span>. Use commas to separate multiple tags.
			</p>

			<div class="space-y-4">
				<div>
					<Input
						bind:value={currentTagsInput}
						label="Tags"
						placeholder="e.g. news, features, blog"
						aria-describedby="tags-help"
					/>
					<span id="tags-help" class="text-[11px] text-surface-400 mt-1 block">
						Separate multiple tags with a comma.
					</span>
				</div>

				<!-- Current tags preview -->
				{#if tagMap[activeCollectionIdForTagging] && tagMap[activeCollectionIdForTagging].length > 0}
					<div class="flex flex-wrap gap-1.5 mt-2">
						{#each tagMap[activeCollectionIdForTagging] as tag}
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-tertiary-500 dark:bg-primary-500/10 text-tertiary-500 dark:text-primary-500">
								{tag}
								<Button variant="ghost"
									type="button"
									class="p-0! min-w-0 text-current hover:text-error-500 leading-none"
									onclick={() => {
										const currentTags = tagMap[activeCollectionIdForTagging] || [];
										const updatedTags = currentTags.filter(t => t !== tag);
										tagMap[activeCollectionIdForTagging] = updatedTags;
										currentTagsInput = updatedTags.join(', ');
									}}
									aria-label={`Remove tag ${tag}`}
								>
									&times;
								</Button>
							</span>
						{/each}
					</div>
				{/if}

				<div class="flex justify-end gap-2 mt-6">
					<Button variant="outline"
						type="button"
						onclick={() => showTagModal = false}
					 class="bg-surface-200 dark:bg-surface-800 hover:bg-surface-300 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-200 px-4 py-2 rounded text-sm font-semibold">
						Cancel
					</Button>
					<Button variant="tertiary"
						type="button"
						onclick={saveTags}
					 class="text-white px-4 py-2 rounded text-sm font-semibold">
						Save
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.collections-list {
		scrollbar-color: rgb(var(--color-primary-500) / 0.3) transparent;
		scrollbar-width: thin;
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

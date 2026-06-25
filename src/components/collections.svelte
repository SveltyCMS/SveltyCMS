<!--
@file src/components/collections.svelte
@description
Tree navigation for content categories and collections.
Provides an organized interface for navigating hierarchical content structures.

@component
**Collections** – Hierarchical tree navigation for content orchestration.

### Features:
- **Hierarchical Tree**: Nested categories and collections with count badges.
- **Drag & Drop Reorder**: Optimistic visual reordering with sibling reindexing (fixes nested lookup + child sorting + collisions).
- **Search**: Debounced real-time search with clear functionality.
- **Validation**: Integrated widget validation warnings for schema health.
- **Navigation**: Click-based routing with expansion state persistence.
- **Responsive**: Compact and full sidebar modes support.
- **Filters**: Favorites toggle + tag-based filtering with "Clear filters" button.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Loader from '@components/ui/loader.svelte';
	import Select from '@components/ui/select.svelte';
	import TreeView from '@components/ui/tree-view.svelte';
	import type { ContentNode, Schema } from '@src/content/types';
	import { type StatusType, StatusTypes } from '@src/content/types';
	import { collection, contentStructure } from '@src/stores/collection-store.svelte.ts';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
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
			status?: StatusType;
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
		type?: 'category' | 'collection';
		path?: string;
		actions?: Array<{
			icon: string;
			label: string;
			onClick: (node: any, event: MouseEvent) => void;
			colorClass?: string;
		}>;
	}

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

	// === Drag & Drop: reactive order overrides and flat node lookup map ===
	let orderOverrides = new SvelteMap<string, number>();
	let flatNodeMap = new Map<string, ExtendedContentNode>();

	// Seed orderOverrides from persisted manifest order (survives restarts)
	$effect(() => {
		const persisted = page.data.collectionOrder as Record<string, number> | undefined;
		if (persisted && typeof persisted === 'object') {
			for (const [id, order] of Object.entries(persisted)) {
				orderOverrides.set(id, order);
			}
		}
	});

	$effect(() => {
		if (showTagModal) {
			previousActiveElement = document.activeElement as HTMLElement;
			setTimeout(() => {
				const input = document.querySelector('input[aria-describedby="tags-help"]') as HTMLElement;
				if (input) input.focus();
			}, 50);
		} else if (previousActiveElement) {
			previousActiveElement.focus();
			previousActiveElement = null;
		}
	});

	function handleModalKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			showTagModal = false;
			return;
		}
		if (e.key === 'Tab') {
			const modal = document.querySelector('[role="dialog"]') as HTMLElement;
			if (!modal) return;
			const focusables = modal.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (!focusables.length) return;
			const first = focusables[0] as HTMLElement;
			const last = focusables[focusables.length - 1] as HTMLElement;
			if ((e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
				(e.shiftKey ? last : first).focus();
				e.preventDefault();
			}
		}
	}

	// Load favorites & tags from localStorage
	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			const favsData = localStorage.getItem(`sveltycms_favs_${userId}`);
			favorites = favsData ? JSON.parse(favsData) : [];
		} catch { favorites = []; }
		try {
			const tagsData = localStorage.getItem(`sveltycms_tags_${userId}`);
			tagMap = tagsData ? JSON.parse(tagsData) : {};
		} catch { tagMap = {}; }
	});

	// Persist favorites & tags
	$effect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem(`sveltycms_favs_${userId}`, JSON.stringify(favorites));
		}
	});
	$effect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem(`sveltycms_tags_${userId}`, JSON.stringify(tagMap));
		}
	});

	// Compute all unique tags for filter dropdown
	const allTags = $derived.by(() => {
		const set = new Set<string>();
		Object.values(tagMap).forEach(tags => tags.forEach(t => set.add(t)));
		return Array.from(set).sort();
	});

	const tagFilterOptions = $derived(allTags.map(t => ({ value: t, label: t })));

	function openTagEditor(collectionId: string, label: string) {
		activeCollectionIdForTagging = collectionId;
		activeCollectionLabelForTagging = label;
		currentTagsInput = (tagMap[collectionId] || []).join(', ');
		showTagModal = true;
	}

	function saveTags() {
		const parsed = currentTagsInput.split(',').map(t => t.trim()).filter(Boolean);
		if (parsed.length) {
			tagMap = { ...tagMap, [activeCollectionIdForTagging]: parsed };
		} else {
			const m = { ...tagMap };
			delete m[activeCollectionIdForTagging];
			tagMap = m;
		}
		showTagModal = false;
	}

	const updateDebounced = debounce.create((value: unknown) => {
		debouncedSearch = (value as string).toLowerCase().trim();
		isSearching = false;
	}, 300);

	$effect(() => {
		if (search) isSearching = true;
		updateDebounced(search);
	});

	// Derived UI & data
	let isFullSidebar = $derived(ui.state.leftSidebar === 'full');
	let currentLanguage = $derived(app.contentLanguage);
	let selectedId = $derived(collection.value?._id ?? null);
	let activeWidgetList = $derived(widgets.activeWidgets);
	let structure = $derived(contentStructure.value ?? []);

	// === Main derived tree with override-aware sorting at every level ===
	let treeNodes = $derived.by(() => {
		flatNodeMap.clear();

		const localCountCache = new SvelteMap<string, number>();

		function countCollections(node: ExtendedContentNode): number {
			const key = node._id;
			if (localCountCache.has(key)) return localCountCache.get(key)!;
			if (!node.children || node.nodeType !== 'category') {
				localCountCache.set(key, 0);
				return 0;
			}
			let total = 0;
			for (const c of node.children) {
				total += c.nodeType === 'collection' ? 1 : countCollections(c);
			}
			localCountCache.set(key, total);
			return total;
		}

		function getBadgeColor(status: StatusType | undefined = undefined) {
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

		// Effective order: override wins
		const getEffectiveOrder = (node: ExtendedContentNode) =>
			orderOverrides.get(node._id) ?? node.order ?? 0;

		function mapToTreeNode(node: ExtendedContentNode, depth = 0): CollectionTreeNode {
			const translation = node.translations?.find(t => t.languageTag === currentLanguage);
			const label = translation?.translationName || node.name;
			const isCategory = node.nodeType === 'category';
			const isExpanded = expandedNodes.has(node._id) || selectedId === node._id;

			let hasInactiveWidgets = false;
			if (!isCategory && node.collectionDef?.fields) {
				hasInactiveWidgets = !validateSchemaWidgets(node.collectionDef as Schema, activeWidgetList).valid;
			}

			let children: CollectionTreeNode[] | undefined;
			if (isCategory && node.children?.length) {
				// Override-aware sort for children (fixes child sorting bug)
				const sortedChildren = [...node.children].sort(
					(a, b) => getEffectiveOrder(a) - getEffectiveOrder(b)
				);
				children = sortedChildren.map(c => mapToTreeNode(c, depth + 1));
			}

			let badge: CollectionTreeNode['badge'];
			if (isCategory) {
				badge = {
					count: countCollections(node),
					visible: true,
					color: getBadgeColor(node.collectionDef ? node.collectionDef.status : undefined)
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
					label: isPinned ? 'Unpin' : 'Pin Collection',
					colorClass: isPinned ? 'text-tertiary-500 dark:text-primary-500' : 'text-surface-500',
					onClick: (_: any, e: MouseEvent) => {
						e.stopPropagation();
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
					onClick: (_: any, e: MouseEvent) => {
						e.stopPropagation();
						favorites = isFav ? favorites.filter(id => id !== node._id) : [...favorites, node._id];
					}
				},
				{
					icon: 'bi:tag',
					label: 'Manage Tags',
					colorClass: 'text-surface-500 hover:text-tertiary-500 dark:text-primary-500',
					onClick: (_: any, e: MouseEvent) => { e.stopPropagation(); openTagEditor(node._id, label); }
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
				order: getEffectiveOrder(node),
				actions
			};
		}

		function filterNode(node: ExtendedContentNode): ExtendedContentNode | null {
			if (node.nodeType === 'category') {
				if (!node.children?.length) return null;
				const filtered = node.children
					.map(filterNode)
					.filter((n): n is ExtendedContentNode => n !== null);
				return filtered.length ? { ...node, children: filtered } : null;
			}
			if (showOnlyFavorites && !favorites.includes(node._id)) return null;
			if (selectedTagFilter && !(tagMap[node._id] || []).includes(selectedTagFilter)) return null;
			return node;
		}

		function buildTree(nodes: ExtendedContentNode[]): ExtendedContentNode[] {
			if (!nodes?.length) return [];
			const nodeMapLocal = new SvelteMap<string, ExtendedContentNode>();
			const roots: ExtendedContentNode[] = [];

			function gather(list: ExtendedContentNode[]) {
				for (const item of list) {
					const id = String(item._id);
					if (!nodeMapLocal.has(id)) {
						nodeMapLocal.set(id, { ...item, children: [] });
						if (item.children?.length) gather(item.children as ExtendedContentNode[]);
					}
				}
			}
			gather(nodes);

			nodeMapLocal.forEach((node) => {
				flatNodeMap.set(node._id, node); // populate flat map for drag & drop
				if (node.parentId) {
					const parent = nodeMapLocal.get(String(node.parentId));
					if (parent) {
						parent.children = parent.children || [];
						if (!parent.children.some(c => String(c._id) === String(node._id))) {
							parent.children.push(node);
						}
					} else {
						roots.push(node);
					}
				} else {
					roots.push(node);
				}
			});
			return roots;
		}

		const nested = buildTree(structure as ExtendedContentNode[]);
		const filtered = nested
			.map(filterNode)
			.filter((n): n is ExtendedContentNode => n !== null);

		// Top-level sort uses effective order
		const sorted = [...filtered].sort(
			(a, b) => getEffectiveOrder(a) - getEffectiveOrder(b)
		);
		return sorted.map(n => mapToTreeNode(n));
	});

	// === Drag & Drop handler with flat lookup + collision-free reindexing ===
	function handleTreeReorder(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') {
		// Note: 'inside' treated as 'after' (no reparenting in current v1)
		if (position === 'inside') position = 'after';

		// Use flatNodeMap for reliable nested lookup
		const targetNode = flatNodeMap.get(targetId);
		const targetOrder = orderOverrides.get(targetId) ?? targetNode?.order ?? 0;

		let newOrder = targetOrder + (position === 'after' ? 1 : -1);
		orderOverrides.set(draggedId, newOrder);

		// Re-index siblings to guarantee unique sequential orders
		reindexSiblings(targetNode?.parentId ?? null);

		// Persist to manifest via API
		persistOrder();
	}

	let _persistTimer: ReturnType<typeof setTimeout>;
	function persistOrder() {
		clearTimeout(_persistTimer);
		_persistTimer = setTimeout(async () => {
			const order: Record<string, number> = {};
			orderOverrides.forEach((v, k) => { order[k] = v; });
			try {
				await fetch('/api/collections/reorder', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order }),
				});
			} catch { /* non-critical */ }
		}, 300);
	}

	function reindexSiblings(parentId: string | null) {
		const siblings = Array.from(flatNodeMap.values()).filter(n =>
			parentId === null ? !n.parentId : String(n.parentId) === parentId
		);

		siblings.sort((a, b) => {
			const oa = orderOverrides.get(a._id) ?? a.order ?? 0;
			const ob = orderOverrides.get(b._id) ?? b.order ?? 0;
			return oa - ob;
		});

		siblings.forEach((node, index) => {
			orderOverrides.set(node._id, index);
		});
	}

	function clearAllFilters() {
		search = '';
		debouncedSearch = '';
		isSearching = false;
		showOnlyFavorites = false;
		selectedTagFilter = '';
	}

	function resetCustomOrder() {
		orderOverrides.clear();
		// Persist empty order to clear manifest
		fetch('/api/collections/reorder', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ order: {} }),
		}).catch(() => {});
	}

	async function navigate(path: string, force = false): Promise<void> {
		if (page.url.pathname === path && !force) return;
		if (force || page.url.pathname === path) await invalidateAll();
		await goto(path, { invalidateAll: true });
	}

	function selectNode(node: ExtendedContentNode): void {
		if (node.nodeType === 'category') {
			if (expandedNodes.has(node._id)) expandedNodes.delete(node._id);
			else expandedNodes.add(node._id);
			return;
		}
		const same = selectedId === node._id;
		modeTransitionGuard.setMode('view');
		app.shouldShowNextButton = true;

		document.dispatchEvent(new CustomEvent('clearEntryListCache', {
			detail: { resetState: true, reason: 'collection-switch' }
		}));

		navigate(`/${currentLanguage}${node.path || `/${node._id}`}`, same);
	}
</script>

<div class="mt-2 space-y-2" role="navigation" aria-label="Collections">
	<!-- Filters Row -->
	{#if isFullSidebar}
		<div class="flex flex-wrap items-center gap-2 px-1">
			<Button
				variant="outline"
				type="button"
				size="sm"
				onclick={() => showOnlyFavorites = !showOnlyFavorites}
				class="flex items-center gap-1.5 rounded-full border text-xs font-semibold py-1 px-3 transition-all {showOnlyFavorites
					? 'bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400'
					: 'bg-surface-500/10 border-transparent hover:bg-surface-500/20 text-surface-600 dark:text-surface-300'}"
			>
				<iconify-icon icon={showOnlyFavorites ? 'bi:star-fill' : 'bi:star'} width="14"></iconify-icon>
				<span>Favorites</span>
			</Button>

			{#if allTags.length > 0}
				<div class="relative flex-1 min-w-35">
					<Select
						bind:value={selectedTagFilter}
						options={tagFilterOptions}
						placeholder="All Tags"
						allowEmptySelection
						size="sm"
					/>
				</div>
			{/if}

			{#if search || showOnlyFavorites || selectedTagFilter}
				<Button variant="ghost" type="button" size="sm" onclick={clearAllFilters} class="text-xs">
					Clear filters
				</Button>
			{/if}
		</div>
	{/if}

	<!-- Search -->
	<div class="relative {isFullSidebar ? 'w-full' : 'w-12'}">
		<Input
			id="collections-search"
			type="search"
			bind:value={search}
			placeholder="Search collections..."
			inputClass="pe-11 {isFullSidebar ? 'h-12 py-3' : 'h-10 py-2'}"
			aria-label="Search collections"
		/>

		{#if isFullSidebar}
			<div class="absolute inset-e-0 top-0 flex h-full items-center">
				{#if isSearching}
					<div class="flex h-10 w-10 items-center justify-center">
						<Loader variant="circle" width="size-2" height="size-2" />
					</div>
				{:else if search}
					<Button
						variant="outline"
						type="button"
						onclick={() => (search = '')}
						class="rounded-full h-9 w-9 mt-0.5 me-0.5"
					>
						<iconify-icon icon="ic:round-close" width={24}></iconify-icon>
					</Button>
				{:else}
					<div class="flex items-center justify-center rounded-e bg-secondary-100 dark:bg-surface-700 h-9 w-9 mt-0.5 me-0.5">
						<iconify-icon icon="ic:outline-search" width={24}></iconify-icon>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Custom Order Banner -->
	{#if orderOverrides.size > 0}
		<div class="flex items-center justify-between rounded bg-tertiary-500/10 px-3 py-1.5 text-xs text-tertiary-600 dark:text-tertiary-400">
			<span>Custom order active</span>
			<Button variant="ghost" type="button" size="sm" onclick={resetCustomOrder} class="text-xs px-2">
				Reset order
			</Button>
		</div>
	{/if}

	<!-- Tree -->
	<div class="collections-list" role="tree" aria-label="Collection tree">
		{#if treeNodes.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 p-6 text-center text-surface-500">
				{#if !widgets.isLoaded}
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
					<p class="text-xs">Loading collections…</p>
				{:else if search || showOnlyFavorites || selectedTagFilter}
					<iconify-icon icon="bi:search" width={28}></iconify-icon>
					<p class="text-sm">No collections match your current filters.</p>
					<Button variant="outline" type="button" size="sm" onclick={clearAllFilters}>Clear filters</Button>
				{:else}
					<iconify-icon icon="bi:collection" width={28}></iconify-icon>
					<p class="text-sm">No collections found.</p>
				{/if}
			</div>
		{:else if !widgets.isLoaded}
			<div class="flex h-24 items-center justify-center">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
			</div>
		{:else}
			<TreeView
				nodes={treeNodes}
				{selectedId}
				compact={!isFullSidebar}
				search={debouncedSearch}
				iconColorClass="text-error-500"
				showBadges={true}
				allowDragDrop={true}
				onreorder={handleTreeReorder}
			/>
		{/if}
	</div>
</div>

<!-- Tag Modal -->
{#if showTagModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		role="dialog" aria-modal="true" aria-labelledby="tag-modal-title" tabindex="-1" onkeydown={handleModalKeyDown}>
		<div class="card w-full max-w-md p-6 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-2xl relative">
			<Button variant="ghost"
				type="button"
				onclick={() => showTagModal = false}
				class="absolute top-4 inset-e-4 p-0! min-w-0 rounded-full text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800">
				<iconify-icon icon="bi:x" width="20"></iconify-icon>
			</Button>

			<h3 id="tag-modal-title" class="text-lg font-bold text-surface-900 dark:text-white mb-2">Manage Tags</h3>
			<p class="text-xs text-surface-500 dark:text-surface-400 mb-4">
				Tags for <span class="font-semibold text-tertiary-500 dark:text-primary-500">{activeCollectionLabelForTagging}</span>
			</p>

			<div class="space-y-4">
				<Input bind:value={currentTagsInput} label="Tags" placeholder="e.g. news, blog, features" aria-describedby="tags-help" />
				<span id="tags-help" class="text-[11px] text-surface-400 mt-1 block">Separate multiple tags with a comma.</span>

				{#if tagMap[activeCollectionIdForTagging]?.length}
					<div class="flex flex-wrap gap-1.5 mt-3">
						{#each tagMap[activeCollectionIdForTagging] as tag, i (i)}
							<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-tertiary-500/10 text-tertiary-500">
								{tag}
								<button
									type="button"
									onclick={() => {
										const updated = tagMap[activeCollectionIdForTagging].filter(t => t !== tag);
										tagMap = { ...tagMap, [activeCollectionIdForTagging]: updated };
										currentTagsInput = updated.join(', ');
									}}
									class="hover:text-error-500 p-0 leading-none"
									aria-label="Remove tag {tag}"
								>&times;</button>
							</span>
						{/each}
					</div>
				{/if}

				<div class="flex justify-end gap-2 mt-6">
					<Button variant="outline" type="button" onclick={() => showTagModal = false}>Cancel</Button>
					<Button variant="tertiary" type="button" onclick={saveTags}>Save</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.collections-list {
		scrollbar-color: rgb(var(--color-primary-500)/0.3) transparent;
		scrollbar-width: thin;
	}
	.collections-list::-webkit-scrollbar { width: 4px; }
	.collections-list::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-primary-500)/0.3);
		border-radius: 2px;
	}
</style>

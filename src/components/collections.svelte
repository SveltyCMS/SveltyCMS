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
	import AdminCard from '@components/admin-card.svelte';
			import Button from '@components/ui/button.svelte';
			import Input from '@components/ui/input.svelte';
			import Loader from '@components/ui/loader.svelte';
			import Select from '@components/ui/select.svelte';
			import TreeView from '@components/ui/tree-view.svelte';
			import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import type { ContentNode, Schema } from '@src/content/types';
	import { type StatusType, StatusTypes } from '@src/content/types';
	import { collection, contentStructure, setContentStructure } from '@src/stores/collection-store.svelte.ts';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	import { app } from '@src/stores/store.svelte';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { debounce } from '@utils/utils';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { logger } from '@utils/logger';
	import { validateSchemaWidgets } from '@widgets/widget-validation';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Snippet } from 'svelte';
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

	// === Drag & Drop: sibling reorder + category reparent (inside) ===

	function isAncestorOf(ancestorId: string, nodeId: string): boolean {
		let current: ExtendedContentNode | undefined = flatNodeMap.get(nodeId);
		const seen = new Set<string>();
		while (current?.parentId) {
			const pid = String(current.parentId);
			if (pid === ancestorId) return true;
			if (seen.has(pid)) break;
			seen.add(pid);
			current = flatNodeMap.get(pid);
		}
		return false;
	}

	/**
	 * TreeView reports before | after | inside.
	 * - inside a **category** → reparent under that category
	 * - inside a **collection** is coerced to after (files are not folders)
	 * - before/after → sibling of target under the same parent
	 */
	function handleTreeReorder(
		draggedId: string,
		targetId: string,
		position: 'before' | 'after' | 'inside',
	) {
		if (draggedId === targetId) return;

		const structure = [...(contentStructure.value ?? [])] as ExtendedContentNode[];
		const byId = new Map(structure.map((n) => [String(n._id), { ...n }]));
		const dragged = byId.get(draggedId);
		const target = byId.get(targetId);
		if (!dragged || !target) return;

		// Cycle guard
		if (position === 'inside' && (targetId === draggedId || isAncestorOf(draggedId, targetId))) {
			toast.warning('Cannot move a category into itself or its descendants.');
			return;
		}

		let intent = position;
		// Only categories accept children (folders); collections are "files"
		if (intent === 'inside' && target.nodeType !== 'category') {
			intent = 'after';
		}

		const oldParentId = dragged.parentId != null ? String(dragged.parentId) : null;
		const newParentId: string | null =
			intent === 'inside'
				? targetId
				: target.parentId != null
					? String(target.parentId)
					: null;

		const siblingsOf = (parentId: string | null) =>
			Array.from(byId.values())
				.filter((n) => {
					const p = n.parentId != null ? String(n.parentId) : null;
					return p === parentId && String(n._id) !== draggedId;
				})
				.sort((a, b) => {
					const oa = orderOverrides.get(String(a._id)) ?? a.order ?? 0;
					const ob = orderOverrides.get(String(b._id)) ?? b.order ?? 0;
					return oa - ob || String(a.name).localeCompare(String(b.name));
				});

		const destSiblings = siblingsOf(newParentId);
		let insertIndex = destSiblings.length;
		if (intent !== 'inside') {
			const ti = destSiblings.findIndex((n) => String(n._id) === targetId);
			insertIndex = ti < 0 ? destSiblings.length : intent === 'after' ? ti + 1 : ti;
		}

		dragged.parentId = (newParentId ?? undefined) as ExtendedContentNode['parentId'];
		const nextDest = [...destSiblings];
		nextDest.splice(insertIndex, 0, dragged);

		nextDest.forEach((n, i) => {
			n.order = i;
			orderOverrides.set(String(n._id), i);
			byId.set(String(n._id), n);
		});

		if (oldParentId !== newParentId) {
			siblingsOf(oldParentId).forEach((n, i) => {
				n.order = i;
				orderOverrides.set(String(n._id), i);
				byId.set(String(n._id), n);
			});
		}

		// Rebuild id-based paths from roots (stable for DB / builder)
		const childrenByParent = new Map<string | null, ExtendedContentNode[]>();
		for (const n of byId.values()) {
			const p = n.parentId != null ? String(n.parentId) : null;
			if (!childrenByParent.has(p)) childrenByParent.set(p, []);
			childrenByParent.get(p)!.push(n);
		}
		const walkPaths = (parentId: string | null, parentPath: string) => {
			const kids = [...(childrenByParent.get(parentId) ?? [])].sort(
				(a, b) => (a.order ?? 0) - (b.order ?? 0),
			);
			for (const kid of kids) {
				const id = String(kid._id);
				kid.path = parentPath ? `${parentPath}.${id}` : id;
				byId.set(id, kid);
				walkPaths(id, kid.path);
			}
		};
		walkPaths(null, '');

		const nextStructure = Array.from(byId.values());
		setContentStructure(nextStructure as ContentNode[]);

		void persistStructure(nextStructure);
		persistOrder();
	}

	let _structureTimer: ReturnType<typeof setTimeout> | undefined;
	function persistStructure(nodes: ExtendedContentNode[]) {
		clearTimeout(_structureTimer);
		_structureTimer = setTimeout(async () => {
			const items = nodes.map((n) => ({
				id: String(n._id),
				parentId: n.parentId != null ? String(n.parentId) : null,
				order: orderOverrides.get(String(n._id)) ?? n.order ?? 0,
				path: n.path || String(n._id),
			}));
			try {
				const res = await fetch('/api/content-structure', {
					method: 'POST',
					headers: clientJsonHeaders(),
					body: JSON.stringify({
						action: 'reorderContentStructure',
						items,
					}),
				});
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
				}
				const body = await res.json().catch(() => ({}));
				const updated = body?.data?.contentStructure ?? body?.contentStructure;
				if (Array.isArray(updated)) {
					setContentStructure(updated);
				}
			} catch (err) {
				logger.error('[Collections] Structure reorder failed', err);
				toast.error('Failed to save hierarchy — try again or use Collection Builder');
			}
		}, 280);
	}

	let _persistTimer: ReturnType<typeof setTimeout>;
	function persistOrder() {
		clearTimeout(_persistTimer);
		_persistTimer = setTimeout(async () => {
			const order: Record<string, number> = {};
			orderOverrides.forEach((v, k) => {
				order[k] = v;
			});
			try {
				await fetch('/api/collections/reorder', {
					method: 'POST',
					headers: clientJsonHeaders(),
					body: JSON.stringify({ order }),
				});
			} catch {
				/* non-critical display order */
			}
		}, 300);
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
			headers: clientJsonHeaders(),
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
	{#snippet searchIcon()}
		<iconify-icon icon="ic:outline-search" width="20" class="text-surface-400"></iconify-icon>
	{/snippet}

	{#snippet clearIcon()}
		{#if isSearching}
			<Loader variant="circle" width="size-2" height="size-2" />
		{:else if search}
			<Button
				variant="ghost"
				type="button"
				onclick={() => (search = '')}
				class="p-0.5 min-w-0 rounded-full hover:bg-surface-700"
				aria-label="Clear search"
			>
				<iconify-icon icon="ic:round-close" width="18"></iconify-icon>
			</Button>
		{/if}
	{/snippet}

	{#if isFullSidebar}
		<div class="relative w-full">
			<Input
				id="collections-search"
				type="search"
				bind:value={search}
				placeholder="Search collections..."
				pre={searchIcon as Snippet}
				post={clearIcon as Snippet}
				inputClass="w-full text-xs"
				aria-label="Search collections"
			/>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-2">
			<SystemTooltip title="Search Collections" positioning={{ placement: 'right' }}>
				<Button
					variant="ghost"
					type="button"
					onclick={() => ui.toggle('leftSidebar', 'full')}
					aria-label="Search collections"
					class="flex h-9 w-9 items-center justify-center rounded-lg p-0! min-w-0 hover:bg-surface-200 dark:hover:bg-surface-800"
				>
					<iconify-icon icon="ic:outline-search" width="20"></iconify-icon>
				</Button>
			</SystemTooltip>

			<SystemTooltip title="Go to Collection Builder" positioning={{ placement: 'right' }}>
				<a
					href="/config/collectionbuilder"
					aria-label="Go to Collection Builder"
					class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 hover:bg-primary-500 hover:text-white transition-colors"
				>
					<iconify-icon icon="ic:round-add" width="18"></iconify-icon>
				</a>
			</SystemTooltip>
		</div>
	{/if}

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
			{#if !isFullSidebar}
				{#if !widgets.isLoaded}
					<div class="flex items-center justify-center py-3 text-surface-500">
						<div class="h-5 w-5 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
					</div>
				{/if}
			{:else}
				<div class="flex flex-col items-center justify-center gap-3 p-6 text-center text-surface-900 dark:text-white">
					{#if !widgets.isLoaded}
						<div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
						<p class="text-xs text-surface-600 dark:text-surface-300">Loading collections…</p>
					{:else if search || showOnlyFavorites || selectedTagFilter}
						<iconify-icon icon="bi:search" width={28} class="text-surface-400"></iconify-icon>
						<p class="text-sm text-surface-900 dark:text-white">No collections match your current filters.</p>
						<Button variant="outline" type="button" size="sm" onclick={clearAllFilters}>Clear filters</Button>
					{:else}
						<iconify-icon icon="bi:collection" width={32} class="opacity-60 text-surface-400 dark:text-surface-300"></iconify-icon>
						<p class="text-sm font-semibold text-surface-900 dark:text-white">No collections found.</p>
						<a
							href="/config/collectionbuilder"
							class="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-500 no-underline!"
						>
							<iconify-icon icon="ic:round-add" width="16"></iconify-icon>
							<span>Add Collection</span>
						</a>
					{/if}
				</div>
			{/if}
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
		<AdminCard class="w-full max-w-md p-6 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 shadow-2xl relative">
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
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={() => {
										const updated = tagMap[activeCollectionIdForTagging].filter(t => t !== tag);
										tagMap = { ...tagMap, [activeCollectionIdForTagging]: updated };
										currentTagsInput = updated.join(', ');
									}}
									class="rounded-full p-0.5 hover:text-error-500"
									aria-label="Remove tag {tag}"
								>&times;</Button>
							</span>
						{/each}
					</div>
				{/if}

				<div class="flex justify-end gap-2 mt-6">
					<Button variant="outline" type="button" onclick={() => showTagModal = false}>Cancel</Button>
					<Button variant="tertiary" type="button" onclick={saveTags}>Save</Button>
				</div>
			</div>
		</AdminCard>
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

<!--
@file src/components/Collections.svelte
@component Collections – Tree navigation for content categories & collections

@features
- Hierarchical tree with categories/collections
- Debounced search with clear button
- Widget validation warnings (inactive widgets)
- Badges: collection count (categories), status/warning (collections)
- Click navigation with proper routing
- Expand/collapse persistence
- Responsive compact mode
-->

<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import type { ContentNode, Schema, StatusType } from '@cms/types';
	import { StatusTypes } from '@cms/types';

	import { collection, contentStructure, setMode } from '@shared/stores/collectionStore.svelte';
	import { ui } from '@shared/stores/UIStore.svelte';
	import { app } from '@shared/stores/store.svelte';
	import { widgets } from '@shared/stores/widgetStore.svelte';

	import { validateSchemaWidgets } from '@shared/utils/widgetValidation';
	import { debounce } from '@shared/utils/utils';

	import TreeView from '@cms/components/system/TreeView.svelte';
	import * as m from '@shared/paraglide/messages';

	interface ExtendedContentNode extends ContentNode {
		children?: ExtendedContentNode[];
		lastModified?: Date;
		fileCount?: number;
	}

	interface CollectionTreeNode {
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
			icon?: string;
			title?: string;
		};
		path?: string;
		depth: number;
		order: number;
	}

	// Mutable state
	let search = $state('');
	let debouncedSearch = $state('');
	let isSearching = $state(false);
	let expandedNodes = $state<Set<string>>(new Set());

	let updateDebounced = debounce.create((value: unknown) => {
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

	// Collection count cache
	let countCache = new Map<string, number>();

	function countCollections(node: ExtendedContentNode): number {
		const key = node._id;
		if (countCache.has(key)) return countCache.get(key)!;

		if (!node.children || node.nodeType !== 'category') {
			countCache.set(key, 0);
			return 0;
		}

		let total = 0;
		for (const child of node.children) {
			if (child.nodeType === 'collection') total++;
			else if (child.nodeType === 'category') total += countCollections(child);
		}
		countCache.set(key, total);
		return total;
	}

	function getBadgeColor(status?: StatusType): string {
		const map: Record<StatusType, string> = {
			[StatusTypes.publish]: 'bg-success-500',
			[StatusTypes.draft]: 'bg-warning-500',
			[StatusTypes.archive]: 'bg-surface-500',
			[StatusTypes.schedule]: 'bg-primary-500',
			[StatusTypes.clone]: 'bg-secondary-500',
			[StatusTypes.delete]: 'bg-error-500',
			[StatusTypes.unpublish]: 'bg-warning-400'
		};
		return status ? (map[status] ?? 'bg-primary-500') : 'bg-primary-500';
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
			const sorted = [...node.children].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
			children = sorted.map((child) => mapToTreeNode(child, depth + 1));
		}

		// Badge
		let badge: CollectionTreeNode['badge'];
		if (isCategory) {
			badge = {
				count: countCollections(node),
				visible: true,
				color: isExpanded ? 'bg-surface-400' : getBadgeColor(node.collectionDef?.status)
			};
		} else if (hasInactiveWidgets) {
			badge = {
				visible: true,
				color: 'bg-warning-500',
				icon: 'mdi:alert-circle',
				title: 'This collection uses inactive widgets'
			};
		}

		return {
			id: node._id,
			name: label,
			isExpanded,
			onClick: () => selectNode(node),
			children,
			icon: isCategory ? 'bi:folder' : 'bi:collection',
			badge,
			path: !isCategory ? `/${currentLanguage}${node.path || '/' + node._id}` : undefined,
			depth,
			order: node.order ?? 0
		};
	}

	let treeNodes = $derived.by(() => {
		countCache.clear();
		const sorted = [...structure].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		return sorted.map((n) => mapToTreeNode(n));
	});

	async function navigate(path: string, force = false): Promise<void> {
		if (page.url.pathname === path && !force) return;
		if (force || page.url.pathname === path) await invalidateAll();
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

		const target = `/${currentLanguage}${node.path || '/' + node._id}`;
		navigate(target, same);
	}

	function toggleExpand(id: string): void {
		const set = new Set(expandedNodes);
		set.has(id) ? set.delete(id) : set.add(id);
		expandedNodes = set;
	}

	function clearSearch(): void {
		search = '';
		debouncedSearch = '';
	}
</script>

<div class="mt-2 space-y-2" role="navigation" aria-label="Collections">
	<!-- Search -->
	<div class="relative {isFullSidebar ? 'w-full' : 'max-w-[135px]'}">
		<input
			type="text"
			bind:value={search}
			placeholder={isFullSidebar ? m.collections_search() : m.MediaGallery_Search()}
			class="w-full rounded border border-surface-300 bg-surface-50 px-3 pr-11 text-sm outline-none transition-all hover:border-surface-400 focus:border-tertiary-500 dark:border-surface-600 dark:bg-surface-800 {isFullSidebar
				? 'h-12 py-3'
				: 'h-10 py-2'}"
			aria-label="Search collections"
		/>

		<div class="absolute right-0 top-0 flex h-full items-center">
			{#if isSearching}
				<div class="flex h-12 w-12 items-center justify-center">
					<div class="h-2 w-2 animate-pulse rounded-full bg-tertiary-500 dark:bg-primary-500"></div>
				</div>
			{:else if search}
				<button
					type="button"
					onclick={clearSearch}
					class="btn rounded-full preset-outline-surface-500 {isFullSidebar ? 'h-11 w-11' : 'h-10 w-10'}"
					aria-label="Clear search"
				>
					<iconify-icon icon="ic:round-close" width="16"></iconify-icon>
				</button>
			{:else}
				<!-- Search with icon -->
				<div
					class="flex items-center justify-center rounded-r bg-secondary-100 dark:bg-surface-700 {isFullSidebar
						? 'h-11 w-11 mt-px mr-px'
						: 'h-8 w-8'}"
				>
					<iconify-icon icon="ic:outline-search" width="24"></iconify-icon>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tree -->
	<div class="collections-list" role="tree" aria-label="Collection tree">
		{#if treeNodes.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 p-6 text-center">
				<iconify-icon icon="bi:collection" width="32" class="text-surface-400 opacity-50"></iconify-icon>
				<p class="text-sm text-surface-500 dark:text-surface-50">{m.collection_no_collections_found()}</p>
			</div>
		{:else}
			<TreeView nodes={treeNodes} {selectedId} compact={!isFullSidebar} search={debouncedSearch} iconColorClass="text-error-500" showBadges={true} />
		{/if}
	</div>
</div>

<style>
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

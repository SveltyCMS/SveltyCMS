<!--
@file src/components/collections.svelte
@description
Tree navigation for content categories and collections.
Updated to use the modern Content Context and modular navigation engine.
-->

<script lang="ts">
// Components
import TreeView from "@src/components/system/tree-view.svelte";
import type { NavigationNode, StatusType } from "@src/content/types";
import { useContent, contentStore, sortContentNodes } from "@src/content";

// Paraglide Messages
import {
	collection_no_collections_found,
	collections_search,
} from "@src/paraglide/messages";
import { collection, setMode } from "@src/stores/collection-store.svelte.ts";
import { app } from "@src/stores/store.svelte";
import { ui } from "@src/stores/ui-store.svelte.ts";
import { debounce } from "@utils/utils";
import { SvelteSet } from "svelte/reactivity";
import { scale } from "svelte/transition";
import { goto } from "$app/navigation";
import { page } from "$app/state";

interface CollectionTreeNode {
	badge?: {
		count?: number;
		status?:
			| "draft"
			| "publish"
			| "archive"
			| "schedule"
			| "delete"
			| "clone"
			| "test";
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
}

// Content Context
const contentContext = useContent();

// Mutable state
let search = $state("");
let debouncedSearch = $state("");
let isSearching = $state(false);
let expandedNodes = new SvelteSet<string>();

let updateDebounced = debounce.create((value: unknown) => {
	debouncedSearch = (value as string).toLowerCase().trim();
	isSearching = false;
}, 300);

$effect(() => {
	if (search) isSearching = true;
	updateDebounced(search);
});

// Derived UI & data
let isFullSidebar = $derived(ui.state.leftSidebar === "full");
let currentLanguage = $derived(app.contentLanguage);
let selectedId = $derived(collection.value?._id ?? null);

// Auto-expand parents of selected node
$effect(() => {
	if (selectedId) {
		const node = contentContext.content.getNode(selectedId);
		if (node?.parentId) {
			let currentParentId: string | undefined = node.parentId;
			while (currentParentId) {
				expandedNodes.add(currentParentId);
				const parent = contentContext.content.getNode(currentParentId);
				currentParentId = parent?.parentId;
			}
		}
	}
});

/**
 * Optimized tree generation using the modular navigation service.
 */
let treeNodes = $derived.by(() => {
	// Explicitly depend on content version to trigger re-calculation when store is synced
	void contentStore.version;

	const nav = contentContext.navigation;
	if (nav.length === 0) return [];

	function mapToTreeNode(node: NavigationNode, depth = 0): CollectionTreeNode {
		const translation = node.translations?.find(
			(t: any) => t.languageTag === currentLanguage,
		);
		const label = translation?.translationName || node.name;
		const isCategory = node.nodeType === "category";
		const isExpanded = expandedNodes.has(node._id) || selectedId === node._id;

		// Validation check for collections
		let hasInactiveWidgets = false;

		// Children (recursive)
		let children: CollectionTreeNode[] | undefined;
		if (isCategory && node.children) {
			const sorted = [...node.children].sort(sortContentNodes);
			children = sorted.map((child: any) =>
				mapToTreeNode(child as NavigationNode, depth + 1),
			);
		}

		// Badge logic
		let badge: CollectionTreeNode["badge"];
		if (isCategory) {
			badge = {
				count:
					node.children?.filter((c: any) => c.nodeType === "collection")
						.length ?? 0,
				visible: true,
				color: "bg-primary-500",
			};
		} else if (hasInactiveWidgets) {
			badge = {
				visible: true,
				color: "bg-warning-500",
				icon: "mdi:alert-circle",
				title: "This collection uses inactive widgets",
			};
		} else if (node.status) {
			const uiStatus = node.status as StatusType;
			if (uiStatus !== "unpublish") {
				badge = {
					visible: true,
					status: uiStatus as any,
					color: "bg-surface-500",
				};
			}
		}

		return {
			id: node._id,
			name: label,
			isExpanded,
			onClick: () => selectNode(node),
			children,
			icon: node.icon || (isCategory ? "bi:folder" : "bi:collection"),
			badge,
			path: isCategory
				? undefined
				: `/${currentLanguage}${node.path || `/${node._id}`}`,
			depth,
			order: node.order ?? 0,
		};
	}

	return nav.map((n: NavigationNode) => mapToTreeNode(n)) as any;
});

async function navigate(path: string, force = false): Promise<void> {
	if (page.url.pathname === path && !force) return;
	await goto(path, { invalidateAll: force });
}

function selectNode(node: any): void {
	if (node.nodeType === "category") {
		toggleExpand(node._id);
		return;
	}

	setMode("view");
	app.shouldShowNextButton = true;

	document.dispatchEvent(
		new CustomEvent("clearEntryListCache", {
			detail: { resetState: true, reason: "collection-switch" },
		}),
	);

	const target = `/${currentLanguage}${node.path || `/${node._id}`}`;
	navigate(target, selectedId === node._id);
}

function toggleExpand(id: string): void {
	if (expandedNodes.has(id)) expandedNodes.delete(id);
	else expandedNodes.add(id);
}

function clearSearch(): void {
	search = "";
	debouncedSearch = "";
}
</script>

<div class="mt-2 space-y-2" role="navigation" aria-label="Collections">
	<!-- Search - Only show if we have collections -->
	{#if treeNodes.length > 0}
		<div class="relative {isFullSidebar ? 'w-full' : 'max-w--33.7'}" transition:scale={{ duration: 200, start: 0.95 }}>
			<input
				type="text"
				bind:value={search}
				placeholder={collections_search()}
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
					<button type="button" onclick={clearSearch} class="btn rounded-full preset-outline-surface-500 {isFullSidebar ? 'h-11 w-11' : 'h-10 w-10'}" aria-label="Clear search">
						<iconify-icon icon="ic:round-close" width={24}></iconify-icon>
					</button>
				{:else}
					<div class="flex items-center justify-center rounded-r bg-secondary-100 dark:bg-surface-700 {isFullSidebar ? 'h-11 w-11 mt-px mr-px' : 'h-8 w-8'}">
						<iconify-icon icon="ic:outline-search" width={24}></iconify-icon>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Tree -->
	<div class="collections-list" role="tree" aria-label="Collection tree">
		{#if !contentContext.content.isInitialized}
			<div class="flex h-24 items-center justify-center" transition:scale={{ duration: 200, start: 0.95 }}>
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-300 border-t-tertiary-500"></div>
			</div>
		{:else if treeNodes.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 p-6 text-center opacity-60" transition:scale={{ duration: 200, start: 0.95 }}>
				<iconify-icon icon="bi:collection" width={32} class="text-surface-400"></iconify-icon>
				<p class="text-xs text-surface-500 dark:text-surface-300">{collection_no_collections_found()}</p>
			</div>
		{:else}
			<TreeView nodes={treeNodes} {selectedId} compact={!isFullSidebar} search={debouncedSearch} iconColorClass="text-tertiary-500" showBadges={true} />
		{/if}
	</div>
</div>

<style>
	.collections-list {
		scrollbar-color: rgb(var(--color-primary-500) / 0.3) transparent;
		scrollbar-width: thin;
	}
	.collections-list::-webkit-scrollbar { width: 4px; }
	.collections-list::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-primary-500) / 0.3);
		border-radius: 2px;
	}
	.collections-list::-webkit-scrollbar-thumb:hover {
		background-color: rgb(var(--color-primary-500) / 0.5);
	}
</style>

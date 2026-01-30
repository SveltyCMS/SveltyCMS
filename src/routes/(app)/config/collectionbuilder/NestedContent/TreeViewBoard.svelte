<!--
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewBoard.svelte
@component
**Board component for managing nested collections using svelte-dnd-action**

### Props
- `contentNodes` {ContentNode[]} - Array of content nodes representing collections and categories
- `onNodeUpdate` {Function} - Callback function to handle updates to the content node
- `onEditCategory` {Function} - Callback function to handle editing of categories
- `onDeleteNode` {Function} - Callback function to handle node deletion
- `onDuplicateNode` {Function} - Callback function to handle node duplication

### Features:
- Drag and drop reordering of collections using svelte-dnd-action
- Support for nested categories with cross-level drag
- Search/Filter functionality
- Expand/Collapse all
- Enhanced visual feedback for drag & drop
-->
<script lang="ts">
	import TreeViewNode from './TreeViewNode.svelte';
	import type { ContentNode, DatabaseId } from '@databases/dbInterface';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { toTreeViewData, toFlatContentNodes, recalculatePaths, type TreeViewItem } from '@utils/treeViewAdapter';
	import { tick } from 'svelte';
	import SystemTooltip from '@components/system/SystemTooltip.svelte';

	interface Props {
		contentNodes: ContentNode[];
		onNodeUpdate: (updatedNodes: ContentNode[]) => void;
		onEditCategory: (category: Partial<ContentNode>) => void;
		onDeleteNode?: (node: Partial<ContentNode>) => void;
		onDuplicateNode?: (node: Partial<ContentNode>) => void;
	}

	let { contentNodes = [], onNodeUpdate, onEditCategory, onDeleteNode, onDuplicateNode }: Props = $props();

	let searchText = $state('');
	let treeRoots = $state<EnhancedTreeViewItem[]>([]);
	let initialized = false;
	let expandedNodes = $state<Set<string>>(new Set());
	let isDragging = $state(false);

	// Accessibility: Live region for announcements
	let announcement = $state('');
	let announcementId = $state(0);

	// Keyboard reordering state
	let keyboardReorderMode = $state<string | null>(null);

	// Enhanced Item Type
	type EnhancedTreeViewItem = TreeViewItem & {
		children: EnhancedTreeViewItem[];
		level: number;
		isDndShadowItem?: boolean;
	};

	// Initialize Tree from Props - only when contentNodes actually changes
	let lastContentNodesHash = $state('');

	$effect(() => {
		// Only rebuild if contentNodes actually changed (not during drag operations)
		if (isDragging) return;

		// Create a simple hash to detect actual changes
		const currentHash = contentNodes.map((n) => `${n._id}-${n.order}-${n.parentId || 'root'}`).join('|');

		if (currentHash !== lastContentNodesHash && contentNodes.length > 0) {
			lastContentNodesHash = currentHash;

			const flatItems = toTreeViewData(contentNodes);
			const newRoots = buildTree(flatItems);
			treeRoots = newRoots;

			if (!initialized) {
				initialized = true;
				// Expand root items by default
				const expandSet = new Set<string>();
				treeRoots.forEach((item) => expandSet.add(item.id));
				expandedNodes = expandSet;
			}
		}
	});

	// Filter Logic
	const displayedTree = $derived.by(() => {
		if (!searchText.trim()) return treeRoots;
		return filterTree(treeRoots, searchText.toLowerCase());
	});

	// Auto-expand on search
	$effect(() => {
		if (searchText.trim()) {
			const idsToExpand = new Set(expandedNodes);
			collectIdsToExpand(treeRoots, searchText.toLowerCase(), idsToExpand);
			expandedNodes = idsToExpand;
		}
	});

	// --- Helpers ---

	function buildTree(flatItems: TreeViewItem[]): EnhancedTreeViewItem[] {
		const itemMap = new Map<string, EnhancedTreeViewItem>();
		flatItems.forEach((item) => {
			itemMap.set(item.id, { ...item, children: [], level: 0 });
		});

		const roots: EnhancedTreeViewItem[] = [];
		flatItems.forEach((item) => {
			const enhanced = itemMap.get(item.id)!;
			if (item.parent && itemMap.get(item.parent)) {
				const parent = itemMap.get(item.parent)!;
				parent.children.push(enhanced);
				enhanced.level = parent.level + 1;
			} else {
				roots.push(enhanced);
			}
		});

		const sortFn = (a: EnhancedTreeViewItem, b: EnhancedTreeViewItem) => (a.order ?? 0) - (b.order ?? 0);
		roots.sort(sortFn);
		itemMap.forEach((node) => node.children.sort(sortFn));

		return roots;
	}

	function flattenTree(nodes: EnhancedTreeViewItem[], parentId: string | null = null): TreeViewItem[] {
		let flat: TreeViewItem[] = [];

		nodes.forEach((node, index) => {
			const { children, level, isDndShadowItem, ...rest } = node;
			const newItem: TreeViewItem = { ...rest, parent: parentId, order: index };
			flat.push(newItem);

			if (children && children.length > 0) {
				flat = flat.concat(flattenTree(children, node.id));
			}
		});

		return flat;
	}

	function findNode(nodes: EnhancedTreeViewItem[], id: string): EnhancedTreeViewItem | null {
		for (const node of nodes) {
			if (node.id === id) return node;
			if (node.children) {
				const found = findNode(node.children, id);
				if (found) return found;
			}
		}
		return null;
	}

	function findAndRemoveNode(nodes: EnhancedTreeViewItem[], id: string): EnhancedTreeViewItem | null {
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i].id === id) {
				const [removed] = nodes.splice(i, 1);
				return removed;
			}
			if (nodes[i].children) {
				const found = findAndRemoveNode(nodes[i].children, id);
				if (found) return found;
			}
		}
		return null;
	}

	function getParent(rootNodes: EnhancedTreeViewItem[], childId: string): EnhancedTreeViewItem | null {
		for (const node of rootNodes) {
			if (node.children.some((c) => c.id === childId)) return node;
			const found = getParent(node.children, childId);
			if (found) return found;
		}
		return null;
	}

	function filterTree(nodes: EnhancedTreeViewItem[], search: string): EnhancedTreeViewItem[] {
		return nodes.reduce<EnhancedTreeViewItem[]>((acc, node) => {
			const matches = node.name.toLowerCase().includes(search);
			const childMatches = filterTree(node.children, search);

			if (matches || childMatches.length > 0) {
				acc.push({ ...node, children: childMatches });
			}
			return acc;
		}, []);
	}

	function collectIdsToExpand(nodes: EnhancedTreeViewItem[], search: string, ids: Set<string>): boolean {
		let hasMatch = false;
		for (const node of nodes) {
			const matches = node.name.toLowerCase().includes(search);
			const childHasMatch = collectIdsToExpand(node.children, search, ids);
			if (childHasMatch || (matches && node.children.length > 0)) {
				ids.add(node.id);
				hasMatch = true;
			}
			if (matches) hasMatch = true;
		}
		return hasMatch;
	}

	function expandAll() {
		const allIds = new Set<string>();
		const recurse = (nodes: EnhancedTreeViewItem[]) => {
			nodes.forEach((n) => {
				allIds.add(n.id);
				recurse(n.children);
			});
		};
		recurse(treeRoots);
		expandedNodes = allIds;
	}

	function collapseAll() {
		expandedNodes = new Set();
	}

	function clearSearch() {
		searchText = '';
	}

	function toggleNode(id: string) {
		const next = new Set(expandedNodes);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedNodes = next;
	}

	function announce(message: string) {
		announcement = message;
		announcementId++;
		setTimeout(() => {
			announcement = '';
		}, 1000);
	}

	// --- Drag & Drop Handlers ---

	function handleRootConsider(e: CustomEvent) {
		const { items, info } = e.detail;

		if (info.trigger === 'dragStarted') {
			isDragging = true;
		}

		// Simply update order at root level
		treeRoots = items.map((item: EnhancedTreeViewItem, index: number) => {
			const existing = findNode(treeRoots, item.id);
			if (existing) {
				return { ...existing, order: index, parent: null };
			}
			return { ...item, order: index, parent: null };
		});
	}

	function handleRootFinalize(e: CustomEvent) {
		const { items } = e.detail;

		// Update order and ensure parent is null for root items
		treeRoots = items.map((item: EnhancedTreeViewItem, index: number) => {
			const existing = findNode(treeRoots, item.id);
			if (existing) {
				return { ...existing, order: index, parent: null };
			}
			return { ...item, order: index, parent: null };
		});

		isDragging = false;
		saveTreeData();
	}

	function handleNestedConsider(e: CustomEvent, parentId: string) {
		const { items, info } = e.detail;

		if (info.trigger === 'dragStarted') {
			isDragging = true;
		}

		const parent = findNode(treeRoots, parentId);
		if (!parent) return;

		// Update parent's children
		parent.children = items.map((item: EnhancedTreeViewItem, index: number) => {
			// Try to find existing node anywhere in tree
			const existing = findNode(treeRoots, item.id);
			if (existing) {
				return {
					...existing,
					order: index,
					parent: parentId,
					level: parent.level + 1
				};
			}
			return {
				...item,
				order: index,
				parent: parentId,
				level: parent.level + 1
			};
		});

		// Auto-expand parent
		if (!expandedNodes.has(parentId)) {
			expandedNodes = new Set([...expandedNodes, parentId]);
		}

		// Trigger reactivity
		treeRoots = [...treeRoots];
	}

	function handleNestedFinalize(e: CustomEvent, parentId: string) {
		const { items } = e.detail;

		const parent = findNode(treeRoots, parentId);
		if (!parent) return;

		// Get IDs of items that should be in this parent
		const itemIds = new Set(items.map((i: EnhancedTreeViewItem) => i.id));

		// Remove these items from anywhere else in the tree
		const cleanTree = (nodes: EnhancedTreeViewItem[]): EnhancedTreeViewItem[] => {
			return nodes
				.filter((node) => !itemIds.has(node.id) || node.id === parentId)
				.map((node) => ({
					...node,
					children: cleanTree(node.children)
				}));
		};

		treeRoots = cleanTree(treeRoots);

		// Now find parent again in cleaned tree and set its children
		const cleanedParent = findNode(treeRoots, parentId);
		if (cleanedParent) {
			cleanedParent.children = items.map((item: EnhancedTreeViewItem, index: number) => {
				const existing = findNode(treeRoots, item.id);
				if (existing && existing.id !== item.id) {
					// Found elsewhere, use existing data
					return {
						...existing,
						order: index,
						parent: parentId,
						level: cleanedParent.level + 1
					};
				}
				return {
					...item,
					order: index,
					parent: parentId,
					level: cleanedParent.level + 1
				};
			});

			// Keep parent expanded
			expandedNodes = new Set([...expandedNodes, parentId]);
		}

		// Trigger reactivity
		treeRoots = [...treeRoots];

		isDragging = false;
		saveTreeData();
	}

	function saveTreeData() {
		setTimeout(() => {
			const flatItems = flattenTree(treeRoots);
			const withPaths = recalculatePaths(flatItems);
			const nodes = toFlatContentNodes(withPaths);
			onNodeUpdate(nodes);
		}, 50);
	}

	// --- Keyboard Reordering ---

	async function moveItem(itemId: string, direction: 'up' | 'down') {
		const parent = getParent(treeRoots, itemId);
		const list = parent ? parent.children : treeRoots;
		const index = list.findIndex((i) => i.id === itemId);

		if (index === -1) return;

		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= list.length) return;

		const item = list[index];
		list.splice(index, 1);
		list.splice(newIndex, 0, item);

		if (!parent) {
			treeRoots = [...treeRoots];
		} else {
			parent.children = [...parent.children];
			treeRoots = [...treeRoots];
		}

		saveTreeData();
		announce(`Moved ${item.name} ${direction}`);
		await tick();
		document.querySelector(`[data-item-id="${itemId}"]`)?.querySelector('button')?.focus();
	}

	async function moveItemUp(itemId: string) {
		await moveItem(itemId, 'up');
	}

	async function moveItemDown(itemId: string) {
		await moveItem(itemId, 'down');
	}

	async function moveItemToParent(itemId: string) {
		const parent = getParent(treeRoots, itemId);
		if (!parent) return;

		const item = parent.children.find((i) => i.id === itemId);
		if (!item) return;

		parent.children = parent.children.filter((i) => i.id !== itemId);

		const grandparent = getParent(treeRoots, parent.id);
		const targetList = grandparent ? grandparent.children : treeRoots;

		const parentIndex = targetList.findIndex((i) => i.id === parent.id);
		targetList.splice(parentIndex + 1, 0, item);

		if (!grandparent) {
			treeRoots = [...treeRoots];
		} else {
			grandparent.children = [...grandparent.children];
			treeRoots = [...treeRoots];
		}

		saveTreeData();
		announce(`Moved ${item.name} to higher level`);
		await tick();
		document.querySelector(`[data-item-id="${itemId}"]`)?.querySelector('button')?.focus();
	}

	function toPartialContentNode(item: TreeViewItem): Partial<ContentNode> {
		return {
			_id: item._id || item.id,
			name: item.name,
			nodeType: item.nodeType,
			parentId: (item.parent ?? undefined) as DatabaseId | undefined,
			slug: item.slug,
			description: item.description,
			icon: item.icon,
			path: item.path
		};
	}

	const flipDurationMs = 200;
</script>

<!-- Accessibility: Live region for screen reader announcements -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
	{#key announcementId}{announcement}{/key}
</div>

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-2">
	<div class="relative flex-1 min-w-[200px]">
		<iconify-icon icon="mdi:magnify" width="18" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
		<input
			type="text"
			placeholder="Search collections..."
			bind:value={searchText}
			class="input w-full h-12 pl-10 pr-8 rounded shadow-sm"
			aria-label="Search collections"
		/>
		{#if searchText}
			<button
				type="button"
				onclick={clearSearch}
				class="absolute right-2 top-1/2 -translate-y-1/2 btn-icon preset-tonal-surface-500"
				aria-label="Clear search"
			>
				<iconify-icon icon="mdi:close" width={16}></iconify-icon>
			</button>
		{/if}
	</div>
	<div class="flex gap-2">
		<SystemTooltip title="Expand all categories">
			<button
				type="button"
				onclick={expandAll}
				class="btn preset-tonal-surface-500 hover:preset-filled-surface-500 transition-all shadow-sm"
				aria-label="Expand all categories"
			>
				<iconify-icon icon="mdi:unfold-more-horizontal" width={24} aria-hidden="true"></iconify-icon>
				<span class="hidden sm:inline ml-1">Expand All</span>
			</button>
		</SystemTooltip>
		<SystemTooltip title="Collapse all categories">
			<button
				type="button"
				onclick={collapseAll}
				class="btn preset-tonal-surface-500 hover:preset-filled-surface-500 transition-all shadow-sm"
				aria-label="Collapse all categories"
			>
				<iconify-icon icon="mdi:unfold-less-horizontal" width={24} aria-hidden="true"></iconify-icon>
				<span class="hidden sm:inline ml-1">Collapse All</span>
			</button>
		</SystemTooltip>
	</div>
</div>

<!-- Tree View -->
<div
	class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-2"
	class:is-dragging={isDragging}
	role="region"
	aria-label="Collection tree. Use arrow keys to navigate, Space to expand/collapse. Press Enter on drag handle to enter keyboard reorder mode."
>
	{#if displayedTree.length === 0}
		<div class="text-center p-8 text-surface-500">
			<iconify-icon icon={searchText ? 'mdi:magnify-close' : 'mdi:folder-outline'} width="48" class="opacity-50 mb-2" aria-hidden="true"
			></iconify-icon>
			<p>{searchText ? `No results found for "${searchText}"` : 'No categories or collections yet'}</p>
		</div>
	{:else}
		<div
			class="dnd-zone root-zone"
			use:dndzone={{
				items: displayedTree,
				flipDurationMs,
				type: 'tree-items',
				dragDisabled: !!searchText,
				morphDisabled: true,
				centreDraggedOnCursor: true
			}}
			onconsider={handleRootConsider}
			onfinalize={handleRootFinalize}
			role="tree"
			aria-label="Collection hierarchy"
		>
			{#each displayedTree as item (item.id)}
				<div
					class="tree-node-wrapper mb-2"
					animate:flip={{ duration: flipDurationMs }}
					role="treeitem"
					aria-expanded={expandedNodes.has(item.id)}
					aria-selected="false"
					data-item-id={item.id}
					data-node-type={item.nodeType}
					data-is-dnd-shadow-item={item.isDndShadowItem}
				>
					{@render treeNode(item, 0)}
				</div>
			{/each}
		</div>
	{/if}
</div>

{#snippet treeNode(item: EnhancedTreeViewItem, level: number)}
	<div class="tree-node-outer">
		<TreeViewNode
			item={{ ...item, hasChildren: item.children?.length > 0 }}
			isOpen={expandedNodes.has(item.id)}
			toggle={() => toggleNode(item.id)}
			onEditCategory={() => onEditCategory(toPartialContentNode(item))}
			onDelete={() => onDeleteNode?.(toPartialContentNode(item))}
			onDuplicate={() => onDuplicateNode?.(toPartialContentNode(item))}
			keyboardReorderMode={keyboardReorderMode === item.id}
			onMoveUp={() => moveItemUp(item.id)}
			onMoveDown={() => moveItemDown(item.id)}
			onMoveToParent={() => moveItemToParent(item.id)}
			onEnterReorderMode={() => {
				keyboardReorderMode = item.id;
				announce(`Keyboard reorder mode active for ${item.name}. Use arrow keys to move, Escape to cancel, Enter to confirm.`);
			}}
			onExitReorderMode={() => {
				keyboardReorderMode = null;
			}}
		/>

		{#if expandedNodes.has(item.id)}
			{#if item.children?.length > 0 || item.nodeType === 'category'}
				<div
					class="dnd-zone nested-zone mt-2"
					style="margin-left: {Math.min(level + 1, 6) * 0.75}rem; padding-left: 0.5rem; border-left: 2px solid rgb(var(--color-surface-300));"
					use:dndzone={{
						items: item.children || [],
						flipDurationMs,
						type: 'tree-items',
						dragDisabled: !!searchText,
						morphDisabled: true,
						centreDraggedOnCursor: true
					}}
					onconsider={(e) => handleNestedConsider(e, item.id)}
					onfinalize={(e) => handleNestedFinalize(e, item.id)}
					role="group"
					aria-label={`Contents of ${item.name}`}
				>
					{#if item.children?.length > 0}
						{#each item.children as child (child.id)}
							<div
								class="tree-node-wrapper mb-2"
								animate:flip={{ duration: flipDurationMs }}
								role="treeitem"
								aria-expanded={expandedNodes.has(child.id)}
								aria-selected="false"
								data-item-id={child.id}
								data-node-type={child.nodeType}
								data-is-dnd-shadow-item={child.isDndShadowItem}
							>
								{@render treeNode(child, level + 1)}
							</div>
						{/each}
					{:else}
						<!-- Empty state for category drop zones -->
						<div class="empty-drop-zone" role="none">
							<span class="text-surface-500 text-sm italic">Drop items here</span>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.collection-builder-tree {
		min-height: 200px;
		padding: 0.5rem;
	}

	.dnd-zone {
		min-height: 60px;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease;
		border-radius: 0.5rem;
		position: relative;
	}

	.dnd-zone:empty,
	.empty-drop-zone {
		min-height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgb(var(--color-surface-200) / 0.3);
		border: 2px dashed rgb(var(--color-surface-400));
		border-radius: 0.5rem;
		padding: 1rem;
	}

	.tree-node-wrapper {
		position: relative;
	}

	/* Active dragging state */
	:global(.tree-node-wrapper.svelte-dnd-action-dragged-el) {
		opacity: 0.5;
		transform: scale(0.95);
	}

	/* Drop target feedback */
	:global(.dnd-zone.svelte-dnd-action-shadow-placeholder-active) {
		background: rgb(var(--color-primary-500) / 0.08) !important;
		border: 2px dashed rgb(var(--color-primary-500)) !important;
	}

	/* Shadow item (placeholder) styling */
	:global([aria-grabbed='true']) {
		opacity: 0.4;
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
		border-radius: 0.5rem;
	}

	/* Category drop zone feedback */
	:global(.nested-zone.svelte-dnd-action-shadow-placeholder-active) {
		background: rgb(var(--color-tertiary-500) / 0.1) !important;
		border-color: rgb(var(--color-tertiary-500)) !important;
	}

	/* Disable selection during drag */
	.collection-builder-tree.is-dragging {
		user-select: none;
	}

	.nested-zone {
		position: relative;
	}

	.nested-zone::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: rgb(var(--color-surface-300));
	}
</style>

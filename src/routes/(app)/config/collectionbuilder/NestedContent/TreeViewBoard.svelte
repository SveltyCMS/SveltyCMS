<!--
@file src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewBoard.svelte
@component
**Enhanced Board component for managing nested collections using svelte-dnd-action**

### Props
- `contentNodes` {ContentNode[]} - Array of content nodes representing collections and categories
- `onNodeUpdate` {Function} - Callback function to handle updates to the content node
- `onEditCategory` {Function} - Callback function to handle editing of categories
- `onDeleteNode` {Function} - Callback function to handle node deletion
- `onDuplicateNode` {Function} - Callback function to handle node duplication

### Features:
- Drag and drop reordering of collections using svelte-dnd-action
- Support for nested categories with cross-level drag
- Cycle detection (prevents dropping parent into own child)
- Race condition prevention with hash synchronization
- Search/Filter functionality with auto-expand
- Expand/Collapse all
- Full keyboard navigation (Arrow keys, Home/End, typeahead, * for siblings)
- Roving tabindex for accessibility
- Smart focus management after deletions
- Memory leak prevention with cleanup effects
- Enhanced visual feedback for drag & drop
-->
<script lang="ts">
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import type { ContentNode, DatabaseId } from '@databases/dbInterface';
	import { sortContentNodes } from '@src/content/utils';
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
	import TreeViewNode from './TreeViewNode.svelte';

	export interface TreeViewItem extends Record<string, any> {
		_id?: any;
		icon?: string;
		id: string;
		isDraggable?: boolean;
		isDropAllowed?: boolean;
		name: string;
		nodeType: 'category' | 'collection';
		order?: number;
		parent: string | null;
		path: string;
	}

	interface Props {
		contentNodes: ContentNode[];
		onDeleteNode?: (node: Partial<ContentNode>) => void;
		onDuplicateNode?: (node: Partial<ContentNode>) => void;
		onEditCategory: (category: Partial<ContentNode>) => void;
		onNodeUpdate: (updatedNodes: ContentNode[]) => void;
	}

	let { contentNodes = [], onNodeUpdate, onEditCategory, onDeleteNode, onDuplicateNode }: Props = $props();

	// Search and UI State
	let searchText = $state('');
	let treeRoots = $state<EnhancedTreeViewItem[]>([]);
	let initialized = $state(false);
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let expandedNodes = $state(new SvelteSet<string>());
	let isDragging = $state(false);
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let nodeSnapshot = $state(new SvelteMap<string, EnhancedTreeViewItem>());
	let lastContentNodesHash = $state('');
	let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

	// Accessibility State
	let announcement = $state('');
	let announcementId = $state(0);
	let keyboardReorderMode = $state<string | null>(null);
	let rovingTabIndex = $state<string | null>(null); // ID of node with tabindex="0"

	// Typeahead State
	let typeaheadBuffer = $state('');
	let typeaheadTimeout: ReturnType<typeof setTimeout> | null = null;

	// Enhanced Item Type
	type EnhancedTreeViewItem = TreeViewItem & {
		children: EnhancedTreeViewItem[];
		level: number;
		isDndShadowItem?: boolean;
	};

	// Cleanup effect to prevent memory leaks
	$effect(() => {
		return () => {
			if (rebuildTimeout) { clearTimeout(rebuildTimeout); }
			if (typeaheadTimeout) { clearTimeout(typeaheadTimeout); }
		};
	});

	// Initialize Tree from Props - with race condition protection
	$effect(() => {
		if (isDragging || !contentNodes.length) { return; }

		const currentHash =
			contentNodes
				.map((n) => `${n._id}:${n.parentId}:${n.order}`)
				.sort()
				.join('|') + contentNodes.length;

		if (currentHash !== lastContentNodesHash) {
			if (rebuildTimeout) { clearTimeout(rebuildTimeout); }

			rebuildTimeout = setTimeout(() => {
				lastContentNodesHash = currentHash;
				console.log('[TreeViewBoard] initializing tree from canonical contentNodes. Count:', contentNodes.length);

				const flatItems: TreeViewItem[] = contentNodes.map((n) => ({
					id: String(n._id),
					_id: n._id,
					name: n.name,
					nodeType: n.nodeType || (n as any).type || 'collection',
					parent: n.parentId ? String(n.parentId) : null,
					order: n.order ?? 0,
					path: n.path || '',
					icon: n.icon,
					slug: n.slug,
					description: n.description,
					isDraggable: true,
					isDropAllowed: true
				}));

				treeRoots = buildTree(flatItems);

				if (!initialized) {
					initialized = true;
					expandAll();
				}

				// Set initial roving tabindex to first node
				if (!rovingTabIndex && treeRoots.length > 0) {
					rovingTabIndex = treeRoots[0].id;
				}

				rebuildTimeout = null;
			}, 50);
		}
	});

	// Auto-expand on search
	$effect(() => {
		if (searchText.trim()) {
			collectIdsToExpand(treeRoots, searchText.toLowerCase(), expandedNodes);
		}
	});

	// --- Tree Building Helpers ---

	function buildTree(flatItems: TreeViewItem[]): EnhancedTreeViewItem[] {
		const itemMap = new SvelteMap<string, EnhancedTreeViewItem>();
		flatItems.forEach((item) => {
			itemMap.set(item.id, { ...item, children: [], level: 0 });
		});

		const roots: EnhancedTreeViewItem[] = [];

		flatItems.forEach((item) => {
			const enhanced = itemMap.get(item.id)!;
			if (item.parent && itemMap.has(item.parent)) {
				const parent = itemMap.get(item.parent)!;
				parent.children.push(enhanced);
				enhanced.level = parent.level + 1;
			} else {
				roots.push(enhanced);
			}
		});

		roots.sort(sortContentNodes);
		itemMap.forEach((node) => node.children.sort(sortContentNodes));

		return roots;
	}

	function flattenTree(nodes: EnhancedTreeViewItem[], parentId: string | null = null): TreeViewItem[] {
		let flat: TreeViewItem[] = [];

		nodes.forEach((node, index) => {
			const { children, level: _level, isDndShadowItem: _isDndShadowItem, ...rest } = node;
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
			if (node.id === id) { return node; }
			if (node.children) {
				const found = findNode(node.children, id);
				if (found) { return found; }
			}
		}
		return null;
	}

	function getParent(rootNodes: EnhancedTreeViewItem[], childId: string): EnhancedTreeViewItem | null {
		for (const node of rootNodes) {
			if (node.children.some((c) => c.id === childId)) { return node; }
			const found = getParent(node.children, childId);
			if (found) { return found; }
		}
		return null;
	}

	function getVisibleNodes(nodes: EnhancedTreeViewItem[]): EnhancedTreeViewItem[] {
		const visible: EnhancedTreeViewItem[] = [];

		function traverse(items: EnhancedTreeViewItem[]) {
			for (const item of items) {
				visible.push(item);
				if (expandedNodes.has(item.id) && item.children?.length) {
					traverse(item.children);
				}
			}
		}

		traverse(nodes);
		return visible;
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
			if (matches) { hasMatch = true; }
		}
		return hasMatch;
	}

	// Filtering Helper - simplified since we auto-expand matches
	function isNodeVisible(node: EnhancedTreeViewItem, search: string): boolean {
		if (!search) { return true; }
		return node.name.toLowerCase().includes(search.toLowerCase());
	}

	// --- UI Actions ---

	function expandAll() {
		const recurse = (nodes: EnhancedTreeViewItem[]) => {
			nodes.forEach((n) => {
				expandedNodes.add(n.id);
				recurse(n.children);
			});
		};
		recurse(treeRoots);
		announce('Expanded all categories');
	}

	function collapseAll() {
		expandedNodes.clear();
		announce('Collapsed all categories');
	}

	function clearSearch() {
		searchText = '';
		announce('Search cleared');
	}

	function toggleNode(id: string) {
		if (expandedNodes.has(id)) {
			expandedNodes.delete(id);
			announce('Collapsed');
		} else {
			expandedNodes.add(id);
			announce('Expanded');
		}
	}

	function announce(message: string) {
		announcement = message;
		announcementId++;
		setTimeout(() => {
			if (announcement === message) { announcement = ''; }
		}, 1000);
	}

	// --- Drag & Drop Handlers ---

	function handleRootConsider(e: CustomEvent) {
		const { items, info } = e.detail;

		if (info.trigger === 'dragStarted') {
			isDragging = true;
			// Take snapshot of current tree state including all children
			nodeSnapshot.clear();
			takeSnapshot(treeRoots);
		}

		// Rehydrate items from snapshot to preserve children
		treeRoots = items.map((item: EnhancedTreeViewItem) => rehydrateItem(item));
	}

	function handleNestedConsider(e: CustomEvent, parentId: string) {
		const { items, info } = e.detail;

		if (info.trigger === 'dragStarted') {
			isDragging = true;
			nodeSnapshot.clear();
			takeSnapshot(treeRoots);
		}

		const parent = findNode(treeRoots, parentId);
		if (parent) {
			// Rehydrate to preserve children
			parent.children = items.map((item: EnhancedTreeViewItem) => rehydrateItem(item));
			treeRoots = [...treeRoots]; // Trigger reactivity
		}
	}

	function handleFinalize(e: CustomEvent, targetParentId: string | null) {
		const { items: newZoneItems } = e.detail;

		// Get IDs of items being moved
		const movingIds = new Set<string>(newZoneItems.map((i: EnhancedTreeViewItem) => i.id));

		// CYCLE DETECTION: Prevent dropping parent into its own child
		if (targetParentId && movingIds.size > 0) {
			for (const movedId of movingIds) {
				if (isAncestorOf(movedId, targetParentId, treeRoots)) {
					const movedNode = findNode(treeRoots, movedId);
					announce(`Cannot move "${movedNode?.name || 'item'}" into its own sub-category`);

					// Revert to snapshot
					if (nodeSnapshot.size > 0) {
						treeRoots = buildTree(flattenTree(Array.from(nodeSnapshot.values()).filter((n) => !n.parent)));
					}
					isDragging = false;
					return;
				}
			}
		}

		// 1. Remove moving items from their current (old) positions in the tree
		// This creates a "clean" tree where moved items only exist in newZoneItems
		function cleanTree(nodes: EnhancedTreeViewItem[]): EnhancedTreeViewItem[] {
			return nodes
				.filter((n) => !movingIds.has(n.id))
				.map((n) => ({
					...n,
					children: cleanTree(n.children || [])
				}));
		}

		const cleanedRoots = cleanTree(treeRoots);

		// 2. Reconstruct the tree with moved items in their new location
		let newTreeRoots: EnhancedTreeViewItem[];

		if (targetParentId === null) {
			// Dropped at root level - newZoneItems are the new roots.
			// newZoneItems already contains all items that should be at the root level.
			newTreeRoots = newZoneItems.map((item: EnhancedTreeViewItem) => ({
				...item,
				parent: null,
				children: item.children || []
			}));
		} else {
			// Dropped into a parent - find target and update its children
			const updateTargetParent = (nodes: EnhancedTreeViewItem[]): EnhancedTreeViewItem[] => {
				return nodes.map((n) => {
					if (n.id === targetParentId) {
						return {
							...n,
							children: newZoneItems.map((item: EnhancedTreeViewItem) => ({
								...item,
								parent: targetParentId,
								children: item.children || []
							}))
						};
					}
					return {
						...n,
						children: updateTargetParent(n.children || [])
					};
				});
			};
			newTreeRoots = updateTargetParent(cleanedRoots);
		}

		// Update state - use structuredClone to strip Svelte 5 proxies for svelte-dnd-action compatibility
		treeRoots = structuredClone(newTreeRoots);

		// Save and notify parent
		saveTreeData();

		// Clear dragging state after a delay to let animations complete
		setTimeout(() => {
			isDragging = false;
			nodeSnapshot.clear();
		}, flipDurationMs + 50);
	}

	// Helper: Check if potentialAncestor is actually an ancestor of nodeId
	function isAncestorOf(potentialAncestorId: string, nodeId: string, nodes: EnhancedTreeViewItem[]): boolean {
		const targetNode = findNode(nodes, nodeId);
		if (!targetNode) { return false; }

		// Walk up from targetNode to see if we hit potentialAncestorId
		let current: EnhancedTreeViewItem | null = targetNode;
		const visited = new SvelteSet<string>();

		while (current) {
			if (current.id === potentialAncestorId) { return true; }
			if (visited.has(current.id)) { break; // Cycle protection
}
			visited.add(current.id);
			current = getParent(nodes, current.id);
		}

		return false;
	}

	// Helper: Take snapshot of entire tree
	function takeSnapshot(nodes: EnhancedTreeViewItem[]) {
		nodes.forEach((node) => {
			nodeSnapshot.set(node.id, { ...node, children: [...(node.children || [])] });
			if (node.children?.length) {
				takeSnapshot(node.children);
			}
		});
	}

	// Helper: Rehydrate single item from snapshot
	function rehydrateItem(item: EnhancedTreeViewItem): EnhancedTreeViewItem {
		const snap = nodeSnapshot.get(item.id);
		if (snap) {
			return {
				...item,
				children: snap.children.map((child) => rehydrateItem(child))
			};
		}
		return { ...item, children: item.children || [] };
	}

	function saveTreeData() {
		const flatItems = flattenTree(treeRoots);
		const withPaths = recalculatePaths(flatItems);
		const nodes = toFlatContentNodes(withPaths);

		// Pre-emptively set hash to prevent race condition with parent updates
		lastContentNodesHash =
			nodes
				.map((n) => `${n._id}:${n.parentId}:${n.order}`)
				.sort()
				.join('|') + nodes.length;

		console.log('[TreeViewBoard] saving tree data with', nodes.length, 'nodes');
		onNodeUpdate(nodes);

		// Delay releasing the dragging lock to ensure parent state updates
		setTimeout(() => {
			isDragging = false;
		}, 100);
	}

	function recalculatePaths(items: TreeViewItem[]): TreeViewItem[] {
		const itemMap = new SvelteMap<string, TreeViewItem>();
		for (const item of items) {
			itemMap.set(item.id, { ...item });
		}

		const childrenByParent = new SvelteMap<string, TreeViewItem[]>();
		for (const item of items) {
			const parentKey = item.parent || '__root__';
			if (!childrenByParent.has(parentKey)) {
				childrenByParent.set(parentKey, []);
			}
			childrenByParent.get(parentKey)?.push(itemMap.get(item.id)!);
		}

		// DO NOT SORT HERE. The items are already in the correct order from flattenTree which respects UI order.
		// Sorting by sortContentNodes (which uses node.order) will use stale order values and break DnD.

		function assignPaths(parentId: string | null, parentPath: string): void {
			const key = parentId || '__root__';
			const children = childrenByParent.get(key);
			if (!children) { return; }

			children.forEach((child, index) => {
				const newPath = parentPath ? `${parentPath}.${child.id}` : child.id;
				const item = itemMap.get(child.id);
				if (item) {
					item.path = newPath;
					item.order = index;
					item.parent = parentId;
				}
				assignPaths(child.id, newPath);
			});
		}

		assignPaths(null, '');
		return Array.from(itemMap.values());
	}

	function toFlatContentNodes(flatItems: TreeViewItem[]): ContentNode[] {
		return flatItems.map((item) => {
			return {
				...item,
				_id: item._id || item.id,
				id: undefined,
				parentId: item.parent || undefined,
				name: item.name,
				icon: item.icon,
				nodeType: item.nodeType,
				path: item.path,
				order: item.order ?? 0,
				parent: undefined,
				text: undefined
			} as unknown as ContentNode;
		});
	}

	// --- Keyboard Navigation ---

	function handleTreeKeyDown(e: KeyboardEvent) {
		// Let keyboard reorder mode handle its own keys
		if (keyboardReorderMode) { return; }

		const visibleNodes = getVisibleNodes(treeRoots);
		if (visibleNodes.length === 0) { return; }

		const activeElement = document.activeElement?.closest('[data-item-id]') as HTMLElement | null;
		const currentId = activeElement?.dataset.itemId;
		let currentIndex = visibleNodes.findIndex((n) => n.id === currentId);

		// If no focus yet, assume first
		if (currentIndex === -1) { currentIndex = 0; }
		const currentNode = visibleNodes[currentIndex];

		let nextNode: EnhancedTreeViewItem | null = null;
		let handled = true;

		switch (e.key) {
			case 'ArrowUp': {
				e.preventDefault();
				if (currentIndex > 0) {
					nextNode = visibleNodes[currentIndex - 1];
				}
				break;
			}

			case 'ArrowDown': {
				e.preventDefault();
				if (currentIndex < visibleNodes.length - 1) {
					nextNode = visibleNodes[currentIndex + 1];
				}
				break;
			}

			case 'ArrowLeft': {
				e.preventDefault();
				if (expandedNodes.has(currentNode.id) && currentNode.children?.length) {
					toggleNode(currentNode.id);
				} else {
					const parent = getParent(treeRoots, currentNode.id);
					if (parent) { nextNode = parent; }
				}
				break;
			}

			case 'ArrowRight': {
				e.preventDefault();
				if (!expandedNodes.has(currentNode.id) && currentNode.children?.length) {
					toggleNode(currentNode.id);
				} else if (currentNode.children?.length) {
					nextNode = currentNode.children[0];
				}
				break;
			}

			case 'Home': {
				e.preventDefault();
				nextNode = visibleNodes[0];
				break;
			}

			case 'End': {
				e.preventDefault();
				nextNode = visibleNodes.at(-1);
				break;
			}

			case '*': {
				e.preventDefault();
				const parent = getParent(treeRoots, currentNode.id);
				const siblings = parent ? parent.children : treeRoots;
				siblings.forEach((s) => {
					if (s.children?.length) { expandedNodes.add(s.id); }
				});
				announce('Expanded all siblings');
				break;
			}

			default: {
				// Typeahead search
				if (e.key.length === 1 && e.key.match(/\S/)) {
					handled = true;
					handleTypeahead(e.key, visibleNodes, currentIndex);
				} else {
					handled = false;
				}
			}
		}

		if (nextNode) {
			focusNode(nextNode.id);
		}

		if (handled) {
			e.preventDefault();
		}
	}

	function handleTypeahead(char: string, visibleNodes: EnhancedTreeViewItem[], currentIndex: number) {
		typeaheadBuffer += char.toLowerCase();

		if (typeaheadTimeout) { clearTimeout(typeaheadTimeout); }
		typeaheadTimeout = setTimeout(() => {
			typeaheadBuffer = '';
		}, 500);

		// Search from current position + 1, then wrap around
		const searchNodes = [...visibleNodes.slice(currentIndex + 1), ...visibleNodes.slice(0, currentIndex + 1)];

		const match = searchNodes.find((n) => n.name.toLowerCase().startsWith(typeaheadBuffer));

		if (match) {
			focusNode(match.id);
			announce(`Jumped to ${match.name}`);
		}
	}

	function focusNode(id: string) {
		rovingTabIndex = id;
		tick().then(() => {
			const element = document.querySelector(`[data-item-id="${id}"] button`);
			if (element) {
				(element as HTMLElement).focus();
				(element as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		});
	}

	// --- Keyboard Reordering ---

	async function moveItem(itemId: string, direction: 'up' | 'down') {
		const parent = getParent(treeRoots, itemId);
		const list = parent ? parent.children : treeRoots;
		const index = list.findIndex((i) => i.id === itemId);

		if (index === -1) { return; }

		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= list.length) { return; }

		const item = list[index];
		list.splice(index, 1);
		list.splice(newIndex, 0, item);

		if (parent) {
			parent.children = [...parent.children];
			treeRoots = [...treeRoots];
		} else {
			treeRoots = [...treeRoots];
		}

		saveTreeData();
		announce(`Moved ${item.name} ${direction}`);
		await tick();
		focusNode(itemId);
	}

	async function moveItemUp(itemId: string) {
		await moveItem(itemId, 'up');
	}

	async function moveItemDown(itemId: string) {
		await moveItem(itemId, 'down');
	}

	async function moveItemToParent(itemId: string) {
		const parent = getParent(treeRoots, itemId);
		if (!parent) { return; }

		const item = parent.children.find((i) => i.id === itemId);
		if (!item) { return; }

		parent.children = parent.children.filter((i) => i.id !== itemId);

		const grandparent = getParent(treeRoots, parent.id);
		const targetList = grandparent ? grandparent.children : treeRoots;

		const parentIndex = targetList.findIndex((i) => i.id === parent.id);
		targetList.splice(parentIndex + 1, 0, item);

		if (grandparent) {
			grandparent.children = [...grandparent.children];
			treeRoots = [...treeRoots];
		} else {
			treeRoots = [...treeRoots];
		}

		saveTreeData();
		announce(`Moved ${item.name} to higher level`);
		await tick();
		focusNode(itemId);
	}

	// --- Smart Delete with Focus Management ---

	function handleDeleteNode(node: Partial<ContentNode>) {
		if (!node._id) { return; }

		// Calculate next focus target before deletion
		const visibleNodes = getVisibleNodes(treeRoots);
		const currentIndex = visibleNodes.findIndex((n) => n.id === String(node._id));
		let nextFocusId: string | null = null;

		if (visibleNodes.length > 1) {
			// Prefer next sibling, then previous, then parent
			const nextIndex = currentIndex < visibleNodes.length - 1 ? currentIndex + 1 : Math.max(0, currentIndex - 1);
			nextFocusId = visibleNodes[nextIndex]?.id || null;
		} else if (treeRoots.length > 0) {
			// If this was the last visible node, focus first root
			nextFocusId = treeRoots[0]?.id;
		}

		// Execute delete
		onDeleteNode?.(node);

		// Restore focus after DOM update
		if (nextFocusId) {
			tick().then(() => {
				rovingTabIndex = nextFocusId;
				focusNode(nextFocusId!);
				announce(`Deleted ${node.name}. Focus moved to next item.`);
			});
		} else {
			announce(`Deleted ${node.name}. No items remaining.`);
		}
	}

	// --- Helper ---

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
	{#key announcementId}
		{announcement}
	{/key}
</div>

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-2">
	<div class="relative flex-1 min-w-50">
		<iconify-icon icon="mdi:magnify" width="18" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
		<input
			type="text"
			placeholder="Search collections..."
			bind:value={searchText}
			class="input w-full h-12 pl-10 pr-8 rounded shadow-sm"
			aria-label="Search collections"
		>
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
				<span class="ml-1 uppercase text-xs font-bold">Expand All</span>
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
				<span class="ml-1 uppercase text-xs font-bold">Collapse All</span>
			</button>
		</SystemTooltip>
	</div>
</div>

<!-- Tree View -->
<div
	class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-2"
	class:is-dragging={isDragging}
	onkeydown={handleTreeKeyDown}
	role="tree"
	tabindex="0"
	aria-label="Collection hierarchy. Use arrow keys to navigate, Space to expand/collapse, Home/End for first/last item, letters to jump to items."
>
	{#if treeRoots.length === 0}
		<div class="text-center p-8 text-surface-500">
			<iconify-icon
				icon={searchText ? 'mdi:magnify-close' : 'mdi:folder-outline'}
				width="48"
				class="opacity-50 mb-2"
				aria-hidden="true"
			></iconify-icon>
			<p>{searchText ? `No results found for "${searchText}"` : 'No categories or collections yet'}</p>
		</div>
	{:else}
		<div
			class="dnd-zone root-zone"
			use:dndzone={{
				items: treeRoots,
				flipDurationMs,
				type: 'tree-items',
				dragDisabled: !!searchText,
				dropFromOthersDisabled: false,
				centreDraggedOnCursor: false,
				morphDisabled: false,
				dropTargetStyle: {
					outline: '2px dashed rgb(var(--color-primary-500))',
					background: 'rgb(var(--color-primary-500) / 0.1)'
				}
			}}
			onconsider={handleRootConsider}
			onfinalize={(e) => handleFinalize(e, null)}
			role="group"
		>
			{#each treeRoots as item (item.id)}
				<div
					class="tree-node-wrapper mb-2"
					class:hidden={!isNodeVisible(item, searchText)}
					animate:flip={{ duration: flipDurationMs }}
					role="treeitem"
					aria-expanded={expandedNodes.has(item.id)}
					aria-selected="false"
					data-item-id={item.id}
					data-node-type={item.nodeType}
					data-is-dnd-shadow-item={item[SHADOW_ITEM_MARKER_PROPERTY_NAME] ? true : false}
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
			onDelete={() => handleDeleteNode(toPartialContentNode(item))}
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
				announce(`Exited reorder mode for ${item.name}`);
			}}
			tabindex={rovingTabIndex === item.id ? 0 : -1}
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
						dropFromOthersDisabled: false,
						centreDraggedOnCursor: false,
						morphDisabled: false,
						dropTargetStyle: {
							outline: '2px dashed rgb(var(--color-tertiary-500))',
							background: 'rgb(var(--color-tertiary-500) / 0.1)'
						}
					}}
					onconsider={(e) => handleNestedConsider(e, item.id)}
					onfinalize={(e) => handleFinalize(e, item.id)}
					role="group"
					aria-label={`Contents of ${item.name}`}
				>
					{#if item.children?.length > 0}
						{#each item.children as child (child.id)}
							<div
								class="tree-node-wrapper mb-2"
								class:hidden={!isNodeVisible(child, searchText)}
								animate:flip={{ duration: flipDurationMs }}
								role="treeitem"
								aria-expanded={expandedNodes.has(child.id)}
								aria-selected="false"
								data-item-id={child.id}
								data-node-type={child.nodeType}
								data-is-dnd-shadow-item={child[SHADOW_ITEM_MARKER_PROPERTY_NAME] ? true : false}
							>
								{@render treeNode(child, level + 1)}
							</div>
						{/each}
					{:else if isDragging}
						<!-- Only show empty drop zone during active dragging -->
						<div class="empty-drop-zone min-h-10" role="none"></div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

<style>
	/* Filtering Hiding */
	.hidden {
		display: none !important;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		white-space: nowrap;
		border: 0;
		clip: rect(0, 0, 0, 0);
	}

	.collection-builder-tree {
		min-height: 200px;
		padding: 0.5rem;
	}

	.dnd-zone {
		position: relative;
		min-height: 60px;
		border: 2px dashed transparent;
		border-radius: 0.5rem;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease;
	}

	.dnd-zone:empty,
	.empty-drop-zone {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 2px;
		padding: 0;
		margin: 0;
		background: transparent;
		border: 2px dashed transparent;
		border-radius: 0.5rem;
		transition: all 0.2s ease;
	}

	.is-dragging .empty-drop-zone {
		min-height: 48px;
		padding: 0.5rem;
		margin: 0.5rem 0;
		background: rgb(var(--color-surface-200) / 0.3);
		border-color: rgb(var(--color-surface-400));
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
		background: rgb(var(--color-primary-500) / 0.1) !important;
		border-color: rgb(var(--color-primary-500)) !important;
	}

	/* Shadow item (placeholder) styling */
	:global([aria-grabbed="true"]) {
		border-radius: 0.5rem;
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
		opacity: 0.4;
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
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 2px;
		content: "";
		background: rgb(var(--color-surface-300));
	}

	/* Empty drop zone visible during drag */
	.empty-drop-zone {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		background: rgb(var(--color-surface-200) / 0.2);
		border: 2px dashed rgb(var(--color-surface-400));
		border-radius: 0.5rem;
	}

	/* Hide empty drop zones when not dragging */
	.dnd-zone:not(.is-dragging) .empty-drop-zone {
		display: none;
	}
</style>

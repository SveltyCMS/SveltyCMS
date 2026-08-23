<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/tree-view-board.svelte
@component
**Enhanced Board for nested collections using @thisux/sveltednd (migrated from svelte-dnd-action)**

### Props
- `contentNodes` {ContentNode[]} - Array of content nodes representing collections and categories
- `onNodeUpdate` {Function} - Callback function to handle updates to the content node
- `onEditCategory` {Function} - Callback function to handle editing of categories
- `onDeleteNode` {Function} - Callback function to handle node deletion
- `onDuplicateNode` {Function} - Callback function to handle node duplication

### Features:
- Drag and drop via @thisux/sveltednd (replaces former `svelte-dnd-action` / `dndzone`)
- Free nesting: drop on category **middle** = inside; top/bottom edge = sibling before/after
- Nested category drop zones auto-expand while dragging
- Preserves full ContentNode payloads (collectionDef, etc.) so sidebar stays coherent
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
import type { ContentNode, DatabaseId } from "@databases/db-interface";
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import { sortContentNodes } from "@src/content";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount, tick } from "svelte";
import { flip } from "svelte/animate";
import { draggable, droppable, dndState } from '@thisux/sveltednd';
import type { DragDropState } from '@thisux/sveltednd';
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { screen } from "@src/stores/screen-size-store.svelte.ts";
// Components
import TreeViewNode from "./tree-view-node.svelte";
	import Button from '@components/ui/button.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';

	export interface TreeViewItem extends Record<string, any> {
		_id?: any;
		icon?: string;
		id: string;
		isDraggable?: boolean;
		isDropAllowed?: boolean;
		name: string;
		nodeType: "category" | "collection" | "folder";
		order?: number;
		parent: string | null;
		path: string;
	}

interface Props {
	contentNodes: ContentNode[];
	/** Incremented by parent on save success so we rebuild from server order. */
	structureKey?: number;
	onDeleteNode?: (node: Partial<ContentNode>) => void;
	onDuplicateNode?: (node: Partial<ContentNode>) => void;
	onEditCategory: (category: Partial<ContentNode>) => void;
	onNodeUpdate: (updatedNodes: ContentNode[]) => void;
	/** Id of the single category selected for "add collection" (only one at a time). */
	selectedCategoryId?: string | null;
	/** Called when user clicks "Select" on a category. */
	onSelectCategory?: (node: TreeViewItem) => void;
}

let {
	contentNodes = [],
	structureKey = 0,
	onNodeUpdate,
	onEditCategory,
	onDeleteNode,
	onDuplicateNode,
	selectedCategoryId = null,
	onSelectCategory,
}: Props = $props();

// Search and UI State
let searchText = $state("");
let treeRoots = $state<EnhancedTreeViewItem[]>([]);
let initialized = $state(false);
// eslint-disable-next-line svelte/no-unnecessary-state-wrap
let expandedNodes = $state(new SvelteSet<string>());
// isDragging is now tracked via dndState.isDragging from @thisux/sveltednd
	let lastContentNodesHash = $state("");
/** Hash of the nodes we last sent in saveTreeData; skip rebuilding until contentNodes matches this (avoids revert on same-level or next move). */
let lastPushedHash = $state("");
/** Last structureKey we saw; when it changes, clear hash guards to force rebuild from server order. */
let lastStructureKey = $state(0);
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Full ContentNode snapshots keyed by id — tree UI only keeps display/DnD fields,
 * but sidebar + save need collectionDef / source / translations, etc.
 */
let sourceNodesById = new SvelteMap<string, ContentNode>();

/** Last pointer for before/after/inside thirds on category rows (sveltednd only exposes before|after). */
let lastPointerY = 0;
let lastPointerX = 0;

onMount(() => {
	const onMove = (e: PointerEvent) => {
		lastPointerX = e.clientX;
		lastPointerY = e.clientY;
	};
	window.addEventListener("pointermove", onMove, { passive: true });
	return () => window.removeEventListener("pointermove", onMove);
});

// Accessibility State
let announcement = $state("");
let announcementId = $state(0);
let keyboardReorderMode = $state<string | null>(null);
let rovingTabIndex = $state<string | null>(null); // ID of node with tabindex="0"

// Typeahead State
let typeaheadBuffer = $state("");
let typeaheadTimeout: ReturnType<typeof setTimeout> | null = null;

// Enhanced Item Type
	type EnhancedTreeViewItem = TreeViewItem & {
		children: EnhancedTreeViewItem[];
		level: number;
	};

// Cleanup effect to prevent memory leaks
$effect(() => {
	return () => {
		if (rebuildTimeout) {
			clearTimeout(rebuildTimeout);
		}
		if (typeaheadTimeout) {
			clearTimeout(typeaheadTimeout);
		}
	};
});

	// Initialize Tree from Props - with race condition protection
	$effect(() => {
		if (dndState.isDragging || !contentNodes.length) {
			return;
		}

	// When parent signals fresh server data (e.g. after save), clear hash guards so we rebuild from server order
	if (structureKey !== lastStructureKey) {
		lastStructureKey = structureKey;
		lastContentNodesHash = "";
		lastPushedHash = "";
	}

	const currentHash =
		contentNodes
			.map((n) => `${n._id}:${n.parentId}:${n.order}`)
			.sort()
			.join("|") + contentNodes.length;

	// Never rebuild from stale contentNodes when we've pushed an update that parent hasn't reflected yet
	if (lastPushedHash && currentHash !== lastPushedHash) {
		return;
	}
	// Parent synced (contentNodes matches what we sent); clear guard so server-driven updates can rebuild later
	if (lastPushedHash && currentHash === lastPushedHash) {
		lastPushedHash = "";
	}

	if (currentHash !== lastContentNodesHash) {
		if (rebuildTimeout) {
			clearTimeout(rebuildTimeout);
		}

		rebuildTimeout = setTimeout(() => {
			lastContentNodesHash = currentHash;
			lastPushedHash = "";

			// Sort by parent then order so UI always reflects DB order (do not rely on array order)
			const sortedNodes = [...contentNodes].sort((a, b) => {
				const parentA = a.parentId != null ? String(a.parentId) : "";
				const parentB = b.parentId != null ? String(b.parentId) : "";
				if (parentA !== parentB) return parentA.localeCompare(parentB);
				const orderDiff = (a.order ?? 0) - (b.order ?? 0);
				if (orderDiff !== 0) return orderDiff;
				return (a.name ?? "").localeCompare(b.name ?? "");
			});

			// Keep full node payloads for merge on save / sidebar sync
			const nextSource = new SvelteMap<string, ContentNode>();
			for (const n of sortedNodes) {
				nextSource.set(String(n._id), n);
			}
			sourceNodesById = nextSource;

			const flatItems: TreeViewItem[] = sortedNodes.map((n) => ({
				id: String(n._id),
				_id: n._id,
				name: n.name,
				nodeType: n.nodeType || (n as any).type || "collection",
				parent: n.parentId ? String(n.parentId) : null,
				order: n.order ?? 0,
				path: "", // Set below from id (path = id for root, parentPath.id for nested)
				icon: n.icon,
				slug: n.slug,
				description: n.description,
				isDraggable: true,
				isDropAllowed: true,
			}));
			const flatItemsWithPaths = recalculatePaths(flatItems);
			treeRoots = buildTree(flatItemsWithPaths);

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

function flattenTree(
	nodes: EnhancedTreeViewItem[],
	parentId: string | null = null,
): TreeViewItem[] {
	let flat: TreeViewItem[] = [];

	nodes.forEach((node, index) => {
			const {
			children,
			level: _level,
			...rest
		} = node;
		const newItem: TreeViewItem = { ...rest, parent: parentId, order: index };
		flat.push(newItem);

		if (children && children.length > 0) {
			flat = flat.concat(flattenTree(children, node.id));
		}
	});

	return flat;
}

function findNode(
	nodes: EnhancedTreeViewItem[],
	id: string,
): EnhancedTreeViewItem | null {
	for (const node of nodes) {
		if (node.id === id) {
			return node;
		}
		if (node.children) {
			const found = findNode(node.children, id);
			if (found) {
				return found;
			}
		}
	}
	return null;
}

function getParent(
	rootNodes: EnhancedTreeViewItem[],
	childId: string,
): EnhancedTreeViewItem | null {
	for (const node of rootNodes) {
		if (node.children.some((c) => c.id === childId)) {
			return node;
		}
		const found = getParent(node.children, childId);
		if (found) {
			return found;
		}
	}
	return null;
}

function getVisibleNodes(
	nodes: EnhancedTreeViewItem[],
): EnhancedTreeViewItem[] {
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

function collectIdsToExpand(
	nodes: EnhancedTreeViewItem[],
	search: string,
	ids: Set<string>,
): boolean {
	let hasMatch = false;
	for (const node of nodes) {
		const matches = node.name.toLowerCase().includes(search);
		const childHasMatch = collectIdsToExpand(node.children, search, ids);
		if (childHasMatch || (matches && node.children.length > 0)) {
			ids.add(node.id);
			hasMatch = true;
		}
		if (matches) {
			hasMatch = true;
		}
	}
	return hasMatch;
}

// Filtering Helper - simplified since we auto-expand matches
function isNodeVisible(node: EnhancedTreeViewItem, search: string): boolean {
	if (!search) {
		return true;
	}
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
	announce("Expanded all categories");
}

function collapseAll() {
	expandedNodes.clear();
	announce("Collapsed all categories");
}

function clearSearch() {
	searchText = "";
	announce("Search cleared");
}

function toggleNode(id: string) {
	if (expandedNodes.has(id)) {
		expandedNodes.delete(id);
		announce("Collapsed");
	} else {
		expandedNodes.add(id);
		announce("Expanded");
	}
}

function announce(message: string) {
	announcement = message;
	announcementId++;
	setTimeout(() => {
		if (announcement === message) {
			announcement = "";
		}
	}, 1000);
}

// --- Drag & Drop Handler ---

/**
 * sveltednd only reports before|after. For tree nesting we add "inside" on category
 * rows using the same 28%/44%/28% thirds as the shared TreeView (left sidebar).
 */
function resolveTreeDropIntent(
	targetItemId: string | null,
	dropPosition: "before" | "after" | null,
): "before" | "after" | "inside" {
	if (!targetItemId) return dropPosition ?? "after";
	const targetNode = findNode(treeRoots, targetItemId);
	if (!targetNode || targetNode.nodeType !== "category") {
		return dropPosition ?? "after";
	}

	const wrapper = document.querySelector(
		`[data-item-id="${CSS.escape(targetItemId)}"]`,
	) as HTMLElement | null;
	if (!wrapper) return dropPosition ?? "after";

	// Prefer the category header row, not the whole subtree (nested zone height)
	const header =
		(wrapper.querySelector(
			':scope > .tree-node-outer > [role="button"]',
		) as HTMLElement | null) ??
		(wrapper.querySelector('[role="button"]') as HTMLElement | null) ??
		wrapper;
	const rect = header.getBoundingClientRect();
	const y = lastPointerY - rect.top;
	const h = Math.max(rect.height, 1);
	if (y < h * 0.28) return "before";
	if (y > h * 0.72) return "after";
	return "inside";
}

/** Auto-expand categories while dragging so nested drop zones appear. */
function handleCategoryDragOver(state: DragDropState<{ itemId: string }>) {
	const el = state.targetElement;
	if (!(el instanceof Element)) return;
	const itemEl = el.closest("[data-item-id]") as HTMLElement | null;
	const id = itemEl?.dataset?.itemId;
	if (!id) return;
	const node = findNode(treeRoots, id);
	if (node?.nodeType === "category" && !expandedNodes.has(id)) {
		expandedNodes.add(id);
	}
}

function handleTreeDrop(state: DragDropState<{ itemId: string }>) {
	const dragged = state.draggedItem;
	if (!dragged) return;

	const draggedId = dragged.itemId;
	const targetContainer = state.targetContainer || state.sourceContainer;
	const dropPosition = state.dropPosition;

	// Prefer the *deepest* data-item-id under the pointer (not an ancestor wrapper)
	const under =
		typeof document !== "undefined" && lastPointerX && lastPointerY
			? document.elementFromPoint(lastPointerX, lastPointerY)
			: null;
	const targetItemEl =
		(under instanceof Element
			? (under.closest("[data-item-id]") as HTMLElement | null)
			: null) ??
		(state.targetElement?.closest("[data-item-id]") as HTMLElement | null);
	const targetItemId = targetItemEl?.dataset?.itemId ?? null;

	// Default parent from container name (nested zones = children:<parentId>)
	let targetParentId: string | null =
		targetContainer === "root" ? null : targetContainer.replace("children:", "");

	const intent = resolveTreeDropIntent(targetItemId, dropPosition);

	// Drop on category middle → nest inside that category (free sub-region drag)
	if (intent === "inside" && targetItemId) {
		targetParentId = targetItemId;
		expandedNodes.add(targetItemId);
	}

	// CYCLE DETECTION
	const draggedNode = findNode(treeRoots, draggedId);
	if (!draggedNode) return;
	if (
		targetParentId &&
		(targetParentId === draggedId ||
			isAncestorOf(draggedId, targetParentId, treeRoots))
	) {
		announce(
			`Cannot move "${draggedNode?.name || "item"}" into its own sub-category`,
		);
		toast.warning("Cannot drop a category into itself or its descendants.");
		return;
	}

	// Only categories accept children — never nest under a collection
	if (targetParentId) {
		const parentNode = findNode(treeRoots, targetParentId);
		if (parentNode && parentNode.nodeType !== "category") {
			// Treat as sibling of that collection under the same parent
			targetParentId = parentNode.parent ?? null;
		}
	}

	// DUPLICATE NAME DETECTION
	const siblingList = targetParentId
		? findNode(treeRoots, targetParentId)?.children || []
		: treeRoots;
	const nameNorm = (n: string) => n.trim().toLowerCase();
	const draggedName = nameNorm(draggedNode.name || "");
	if (
		draggedName &&
		siblingList.some(
			(n) => n.id !== draggedId && nameNorm(n.name || "") === draggedName,
		)
	) {
		announce("A collection with this name already exists in the target category.");
		toast.warning(
			"A collection with this name already exists in the target category.",
		);
		return;
	}

	// Get full node data before removal
	const fullNode = {
		...draggedNode,
		children: [...(draggedNode.children || [])],
	};

	// Remove from source
	removeFromTree(treeRoots, draggedId);

	// Resolve target list after removal
	const targetList = targetParentId
		? findNode(treeRoots, targetParentId)?.children || []
		: treeRoots;

	let targetIndex: number;
	if (intent === "inside") {
		// Nest: append to end of category (stable, predictable)
		targetIndex = targetList.length;
	} else if (targetItemId) {
		// Sibling reorder relative to target — skip when target is the nest parent
		const foundIndex = targetList.findIndex((n) => n.id === targetItemId);
		if (foundIndex >= 0) {
			targetIndex = intent === "after" ? foundIndex + 1 : foundIndex;
		} else {
			targetIndex = targetList.length;
		}
	} else {
		targetIndex = targetList.length;
	}
	targetIndex = Math.min(Math.max(0, targetIndex), targetList.length);

	targetList.splice(targetIndex, 0, fullNode);

	// Trigger reactivity and recalculate
	treeRoots = [...treeRoots];
	const flatAfterMove = flattenTree(treeRoots);
	const withPaths = recalculatePaths(flatAfterMove);
	const treeWithPaths = buildTree(withPaths);
	treeRoots = $state.snapshot(treeWithPaths) as EnhancedTreeViewItem[];

	// Optimistic local persistence + parent/sidebar sync
	saveTreeData();
	announce(
		intent === "inside"
			? `Moved ${draggedNode.name} into category`
			: `Moved ${draggedNode.name}`,
	);
}

// Helper: Remove node from tree
function removeFromTree(nodes: EnhancedTreeViewItem[], id: string): boolean {
	const idx = nodes.findIndex(n => n.id === id);
	if (idx >= 0) { nodes.splice(idx, 1); return true; }
	for (const n of nodes) {
		if (n.children && removeFromTree(n.children, id)) return true;
	}
	return false;
}

// Helper: Check if potentialAncestor is actually an ancestor of nodeId
function isAncestorOf(
	potentialAncestorId: string,
	nodeId: string,
	nodes: EnhancedTreeViewItem[],
): boolean {
	const targetNode = findNode(nodes, nodeId);
	if (!targetNode) {
		return false;
	}

	// Walk up from targetNode to see if we hit potentialAncestorId
	let current: EnhancedTreeViewItem | null = targetNode;
	const visited = new SvelteSet<string>();

	while (current) {
		if (current.id === potentialAncestorId) {
			return true;
		}
		if (visited.has(current.id)) {
			break; // Cycle protection
		}
		visited.add(current.id);
		current = getParent(nodes, current.id);
	}

	return false;
}


function saveTreeData() {
	const flatItems = flattenTree(treeRoots);
	const withPaths = recalculatePaths(flatItems);
	const nodes = toFlatContentNodes(withPaths);

	const pushedHash =
		nodes
			.map((n) => `${n._id}:${n.parentId}:${n.order}`)
			.sort()
			.join("|") + nodes.length;

	// Set hash and guard so we don't rebuild from stale contentNodes until parent syncs
	lastContentNodesHash = pushedHash;
	lastPushedHash = pushedHash;

	onNodeUpdate(nodes);
}

function recalculatePaths(items: TreeViewItem[]): TreeViewItem[] {
	const itemMap = new SvelteMap<string, TreeViewItem>();
	for (const item of items) {
		itemMap.set(item.id, { ...item });
	}

	const childrenByParent = new SvelteMap<string, TreeViewItem[]>();
	for (const item of items) {
		const parentKey = item.parent || "__root__";
		if (!childrenByParent.has(parentKey)) {
			childrenByParent.set(parentKey, []);
		}
		childrenByParent.get(parentKey)!.push(itemMap.get(item.id)!);
	}

	// DO NOT SORT HERE. The items are already in the correct order from flattenTree which respects UI order.
	// Sorting by sortContentNodes (which uses node.order) will use stale order values and break DnD.

	function assignPaths(parentId: string | null, parentPath: string): void {
		const key = parentId || "__root__";
		const children = childrenByParent.get(key);
		if (!children) return;

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

	assignPaths(null, "");
	return Array.from(itemMap.values());
}

function toFlatContentNodes(flatItems: TreeViewItem[]): ContentNode[] {
	return flatItems.map((item) => {
		const id = String(item._id || item.id);
		const original = sourceNodesById.get(id);
		// Merge DnD position fields onto the full original payload so sidebar / save keep collectionDef etc.
		const merged = {
			...original,
			...item,
			_id: (item._id || item.id) as DatabaseId,
			// Send null for root so server persists it (undefined is omitted by JSON and DB keeps old parent).
			parentId: item.parent != null ? (item.parent as DatabaseId) : null,
			name: item.name ?? original?.name,
			icon: item.icon ?? original?.icon,
			nodeType: item.nodeType ?? original?.nodeType,
			path: item.path,
			order: item.order ?? 0,
			slug: item.slug ?? original?.slug,
			description: item.description ?? original?.description,
		} as unknown as ContentNode & {
			id?: unknown;
			parent?: unknown;
			text?: unknown;
			children?: unknown;
			level?: unknown;
			isDraggable?: unknown;
			isDropAllowed?: unknown;
		};
		// Strip tree-only fields
		delete (merged as any).id;
		delete (merged as any).parent;
		delete (merged as any).text;
		delete (merged as any).children;
		delete (merged as any).level;
		delete (merged as any).isDraggable;
		delete (merged as any).isDropAllowed;
		// Keep source map fresh for subsequent moves before parent rebuilds
		sourceNodesById.set(id, merged as ContentNode);
		return merged as ContentNode;
	});
}

// --- Keyboard Navigation ---

function handleTreeKeyDown(e: KeyboardEvent) {
	// Let keyboard reorder mode handle its own keys
	if (keyboardReorderMode) {
		return;
	}

	const visibleNodes = getVisibleNodes(treeRoots);
	if (visibleNodes.length === 0) {
		return;
	}

	const activeElement = document.activeElement?.closest(
		"[data-item-id]",
	) as HTMLElement | null;
	const currentId = activeElement?.dataset.itemId;
	let currentIndex = visibleNodes.findIndex((n) => n.id === currentId);

	// If no focus yet, assume first
	if (currentIndex === -1) {
		currentIndex = 0;
	}
	const currentNode = visibleNodes[currentIndex];

	let nextNode: EnhancedTreeViewItem | null = null;
	let handled = true;

	switch (e.key) {
		case "ArrowUp": {
			e.preventDefault();
			if (currentIndex > 0) {
				nextNode = visibleNodes[currentIndex - 1];
			}
			break;
		}

		case "ArrowDown": {
			e.preventDefault();
			if (currentIndex < visibleNodes.length - 1) {
				nextNode = visibleNodes[currentIndex + 1];
			}
			break;
		}

		case "ArrowLeft": {
			e.preventDefault();
			if (expandedNodes.has(currentNode.id) && currentNode.children?.length) {
				toggleNode(currentNode.id);
			} else {
				const parent = getParent(treeRoots, currentNode.id);
				if (parent) {
					nextNode = parent;
				}
			}
			break;
		}

		case "ArrowRight": {
			e.preventDefault();
			if (!expandedNodes.has(currentNode.id) && currentNode.children?.length) {
				toggleNode(currentNode.id);
			} else if (currentNode.children?.length) {
				nextNode = currentNode.children[0];
			}
			break;
		}

		case "Home": {
			e.preventDefault();
			nextNode = visibleNodes[0] ?? null;
			break;
		}

		case "End": {
			e.preventDefault();
			nextNode = visibleNodes.at(-1) ?? null;
			break;
		}

		case "*": {
			e.preventDefault();
			const parent = getParent(treeRoots, currentNode.id);
			const siblings = parent ? parent.children : treeRoots;
			siblings.forEach((s) => {
				if (s.children?.length) {
					expandedNodes.add(s.id);
				}
			});
			announce("Expanded all siblings");
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

function handleTypeahead(
	char: string,
	visibleNodes: EnhancedTreeViewItem[],
	currentIndex: number,
) {
	typeaheadBuffer += char.toLowerCase();

	if (typeaheadTimeout) {
		clearTimeout(typeaheadTimeout);
	}
	typeaheadTimeout = setTimeout(() => {
		typeaheadBuffer = "";
	}, 500);

	// Search from current position + 1, then wrap around
	const searchNodes = [
		...visibleNodes.slice(currentIndex + 1),
		...visibleNodes.slice(0, currentIndex + 1),
	];

	const match = searchNodes.find((n) =>
		n.name.toLowerCase().startsWith(typeaheadBuffer),
	);

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
			(element as HTMLElement).scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
	});
}

// --- Keyboard Reordering ---

async function moveItem(itemId: string, direction: "up" | "down") {
	const parent = getParent(treeRoots, itemId);
	const list = parent ? parent.children : treeRoots;
	const index = list.findIndex((i) => i.id === itemId);

	if (index === -1) {
		return;
	}

	const newIndex = direction === "up" ? index - 1 : index + 1;
	if (newIndex < 0 || newIndex >= list.length) {
		return;
	}

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
	await moveItem(itemId, "up");
}

async function moveItemDown(itemId: string) {
	await moveItem(itemId, "down");
}

async function moveItemToParent(itemId: string) {
	const parent = getParent(treeRoots, itemId);
	if (!parent) {
		return;
	}

	const item = parent.children.find((i) => i.id === itemId);
	if (!item) {
		return;
	}

	const grandparent = getParent(treeRoots, parent.id);
	const targetList = grandparent ? grandparent.children : treeRoots;
	const nameNorm = (n: string) => (n ?? "").trim().toLowerCase();
	const itemNameNorm = nameNorm(item.name ?? "");
	if (
		itemNameNorm &&
		targetList.some(
			(sibling) =>
				sibling.id !== item.id && nameNorm(sibling.name ?? "") === itemNameNorm,
		)
	) {
		toast.warning(
			"A collection with this name already exists in the target category.",
		);
		announce(
			"A collection with this name already exists in the target category.",
		);
		return;
	}

	parent.children = parent.children.filter((i) => i.id !== itemId);

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
	if (!node._id) {
		return;
	}

	// Calculate next focus target before deletion
	const visibleNodes = getVisibleNodes(treeRoots);
	const currentIndex = visibleNodes.findIndex((n) => n.id === String(node._id));
	let nextFocusId: string | null = null;

	if (visibleNodes.length > 1) {
		// Prefer next sibling, then previous, then parent
		const nextIndex =
			currentIndex < visibleNodes.length - 1
				? currentIndex + 1
				: Math.max(0, currentIndex - 1);
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
		path: item.path,
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
<div class="mb-2 flex flex-wrap items-center gap-2">
	<div class="relative flex-1 min-w-50">
		<FloatingInput
			bind:value={searchText}
			label="Search collections..."
			icon="mdi:magnify"
			aria-label="Search collections"
			inputClass="w-full h-12 pe-8 rounded shadow-sm"
		/>
		{#if searchText}
			<Button variant="surface"
				type="button"
				onclick={clearSearch}
				aria-label="Clear search"
			 class="p-0! min-w-0 absolute inset-e-2 top-1/2 -translate-y-1/2 z-10">
				<iconify-icon icon="mdi:close" width={16}></iconify-icon>
			</Button>
		{/if}
	</div>
	<div class="flex gap-2">
		<SystemTooltip title="Expand all categories">
			<Button variant="surface"
				type="button"
				onclick={expandAll}
				aria-label="Expand all categories"
			 class="hover: transition-all shadow-sm">
				<iconify-icon icon="mdi:unfold-more-horizontal" width={24} aria-hidden="true"></iconify-icon>
				<span class="ms-1 uppercase text-xs font-bold">Expand All</span>
			</Button>
		</SystemTooltip>
		<SystemTooltip title="Collapse all categories">
			<Button variant="surface"
				type="button"
				onclick={collapseAll}
				aria-label="Collapse all categories"
			 class="hover: transition-all shadow-sm">
				<iconify-icon icon="mdi:unfold-less-horizontal" width={24} aria-hidden="true"></iconify-icon>
				<span class="ms-1 uppercase text-xs font-bold">Collapse All</span>
			</Button>
		</SystemTooltip>
	</div>
</div>

	<!-- Tree View: only claim role="tree" when treeitems exist; empty state
		     is not a valid ARIA tree (missing required treeitem children).
		     tabindex must follow role — a noninteractive div cannot be focusable. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -- role is only 'tree'
	     (a focusable interactive role) when treeitems exist; an empty tree must
	     not be focusable or claim an ARIA role without required children. The
	     static analyzer cannot see that tabindex is gated on the same condition. -->
	<div
		class="dnd-tree relative h-auto min-h-50 w-full overflow-y-auto rounded p-2 [&.dnd-active]:select-none"
		class:dnd-active={dndState.isDragging}
		onkeydown={handleTreeKeyDown}
		role={treeRoots.length > 0 ? 'tree' : undefined}
		tabindex={treeRoots.length > 0 ? 0 : undefined}
		aria-label="Collection hierarchy. Use arrow keys to navigate, Space to expand/collapse, Home/End for first/last item, letters to jump to items."
	>
	{#if treeRoots.length === 0}
		<div class="text-center p-8 text-surface-500">
			<iconify-icon icon={searchText ? 'mdi:magnify-close' : 'mdi:folder-outline'} width="48" class="opacity-50 mb-2" aria-hidden="true"
			></iconify-icon>
			<p>{searchText ? `No results found for "${searchText}"` : 'No categories or collections yet'}</p>
		</div>
	{:else}
		<div
			class="root-zone relative min-h-15 border-2 border-dashed border-transparent rounded-lg transition-colors duration-200 [&.drag-over-zone]:bg-primary-500/10! [&.drag-over-zone]:outline-2 [&.drag-over-zone]:outline-dashed [&.drag-over-zone]:outline-primary-500!"
			class:dropping={dndState.isDragging}
			use:droppable={{
				container: 'root',
				callbacks: {
					onDrop: handleTreeDrop,
					onDragOver: handleCategoryDragOver,
				},
				direction: 'vertical',
				attributes: {
					dragOverClass: 'drag-over-zone'
				}
			}}
			role="group"
		>
			{#each treeRoots as item (item.id)}
				<div
					class="relative mb-2 [&.dragging]:opacity-50 [&.dragging]:scale-95 [&.drag-over-item]:outline-2 [&.drag-over-item]:outline-dashed [&.drag-over-item]:outline-primary-400! [&.drag-over-item]:outline-offset-2 [&.drag-over-item]:rounded-lg [&.drop-inside-hint]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-tertiary-500)_25%,transparent)] [&.drop-inside-hint]:rounded-lg"
					class:hidden={!isNodeVisible(item, searchText)}
					class:drop-inside-hint={dndState.isDragging && item.nodeType === 'category'}
					animate:flip={{ duration: flipDurationMs }}
					role="treeitem"
					aria-expanded={expandedNodes.has(item.id)}
					aria-selected="false"
					data-item-id={item.id}
					data-node-type={item.nodeType}
					use:draggable={{
						container: 'root',
						dragData: { itemId: item.id },
						disabled: !!searchText,
						keyboard: true,
					}}
					use:droppable={{
						container: 'root',
						callbacks: {
							onDrop: handleTreeDrop,
							onDragOver: handleCategoryDragOver,
						},
						direction: 'vertical',
						attributes: { dragOverClass: 'drag-over-item' },
					}}
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
			isSelectedCategory={item.nodeType === 'category' && item.id === selectedCategoryId}
			toggle={() => toggleNode(item.id)}
			onEditCategory={() => onEditCategory(toPartialContentNode(item))}
			onDelete={() => handleDeleteNode(toPartialContentNode(item))}
			onDuplicate={() => onDuplicateNode?.(toPartialContentNode(item))}
			onSelectCategory={item.nodeType === 'category' && onSelectCategory ? () => onSelectCategory(item) : undefined}
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

		{#if expandedNodes.has(item.id) || (dndState.isDragging && item.nodeType === 'category')}
			{#if item.children?.length > 0 || item.nodeType === 'category'}
				<div
					class="relative mt-2 min-h-15 border-2 border-dashed border-transparent rounded-lg transition-colors duration-200 before:absolute before:top-0 before:bottom-0 before:left-0 before:w-0.5 before:bg-surface-300 before:content-[''] empty:flex empty:items-center empty:justify-center empty:min-h-0.5 empty:rounded-lg [&.drag-over-zone]:bg-tertiary-500/10! [&.drag-over-zone]:outline-2 [&.drag-over-zone]:outline-dashed [&.drag-over-zone]:outline-tertiary-500! [&.drag-over-zone]:min-h-12"
					class:dropping={dndState.isDragging}
					style="margin-left: {screen.isDesktop ? Math.min(level + 1, 6) * 0.75 : 0.4}rem; padding-left: 0.5rem; border-left: 2px solid var(--color-surface-300);"
					use:droppable={{
						container: 'children:' + item.id,
						callbacks: {
							onDrop: handleTreeDrop,
							onDragOver: handleCategoryDragOver,
						},
						direction: 'vertical',
						attributes: {
							dragOverClass: 'drag-over-zone'
						}
					}}
					role="group"
					aria-label={`Contents of ${item.name}`}
				>
					{#if item.children?.length > 0}
						{#each item.children as child (child.id)}
							<div
								class="relative mb-2 [&.dragging]:opacity-50 [&.dragging]:scale-95 [&.drag-over-item]:outline-2 [&.drag-over-item]:outline-dashed [&.drag-over-item]:outline-primary-400! [&.drag-over-item]:outline-offset-2 [&.drag-over-item]:rounded-lg [&.drop-inside-hint]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-tertiary-500)_25%,transparent)] [&.drop-inside-hint]:rounded-lg"
								class:hidden={!isNodeVisible(child, searchText)}
								class:drop-inside-hint={dndState.isDragging && child.nodeType === 'category'}
								animate:flip={{ duration: flipDurationMs }}
								role="treeitem"
								aria-expanded={expandedNodes.has(child.id)}
								aria-selected="false"
								data-item-id={child.id}
								data-node-type={child.nodeType}
								use:draggable={{
									container: 'children:' + item.id,
									dragData: { itemId: child.id },
									disabled: !!searchText,
									keyboard: true,
								}}
								use:droppable={{
									container: 'children:' + item.id,
									callbacks: {
										onDrop: handleTreeDrop,
										onDragOver: handleCategoryDragOver,
									},
									direction: 'vertical',
									attributes: { dragOverClass: 'drag-over-item' },
								}}
							>
								{@render treeNode(child, level + 1)}
							</div>
						{/each}
					{:else if dndState.isDragging}
						<!-- Empty category: explicit drop surface while dragging -->
						<div class="my-2 flex min-h-12 items-center justify-center rounded-lg border-2 border-dashed border-surface-500 bg-surface-200/30 p-2 transition-all duration-200" aria-hidden="true"></div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

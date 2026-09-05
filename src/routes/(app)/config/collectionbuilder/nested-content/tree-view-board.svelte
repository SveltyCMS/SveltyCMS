<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/tree-view-board.svelte
@component
**Nested collection tree with file-manager style drag & drop (@thisux/sveltednd)**

### Props
- `contentNodes` {ContentNode[]} - Flat list of collections and categories
- `structureKey` {number} - Incremented by parent after a save so we rebuild from server order
- `onNodeUpdate` {Function} - Receives the full flat node list after every move
- `onEditCategory` / `onDeleteNode` / `onDuplicateNode` - Row action callbacks

### Drag & drop model
Two operations, resolved from exactly one signal each — rows are the ONLY drop
targets, so nothing appears or resizes when a drag starts:

1. **Sort** — drop on the top/bottom half of a row inserts before/after it, as a
   sibling *at that row's level*. This is also how you move an item OUT of a
   category: drop it on the half of any row that lives at the level you want.
2. **Nest** — the pointer in the MIDDLE band of a category row (the outer
   `SORT_EDGE` of its height always means "sort beside") highlights it amber and
   springs it open immediately, and a release drops INSIDE it, appended last.
   Position within the row is the only thing that decides nest-vs-sort, which is
   exactly the rule the sidebar tree (`tree-view.svelte`) uses. Reserving the
   edges for sorting is what lets you still reorder past a category without
   falling into it. This also covers empty categories, so no placeholder drop
   zone is needed.

Why this shape: sveltednd derives `dropPosition` from the droppable node's own
bounding rect (`clientY < top + height/2`). So each droppable must wrap the row
header ONLY — never the subtree — or the midpoint is the middle of the whole
expanded branch. Children therefore render as a *sibling* of the row, which also
means no droppable is ever nested inside another droppable and a single gesture
can only ever fire one `onDrop`.

"Inside" is not a position sveltednd reports, so it is derived from the cursor's
offset within the row on the native `dragover` event — that event carries
`clientX/Y` and keeps firing during an HTML5 drag, which `pointermove` does not.
-->
<script lang="ts">
import type { ContentNode, DatabaseId } from "@databases/db-interface";
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { tick } from "svelte";
import { droppable, dndState } from "@thisux/sveltednd";
import type { DragDropState } from "@thisux/sveltednd";
import { liftAndCarry } from "@utils/media/media-lift-drag";
import { suppressNativeDragGhost } from "@utils/media/media-dnd";
import { SvelteSet } from "svelte/reactivity";
import { screen } from "@src/stores/screen-size-store.svelte.ts";
// Components
import TreeViewNode from "./tree-view-node.svelte";
import TreeDragPreview from "./tree-drag-preview.svelte";
import Button from "@components/ui/button.svelte";
import FloatingInput from "@components/ui/floating-input.svelte";

export interface TreeViewItem extends Record<string, any> {
	_id?: any;
	icon?: string;
	id: string;
	name: string;
	nodeType: "category" | "collection" | "folder";
	order?: number;
	parent: string | null;
	path: string;
}

type TreeNode = TreeViewItem & { children: TreeNode[] };

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

/**
 * Fraction of a category row's height reserved at each edge for sorting; the
 * middle band nests. Matches the sidebar tree (`tree-view.svelte`) so the two
 * trees feel identical: position within the row is the ONLY thing that decides
 * nest-vs-sort, and it responds immediately — no hold, no timers.
 */
const SORT_EDGE = 0.25;

// --- Core state ---
let searchText = $state("");
let treeRoots = $state<TreeNode[]>([]);
let expandedNodes = $state(new SvelteSet<string>());
let initialized = $state(false);

/**
 * Hash of the tree we last handed to `onNodeUpdate`. While this is set we ignore
 * incoming `contentNodes` that don't match it, so an in-flight save can't be
 * clobbered by the pre-save props still sitting in the parent.
 */
let pendingPushHash = $state("");
let lastRenderedHash = $state("");
let lastStructureKey = $state(0);

/**
 * Full ContentNode payloads keyed by id. The tree only carries display/DnD
 * fields; save and the sidebar need collectionDef / source / translations.
 * Plain Map on purpose — it is written during rebuild, never read reactively.
 */
let sourceNodesById = new Map<string, ContentNode>();

// --- Drag state ---
/** Category the pointer is over the middle of; dropping now nests inside it. */
let nestTargetId = $state<string | null>(null);
/** Pointer position the countdown was anchored at, to measure travel against. */

/**
 * Row being dragged, set one frame AFTER dragstart. Chrome snapshots the source
 * element for its drag image at the end of the dragstart handler, so dimming it
 * synchronously (as a `.dragging` class does) bakes the transparency into that
 * snapshot and the cursor carries a washed-out, near-empty rectangle. Deferring
 * by a frame lets the snapshot capture the row at full opacity.
 */
let dragSourceId = $state<string | null>(null);

/**
 * Where the insertion line is drawn. Derived from dndState rather than the
 * library's own indicator: for `after` it moves the line onto
 * `node.nextElementSibling`, which in a tree is the target's children block,
 * so the line would render inside the branch instead of below it.
 */
function lineFor(id: string): "before" | "after" | null {
	if (!dndState.isDragging) return null;
	if (dndState.targetContainer !== `node:${id}`) return null;
	if (nestTargetId === id) return null; // nesting, not sorting
	return dndState.dropPosition ?? null;
}

// --- Accessibility state ---
let announcement = $state("");
let announcementId = $state(0);
let rovingTabIndex = $state<string | null>(null);
let typeaheadBuffer = "";
let typeaheadTimeout: ReturnType<typeof setTimeout> | null = null;

$effect(() => () => {
	if (typeaheadTimeout) clearTimeout(typeaheadTimeout);
});

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

function hashNodes(nodes: Array<{ _id?: unknown; parentId?: unknown; order?: number }>): string {
	return (
		nodes
			.map((n) => `${String(n._id)}:${n.parentId == null ? "" : String(n.parentId)}:${n.order ?? 0}`)
			.sort()
			.join("|") + `#${nodes.length}`
	);
}

/** Build the nested tree from the flat server list. Pure — no reactive allocations. */
function buildTree(flat: ContentNode[]): TreeNode[] {
	const byId = new Map<string, TreeNode>();

	for (const n of flat) {
		const id = String(n._id);
		byId.set(id, {
			id,
			_id: n._id,
			name: n.name,
			nodeType: (n.nodeType || (n as any).type || "collection") as TreeViewItem["nodeType"],
			parent: n.parentId != null ? String(n.parentId) : null,
			order: n.order ?? 0,
			path: n.path ?? "",
			icon: n.icon,
			slug: n.slug,
			description: n.description,
			children: [],
		});
	}

	const roots: TreeNode[] = [];
	for (const n of flat) {
		const node = byId.get(String(n._id))!;
		const parent = node.parent ? byId.get(node.parent) : null;
		if (parent) parent.children.push(node);
		else roots.push(node);
	}

	// `order` is authoritative; name only breaks exact ties so the result is stable.
	const byOrder = (a: TreeNode, b: TreeNode) =>
		(a.order ?? 0) - (b.order ?? 0) || (a.name ?? "").localeCompare(b.name ?? "");
	const sortDeep = (list: TreeNode[]) => {
		list.sort(byOrder);
		for (const child of list) sortDeep(child.children);
	};
	sortDeep(roots);

	return roots;
}

// Rebuild from props. Never while dragging, and never over an unacknowledged push.
$effect(() => {
	const incoming = contentNodes;
	if (dndState.isDragging || !incoming.length) return;

	if (structureKey !== lastStructureKey) {
		lastStructureKey = structureKey;
		pendingPushHash = "";
		lastRenderedHash = "";
	}

	const hash = hashNodes(incoming);

	if (pendingPushHash) {
		// Parent has caught up with our optimistic tree — resume accepting props.
		if (hash === pendingPushHash) pendingPushHash = "";
		return;
	}
	if (hash === lastRenderedHash) return;

	lastRenderedHash = hash;
	sourceNodesById = new Map(incoming.map((n) => [String(n._id), n]));
	treeRoots = buildTree(incoming);

	if (!initialized) {
		initialized = true;
		expandAll();
	}
	if (!rovingTabIndex && treeRoots.length > 0) rovingTabIndex = treeRoots[0].id;
});

// Auto-expand branches containing a search match.
$effect(() => {
	const term = searchText.trim().toLowerCase();
	if (!term) return;
	collectIdsToExpand(treeRoots, term, expandedNodes);
});

// ---------------------------------------------------------------------------
// Tree queries (pure)
// ---------------------------------------------------------------------------

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
	for (const node of nodes) {
		if (node.id === id) return node;
		const found = findNode(node.children, id);
		if (found) return found;
	}
	return null;
}

function getParent(nodes: TreeNode[], childId: string): TreeNode | null {
	for (const node of nodes) {
		if (node.children.some((c) => c.id === childId)) return node;
		const found = getParent(node.children, childId);
		if (found) return found;
	}
	return null;
}

/** True when `candidateId` is `ancestorId` itself or sits anywhere beneath it. */
function isSelfOrDescendant(ancestorId: string, candidateId: string): boolean {
	if (ancestorId === candidateId) return true;
	const ancestor = findNode(treeRoots, ancestorId);
	if (!ancestor) return false;
	const walk = (list: TreeNode[]): boolean =>
		list.some((n) => n.id === candidateId || walk(n.children));
	return walk(ancestor.children);
}

function getVisibleNodes(nodes: TreeNode[]): TreeNode[] {
	const visible: TreeNode[] = [];
	const walk = (list: TreeNode[]) => {
		for (const item of list) {
			visible.push(item);
			if (expandedNodes.has(item.id) && item.children.length) walk(item.children);
		}
	};
	walk(nodes);
	return visible;
}

function collectIdsToExpand(nodes: TreeNode[], search: string, ids: Set<string>): boolean {
	let hasMatch = false;
	for (const node of nodes) {
		const matches = node.name.toLowerCase().includes(search);
		const childMatch = collectIdsToExpand(node.children, search, ids);
		if (childMatch || (matches && node.children.length > 0)) {
			ids.add(node.id);
			hasMatch = true;
		}
		if (matches) hasMatch = true;
	}
	return hasMatch;
}

function isNodeVisible(node: TreeNode, search: string): boolean {
	if (!search) return true;
	return node.name.toLowerCase().includes(search.toLowerCase());
}

// ---------------------------------------------------------------------------
// Tree mutation (immutable — every changed branch is rebuilt, siblings reused)
// ---------------------------------------------------------------------------

/** Remove `id` from the tree, returning the detached node (with its subtree) and the new roots. */
function detach(nodes: TreeNode[], id: string): { roots: TreeNode[]; removed: TreeNode | null } {
	let removed: TreeNode | null = null;

	const strip = (list: TreeNode[]): TreeNode[] => {
		const out: TreeNode[] = [];
		for (const node of list) {
			if (node.id === id) {
				removed = node;
				continue;
			}
			const children = node.children.length ? strip(node.children) : node.children;
			out.push(children === node.children ? node : { ...node, children });
		}
		return out;
	};

	const roots = strip(nodes);
	return { roots, removed };
}

/** Insert `node` into `parentId`'s child list (or roots when null) at `index`. */
function attach(
	nodes: TreeNode[],
	parentId: string | null,
	index: number,
	node: TreeNode,
): TreeNode[] {
	if (parentId === null) {
		const out = [...nodes];
		out.splice(Math.min(Math.max(index, 0), out.length), 0, node);
		return out;
	}

	const walk = (list: TreeNode[]): TreeNode[] =>
		list.map((current) => {
			if (current.id === parentId) {
				const children = [...current.children];
				children.splice(Math.min(Math.max(index, 0), children.length), 0, node);
				return { ...current, children };
			}
			if (!current.children.length) return current;
			const children = walk(current.children);
			return children === current.children ? current : { ...current, children };
		});

	return walk(nodes);
}

/**
 * Re-derive `parent` and `order` for the whole tree from its current shape.
 *
 * `path` is deliberately left untouched: it is the stable key the database
 * matches structure rows on (`bulkUpdate` looks rows up by path). Rewriting it
 * into a parent-chain made every move address a row that does not exist, so the
 * save silently persisted nothing. Hierarchy lives in `parent` + `order`.
 */
function normalize(nodes: TreeNode[], parentId: string | null): TreeNode[] {
	return nodes.map((node, index) => ({
		...node,
		parent: parentId,
		order: index,
		children: normalize(node.children, node.id),
	}));
}

function flatten(nodes: TreeNode[]): TreeViewItem[] {
	const out: TreeViewItem[] = [];
	const walk = (list: TreeNode[]) => {
		for (const node of list) {
			const { children, ...rest } = node;
			out.push(rest);
			walk(children);
		}
	};
	walk(nodes);
	return out;
}

/** Merge tree position fields back onto the full server payloads. */
function toContentNodes(items: TreeViewItem[]): ContentNode[] {
	return items.map((item) => {
		const id = String(item._id || item.id);
		const original = sourceNodesById.get(id);
		const merged = {
			...original,
			_id: (item._id || item.id) as DatabaseId,
			name: item.name ?? original?.name,
			icon: item.icon ?? original?.icon,
			nodeType: item.nodeType ?? original?.nodeType,
			slug: item.slug ?? original?.slug,
			description: item.description ?? original?.description,
			path: item.path,
			order: item.order ?? 0,
			// null (not undefined) so the server actually clears the parent for root items.
			parentId: item.parent != null ? (item.parent as DatabaseId) : null,
		} as ContentNode;
		sourceNodesById.set(id, merged);
		return merged;
	});
}

/** Normalize, render, and push the tree to the parent. Single write path. */
function commit(nextRoots: TreeNode[]) {
	const normalized = normalize(nextRoots, null);
	treeRoots = normalized;

	const nodes = toContentNodes(flatten(normalized));
	const hash = hashNodes(nodes);
	pendingPushHash = hash;
	lastRenderedHash = hash;

	onNodeUpdate(nodes);
}

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------

/** sveltednd types callbacks as `DragDropState<unknown>`; our payload is always `{ itemId }`. */
function draggedIdOf(state: DragDropState<unknown>): string | null {
	const payload = state.draggedItem as { itemId?: string } | null | undefined;
	return payload?.itemId ?? null;
}

/** Clear the nest highlight if it is currently showing for `item`. */
function clearNestTarget(item: TreeNode) {
	if (nestTargetId === item.id) nestTargetId = null;
}

/**
 * Decide whether the pointer is asking to nest into this category or to sort
 * beside it, from pointer position alone — the same rule the sidebar tree uses:
 *
 * - outer `SORT_EDGE` of the row (top/bottom) → sort beside it
 * - middle band of a category → nest inside it, immediately
 *
 * There is no hold-to-nest: an intent that depends on holding still is invisible
 * until it fires, and made nesting feel unresponsive. Keeping the edges reserved
 * for sorting is what still lets you reorder past a category without falling in.
 *
 * `row` is the `.tree-row` rect, never the `.tree-item` rect — the latter spans
 * the whole expanded branch, so its middle band would sit somewhere down in the
 * children and nesting would trigger over the wrong rows.
 */
function applyNestZone(item: TreeNode, clientY: number, row: DOMRect) {
	if (item.nodeType !== "category") {
		clearNestTarget(item);
		return;
	}

	const draggedId = draggedIdOf(dndState);
	if (!draggedId || isSelfOrDescendant(draggedId, item.id)) {
		clearNestTarget(item);
		return;
	}

	if (row.height === 0) return;

	const offset = (clientY - row.top) / row.height;
	if (offset <= SORT_EDGE || offset >= 1 - SORT_EDGE) {
		clearNestTarget(item);
		return;
	}

	if (nestTargetId === item.id) return; // already active — nothing to change

	nestTargetId = item.id;
	// Spring open so the user can keep drilling into nested categories.
	expandedNodes.add(item.id);
}

/**
 * Desktop path. The native `dragover` event carries `clientX/Y` (sveltednd's own
 * callback only passes its state object) and keeps firing throughout an HTML5
 * drag, unlike `pointermove`.
 */
function handleRowDragOver(item: TreeNode, event: DragEvent) {
	applyNestZone(item, event.clientY, (event.currentTarget as HTMLElement).getBoundingClientRect());
}

/**
 * Touch path. A touch drag is NOT an HTML5 drag: sveltednd drives it from
 * `pointermove`/`pointerup` and never fires `dragover`, so `handleRowDragOver`
 * above simply never ran on mobile. That left `nestTargetId` permanently null —
 * the library's own before/after indicator still worked, so dropping onto a
 * category could only ever sort beside it, never nest inside it.
 *
 * One document-level listener resolves the row under the pointer rather than one
 * listener per row, so cost stays flat as the tree grows.
 */
function handleDocumentPointerMove(event: PointerEvent) {
	if (!dndState.isDragging) return;

	const under = document.elementFromPoint(event.clientX, event.clientY);
	const row = under instanceof Element ? under.closest(".tree-row") : null;
	if (!row) {
		nestTargetId = null;
		return;
	}

	const id = row.parentElement?.getAttribute("data-item-id");
	const item = id ? findNode(treeRoots, id) : null;
	if (!item) {
		nestTargetId = null;
		return;
	}

	applyNestZone(item, event.clientY, row.getBoundingClientRect());
}

$effect(() => {
	document.addEventListener("pointermove", handleDocumentPointerMove, { passive: true });
	return () => document.removeEventListener("pointermove", handleDocumentPointerMove);
});

function handleRowDragLeave(item: TreeNode) {
	clearNestTarget(item);
}

function endDrag() {
	nestTargetId = null;
	dragSourceId = null;
}

/** Defer the source dimming past Chrome's drag-image snapshot (see `dragSourceId`). */
function handleDragStart(item: TreeNode) {
	requestAnimationFrame(() => {
		if (dndState.isDragging) dragSourceId = item.id;
	});
}

/**
 * Reject the move and tell the user why. Returns true when the move is invalid.
 * `parentId === null` means root, which is always a legal destination.
 */
function rejectMove(node: TreeNode, parentId: string | null): boolean {
	if (parentId !== null && isSelfOrDescendant(node.id, parentId)) {
		const message = `Cannot move "${node.name}" into itself or one of its sub-categories.`;
		toast.warning(message);
		announce(message);
		return true;
	}

	const siblings = parentId ? (findNode(treeRoots, parentId)?.children ?? []) : treeRoots;
	const name = (node.name ?? "").trim().toLowerCase();
	if (
		name &&
		siblings.some((s) => s.id !== node.id && (s.name ?? "").trim().toLowerCase() === name)
	) {
		const message = `"${node.name}" already exists in the target category.`;
		toast.warning(message);
		announce(message);
		return true;
	}

	return false;
}

/** Move `draggedId` under `parentId` at `index`. Index is pre-removal. */
function moveNode(draggedId: string, parentId: string | null, index: number) {
	const node = findNode(treeRoots, draggedId);
	if (!node) return;
	if (rejectMove(node, parentId)) return;

	const currentParent = getParent(treeRoots, draggedId);
	const currentParentId = currentParent?.id ?? null;
	const siblings = currentParent ? currentParent.children : treeRoots;
	const currentIndex = siblings.findIndex((n) => n.id === draggedId);

	// Removing the node first shifts every later slot in the same list down by one.
	let targetIndex = index;
	if (currentParentId === parentId && currentIndex !== -1 && currentIndex < index) {
		targetIndex -= 1;
	}
	if (currentParentId === parentId && currentIndex === targetIndex) return; // no-op

	const { roots, removed } = detach(treeRoots, draggedId);
	if (!removed) return;

	commit(attach(roots, parentId, targetIndex, removed));

	const destination = parentId ? findNode(treeRoots, parentId)?.name : "top level";
	announce(`Moved ${node.name} to ${destination ?? "top level"}`);
}

/** Drop on a row: nest when the pointer is in that category's middle band, otherwise sort beside it. */
function handleRowDrop(item: TreeNode, state: DragDropState<unknown>) {
	const draggedId = draggedIdOf(state);
	const position = state.dropPosition;
	const nestInto = nestTargetId === item.id;
	endDrag();

	if (!draggedId || draggedId === item.id) return;

	if (nestInto && item.nodeType === "category") {
		const target = findNode(treeRoots, item.id);
		moveNode(draggedId, item.id, target?.children.length ?? 0);
		expandedNodes.add(item.id);
		return;
	}

	// Sort as a sibling of the hovered row, at that row's level.
	const parent = getParent(treeRoots, item.id);
	const parentId = parent?.id ?? null;
	const siblings = parent ? parent.children : treeRoots;
	const targetIndex = siblings.findIndex((n) => n.id === item.id);
	if (targetIndex === -1) return;

	moveNode(draggedId, parentId, position === "after" ? targetIndex + 1 : targetIndex);
}

// ---------------------------------------------------------------------------
// UI actions
// ---------------------------------------------------------------------------

function expandAll() {
	const walk = (nodes: TreeNode[]) => {
		for (const n of nodes) {
			expandedNodes.add(n.id);
			walk(n.children);
		}
	};
	walk(treeRoots);
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
}

// ---------------------------------------------------------------------------
// Keyboard navigation & reordering
// ---------------------------------------------------------------------------

function focusNode(id: string) {
	rovingTabIndex = id;
	tick().then(() => {
		const el = document.querySelector(`[data-item-id="${CSS.escape(id)}"] [role="button"]`);
		if (el instanceof HTMLElement) {
			el.focus();
			el.scrollIntoView({ block: "nearest" });
		}
	});
}

/** Alt+Arrow reorders. Plain arrows only navigate, so focus can never mutate data. */
function handleTreeKeyDown(e: KeyboardEvent) {
	const visible = getVisibleNodes(treeRoots);
	if (!visible.length) return;

	const activeItem = document.activeElement?.closest("[data-item-id]");
	const currentId = activeItem instanceof HTMLElement ? activeItem.dataset.itemId : undefined;
	const currentIndex = Math.max(
		0,
		visible.findIndex((n) => n.id === currentId),
	);
	const current = visible[currentIndex];
	if (!current) return;

	if (e.altKey) {
		switch (e.key) {
			case "ArrowUp":
				e.preventDefault();
				reorderWithinParent(current.id, -1);
				return;
			case "ArrowDown":
				e.preventDefault();
				reorderWithinParent(current.id, 1);
				return;
			case "ArrowLeft":
				e.preventDefault();
				moveToGrandparent(current.id);
				return;
			case "ArrowRight":
				e.preventDefault();
				nestIntoPreviousSibling(current.id);
				return;
		}
	}

	let next: TreeNode | null = null;

	switch (e.key) {
		case "ArrowUp":
			e.preventDefault();
			next = visible[currentIndex - 1] ?? null;
			break;
		case "ArrowDown":
			e.preventDefault();
			next = visible[currentIndex + 1] ?? null;
			break;
		case "ArrowLeft":
			e.preventDefault();
			if (expandedNodes.has(current.id) && current.children.length) toggleNode(current.id);
			else next = getParent(treeRoots, current.id);
			break;
		case "ArrowRight":
			e.preventDefault();
			if (!expandedNodes.has(current.id) && current.children.length) toggleNode(current.id);
			else next = current.children[0] ?? null;
			break;
		case "Home":
			e.preventDefault();
			next = visible[0] ?? null;
			break;
		case "End":
			e.preventDefault();
			next = visible.at(-1) ?? null;
			break;
		case "*": {
			e.preventDefault();
			const parent = getParent(treeRoots, current.id);
			for (const s of parent ? parent.children : treeRoots) {
				if (s.children.length) expandedNodes.add(s.id);
			}
			announce("Expanded all siblings");
			break;
		}
		default:
			if (e.key.length === 1 && /\S/.test(e.key)) {
				e.preventDefault();
				handleTypeahead(e.key, visible, currentIndex);
			}
			return;
	}

	if (next) focusNode(next.id);
}

function handleTypeahead(char: string, visible: TreeNode[], currentIndex: number) {
	typeaheadBuffer += char.toLowerCase();
	if (typeaheadTimeout) clearTimeout(typeaheadTimeout);
	typeaheadTimeout = setTimeout(() => {
		typeaheadBuffer = "";
	}, 500);

	const rotated = [...visible.slice(currentIndex + 1), ...visible.slice(0, currentIndex + 1)];
	const match = rotated.find((n) => n.name.toLowerCase().startsWith(typeaheadBuffer));
	if (match) {
		focusNode(match.id);
		announce(`Jumped to ${match.name}`);
	}
}

function reorderWithinParent(itemId: string, delta: number) {
	const parent = getParent(treeRoots, itemId);
	const siblings = parent ? parent.children : treeRoots;
	const index = siblings.findIndex((n) => n.id === itemId);
	const next = index + delta;
	if (index === -1 || next < 0 || next >= siblings.length) return;

	// moveNode indexes pre-removal, so moving down needs the slot past the neighbour.
	moveNode(itemId, parent?.id ?? null, delta > 0 ? next + 1 : next);
	focusNode(itemId);
}

function moveToGrandparent(itemId: string) {
	const parent = getParent(treeRoots, itemId);
	if (!parent) return;
	const grandparent = getParent(treeRoots, parent.id);
	const targetList = grandparent ? grandparent.children : treeRoots;
	moveNode(itemId, grandparent?.id ?? null, targetList.findIndex((n) => n.id === parent.id) + 1);
	focusNode(itemId);
}

function nestIntoPreviousSibling(itemId: string) {
	const parent = getParent(treeRoots, itemId);
	const siblings = parent ? parent.children : treeRoots;
	const index = siblings.findIndex((n) => n.id === itemId);
	const previous = siblings[index - 1];
	if (!previous || previous.nodeType !== "category") return;

	moveNode(itemId, previous.id, previous.children.length);
	expandedNodes.add(previous.id);
	focusNode(itemId);
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

function handleDeleteNode(node: Partial<ContentNode>) {
	if (!node._id) return;

	const visible = getVisibleNodes(treeRoots);
	const index = visible.findIndex((n) => n.id === String(node._id));
	const nextFocus =
		visible.length > 1
			? (visible[index < visible.length - 1 ? index + 1 : Math.max(0, index - 1)]?.id ?? null)
			: (treeRoots[0]?.id ?? null);

	onDeleteNode?.(node);

	if (nextFocus) {
		tick().then(() => {
			focusNode(nextFocus);
			announce(`Deleted ${node.name}. Focus moved to next item.`);
		});
	} else {
		announce(`Deleted ${node.name}. No items remaining.`);
	}
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
		path: item.path,
	};
}

/** Elements inside a row that must keep working as plain clicks. */
const INTERACTIVE = ["button", "a[href]", "[data-no-drag]"];
</script>

<!-- Accessibility: live region for screen reader announcements -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
	{#key announcementId}{announcement}{/key}
</div>

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-2">
	<div class="relative flex-1 min-w-50">
		<FloatingInput
			bind:value={searchText}
			label="Search collections..."
			icon="mdi:magnify"
			aria-label="Search collections"
			inputClass="w-full h-12 pe-8 rounded shadow-sm"
		/>
		{#if searchText}
			<Button
				variant="surface"
				type="button"
				onclick={clearSearch}
				aria-label="Clear search"
				class="p-0! min-w-0 absolute inset-e-2 top-1/2 -translate-y-1/2 z-10"
			>
				<iconify-icon icon="mdi:close" width={16}></iconify-icon>
			</Button>
		{/if}
	</div>
	<div class="flex gap-2">
		<SystemTooltip title="Expand all categories">
			<Button
				variant="surface"
				type="button"
				onclick={expandAll}
				aria-label="Expand all categories"
				class="shadow-sm"
			>
				<iconify-icon icon="mdi:unfold-more-horizontal" width={24} aria-hidden="true"></iconify-icon>
				<span class="ms-1 uppercase text-xs font-bold">Expand All</span>
			</Button>
		</SystemTooltip>
		<SystemTooltip title="Collapse all categories">
			<Button
				variant="surface"
				type="button"
				onclick={collapseAll}
				aria-label="Collapse all categories"
				class="shadow-sm"
			>
				<iconify-icon icon="mdi:unfold-less-horizontal" width={24} aria-hidden="true"></iconify-icon>
				<span class="ms-1 uppercase text-xs font-bold">Collapse All</span>
			</Button>
		</SystemTooltip>
	</div>
</div>

<!-- Tree. role="tree" only once treeitems exist — an empty tree is not a valid
     ARIA tree, and a non-interactive role must not be focusable. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-2"
	class:is-dragging={dndState.isDragging}
	onkeydown={handleTreeKeyDown}
	role={treeRoots.length > 0 ? "tree" : undefined}
	tabindex={treeRoots.length > 0 ? 0 : undefined}
	aria-label="Collection hierarchy. Arrow keys navigate, Alt+arrows reorder, letters jump to items."
>
	{#if treeRoots.length === 0}
		<div class="text-center p-8 text-surface-500">
			<iconify-icon
				icon={searchText ? "mdi:magnify-close" : "mdi:folder-outline"}
				width="48"
				class="opacity-50 mb-2"
				aria-hidden="true"
			></iconify-icon>
			<p>
				{searchText ? `No results found for "${searchText}"` : "No categories or collections yet"}
			</p>
		</div>
	{:else}
		<div
			role="group"
			aria-label="Content Organization Tree"
		>
			<TreeDragPreview />
			{#each treeRoots as item (item.id)}
				{@render treeNode(item, 0)}
			{/each}
		</div>
	{/if}
</div>

{#snippet treeNode(item: TreeNode, level: number)}
	<div
		class="tree-item"
		class:hidden={!isNodeVisible(item, searchText)}
		data-item-id={item.id}
		data-node-type={item.nodeType}
		role="treeitem"
		aria-expanded={item.nodeType === "category" ? expandedNodes.has(item.id) : undefined}
		aria-selected="false"
	>
		<!-- The droppable wraps the ROW ONLY. sveltednd derives before/after from
		     this element's own midpoint, so it must never contain the subtree. -->
		<div
			class="tree-row"
			class:nest-target={dndState.isDragging && nestTargetId === item.id}
			class:line-before={lineFor(item.id) === "before"}
			class:line-after={lineFor(item.id) === "after"}
			class:drag-source={dndState.isDragging && dragSourceId === item.id}
			use:liftAndCarry={{
				container: "tree",
				dragData: { itemId: item.id },
				disabled: !!searchText,
				interactive: INTERACTIVE,
				callbacks: { onDragStart: () => handleDragStart(item), onDragEnd: endDrag },
			}}
			ondragstart={suppressNativeDragGhost}
			ondragover={(e: DragEvent) => handleRowDragOver(item, e)}
			use:droppable={{
				container: `node:${item.id}`,
				direction: "vertical",
				callbacks: {
					onDragLeave: () => handleRowDragLeave(item),
					onDrop: (s) => handleRowDrop(item, s),
					onDragEnd: endDrag,
				},
				attributes: { dragOverClass: "row-over" },
			}}
		>
			<TreeViewNode
				item={{ ...item, hasChildren: item.children.length > 0 }}
				isOpen={expandedNodes.has(item.id)}
				isSelectedCategory={item.nodeType === "category" && item.id === selectedCategoryId}
				toggle={() => toggleNode(item.id)}
				onEditCategory={() => onEditCategory(toPartialContentNode(item))}
				onDelete={() => handleDeleteNode(toPartialContentNode(item))}
				onDuplicate={() => onDuplicateNode?.(toPartialContentNode(item))}
				onSelectCategory={item.nodeType === "category" && onSelectCategory
					? () => onSelectCategory(item)
					: undefined}
				tabindex={rovingTabIndex === item.id ? 0 : -1}
			/>
		</div>

		{#if item.nodeType === "category" && expandedNodes.has(item.id) && item.children.length > 0}
			<div
				class="tree-children"
				style="margin-inline-start: {screen.isDesktop ? Math.min(level + 1, 6) * 0.75 : 0.4}rem"
				role="group"
				aria-label={`Contents of ${item.name}`}
			>
				{#each item.children as child (child.id)}
					{@render treeNode(child, level + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
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
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	.tree-item {
		position: relative;
	}

	.tree-row {
		position: relative;
		margin-bottom: 0.5rem;
	}

	/* sveltednd ships global .drop-before/.drop-after lines and, for "after",
	   moves them onto the next DOM sibling — which here is the children block.
	   Suppress them and draw the line ourselves from dndState instead. */
	.collection-builder-tree :global(.drop-before)::before,
	.collection-builder-tree :global(.drop-after)::after,
	.collection-builder-tree :global(.drop-left)::before,
	.collection-builder-tree :global(.drop-right)::after {
		display: none !important;
	}

	/* Insertion line. Drawn on the row itself so it sits exactly on the boundary
	   the drop will use — no placeholder element, no reflow, no layout shift.
	   `display: block` is explicit because the library stamps its own
	   `drop-before` class onto this very element, and the suppression rule above
	   would otherwise hide our line along with theirs. */
	.tree-row.line-before::before,
	.tree-row.line-after::after {
		content: '';
		display: block !important;
		position: absolute;
		inset-inline: 0;
		height: 2px;
		background: var(--color-primary-500);
		pointer-events: none;
		z-index: 2;
	}

	.tree-row.line-before::before {
		top: -3px;
	}

	.tree-row.line-after::after {
		bottom: -3px;
	}

	/* Nest target: "release here to put it inside". Warning/amber on purpose
	   — a category's own border is tertiary blue, so a blue highlight read as
	   ordinary chrome rather than an active drop target. Static, no animation. */
	.tree-row.nest-target {
		border-radius: 0.375rem;
		outline: 2px solid var(--color-warning-500);
		outline-offset: -1px;
	}

	/* Tint the row so the state reads at a glance. The theme exposes colours as
	   oklch(), not RGB triplets, so alpha needs color-mix — a
	   `rgb(var(--token) / 0.3)` here is invalid and silently paints nothing. */
	.tree-row.nest-target :global(> *) {
		background: color-mix(in oklch, var(--color-warning-500) 30%, transparent) !important;
		border-color: var(--color-warning-500) !important;
	}

	.tree-children {
		position: relative;
		padding-inline-start: 0.5rem;
		border-inline-start: 2px solid color-mix(in oklch, var(--color-surface-300) 60%, transparent);
	}

	/* Dragged source row: dimmed only. No transform, no ghost, no transition.
	   Driven by `drag-source` (applied a frame late) rather than the library's
	   `.dragging`, which lands during dragstart and would be baked into Chrome's
	   drag-image snapshot — that is what made the cursor carry an empty outline. */
	.collection-builder-tree :global(.dragging) {
		opacity: 1;
	}

	.tree-row.drag-source {
		opacity: 0.4;
	}

	.collection-builder-tree.is-dragging {
		user-select: none;
	}
</style>

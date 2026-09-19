<!--
@file src/components/ui/tree-view.svelte
@component
**SveltyCMS TreeView — WCAG 3.0 Ready**

Recursive tree navigation with multi-density support, keyboard navigation,
drag-and-drop reordering, badges with counts, per-node action buttons,
search filtering, and RTL support.

### Props
- `items` / `nodes` (TreeItem[]): Array of tree items (supports both prop names for compat).
- `selectedId` (string | null): The ID of the currently selected node.
- `search` (string): Search filter string — auto-expands matching nodes.
- `expandedIds` (Set<string>): Bindable set of expanded node IDs.
- `allowDragDrop` (boolean): Enable HTML5 drag-and-drop reordering (before / after / **inside**).
- `compact` (boolean): Shorthand for compact density.
- `density` ('compact' | 'comfortable' | 'spacious'): Fine-grained density control.
- `iconColorClass` (string): Tailwind color class for node icons (default: 'text-surface-400').
- `showBadges` (boolean): Show count badges on nodes (default: false).
- `ariaLabel` (string): Accessible label for the tree (default: 'Navigation tree').
- `dir` ('ltr' | 'rtl' | 'auto'): Text direction for RTL language support.
- `variant` ('default' | 'media' | 'sidebar'): Media gallery folder styling, or collections sidebar (nested panel + left-aligned rows).
- `collapsed` (boolean): Sidebar rail mode — parent rows stack icon above label like Media Gallery.
- `externalDrop` (object): Optional @thisux/sveltednd drop targets (e.g. media files → folders).
- `class` (string): Additional CSS classes.

### TreeItem Shape
```
{
    id: string;          // Unique node ID (required)
    label?: string;      // Display text (falls back to `name` for system compat)
    name?: string;       // Alias for label (system tree-view compat)
    icon?: string;       // Iconify icon name
    children?: TreeItem[]; // Nested child nodes
    disabled?: boolean;  // Disables interaction
    isLoading?: boolean; // Shows spinner instead of chevron
    badge?: {            // Badge with count display
        count?: number;
        visible?: boolean;
        color?: string;
        icon?: string;
        title?: string;
    };
    actions?: Array<{    // Floating action buttons (hover to reveal)
        icon: string;
        label: string;
        colorClass?: string;
        onClick: () => void;
    }>;
    onClick?: () => void; // Per-node click handler (takes priority over onselect)
    metadata?: any;       // Arbitrary metadata
}
```

### Callbacks
- `onselect` (function): Called when a node is selected (receives TreeItem).
- `onreorder` (function): Called after drag-and-drop reorder (draggedId, targetId, position).
- `onhover` (function): Called when a node is hovered (receives TreeItem).
- `onexpand` (function): Called when a node is expanded (receives TreeItem).

### Accessibility Features (WCAG 3.0)
- `role="tree"` with `aria-orientation="vertical"` on the root
- `role="group"` with `aria-labelledby` for child containers
- Arrow key navigation: Up/Down/Left/Right/Home/End
- Enter/Space to select, Left to collapse, Right to expand
- Tab index management via roving tabindex pattern
- 24px minimum touch target on all densities
- Respects `prefers-reduced-motion` for all transitions
- Screen reader live region for search result count

### Features:
- backward compatible with system tree-view (supports `nodes`, `name`, `onHover`, `onExpand`)
- multi-density: compact (16px), comfortable (20px), spacious (24px) icon sizes
- count badges with configurable visibility, color, and icon
- per-node action buttons revealed on hover
- loading spinners per node
- drag-and-drop with before/after/inside position indicators
- optional external drop (sveltednd) for media → folder moves
- search with auto-expand and keyboard accessibility
- vertical guide lines matching node depth
- expand/collapse fly transitions with reduced-motion awareness
- RTL-aware chevron rotation
- full Svelte 5 runes: $props, $bindable, $derived, $state, SvelteSet
-->

	<script module lang="ts">
		import Badge from '@components/ui/badge.svelte';
		import Button from '@components/ui/button.svelte';
	    export interface TreeItem {
        id: string;
        label?: string;
        name?: string;          // Backward compat with system tree-view
        icon?: string;
        iconExpanded?: string;
        iconColorClass?: string;
        labelClass?: string;
        children?: TreeItem[];
        disabled?: boolean;
        isLoading?: boolean;
        isExpanded?: boolean;   // Initial expanded state (synced to expandedIds)
        /** Semantic kind — categories/folders accept "inside" drops; collections/files do not. */
        type?: 'category' | 'collection' | 'folder' | string;
        nodeType?: 'category' | 'collection' | 'folder' | string;
        badge?: {
            count?: number;
            visible?: boolean;
            color?: string;
            icon?: string;
            title?: string;
        };
        actions?: Array<{
            icon: string;
            label: string;
            colorClass?: string;
            onClick: (...args: any[]) => void;
        }>;
        onClick?: () => void;
        metadata?: any;
        href?: string;
        path?: string;
        preload?: 'hover' | 'viewport' | 'predict' | 'smart';
        [key: string]: any;
    }

	/** External drop (e.g. media gallery items → folder nodes) via @thisux/sveltednd. */
	export interface TreeExternalDrop {
		enabled: boolean;
		/** CSS classes when target is valid */
		okClass?: string;
		/** CSS classes when drop would be a no-op (already in folder) */
		sameClass?: string;
		isSameTarget?: (nodeId: string) => boolean;
		onDrop: (nodeId: string, state: unknown) => void | Promise<void>;
		onDragEnter?: (nodeId: string) => void;
		onDragLeave?: (nodeId: string) => void;
	}
</script>

<script lang="ts">
    import { cn } from '@utils/cn';
    import { SvelteSet } from 'svelte/reactivity';
    import { fly, scale } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { droppable } from '@thisux/sveltednd';
    import type { DragDropState } from '@thisux/sveltednd';

    interface Props {
        items?: TreeItem[];
        nodes?: TreeItem[];       // Backward compat alias
        selectedId?: string | null;
        search?: string;
        expandedIds?: Set<string>;
        allowDragDrop?: boolean;
        compact?: boolean;
        density?: 'compact' | 'comfortable' | 'spacious';
        iconColorClass?: string;
        showBadges?: boolean;
        ariaLabel?: string;
        dir?: 'ltr' | 'rtl' | 'auto';
        variant?: 'default' | 'media' | 'sidebar';
        /** Collapsed left-rail: stack icon above label (matches Media Gallery rail). */
        collapsed?: boolean;
        /** Media-file (or other) external drops onto folder/category rows */
        externalDrop?: TreeExternalDrop | null;
        class?: string;
        // Callbacks
        onselect?: (item: TreeItem) => void;
        onSelect?: (item: TreeItem) => void;   // Backward compat
        onreorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
        onReorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
        onhover?: (item: TreeItem) => void;
        onHover?: (item: TreeItem) => void;    // Backward compat
        onexpand?: (item: TreeItem) => void;
        onExpand?: (item: TreeItem) => void;   // Backward compat
    }

    let {
        items: itemsProp,
        nodes: nodesProp,
        selectedId = null,
        search = '',
        expandedIds = $bindable(new SvelteSet()),
        allowDragDrop = false,
        compact = false,
        density = 'comfortable',
        iconColorClass = 'text-surface-400',
        showBadges = false,
        ariaLabel = 'Navigation tree',
        dir = 'ltr',
        variant = 'default',
        collapsed = false,
        externalDrop = null,
        class: className,
        onselect,
        onSelect,
        onreorder,
        onReorder,
        onhover,
        onHover,
        onexpand,
        onExpand
    }: Props = $props();

    // Normalize callbacks (support both naming conventions)
    const handleSelect = $derived(onselect || onSelect);
    const handleReorder = $derived(onreorder || onReorder);
    const handleHover = $derived(onhover || onHover);
    const handleExpand = $derived(onexpand || onExpand);

    // Normalize items: support both `items` and `nodes` props
    const rawItems: TreeItem[] = $derived((itemsProp ?? nodesProp ?? []) as TreeItem[]);

    // Seed expansion from node data. Strictly once per node id: `rawItems` is
    // rebuilt on every upstream change, so re-seeding would keep re-opening a
    // node the user has just collapsed.
    const seededExpanded = new Set<string>();
    $effect(() => {
        if (variant === 'media') return;
        const syncExpanded = (nodes: TreeItem[]) => {
            nodes.forEach((node) => {
                if (!node.id || seededExpanded.has(node.id)) {
                    if (node.children) syncExpanded(node.children);
                    return;
                }
                seededExpanded.add(node.id);
                if (node.isExpanded && !expandedIds.has(node.id)) {
                    expandedIds.add(node.id);
                }
                if (node.children) syncExpanded(node.children);
            });
        };
        syncExpanded(rawItems);
    });

    // --- DENSITY SYSTEM ---
    const computedDensity = $derived(compact ? 'compact' : density);

    const densityTokens = $derived.by(() => {
        switch (computedDensity) {
            case 'compact':
                return {
                    padding: 'py-1 gap-1.5',
                    font: 'text-xs',
                    chevron: '16',
                    icon: '16',
                    dummy: 'size-4',
                    indentMul: 0.75,
                    indentBase: 0.5,
                    guidelineMul: 0.75,
                    guidelineBase: 1.0,
                    touch: 'min-h-[24px]'
                };
            case 'spacious':
                return {
                    padding: 'py-2.5 gap-2.5',
                    font: 'text-base',
                    chevron: '20',
                    icon: '22',
                    dummy: 'size-5',
                    indentMul: 1.75,
                    indentBase: 0.75,
                    guidelineMul: 1.75,
                    guidelineBase: 1.45,
                    touch: 'min-h-[32px]'
                };
            default: // comfortable
                return {
                    padding: 'py-1.5 gap-2',
                    font: 'text-sm',
                    chevron: '18',
                    icon: '20',
                    dummy: 'size-[18px]',
                    indentMul: 1.25,
                    indentBase: 0.5,
                    guidelineMul: 1.25,
                    guidelineBase: 1.1,
                    touch: 'min-h-[28px]'
                };
        }
    });

    function indentLeft(depth: number) {
        return depth * densityTokens.indentMul + densityTokens.indentBase;
    }

    function guidelineLeft(depth: number) {
        return depth * densityTokens.guidelineMul + densityTokens.guidelineBase;
    }

    // --- MOTION ---
    let prefersReducedMotion = $state(false);
    const transitionDuration = $derived(prefersReducedMotion ? 0 : 200);

    onMount(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        prefersReducedMotion = mq.matches;
        const handler = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches; };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    });

    // --- STATE ---
    let focusedNodeId = $state<string | null>(null);
    let draggedNode = $state<TreeItem | null>(null);
    let dragOverNode = $state<TreeItem | null>(null);
    let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);

    // --- DERIVED: Filtered + Mapped Items ---
    const filteredItems = $derived.by(() => {
        const term = search.toLowerCase().trim();
        if (!term) return rawItems;

        const filter = (nodes: TreeItem[]): TreeItem[] => {
            return nodes
                .map(node => {
                    const nodeLabel = node.label || node.name || '';
                    const matches = nodeLabel.toLowerCase().includes(term);
                    if (matches) return node;
                    if (node.children) {
                        const children = filter(node.children);
                        if (children.length > 0) {
                            expandedIds.add(node.id); // Auto-expand parent of matches
                            return { ...node, children };
                        }
                    }
                    return null;
                })
                .filter((n): n is TreeItem => n !== null);
        };
        return filter(rawItems);
    });

    // Node lookup map for parent/depth resolution
    const nodeMap = $derived.by(() => {
        const map = new Map<string, { item: TreeItem; parentId?: string; depth: number }>();
        const collect = (nodes: TreeItem[], depth = 0, parentId: string | undefined = undefined) => {
            nodes.forEach(node => {
                map.set(node.id, { item: node, parentId, depth });
                if (node.children) collect(node.children, depth + 1, node.id);
            });
        };
        collect(rawItems);
        return map;
    });

    // --- METHODS ---
    function getNodeLabel(node: TreeItem): string {
        return node.label || node.name || node.id;
    }

    function setNodeExpanded(id: string, open: boolean): void {
        const next = new SvelteSet(expandedIds);
        if (open) {
            next.add(id);
        } else {
            next.delete(id);
        }
        expandedIds = next;
    }

    function toggleNode(node: TreeItem) {
        if (node.disabled) return;

        const hasKids = !!(node.children && node.children.length > 0);
        const canExpand = hasKids || canNestInto(node);
        const isMediaRoot = variant === 'media' && node.id === 'root';

        if (isMediaRoot) {
            if (selectedId !== 'root') {
                setNodeExpanded('root', true);
                node.onClick?.();
            } else if (hasKids) {
                setNodeExpanded(node.id, !expandedIds.has(node.id));
            }
            focusedNodeId = node.id;
            return;
        }

        if (canExpand) {
            const opening = !expandedIds.has(node.id);
            setNodeExpanded(node.id, opening);
            if (opening) handleExpand?.(node);
        }

        if (node.onClick) {
            node.onClick();
        } else {
            handleSelect?.(node);
        }
        focusedNodeId = node.id;
    }

    function getVisibleNodesFlat(): string[] {
        const visible: string[] = [];
        const traverse = (nodes: TreeItem[]) => {
            nodes.forEach(n => {
                visible.push(n.id);
                if (n.children && expandedIds.has(n.id)) traverse(n.children);
            });
        };
        traverse(filteredItems);
        return visible;
    }

    function handleKeyDown(event: KeyboardEvent, node: TreeItem) {
        const v = getVisibleNodesFlat();
        const idx = v.indexOf(node.id);

        switch (event.key) {
            case 'Enter':
            case ' ':
                event.preventDefault();
                toggleNode(node);
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (idx < v.length - 1) focusedNodeId = v[idx + 1];
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (idx > 0) focusedNodeId = v[idx - 1];
                break;
            case 'ArrowRight':
                event.preventDefault();
                if (canNestInto(node) && !expandedIds.has(node.id)) {
                    setNodeExpanded(node.id, true);
                    handleExpand?.(node);
                } else if (node.children && idx < v.length - 1) {
                    focusedNodeId = v[idx + 1];
                }
                break;
            case 'ArrowLeft':
                event.preventDefault();
                if (node.children && expandedIds.has(node.id)) {
                    setNodeExpanded(node.id, false);
                } else {
                    const parentId = nodeMap.get(node.id)?.parentId;
                    if (parentId) focusedNodeId = parentId;
                }
                break;
            case 'Home':
                event.preventDefault();
                if (v.length) focusedNodeId = v[0];
                break;
            case 'End':
                event.preventDefault();
                if (v.length) focusedNodeId = v[v.length - 1];
                break;
        }
    }

    // --- DRAG & DROP ---
    function handleDragStart(e: DragEvent, node: TreeItem) {
        if (!allowDragDrop || node.id === 'root') return;
        draggedNode = node;
        e.dataTransfer?.setData('text/plain', node.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    }

    /** Categories / folders accept "inside" reparent; collections/files only reorder as siblings. */
    function canNestInto(node: TreeItem): boolean {
        if (variant === 'media') return true; // all virtual-folder nodes are nestable (incl. root)
        const kind = (node.type || node.nodeType || '').toString().toLowerCase();
        if (kind === 'collection' || kind === 'file') return false;
        if (kind === 'category' || kind === 'folder') return true;
        // Empty container nodes often omit type but still have children slots
        return Array.isArray(node.children);
    }

    function handleDragOver(e: DragEvent, node: TreeItem) {
        if (!allowDragDrop || !draggedNode || draggedNode.id === node.id) return;

        // Prevent dragging into own descendants
        let currentId: string | undefined = node.id;
        while (currentId) {
            if (currentId === draggedNode.id) return;
            currentId = nodeMap.get(currentId)?.parentId;
        }

        e.preventDefault();
        dragOverNode = node;

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const y = e.clientY - rect.top;
        const h = rect.height;

        if (y < h * 0.25) {
            dropPosition = 'before';
        } else if (y > h * 0.75) {
            dropPosition = 'after';
        } else if (canNestInto(node)) {
            dropPosition = 'inside';
            // Spring-open collapsed folders/categories so nested targets appear
            if (!expandedIds.has(node.id) && (node.children?.length || canNestInto(node))) {
                setNodeExpanded(node.id, true);
                handleExpand?.(node);
            }
        } else {
            // Collections: middle of row = after (sibling)
            dropPosition = 'after';
        }
    }

    function externalDroppableOptions(nodeId: string) {
        const cfg = externalDrop;
        if (!cfg?.enabled) {
            return { container: nodeId, disabled: true };
        }
        const same = cfg.isSameTarget?.(nodeId) ?? false;
        return {
            container: nodeId,
            disabled: !cfg.enabled,
            attributes: {
                dragOverClass: same ? (cfg.sameClass ?? '') : (cfg.okClass ?? ''),
            },
            callbacks: {
                onDrop: (state: DragDropState<unknown>) => cfg.onDrop(nodeId, state),
                onDragEnter: () => cfg.onDragEnter?.(nodeId),
                onDragLeave: () => cfg.onDragLeave?.(nodeId),
            },
        };
    }

    function handleDragLeave() {
        dragOverNode = null;
        dropPosition = null;
    }

    function handleDrop(e: DragEvent, node: TreeItem) {
        if (!allowDragDrop || !draggedNode || !dropPosition) return;
        e.preventDefault();
        handleReorder?.(draggedNode.id, node.id, dropPosition);
        draggedNode = null;
        dragOverNode = null;
        dropPosition = null;
    }

    function handleDragEnd() {
        draggedNode = null;
        dragOverNode = null;
        dropPosition = null;
    }

    // Auto-focus the focused node
    $effect(() => {
        if (focusedNodeId) {
            const el = document.getElementById(`treenode-${focusedNodeId}`);
            el?.focus({ preventScroll: true });
        }
    });

	    // --- BADGE HELPER ---
	    function shouldShowBadge(node: TreeItem): boolean {
	        if (!showBadges) return false;
	        if (!node.badge) return false;
	        if (node.badge.visible === false) return false;
	        if (node.badge.count !== undefined && node.badge.count <= 0) return false;
	        // Only categories that actually contain collections show badges
	        if (node.type !== 'category') return false;
	        if (!node.children || node.children.length === 0) return false;
	        return true;
	    }
</script>

{#snippet treeNode(node: TreeItem, depth: number)}
    {@const hasChildren = !!(node.children && node.children.length > 0)}
    {@const expanded = expandedIds.has(node.id)}
    {@const isSelected = selectedId === node.id}
    {@const isHighlighted = isSelected || (dragOverNode?.id === node.id && dropPosition === 'inside')}
    {@const isFocused = focusedNodeId === node.id}
    {@const nodeLabel = getNodeLabel(node)}
    {@const showBadge = shouldShowBadge(node)}
    {@const isMedia = variant === 'media'}
    {@const isSidebar = variant === 'sidebar'}
    {@const isNested = depth > 0}
    {@const isSidebarRail = isSidebar && collapsed && !isNested}
    {@const isRoot = depth === 0 && node.id === 'root'}
    {@const showChevron = hasChildren || canNestInto(node)}
    {@const mediaIconTone = 'text-surface-300 dark:text-surface-400'}
    {@const mediaRootText = 'text-surface-200 dark:text-surface-400'}
    {@const mediaFolderText = 'text-surface-400 dark:text-surface-400'}
    {@const mediaSelectedText = 'text-warning-400 dark:text-warning-400'}
    {@const mediaGuideLine = 'bg-surface-600/50 dark:bg-white/10'}

    <div class="flex flex-col" data-item-id={node.id}>
    <!--
        Row wrapper. Everything that is positioned relative to a *row* (hover
        actions, drop indicators, the sveltednd drop highlight) lives here and
        NOT on the outer node div — the outer div also contains the expanded
        child subtree, so `top-1/2` there centres on the whole subtree and the
        overlay escapes the row. `isolate` gives the row its own stacking
        context so inner z-indexes can never paint over sticky sidebar chrome.
    -->
    <div
        class={cn(
            'group/item relative isolate flex w-full min-w-0 items-center',
            isSidebar && 'rounded-[var(--admin-radius-button,0.25rem)] outline-none focus:outline-none focus-visible:outline-none',
        )}
        data-node-type={node.type || node.nodeType || (isMedia ? 'folder' : undefined)}
        data-media-drop-target={externalDrop?.enabled ? node.id : undefined}
        use:droppable={externalDroppableOptions(node.id)}
        role="treeitem"
        id={`treenode-${node.id}`}
        tabindex={isFocused || (selectedId === node.id) || (focusedNodeId === null && depth === 0) ? 0 : -1}
        aria-expanded={showChevron ? expanded : undefined}
        aria-selected={isSelected}
        aria-level={depth + 1}
        aria-setsize={-1}
        onclick={(e) => {
          // Clicking a nested treeitem bubbles up through ancestor treeitems —
          // without stopping propagation the root node's handler re-runs after
          // the child's and can navigate/expand the wrong node.
          e.stopPropagation();
          toggleNode(node);
        }}
        onkeydown={(e: KeyboardEvent) => handleKeyDown(e, node)}
        onmouseenter={() => handleHover?.(node)}
        draggable={allowDragDrop && node.id !== 'root'}
        ondragstart={(e: DragEvent) => handleDragStart(e, node)}
        ondragover={(e: DragEvent) => handleDragOver(e, node)}
        ondragleave={handleDragLeave}
        ondrop={(e: DragEvent) => handleDrop(e, node)}
        ondragend={handleDragEnd}
    >
        <!-- Drag drop indicator: before -->
        {#if dragOverNode?.id === node.id && dropPosition === 'before'}
            <div class="absolute -top-0.5 inset-s-0 inset-e-0 h-0.5 bg-tertiary-500 dark:bg-primary-500 z-10 rounded-full" transition:scale={{ duration: transitionDuration }}></div>
        {/if}

        <svelte:element
            this={node.href || node.path ? 'a' : 'div'}
            href={node.href || node.path}
            data-preload={node.preload}
            data-sveltekit-preload-data={node.href || node.path ? 'hover' : undefined}
            class={cn(
                'flex w-full group group/item focus:outline-none justify-start text-start cursor-pointer select-none no-underline text-inherit',
                isMedia
                    ? cn(
                        'rounded-none border-0 bg-transparent px-0 shadow-none transition-colors',
                        isRoot
                            ? cn(
                                'items-center gap-2 py-2.5 text-[15px] font-medium leading-none',
                                isSelected && mediaSelectedText,
                            )
                            : cn(
                                'items-center gap-2 py-1.5 text-sm leading-none',
                                'min-h-7.5',
                                isSelected ? cn('font-medium', mediaSelectedText) : 'font-normal',
                            ),
                        isFocused && 'ring-1 ring-inset ring-primary-500/40',
                    )
                    : isSidebar
                    ? cn(
                        // Full: horizontal Media Gallery chip. Rail: stacked icon+label like Media.
                        'box-border border-0 font-semibold tracking-wide leading-snug transition-colors shadow-none',
                        'text-surface-900 dark:text-white',
                        isSidebarRail
                            ? 'flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px]'
                            : 'items-center gap-1.5 px-3 py-2 text-[11px]',
                        isNested
                            ? 'bg-transparent hover:bg-black/5 dark:hover:bg-white/5'
                            : 'bg-surface-200/80 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-800',
                    )
                    : cn(
                        'items-center transition-colors border border-transparent px-2 box-border',
                        densityTokens.padding,
                        densityTokens.touch,
                        isSelected
                            ? 'bg-primary-500/10 border-primary-500/30 text-primary-600 dark:text-primary-400'
                            : 'hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-900 dark:text-surface-100',
                        isFocused && 'ring-2 ring-inset ring-primary-500/50',
                    ),
                draggedNode?.id === node.id && 'opacity-40 grayscale',
                !isSidebar && dragOverNode?.id === node.id && dropPosition === 'inside' && 'bg-tertiary-500/20! dark:bg-primary-500/20! border-tertiary-500! dark:border-primary-500!',
                node.disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={isMedia
                ? (!isRoot
                    ? `padding-inline-start: ${1.75 + Math.max(0, depth - 1) * 1.25}rem`
                    : undefined)
                : isSidebar
                    ? 'border-radius: var(--admin-radius-button, 0.25rem)'
                    : `border-radius: var(--admin-radius-input, 0.25rem); padding-inline-start: ${indentLeft(depth)}rem`}
        >
            <!-- Expand/Collapse — leading chevron (default/media); sidebar puts it at the end -->
            {#if !isSidebar}
                {#if showChevron}
                    {#if node.isLoading}
                        <div class="flex items-center justify-center {densityTokens.dummy}">
                            <div class="h-3 w-3 animate-spin rounded-full border-2 border-surface-500 border-t-transparent" aria-label="Loading"></div>
                        </div>
                    {:else}
                        <iconify-icon
                            icon="mdi:chevron-right"
                            width={isMedia ? '16' : densityTokens.chevron}
                            class={cn(
                                'shrink-0 opacity-60 transition-transform',
                                prefersReducedMotion ? 'duration-0' : 'duration-200',
                                expanded && 'rotate-90',
                                dir === 'rtl' && 'rotate-180'
                            )}
                            aria-hidden="true"
                        ></iconify-icon>
                    {/if}
                {:else if !isMedia}
                    <!-- Spacer when no children, matching chevron width -->
                    <div class={densityTokens.dummy} aria-hidden="true"></div>
                {/if}
            {/if}

            <!-- Node Icon -->
            {#if node.icon || node.iconExpanded}
                <div class="relative flex shrink-0 items-center">
                    <iconify-icon
                        icon={(expanded && node.iconExpanded) ? node.iconExpanded : (node.icon || '')}
                        width={isMedia ? (isRoot ? '18' : '16') : isSidebar ? (isSidebarRail ? '18' : '16') : densityTokens.icon}
                        class={cn(
                            isMedia
                                ? isSelected
                                    ? mediaSelectedText
                                    : isRoot
                                        ? mediaIconTone
                                        : mediaFolderText
                                : isSidebar
                                    ? 'text-tertiary-500 dark:text-primary-500'
                                    : isHighlighted
                                        ? 'text-primary-600 dark:text-primary-500'
                                        : (node.iconColorClass || iconColorClass),
                        )}
                        aria-hidden="true"
                    ></iconify-icon>
                </div>
            {/if}

            <!-- Label -->
            <span
                title={nodeLabel}
                class={cn(
                'truncate transition-colors min-w-0',
                !isSidebarRail && 'flex-1',
                isMedia
                    ? cn(
                        isRoot ? 'text-[15px]' : 'text-sm',
                        isSelected ? mediaSelectedText : isRoot ? mediaRootText : mediaFolderText,
                        !isSelected && !isRoot && 'hover:text-surface-200 dark:hover:text-surface-400',
                    )
                    : isSidebar
                    ? cn(
                        isSidebarRail
                            ? 'max-w-full truncate text-center text-[10px] font-semibold tracking-wide text-surface-900 dark:text-white'
                            : 'text-[11px] font-semibold tracking-wide text-surface-900 dark:text-white',
                    )
                    : cn(
                        node.labelClass || densityTokens.font,
                        isHighlighted
                            ? 'font-semibold text-primary-600 dark:text-primary-500'
                            : (!node.labelClass && 'font-medium text-surface-900 dark:text-surface-100'),
                    ),
            )}>
                {nodeLabel}
            </span>

	            <!-- Count Badge — hide on rail (Media has none); keep in full sidebar -->
	            {#if showBadge && !isSidebarRail}
	                <Badge
	                    variant="surface"
	                    size="sm"
	                    class={cn(
	                        'shrink-0',
	                        !isSidebar && 'ms-auto',
	                        computedDensity !== 'compact' && 'group-hover/item:hidden',
	                    )}
	                    title={node.badge?.title}
	                >
	                    {#if node.badge?.icon}
	                        <iconify-icon icon={node.badge.icon} width="20" class="inline-block me-0.5" aria-hidden="true"></iconify-icon>
	                    {/if}
	                    {node.badge?.count ?? ''}
	                </Badge>
	            {/if}

            <!-- Sidebar: chevron when item has children (full + rail) -->
            {#if isSidebar && showChevron}
                {#if node.isLoading}
                    <div class="flex shrink-0 items-center justify-center {densityTokens.dummy}">
                        <div class="h-3 w-3 animate-spin rounded-full border-2 border-surface-500 border-t-transparent" aria-label="Loading"></div>
                    </div>
                {:else}
                    <iconify-icon
                        icon="mdi:chevron-down"
                        width={isSidebarRail ? '12' : densityTokens.chevron}
                        class={cn(
                            'shrink-0 opacity-60 transition-transform',
                            prefersReducedMotion ? 'duration-0' : 'duration-200',
                            !expanded && '-rotate-90',
                            dir === 'rtl' && expanded && 'rotate-180'
                        )}
                        aria-hidden="true"
                    ></iconify-icon>
                {/if}
            {/if}
        </svelte:element>

        <!-- Per-node Action Buttons -->
        {#if node.actions && node.actions.length > 0 && computedDensity !== 'compact'}
            <div class="absolute inset-e-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/item:opacity-100 focus-within:opacity-100"
                role="toolbar"
                aria-label="Item actions">
                {#each node.actions as act (act.label)}
                    <!-- size="sm" + explicit box: the default md button is 40px tall and
                         overhangs a 32px tree row on both edges. -->
                    <Button variant="ghost"
                        size="sm"
                        type="button"
                        onclick={(e: MouseEvent) => { e.stopPropagation(); act.onClick(node, e); }}
                        aria-label={act.label}
                        title={act.label}
                     class="h-6! w-6! p-0! min-w-0 rounded-full hover:bg-surface-200 dark:hover:bg-surface-700">
                        <iconify-icon icon={act.icon} width="16" class={act.colorClass || ''} aria-hidden="true"></iconify-icon>
                    </Button>
                {/each}
            </div>
        {/if}

        <!-- Drag drop indicator: after -->
        {#if dragOverNode?.id === node.id && dropPosition === 'after'}
            <div class="absolute -bottom-0.5 inset-s-0 inset-e-0 h-0.5 bg-tertiary-500 dark:bg-primary-500 z-10 rounded-full" transition:scale={{ duration: transitionDuration }}></div>
        {/if}
    </div>
    <!-- /row wrapper -->

        <!-- Children (recursive) -->
        {#if hasChildren}
            <!--
                sveltednd paints its "after" drop line on the droppable's
                nextElementSibling — which, for a row, is this container. Mark it so
                app.css can suppress that line (folder targets have no insert index).
                A separate attribute, NOT data-media-drop-target: that one identifies
                real drop zones and is queried by name in the media e2e specs.
            -->
            <div
                id={`node-${node.id}-children`}
                data-media-drop-line-guard={externalDrop?.enabled ? '' : undefined}
                class={cn(
                    'relative',
                    isSidebar
                        ? // Submenu panel only — no colored border; parents keep Media Gallery chip look
                          'ms-0 me-0 mt-0.5 mb-1 overflow-hidden border-0 bg-surface-500/10 dark:bg-surface-900/80'
                        : isMedia && isRoot
                            ? 'ms-0'
                            : computedDensity === 'compact'
                                ? 'ms-1'
                                : 'ms-4',
                )}
                style={isSidebar ? 'border-radius: var(--admin-radius-button, 0.25rem)' : undefined}
                role="group"
                aria-labelledby={`treenode-${node.id}`}
            >
                <!-- Vertical Guide Line — media root only, or default tree (not sidebar panel) -->
                {#if isMedia && isRoot && expanded}
                    <div
                        class={cn('pointer-events-none absolute bottom-0 inset-s-5.75 top-0 w-px', mediaGuideLine)}
                        aria-hidden="true"
                    ></div>
                {:else if !isMedia && !isSidebar}
                    <div
                        class="absolute inset-s-0 top-0 bottom-0 w-px bg-surface-200 dark:bg-surface-700"
                        style="margin-inline-start: {guidelineLeft(depth)}rem;"
                        aria-hidden="true"
                    ></div>
                {/if}

                {#if expanded}
                    <div
                        class={isSidebar ? 'divide-y divide-surface-500/15 dark:divide-surface-500/25' : undefined}
                        transition:fly|local={{ y: prefersReducedMotion ? 0 : -10, duration: transitionDuration }}
                    >
                        {#each node.children! as child (child.id)}
                            {@render treeNode(child, depth + 1)}
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/snippet}

<div
    class={cn(
        'flex flex-col w-full',
        variant === 'sidebar' ? 'gap-1' : 'gap-0.5',
        className,
    )}
    role="tree"
    aria-label={ariaLabel}
    aria-orientation="vertical"
    {dir}
>
    {#if filteredItems.length === 0}
        <div class="flex flex-col items-center justify-center gap-2 p-6 text-center text-surface-500 dark:text-surface-400">
            <iconify-icon icon="mdi:file-tree-outline" width="32" class="opacity-40" aria-hidden="true"></iconify-icon>
            <p class="text-sm">{search ? 'No matching items found.' : 'No items to display.'}</p>
        </div>
    {:else}
        {#each filteredItems as rootItem (rootItem.id)}
            {@render treeNode(rootItem, 0)}
        {/each}
    {/if}
</div>

<!-- Screen reader live region -->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {#if search}
        {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} found matching "{search}"
    {/if}
</div>

<style>
    /*
      Tree rows are full-bleed: the row button's box starts exactly at the
      inline-start edge of the sidebar's clipping scroll container, which has no
      inline-start padding. The global a11y focus ring in src/utilities.css uses
      `outline-offset: 2px`, so on these rows those 2px land outside the clip and
      the outline renders visibly cut off along the left edge.

      Draw the same indicator just *inside* the row instead. Only the offset is
      changed — colour, width and style still come from the global rule, so the
      focus affordance stays identical to the rest of the app.

      Why not a Tailwind utility: `focus-visible:-outline-offset-2` compiles fine,
      but Tailwind emits it into `@layer utilities` while the rule above is
      UNLAYERED. Unlayered declarations beat every layered one regardless of
      specificity, so the utility is generated and simply never applies. Verified
      in the browser: computed outline-offset stayed 2px with the utility on the
      element. Same reason the ring reset below is CSS — `cn` is plain clsx (no
      tailwind-merge), so a competing utility loses on stylesheet order anyway.
    */
    :global([role='treeitem'].outline-none:focus),
    :global([role='treeitem'].outline-none:focus-visible) {
        outline: none;
    }

    :global(.tree-node-btn:focus-visible) {
        outline-offset: -2px;
        /* The outline above is the focus indicator; suppress Button's own
           focus-visible ring so the two don't stack into a double border. */
        --tw-ring-shadow: 0 0 #0000;
        --tw-ring-offset-shadow: 0 0 #0000;
    }

    @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
        }
    }
</style>

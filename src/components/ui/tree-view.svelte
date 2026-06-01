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
- `allowDragDrop` (boolean): Enable drag-and-drop reordering.
- `compact` (boolean): Shorthand for compact density.
- `density` ('compact' | 'comfortable' | 'spacious'): Fine-grained density control.
- `iconColorClass` (string): Tailwind color class for node icons (default: 'text-surface-400').
- `showBadges` (boolean): Show count badges on nodes (default: false).
- `ariaLabel` (string): Accessible label for the tree (default: 'Navigation tree').
- `dir` ('ltr' | 'rtl' | 'auto'): Text direction for RTL language support.
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
- search with auto-expand and keyboard accessibility
- vertical guide lines matching node depth
- expand/collapse fly transitions with reduced-motion awareness
- RTL-aware chevron rotation
- full Svelte 5 runes: $props, $bindable, $derived, $state, SvelteSet
-->

<script module lang="ts">
    export interface TreeItem {
        id: string;
        label?: string;
        name?: string;          // Backward compat with system tree-view
        icon?: string;
        children?: TreeItem[];
        disabled?: boolean;
        isLoading?: boolean;
        isExpanded?: boolean;   // Initial expanded state (synced to expandedIds)
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
        [key: string]: any;
    }
</script>

<script lang="ts">
    import { cn } from '@utils/cn';
    import { SvelteSet } from 'svelte/reactivity';
    import { fly, scale } from 'svelte/transition';
    import { onMount } from 'svelte';

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

    // Sync initial isExpanded states into expandedIds set
    $effect(() => {
        const syncExpanded = (nodes: TreeItem[]) => {
            nodes.forEach(node => {
                if (node.isExpanded && node.id) expandedIds.add(node.id);
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
        const collect = (nodes: TreeItem[], depth = 0, parentId?: string) => {
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

    function toggleNode(node: TreeItem) {
        if (node.disabled) return;

        if (node.children && node.children.length > 0) {
            if (expandedIds.has(node.id)) {
                expandedIds.delete(node.id);
            } else {
                expandedIds.add(node.id);
                handleExpand?.(node);
            }
        }
        // Per-node onClick takes priority, otherwise bubble to onselect
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
                if (node.children && node.children.length > 0 && !expandedIds.has(node.id)) {
                    expandedIds.add(node.id);
                    handleExpand?.(node);
                } else if (node.children && idx < v.length - 1) {
                    focusedNodeId = v[idx + 1];
                }
                break;
            case 'ArrowLeft':
                event.preventDefault();
                if (node.children && expandedIds.has(node.id)) {
                    expandedIds.delete(node.id);
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

        if (y < h * 0.25) dropPosition = 'before';
        else if (y > h * 0.75) dropPosition = 'after';
        else dropPosition = 'inside';
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
        return true;
    }
</script>

{#snippet treeNode(node: TreeItem, depth: number)}
    {@const hasChildren = !!(node.children && node.children.length > 0)}
    {@const expanded = expandedIds.has(node.id)}
    {@const isSelected = selectedId === node.id}
    {@const isFocused = focusedNodeId === node.id}
    {@const nodeLabel = getNodeLabel(node)}
    {@const showBadge = shouldShowBadge(node)}

    <div class="flex flex-col group/item relative">
        <!-- Drag drop indicator: before -->
        {#if dragOverNode?.id === node.id && dropPosition === 'before'}
            <div class="absolute -top-0.5 left-0 right-0 h-0.5 bg-tertiary-500 dark:bg-primary-500 z-10 rounded-full" transition:scale={{ duration: transitionDuration }}></div>
        {/if}

        <button
            type="button"
            id={`treenode-${node.id}`}
            class={cn(
                'flex items-center rounded-lg transition-all cursor-pointer group focus:outline-none text-left border border-transparent px-2',
                densityTokens.padding,
                densityTokens.touch,
                isSelected
                    ? 'bg-tertiary-500 dark:bg-primary-500/10 border-tertiary-500 dark:border-primary-500/30 text-primary-700 dark:text-primary-300 shadow-xs'
                    : 'hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-900 dark:text-surface-100',
                isFocused && 'ring-2 ring-primary-500/50 shadow-sm',
                draggedNode?.id === node.id && 'opacity-40 grayscale',
                dragOverNode?.id === node.id && dropPosition === 'inside' && 'bg-tertiary-500 dark:bg-primary-500/20 border-tertiary-500 dark:border-primary-500',
                node.disabled && 'opacity-50 cursor-not-allowed'
            )}
            style="padding-left: {indentLeft(depth)}rem"
            onclick={() => toggleNode(node)}
            onkeydown={(e) => handleKeyDown(e, node)}
            onmouseenter={() => handleHover?.(node)}

            draggable={allowDragDrop && node.id !== 'root'}
            ondragstart={(e) => handleDragStart(e, node)}
            ondragover={(e) => handleDragOver(e, node)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, node)}
            ondragend={handleDragEnd}

            tabindex={isFocused || (selectedId === node.id) || (focusedNodeId === null && depth === 0) ? 0 : -1}
            aria-expanded={hasChildren ? expanded : undefined}
            aria-selected={isSelected}
            aria-level={depth + 1}
            aria-setsize={-1}
            role="treeitem"
        >
            <!-- Expand/Collapse Chevron or Loading Spinner -->
            {#if hasChildren}
                {#if node.isLoading}
                    <div class="flex items-center justify-center {densityTokens.dummy}">
                        <div class="h-3 w-3 animate-spin rounded-full border-2 border-surface-400 border-t-transparent" aria-label="Loading"></div>
                    </div>
                {:else}
                    <iconify-icon
                        icon="mdi:chevron-right"
                        width={densityTokens.chevron}
                        class={cn(
                            'transition-transform shrink-0 opacity-60',
                            prefersReducedMotion ? 'duration-0' : 'duration-200',
                            expanded && 'rotate-90',
                            dir === 'rtl' && 'rotate-180'
                        )}
                        aria-hidden="true"
                    ></iconify-icon>
                {/if}
            {:else}
                <!-- Spacer when no children, matching chevron width -->
                <div class={densityTokens.dummy} aria-hidden="true"></div>
            {/if}

            <!-- Node Icon -->
            {#if node.icon}
                <div class="relative flex shrink-0 items-center">
                    <iconify-icon
                        icon={node.icon}
                        width={densityTokens.icon}
                        class={cn(isSelected ? 'text-tertiary-500 dark:text-primary-500' : iconColorClass)}
                        aria-hidden="true"
                    ></iconify-icon>
                </div>
            {/if}

            <!-- Label -->
            <span class={cn(
                'truncate transition-colors',
                densityTokens.font,
                isSelected
                    ? 'font-bold text-tertiary-600 dark:text-primary-600 dark:text-primary-500'
                    : 'font-medium text-surface-900 dark:text-surface-100'
            )}>
                {nodeLabel}
            </span>

            <!-- Count Badge -->
            {#if showBadge}
                <span
                    class={cn(
                        'ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0',
                        node.badge?.color || 'bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-white'
                    )}
                    title={node.badge?.title}
                >
                    {#if node.badge?.icon}
                        <iconify-icon icon={node.badge.icon} width="10" class="inline-block mr-0.5" aria-hidden="true"></iconify-icon>
                    {/if}
                    {node.badge?.count ?? ''}
                </span>
            {/if}
        </button>

        <!-- Per-node Action Buttons (hover to reveal) -->
        {#if node.actions && node.actions.length > 0 && computedDensity !== 'compact'}
            <div class="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/item:opacity-100 focus-within:opacity-100">
                {#each node.actions as act}
                    <button
                        type="button"
                        class="btn-icon btn-icon-sm rounded-full hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
                        onclick={(e) => { e.stopPropagation(); act.onClick(); }}
                        aria-label={act.label}
                        title={act.label}
                    >
                        <iconify-icon icon={act.icon} width="16" class={act.colorClass || ''} aria-hidden="true"></iconify-icon>
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Drag drop indicator: after -->
        {#if dragOverNode?.id === node.id && dropPosition === 'after'}
            <div class="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-tertiary-500 dark:bg-primary-500 z-10 rounded-full" transition:scale={{ duration: transitionDuration }}></div>
        {/if}

        <!-- Children (recursive) -->
        {#if hasChildren}
            <div
                id={`node-${node.id}-children`}
                class="relative {computedDensity === 'compact' ? 'ms-1' : 'ms-4'}"
                role="group"
                aria-labelledby={`treenode-${node.id}`}
            >
                <!-- Vertical Guide Line -->
                <div
                    class="absolute left-0 top-0 w-px bg-linear-to-b from-surface-200 to-transparent dark:from-surface-700"
                    style="margin-left: {guidelineLeft(depth)}rem; height: 100%"
                    aria-hidden="true"
                ></div>

                {#if expanded}
                    <div transition:fly|local={{ y: prefersReducedMotion ? 0 : -10, duration: transitionDuration }}>
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
    class={cn('flex flex-col gap-0.5 w-full', className)}
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
    @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
        }
    }
</style>

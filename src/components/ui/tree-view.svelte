<!-- 
@file src/components/ui/tree-view.svelte
@component
**Superior Svelte 5 TreeView Primitive with multi-density support and keyboard navigation**

### Props
- `items` (TreeItem[]): Array of tree items to render.
- `selectedId` (string | null): The ID of the currently selected tree item.
- `search` (string): Search filter string to filter items.
- `expandedIds` (Set<string>): Set of expanded node IDs (bindable).
- `allowDragDrop` (boolean): Whether drag and drop reordering is enabled.
- `compact` (boolean): Backward-compatible shorthand for compact density.
- `density` ('compact' | 'comfortable' | 'spacious'): Density control for layout spacing.
- `dir` ('ltr' | 'rtl' | 'auto'): Directionality.
- `class` (string): Additional CSS classes.

### Callbacks
- `onselect` (function): Callback when a node is selected.
- `onreorder` (function): Callback when a node is reordered via drag-and-drop.
- `onhover` (function): Callback when a node is hovered.
- `onexpand` (function): Callback when a node is expanded.

### Features:
- multi-density styling support (compact, comfortable, spacious)
- standard keyboard navigation (arrows, space, enter, home, end)
- drag and drop reordering
- automatic filtering and auto-expanding during search
- vertical guide lines matching node depth
-->

<script module lang="ts">
    export interface TreeItem {
        id: string;
        label: string;
        icon?: string;
        children?: TreeItem[];
        disabled?: boolean;
        metadata?: any;
        [key: string]: any;
    }
</script>

<script lang="ts">
import { cn } from '@utils/cn';
import { SvelteSet } from 'svelte/reactivity';
import { scale } from 'svelte/transition';

interface Props {
    items: TreeItem[];
    selectedId?: string | null;
    search?: string;
    expandedIds?: Set<string>;
    allowDragDrop?: boolean;
    compact?: boolean;
    density?: 'compact' | 'comfortable' | 'spacious';
    dir?: 'ltr' | 'rtl' | 'auto';
    class?: string;
    // Callbacks
    onselect?: (item: TreeItem) => void;
    onreorder?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
    onhover?: (item: TreeItem) => void;
    onexpand?: (item: TreeItem) => void;
}

let { 
    items = [], 
    selectedId = null,
    search = '',
    expandedIds = $bindable(new SvelteSet()),
    allowDragDrop = false,
    compact = false,
    density = 'comfortable',
    dir = 'ltr',
    class: className,
    onselect,
    onreorder,
    onhover,
    onexpand
}: Props = $props();

// --- DENSITY SYSTEM DERIVATIONS ---
const computedDensity = $derived(compact ? 'compact' : density);

const paddingClass = $derived.by(() => {
    switch (computedDensity) {
        case 'compact': return 'py-1 gap-1.5';
        case 'spacious': return 'py-2.5 gap-2.5';
        case 'comfortable':
        default: return 'py-1.5 gap-2';
    }
});

const fontClass = $derived.by(() => {
    switch (computedDensity) {
        case 'compact': return 'text-xs';
        case 'spacious': return 'text-base';
        case 'comfortable':
        default: return 'text-sm';
    }
});

const chevronSize = $derived.by(() => {
    switch (computedDensity) {
        case 'compact': return '16';
        case 'spacious': return '20';
        case 'comfortable':
        default: return '18';
    }
});

const iconSize = $derived.by(() => {
    switch (computedDensity) {
        case 'compact': return '16';
        case 'spacious': return '22';
        case 'comfortable':
        default: return '20';
    }
});

const dummySizeClass = $derived.by(() => {
    switch (computedDensity) {
        case 'compact': return 'size-4';
        case 'spacious': return 'size-5';
        case 'comfortable':
        default: return 'size-[18px]';
    }
});

function getIndentLeft(depth: number) {
    switch (computedDensity) {
        case 'compact': return depth * 0.75 + 0.5;
        case 'spacious': return depth * 1.75 + 0.75;
        case 'comfortable':
        default: return depth * 1.25 + 0.5;
    }
}

function getGuideLineLeft(depth: number) {
    switch (computedDensity) {
        case 'compact': return depth * 0.75 + 0.5 + 0.5;
        case 'spacious': return depth * 1.75 + 0.75 + 0.7;
        case 'comfortable':
        default: return depth * 1.25 + 0.5 + 0.6;
    }
}

// --- STATE ---
let focusedNodeId = $state<string | null>(null);
let draggedNode = $state<TreeItem | null>(null);
let dragOverNode = $state<TreeItem | null>(null);
let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);

// --- DERIVED ---
const filteredItems = $derived.by(() => {
    const term = search.toLowerCase().trim();
    if (!term) return items;

    const filter = (nodes: TreeItem[]): TreeItem[] => {
        return nodes
            .map(node => {
                const matches = node.label.toLowerCase().includes(term);
                if (matches) return node;
                if (node.children) {
                    const children = filter(node.children);
                    if (children.length > 0) {
                        expandedIds.add(node.id); // Auto-expand
                        return { ...node, children };
                    }
                }
                return null;
            })
            .filter((n): n is TreeItem => n !== null);
    };
    return filter(items);
});

// Map for lookups
const nodeMap = $derived.by(() => {
    const map = new Map<string, { item: TreeItem, parentId?: string, depth: number }>();
    const collect = (nodes: TreeItem[], depth = 0, parentId?: string) => {
        nodes.forEach(node => {
            map.set(node.id, { item: node, parentId, depth });
            if (node.children) collect(node.children, depth + 1, node.id);
        });
    };
    collect(items);
    return map;
});

// --- METHODS ---
function toggleNode(item: TreeItem) {
    if (item.disabled) return;
    
    if (item.children && item.children.length > 0) {
        if (expandedIds.has(item.id)) {
            expandedIds.delete(item.id);
        } else {
            expandedIds.add(item.id);
            onexpand?.(item);
        }
    }
    onselect?.(item);
    focusedNodeId = item.id;
}

// Keyboard Navigation
function handleKeyDown(event: KeyboardEvent, item: TreeItem) {
    const v = getVisibleNodesFlat();
    const idx = v.indexOf(item.id);

    switch (event.key) {
        case 'Enter':
        case ' ':
            event.preventDefault();
            toggleNode(item);
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
            if (item.children && !expandedIds.has(item.id)) {
                expandedIds.add(item.id);
            } else if (item.children && idx < v.length - 1) {
                focusedNodeId = v[idx + 1];
            }
            break;
        case 'ArrowLeft':
            event.preventDefault();
            if (expandedIds.has(item.id)) {
                expandedIds.delete(item.id);
            } else {
                const parentId = nodeMap.get(item.id)?.parentId;
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

// Drag & Drop logic
function handleDragStart(e: DragEvent, node: TreeItem) {
    if (!allowDragDrop || node.id === 'root') return;
    draggedNode = node;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.id);
    }
}

function handleDragOver(e: DragEvent, node: TreeItem) {
    if (!allowDragDrop || !draggedNode || draggedNode.id === node.id) return;
    
    // Prevent dragging into its own descendants
    let currentId: string | undefined = node.id;
    while(currentId) {
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

function handleDrop(e: DragEvent, node: TreeItem) {
    if (!allowDragDrop || !draggedNode || !dropPosition) return;
    e.preventDefault();
    onreorder?.(draggedNode.id, node.id, dropPosition);
    draggedNode = null;
    dragOverNode = null;
    dropPosition = null;
}

// Auto-focus effect
$effect(() => {
    if (focusedNodeId) {
        const el = document.getElementById(`treenode-${focusedNodeId}`);
        el?.focus({ preventScroll: true });
    }
});
</script>

{#snippet treeNode(node: TreeItem, depth: number)}
    {@const hasChildren = !!node.children && node.children.length > 0}
    {@const expanded = expandedIds.has(node.id)}
    {@const isSelected = selectedId === node.id}
    {@const isFocused = focusedNodeId === node.id}

    <div class="flex flex-col group/item relative">
        <!-- Drag Indicators -->
        {#if dragOverNode?.id === node.id && dropPosition === 'before'}
            <div class="absolute -top-0.5 left-0 right-0 h-0.5 bg-primary-500 z-10 rounded-full" transition:scale></div>
        {/if}

        <button 
            type="button"
            id={`treenode-${node.id}`}
            class={cn(
                "flex items-center rounded-lg transition-all cursor-pointer group focus:outline-none text-left border border-transparent px-2",
                paddingClass,
                isSelected ? "bg-primary-500/10 border-primary-500/30 text-primary-700 dark:text-primary-300 shadow-xs" : 
                             "hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-900 dark:text-surface-100",
                isFocused && "ring-2 ring-primary-500/50 shadow-sm",
                draggedNode?.id === node.id && "opacity-40 grayscale",
                dragOverNode?.id === node.id && dropPosition === 'inside' && "bg-primary-500/20 border-primary-500",
                node.disabled && "opacity-50 cursor-not-allowed"
            )}
            style="padding-left: {getIndentLeft(depth)}rem"
            onclick={() => toggleNode(node)}
            onkeydown={(e) => handleKeyDown(e, node)}
            onmouseenter={() => onhover?.(node)}
            
            draggable={allowDragDrop && node.id !== 'root'}
            ondragstart={(e) => handleDragStart(e, node)}
            ondragover={(e) => handleDragOver(e, node)}
            ondragleave={() => { dragOverNode = null; dropPosition = null; }}
            ondrop={(e) => handleDrop(e, node)}
            ondragend={() => { draggedNode = null; dragOverNode = null; dropPosition = null; }}
            
            tabindex={isFocused || (selectedId === node.id) || (focusedNodeId === null && depth === 0) ? 0 : -1}
        >
            <!-- Chevron -->
            {#if hasChildren}
                <iconify-icon 
                    icon="mdi:chevron-right" 
                    width={chevronSize} 
                    class={cn("transition-transform duration-200 opacity-60", expanded && "rotate-90", dir === 'rtl' && "rotate-180")}
                ></iconify-icon>
            {:else}
                <div class={dummySizeClass}></div>
            {/if}

            <!-- Icon -->
            {#if node.icon}
                <iconify-icon icon={node.icon} width={iconSize} class={cn(isSelected ? "text-primary-500" : "text-surface-400")}></iconify-icon>
            {/if}

            <!-- Label -->
            <span class={cn(
                "truncate transition-colors",
                fontClass,
                isSelected ? "font-bold text-primary-600 dark:text-primary-400" : "font-medium text-surface-900 dark:text-surface-100"
            )}>
                {node.label}
            </span>

            <!-- Badge -->
            {#if node.badge}
                <span class="ml-auto px-1.5 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-white text-[10px] font-bold">
                    {node.badge}
                </span>
            {/if}
        </button>

        {#if dragOverNode?.id === node.id && dropPosition === 'after'}
            <div class="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-primary-500 z-10 rounded-full" transition:scale></div>
        {/if}

        <!-- Vertical Guide Line -->
        {#if hasChildren && expanded}
            <div class="relative flex flex-col pt-0.5">
                <div 
                    class="absolute left-0 top-0 w-px bg-linear-to-b from-surface-200 to-transparent dark:from-surface-700"
                    style="margin-left: {getGuideLineLeft(depth)}rem; height: 100%"
                ></div>
                {#each node.children! as child (child.id)}
                    {@render treeNode(child, depth + 1)}
                {/each}
            </div>
        {/if}
    </div>
{/snippet}

<div class={cn("flex flex-col gap-0.5 w-full", className)} role="tree" aria-orientation="vertical">
    {#each filteredItems as rootItem (rootItem.id)}
        {@render treeNode(rootItem, 0)}
    {/each}
</div>

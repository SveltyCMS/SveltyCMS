<!--
  @file src/components/system/TreeView.svelte
  @component **Enhanced TreeView - Svelte 5 Optimized**

  A recursive, accessible tree view component with drag-drop, keyboard navigation,
  and advanced features.

  @example
  <TreeView 
    {nodes} 
    selectedId={currentId}
    allowDragDrop
    onReorder={handleReorder}
  />

  ### Features
  - Full keyboard navigation (Arrow keys, Home, End, Enter, Space)
  - Drag and drop support with visual feedback
  - Search/filter functionality
  - RTL/LTR support
  - Lazy loading children
  - Badge indicators
  - Preloading on hover
  - Accessibility compliant (WCAG 2.1 AA)
  - Reduced motion support
  - Performance optimized with memoization
 -->

<script lang="ts" module>
	export interface TreeNode {
		ariaLabel?: string; // Optional aria label for the node
		badge?: {
			visible?: boolean; // Whether the badge is visible
			count?: number; // Count for the badge
			status?: 'draft' | 'publish' | 'archive' | 'schedule' | 'delete' | 'clone' | 'test'; // Status for the badge
			color?: string; // Color for the badge
		};
		children?: TreeNode[]; // Optional children nodes
		depth?: number; // Depth of the node
		icon?: string; // Optional icon for the node
		id: string; // Unique identifier for the node
		isCollection?: boolean; // Whether the node is a collection
		isExpanded?: boolean; // Whether the node is expanded
		isLoading?: boolean; // Whether the node is loading
		name: string; // Name of the node
		nodeType?: string; // Type of the node
		onClick?: (node: TreeNode) => void;
		order?: number; // Order of the node
		path?: string; // Path of the node
	}
</script>

<script lang="ts">
	type _any = any;

	import { logger } from '@utils/logger';
	import TreeViewComponent from './TreeView.svelte';

	const TreeView = TreeViewComponent;

	import { onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { fly, scale } from 'svelte/transition';
	import { preloadData } from '$app/navigation';

	interface TreeViewProps {
		allowDragDrop?: boolean;
		ariaLabel?: string;
		compact?: boolean;
		dir?: 'ltr' | 'rtl' | 'auto';
		iconColorClass?: string;
		k?: _any;
		nodes: TreeNode[];
		onExpand?: ((node: TreeNode) => void) | null;
		onHover?: ((node: TreeNode) => void) | null;
		onReorder?: ((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void) | null;
		search?: string;
		selectedId?: string | null;
		showBadges?: boolean;
	}

	// Destructure props with clearer names and defaults
	const {
		k = undefined,
		nodes: initialNodes,
		selectedId = null,
		ariaLabel = 'Navigation tree',
		dir = 'ltr',
		search = '',
		compact = false,
		iconColorClass = 'text-error-500',
		showBadges = false,
		allowDragDrop = false,
		onReorder = null,
		onExpand = null,
		onHover = null
	}: TreeViewProps = $props();

	// State
	let focusedNodeId = $state<string | null>(null);
	let expandedNodeIds = new SvelteSet<string>();
	let draggedNode = $state<TreeNode | null>(null);
	let dragOverNode = $state<TreeNode | null>(null);
	let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);
	let prefersReducedMotion = $state(false);

	// Helper: check expansion
	function isNodeExpanded(nodeId: string): boolean {
		return expandedNodeIds.has(nodeId);
	}

	// Map nodes with derived expansion state
	function mapNodesWithDerivedState(nodesToMap: TreeNode[]): TreeNode[] {
		return nodesToMap.map((node) => ({
			...node,
			isExpanded: isNodeExpanded(node.id),
			children: node.children ? mapNodesWithDerivedState(node.children) : undefined
		}));
	}

	const processedNodes = $derived(mapNodesWithDerivedState(initialNodes));

	// Filter nodes based on search
	const filteredNodes = $derived.by(() => {
		const searchTermLower = (search || '').toLowerCase().trim();
		if (!searchTermLower) { return processedNodes; }

		const filter = (nodesToFilter: TreeNode[]): TreeNode[] => {
			return nodesToFilter
				.map((node) => {
					const nameMatch = node.name.toLowerCase().includes(searchTermLower);
					if (nameMatch) { return node; }

					if (node.children) {
						const children = filter(node.children);
						if (children.length > 0) {
							return { ...node, children, isExpanded: true }; // Auto-expand matches
						}
					}
					return null;
				})
				.filter((n): n is TreeNode => n !== null);
		};
		return filter(processedNodes);
	});

	// Node map for lookups
	const nodeMap = $derived.by(() => {
		const map = new SvelteMap<string, TreeNode & { depth: number; parentId?: string }>();

		function collect(node: TreeNode, depth = 0, parentId?: string) {
			map.set(node.id, { ...node, depth, parentId });
			if (node.children) {
				node.children.forEach((c) => collect(c, depth + 1, node.id));
			}
		}

		initialNodes.forEach((n: TreeNode) => collect(n));
		return map;
	});

	// Toggle expansion
	function toggleNode(node: TreeNode) {
		logger.debug('[TreeView] toggleNode:', node.name);

		// Toggle expansion if node has children
		if (node.children) {
			if (expandedNodeIds.has(node.id)) {
				expandedNodeIds.delete(node.id);
			} else {
				expandedNodeIds.add(node.id);
				if (onExpand) { onExpand(node); }
			}
		}

		// Always call onClick if it exists (even for leaf nodes without children)
		if (node.onClick) {
			logger.debug('[TreeView] Calling node.onClick');
			node.onClick(node);
		}
	}

	// Keyboard handling
	function handleKeyDown(event: KeyboardEvent, node: TreeNode) {
		const actions: Record<string, () => void> = {
			Enter: () => toggleNode(node),
			' ': () => {
				event.preventDefault();
				toggleNode(node);
			},
			ArrowRight: () => handleArrowKey(node, 'right'),
			ArrowLeft: () => handleArrowKey(node, 'left'),
			ArrowDown: () => focusNextNode(node.id),
			ArrowUp: () => focusPreviousNode(node.id),
			Home: () => focusFirstNode(),
			End: () => focusLastNode()
		};

		const action = actions[event.key];
		if (action) {
			action();
			event.preventDefault();
		}
	}

	function handleArrowKey(node: TreeNode, direction: 'left' | 'right') {
		const isRtl = dir === 'rtl';
		const expandKey = isRtl ? 'left' : 'right';
		const collapseKey = isRtl ? 'right' : 'left';
		const nodeData = nodeMap.get(node.id);

		if (direction === expandKey) {
			if (node.children && !isNodeExpanded(node.id)) {
				toggleNode(node);
			} else if (node.children && isNodeExpanded(node.id)) {
				focusNextNode(node.id);
			}
		} else if (direction === collapseKey) {
			if (node.children && isNodeExpanded(node.id)) {
				toggleNode(node);
			} else if (nodeData?.parentId) {
				focusNodeById(nodeData.parentId);
			}
		}
	}

	// Get visible nodes
	function getVisibleNodesFlat(): string[] {
		const visible: string[] = [];

		function traverse(nodesToTraverse: TreeNode[]) {
			nodesToTraverse.forEach((n) => {
				visible.push(n.id);
				if (n.children && isNodeExpanded(n.id)) {
					traverse(n.children);
				}
			});
		}

		traverse(filteredNodes);
		return visible;
	}

	function focusNodeById(nodeId: string | null) {
		if (nodeId && nodeMap.has(nodeId)) {
			focusedNodeId = nodeId;
		}
	}

	function focusNextNode(currentId: string) {
		const v = getVisibleNodesFlat();
		const i = v.indexOf(currentId);
		if (i >= 0 && i < v.length - 1) {
			focusNodeById(v[i + 1]);
		}
	}

	function focusPreviousNode(currentId: string) {
		const v = getVisibleNodesFlat();
		const i = v.indexOf(currentId);
		if (i > 0) {
			focusNodeById(v[i - 1]);
		}
	}

	function focusFirstNode() {
		const v = getVisibleNodesFlat();
		if (v.length) { focusNodeById(v[0]); }
	}

	function focusLastNode() {
		const v = getVisibleNodesFlat();
		if (v.length) { focusNodeById(v.at(-1)); }
	}

	// Auto-focus effect
	$effect(() => {
		if (focusedNodeId) {
			const el = document.getElementById(`node-${focusedNodeId}`);
			el?.focus({ preventScroll: true });
		}
	});

	// Drag/drop helpers
	function isDescendant(ancestorId: string, nodeId: string): boolean {
		let currentId: string | undefined = nodeId;
		while (currentId) {
			const nd = nodeMap.get(currentId);
			if (nd?.parentId === ancestorId) { return true; }
			currentId = nd?.parentId;
		}
		return false;
	}

	function handleDragStart(event: DragEvent, node: TreeNode) {
		if (!allowDragDrop || node.id === 'root') { return; }

		draggedNode = node;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', node.id);
		}
	}

	function handleDragOver(event: DragEvent, node: TreeNode) {
		if (!(allowDragDrop && draggedNode) || draggedNode.id === node.id) { return; }

		if (isDescendant(draggedNode.id, node.id)) {
			dropPosition = null;
			dragOverNode = node;
			if (event.dataTransfer) { event.dataTransfer.dropEffect = 'none'; }
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) { event.dataTransfer.dropEffect = 'move'; }

		dragOverNode = node;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const y = event.clientY - rect.top;
		const h = rect.height;
		const threshold = 0.25;

		if (y < h * threshold) {
			dropPosition = 'before';
		} else if (y > h * (1 - threshold)) {
			dropPosition = 'after';
		} else {
			dropPosition = (node.nodeType === 'virtual' || node.nodeType === 'category') && node.id !== 'root' ? 'inside' : 'after';
		}
	}

	function handleDragLeave(event?: DragEvent) {
		if (!allowDragDrop) { return; }

		const related = event?.relatedTarget as Node | null;
		if (!(related && (event?.currentTarget as Node).contains(related))) {
			dragOverNode = null;
			dropPosition = null;
		}
	}

	function handleDrop(event: DragEvent, node: TreeNode) {
		if (!(allowDragDrop && draggedNode && dropPosition) || draggedNode.id === node.id || isDescendant(draggedNode.id, node.id)) {
			handleDragEnd();
			return;
		}

		event.preventDefault();
		if (onReorder) {
			onReorder(draggedNode.id, node.id, dropPosition);
		}
		handleDragEnd();
	}

	function handleDragEnd() {
		if (!allowDragDrop) { return; }
		draggedNode = null;
		dragOverNode = null;
		dropPosition = null;
	}

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	// Get transition duration
	const transitionDuration = $derived(prefersReducedMotion ? 0 : 200);
</script>

<ul role="tree" aria-label={ariaLabel} {dir} class="scrollbar-thin scrollbar-thumb-primary-500 max-h-[80vh] w-full space-y-1 overflow-y-auto">
	{#each filteredNodes as node (node.id)}
		<li
			role="treeitem"
			aria-expanded={node.children ? node.isExpanded : undefined}
			aria-label={node.ariaLabel || node.name}
			aria-selected={selectedId === node.id}
			class="group relative"
			transition:scale={{ duration: transitionDuration, start: 0.95 }}
		>
			<!-- Drop indicator: before -->
			{#if dragOverNode?.id === node.id && dropPosition === 'before'}
				<div
					class="absolute -top-0.5 left-0 right-0 z-10 h-1 rounded-full bg-primary-500"
					transition:scale={{ duration: transitionDuration, start: 0.8 }}
				></div>
			{/if}

			<button
				type="button"
				id={`node-${node.id}`}
				class="relative flex w-full items-center gap-1.5 rounded
				       border border-surface-400 px-2 py-3 transition-all duration-200
				       hover:bg-surface-50 focus:bg-surface-50 focus-visible:outline-none
				       focus-visible:ring-2 focus-visible:ring-primary-500
				       dark:border-transparent dark:bg-surface-500
				       dark:text-surface-200 dark:hover:bg-surface-400
				       {node.children ? '' : 'bg-surface-300 dark:bg-surface-700'}
				       {selectedId === node.id ? 'bg-primary-500/20 border-primary-500/50 dark:bg-primary-500/30' : ''}
				       {draggedNode?.id === node.id ? 'opacity-50' : ''}
				       {dragOverNode?.id === node.id && dropPosition === 'inside' ? 'border-primary-500 bg-primary-100 dark:bg-primary-900' : ''}
				       {allowDragDrop && node.nodeType === 'virtual' && node.id !== 'root' ? 'cursor-move' : ''}"
				aria-expanded={node.children ? node.isExpanded : undefined}
				tabindex={focusedNodeId === node.id ? 0 : -1}
				draggable={allowDragDrop && node.nodeType === 'virtual' && node.id !== 'root'}
				onclick={() => toggleNode(node)}
				onkeydown={(event) => handleKeyDown(event, node)}
				ondragstart={(event) => handleDragStart(event, node)}
				ondragover={(event) => handleDragOver(event, node)}
				ondragleave={handleDragLeave}
				ondrop={(event) => handleDrop(event, node)}
				ondragend={handleDragEnd}
				aria-controls={node.children ? `node-${node.id}-children` : undefined}
				onmouseenter={() => {
					if (node.path) preloadData(node.path);
					if (onHover) onHover(node);
				}}
			>
				<!-- Expand/Collapse icon with RTL support -->
				{#if node.children}
					{#if node.isLoading}
						<div class="flex h-4 w-4 items-center justify-center">
							<div class="h-3 w-3 animate-spin rounded-full border-2 border-surface-400 border-t-transparent"></div>
						</div>
					{:else}
						<div
							aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
							class="h-4 w-4 transform transition-transform duration-{transitionDuration}
							       {node.isExpanded ? '' : dir === 'rtl' ? 'rotate-180' : '-rotate-90'}"
						>
							<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class={dir === 'rtl' ? 'scale-x-[-1]' : ''} aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</div>
					{/if}

					<!-- Badge overlay -->
					{#if showBadges && node.badge?.count && node.badge.count > 0}
						<div
							class="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-xs font-medium text-white shadow-sm
							       {node.badge.color || 'bg-tertiary-500 dark:bg-primary-500'}"
							transition:scale={{ duration: transitionDuration, start: 0.8 }}
						>
							{node.badge.count}
						</div>
					{/if}
				{:else}
					<div class="h-4 w-4" aria-hidden="true"></div>
				{/if}

				<!-- Icon -->
				{#if node.icon}
					<div class="relative flex shrink-0 items-center">
						<iconify-icon
							icon={node.icon}
							width={compact ? '20' : '24'}
							height={compact ? '20' : '24'}
							class={iconColorClass}
							aria-hidden="true"
						></iconify-icon>
					</div>
				{/if}

				<!-- Node label -->
				<span
									class="flex-1 select-none overflow-hidden text-ellipsis whitespace-nowrap text-left dark:text-white
									       {compact ? 'text-xs' : 'text-sm'}
									       {selectedId === node.id ? 'font-semibold' : ''}"					style="margin-left: {node.depth ? node.depth * 8 : 0}px"
				>
					{node.name}
				</span>
			</button>

			<!-- Drop indicator: after -->
			{#if dragOverNode?.id === node.id && dropPosition === 'after'}
				<div
					class="absolute -bottom-0.5 left-0 right-0 z-10 h-1 rounded-full bg-primary-500"
					transition:scale={{ duration: transitionDuration, start: 0.8 }}
				></div>
			{/if}

			<!-- Children nodes -->
			{#if node.children}
				<div id={`node-${node.id}-children`} class="relative {compact ? 'ms-1' : 'ms-4'}" role="group" aria-labelledby={`node-${node.id}`}>
					<!-- Vertical line -->
					<div
						class="absolute -left-0.5 top-0 h-full w-0.5 bg-linear-to-b
						       from-surface-100 from-20% to-transparent dark:from-surface-400"
					></div>

					<!-- Recursive children -->
					{#if node.isExpanded}
						<div transition:fly|local={{ y: -10, duration: transitionDuration }}>
							<TreeView
								{k}
								nodes={node.children}
								{selectedId}
								ariaLabel={`Children of ${node.name}`}
								{dir}
								{search}
								{compact}
								{iconColorClass}
								{showBadges}
								{allowDragDrop}
								{onReorder}
								{onExpand}
								{onHover}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>

<!-- Screen reader announcements -->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
	{#if search}
		Filtered to {filteredNodes.length} item{filteredNodes.length !== 1 ? 's' : ''}
	{/if}
</div>

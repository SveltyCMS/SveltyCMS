<!--
  @file src/routes/TreeView.svelte
  @component TreeView Component

  @description A recursive, accessible tree view component
  It supports expanding/collapsing nodes, keyboard navigation, and LTR/RTL layouts.

  @props
  - k: An arbitrary key (not used in this component, consider removing it).
  - nodes: An array of TreeNode objects representing the tree structure.
  - selectedId: (Optional) The ID of the currently selected node.
  - ariaLabel: (Optional) The ARIA label for the tree element (default: "Navigation tree").
  - dir: (Optional) The text direction ('ltr' or 'rtl', default: 'ltr').
  - showBadges: (Optional) A boolean to control the visibility of badges.
 -->

<script lang="ts" module>
	// Define the structure of a tree node
	export interface TreeNode {
		id: string; // Unique identifier for the node
		name: string; // Display name of the node
		children?: TreeNode[]; // Optional array of child nodes
		isExpanded?: boolean; // Optional flag indicating if the node is expanded
		icon?: string; // Optional icon for the node
		ariaLabel?: string; // Optional ARIA label for the node
		onClick?: (node: TreeNode) => void;
		isCollection?: boolean; // Optional flag indicating if the node is a collection
		badge?: {
			visible?: boolean;
			count?: number;
			status?: 'draft' | 'publish' | 'archive' | 'schedule' | 'delete' | 'clone' | 'test';
			color?: string;
		};
		depth?: number; // Depth of the node in the tree
		order?: number; // Order for sorting and reordering
		nodeType?: string; // Type of node for filtering drag operations
		path?: string; // Path to prefetch
		isLoading?: boolean; // Optional flag indicating if the node is loading children
	}
</script>

<script lang="ts">
	import { logger } from '@utils/logger';
	// Import recursive component and transitions/easing
	import TreeViewComponent from './TreeView.svelte';
	const TreeView = TreeViewComponent;
	import { fly } from 'svelte/transition';
	import { preloadData } from '$app/navigation';

	// Destructure props with clearer names and defaults
	// Props interface
	interface TreeViewProps {
		k?: any;
		nodes: TreeNode[];
		selectedId?: string | null;
		ariaLabel?: string;
		dir?: 'ltr' | 'rtl' | 'auto';
		search?: string;
		compact?: boolean;
		iconColorClass?: string;
		showBadges?: boolean;
		allowDragDrop?: boolean;
		onReorder?: ((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void) | null;
		onExpand?: ((node: TreeNode) => void) | null;
		onHover?: ((node: TreeNode) => void) | null;
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

	// Focused item id
	let focusedNodeId = $state<string | null>(null);

	// Use native Set for expansion state; SvelteSet isn't available in this environment.
	let expandedNodeIds = $state(new Set());

	// Drag & drop transient UI state
	let draggedNode = $state<TreeNode | null>(null);
	let dragOverNode = $state<TreeNode | null>(null);
	let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);

	// Helper: check expansion
	function isNodeExpanded(nodeId: string) {
		return expandedNodeIds.has(nodeId);
	}

	// Map nodes to derived form including isExpanded without mutating props
	function mapNodesWithDerivedState(nodesToMap: TreeNode[]): TreeNode[] {
		return nodesToMap.map((node) => ({
			...node,
			isExpanded: isNodeExpanded(node.id),
			children: node.children ? mapNodesWithDerivedState(node.children) : undefined
		}));
	}

	const processedNodes = $derived(() => mapNodesWithDerivedState(initialNodes));

	const filteredNodes = $derived(() => {
		const searchTermLower = (search || '').toLowerCase().trim();
		if (!searchTermLower) return processedNodes();

		const filter = (nodesToFilter: TreeNode[]): TreeNode[] => {
			return nodesToFilter
				.map((node) => {
					const nameMatch = node.name.toLowerCase().includes(searchTermLower);
					if (nameMatch) return node;
					if (node.children) {
						const children = filter(node.children);
						if (children.length > 0) return { ...node, children };
					}
					return null;
				})
				.filter((n): n is TreeNode => n !== null);
		};
		return filter(processedNodes());
	});

	// nodeMap derived for lookups (depth + parentId)
	const nodeMap = $derived(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map();
		function collect(node: TreeNode, depth = 0, parentId?: string) {
			map.set(node.id, { ...node, depth, parentId });
			if (node.children) node.children.forEach((c) => collect(c, depth + 1, node.id));
		}
		initialNodes.forEach((n: TreeNode) => collect(n));
		return map;
	});

	// Toggle expansion state
	function toggleNode(node: TreeNode) {
		logger.debug('[TreeView] toggleNode called for:', node.name, 'hasChildren:', !!node.children, 'hasOnClick:', !!node.onClick);

		// Toggle expansion if node has children
		if (node.children) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const newSet = new Set(expandedNodeIds);
			if (newSet.has(node.id)) {
				newSet.delete(node.id);
			} else {
				newSet.add(node.id);
				if (onExpand) onExpand(node);
			}
			expandedNodeIds = newSet;
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
			' ': () => toggleNode(node),
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
		const expandKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
		const collapseKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
		const currentKey = direction === 'right' ? 'ArrowRight' : 'ArrowLeft';
		const nodeData = nodeMap().get(node.id);

		if (currentKey === expandKey) {
			if (node.children && !isNodeExpanded(node.id)) toggleNode(node);
			else if (node.children && isNodeExpanded(node.id)) focusNextNode(node.id);
		} else if (currentKey === collapseKey) {
			if (node.children && isNodeExpanded(node.id)) toggleNode(node);
			else if (nodeData?.parentId) focusNodeById(nodeData.parentId);
			else if (nodeData?.depth === 0) focusPreviousNode(node.id);
		}
	}

	// Visible nodes flattening based on filteredNodes()
	function getVisibleNodesFlat(): string[] {
		const visible: string[] = [];
		function traverse(nodesToTraverse: TreeNode[]) {
			nodesToTraverse.forEach((n) => {
				visible.push(n.id);
				if (n.children && isNodeExpanded(n.id)) traverse(n.children);
			});
		}
		traverse(filteredNodes());
		return visible;
	}

	function focusNodeById(nodeId: string | null) {
		if (nodeId && nodeMap().has(nodeId)) focusedNodeId = nodeId;
	}

	function focusNextNode(currentId: string) {
		const v = getVisibleNodesFlat();
		const i = v.indexOf(currentId);
		focusNodeById(v[(i + 1) % v.length]);
	}

	function focusPreviousNode(currentId: string) {
		const v = getVisibleNodesFlat();
		const i = v.indexOf(currentId);
		focusNodeById(v[(i - 1 + v.length) % v.length]);
	}

	function focusFirstNode() {
		const v = getVisibleNodesFlat();
		if (v.length) focusNodeById(v[0]);
	}

	function focusLastNode() {
		const v = getVisibleNodesFlat();
		if (v.length) focusNodeById(v[v.length - 1]);
	}

	$effect(() => {
		if (focusedNodeId) {
			const el = document.getElementById(`node-${focusedNodeId}`);
			el?.focus({ preventScroll: true });
		}
	});

	// Drag/drop helpers (isDescendant, handleDragStart/Over/Leave/Drop/End)
	function isDescendant(ancestorId: string, nodeId: string): boolean {
		let currentId: string | undefined = nodeId;
		while (currentId) {
			const nd = nodeMap().get(currentId);
			if (nd?.parentId === ancestorId) return true;
			currentId = nd?.parentId;
		}
		return false;
	}

	function handleDragStart(event: DragEvent, node: TreeNode) {
		if (!allowDragDrop || node.id === 'root') return;
		draggedNode = node;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', node.id);
		}
	}

	function handleDragOver(event: DragEvent, node: TreeNode) {
		if (!allowDragDrop || !draggedNode || draggedNode.id === node.id) return;
		if (isDescendant(draggedNode.id, node.id)) {
			dropPosition = null;
			dragOverNode = node;
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
			return;
		}
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dragOverNode = node;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const y = event.clientY - rect.top;
		const h = rect.height;
		const threshold = 0.25;
		if (y < h * threshold) dropPosition = 'before';
		else if (y > h * (1 - threshold)) dropPosition = 'after';
		else dropPosition = (node.nodeType === 'virtual' || node.nodeType === 'category') && node.id !== 'root' ? 'inside' : 'after';
	}

	function handleDragLeave(event?: DragEvent) {
		if (!allowDragDrop) return;
		const related = event?.relatedTarget as Node | null;
		if (!related || !(event?.currentTarget as Node).contains(related)) {
			dragOverNode = null;
			dropPosition = null;
		}
	}

	function handleDrop(event: DragEvent, node: TreeNode) {
		if (!allowDragDrop || !draggedNode || !dropPosition || draggedNode.id === node.id || isDescendant(draggedNode.id, node.id)) {
			handleDragEnd();
			return;
		}
		event.preventDefault();
		if (onReorder) onReorder(draggedNode.id, node.id, dropPosition);
		handleDragEnd();
	}

	function handleDragEnd() {
		if (!allowDragDrop) return;
		draggedNode = null;
		dragOverNode = null;
		dropPosition = null;
	}
</script>

<ul
	role="tree"
	aria-label={ariaLabel}
	{dir}
	class="rtl:space-x-revert scrollbar-thin scrollbar-thumb-primary-500 max-h-[80vh] w-full space-y-1 overflow-y-auto"
>
	{#each filteredNodes() as node (node.id)}
		<li
			role="treeitem"
			aria-expanded={node.children ? node.isExpanded : undefined}
			aria-label={node.ariaLabel || node.name}
			aria-selected={selectedId === node.id}
			class="group relative"
		>
			<!-- Drop indicator for 'before' position -->
			{#if dragOverNode?.id === node.id && dropPosition === 'before'}
				<div class="absolute -top-0.5 left-0 right-0 z-10 h-0.5 bg-primary-500"></div>
			{/if}

			<button
				type="button"
				id={`node-${node.id}`}
				class="relative flex w-full items-center gap-1.5 rounded
                       border border-surface-400 px-2 py-3 transition-all duration-200
                       hover:bg-surface-50 focus:bg-surface-50 focus-visible:outline-none
                       dark:border dark:border-transparent dark:bg-surface-500
                       dark:text-surface-200 dark:hover:bg-surface-400 dark:focus:bg-surface-500
                       {node.children ? '' : 'bg-surface-300 dark:bg-surface-700'}
                       {draggedNode?.id === node.id ? 'opacity-50' : ''}
                       {dragOverNode?.id === node.id && dropPosition === 'inside' ? 'border-primary-500 bg-primary-100 dark:bg-primary-900' : ''}
                       {allowDragDrop && node.nodeType === 'virtual' && node.id !== 'root' ? 'cursor-move' : ''}"
				role="treeitem"
				aria-expanded={node.children ? node.isExpanded : undefined}
				aria-selected={selectedId === node.id}
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
							<svg class="h-3 w-3 animate-spin text-surface-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						</div>
					{:else}
						<div
							aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
							class={`h-4 w-4 transform transition-transform duration-200
                           ${node.isExpanded ? '' : dir === 'rtl' ? 'rotate-180' : 'rotate-90'}`}
						>
							<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class={dir === 'rtl' ? 'scale-x-[-1]' : ''} aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>
						</div>
					{/if}

					<!-- Badge overlay -->
					{#if showBadges && !node.isExpanded && node.badge?.count && node.badge.count > 0}
						<div
							class="absolute right-0 top-0 flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1.5 text-xs font-medium text-white {node
								.badge.color || 'bg-tertiary-500'} dark:bg-primary-500"
						>
							{node.badge.count}
						</div>
					{/if}
				{:else}
					<div class="h-4 w-4" aria-hidden="true"></div>
				{/if}

				<!-- Icon -->
				{#if node.icon}
					<div class="relative flex items-center">
						<iconify-icon icon={node.icon} width={compact ? '20' : '24'} height={compact ? '20' : '24'} class={iconColorClass} aria-hidden="true"
						></iconify-icon>
					</div>
				{/if}
				<!-- Node label -->
				<span
					class="select-none overflow-hidden text-ellipsis whitespace-nowrap dark:text-white {compact ? 'text-xs' : ''}"
					style="margin-left: {node.depth ? node.depth * 8 : 0}px"
				>
					{node.name}
				</span>
			</button>

			<!-- Drop indicator for 'after' position -->
			{#if dragOverNode?.id === node.id && dropPosition === 'after'}
				<div class="absolute -bottom-0.5 left-0 right-0 z-10 h-0.5 bg-primary-500"></div>
			{/if}

			<!-- Children nodes with RTL support -->
			{#if node.children}
				<div id={`node-${node.id}-children`} class="relative {compact ? 'ms-1' : 'ms-4'}" role="group" aria-labelledby={`node-${node.id}-label`}>
					<!-- Vertical line with RTL support -->
					<div
						class="absolute -left-0.5 top-0 h-full w-0.5 bg-gradient-to-b
                           from-surface-100 from-20% to-transparent dark:from-surface-400"
					></div>

					<!-- Children nodes -->
					{#if node.isExpanded}
						<div transition:fly|local={{ y: -10, duration: 200 }}>
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

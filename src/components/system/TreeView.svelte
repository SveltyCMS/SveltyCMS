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
	}
</script>

<script lang="ts">
	// Import the component itself for recursive usage
	import TreeViewComponent from './TreeView.svelte';
	// Alias for recursive usage
	const TreeView = TreeViewComponent;
	import { fly } from 'svelte/transition';

	// Destructure props with default values
	const {
		k, // Key (consider removing if not used)
		nodes: initialNodes, // Initial tree nodes
		selectedId = null, // Initially selected node ID
		ariaLabel = 'Navigation tree', // Default ARIA label for the tree
		dir = 'ltr', // Default text direction
		search = '', // Search term for filtering nodes
		compact = false, // Flag for compact view
		iconColorClass = 'text-error-500', // Default icon color class
		showBadges = false, // Default to false so it's optional
		allowDragDrop = false, // Enable drag & drop functionality
		onReorder = null // Callback for reordering nodes
	} = $props<{
		k: number;
		nodes: TreeNode[];
		selectedId?: string | null;
		ariaLabel?: string;
		dir?: 'ltr' | 'rtl';
		search?: string;
		compact?: boolean;
		iconColorClass?: string;
		showBadges?: boolean;
		allowDragDrop?: boolean;
		onReorder?: ((draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void) | null;
	}>();

	// Reactive state for nodes - update when initialNodes change
	let nodes = $state<TreeNode[]>(initialNodes);
	$effect(() => {
		nodes = initialNodes;
	});

	let focusedNodeId = $state<string | null>(null);

	// Drag & Drop state
	let draggedNode = $state<TreeNode | null>(null);
	let dragOverNode = $state<TreeNode | null>(null);
	let dropPosition = $state<'before' | 'after' | 'inside' | null>(null);

	// Filtered Memoize nodes
	const filteredNodes = $derived.by(() => {
		if (!search) return nodes;

		return nodes.filter((node) => {
			const matchesSearch = node.name.toLowerCase().includes(search.toLowerCase());
			const childMatches = node.children ? node.children.some((child) => child.name.toLowerCase().includes(search.toLowerCase())) : false;
			return matchesSearch || childMatches;
		});
	});

	// Create a map of node IDs to nodes for efficient lookup
	const nodeMap = $derived.by(() => {
		const map = new Map<string, TreeNode>();
		function collectNodes(node: TreeNode, depth = 0) {
			map.set(node.id, { ...node, depth });
			if (node.children) {
				node.children.forEach((child) => collectNodes(child, depth + 1));
			}
		}
		nodes.forEach((node) => collectNodes(node));
		return map;
	});

	// Function to toggle node expansion
	function toggleNode(node: TreeNode) {
		if (node.children) {
			if (!node.isExpanded) {
				// Collapse other expanded parents
				nodes.forEach((n) => {
					if (n.id !== node.id && n.isExpanded && n.children) {
						n.isExpanded = false;
					}
				});
			}
			node.isExpanded = !node.isExpanded;
		}
		if (node.onClick) node.onClick(node);
	}

	// Function to handle keyboard events
	function handleKeyDown(event: KeyboardEvent, node: TreeNode) {
		// Define actions for specific keys
		const keyActions = {
			Enter: () => toggleNode(node), // Toggle node expansion on Enter
			' ': () => toggleNode(node), // Toggle node expansion on Space
			ArrowRight: () => handleArrowRight(node), // Handle right arrow key
			ArrowLeft: () => handleArrowLeft(node), // Handle left arrow key
			ArrowDown: () => focusNextNode(node.id), // Focus on the next node
			ArrowUp: () => focusPreviousNode(node.id), // Focus on the previous node
			Home: () => focusFirstNode(), // Focus on the first node
			End: () => focusLastNode() // Focus on the last node
		};

		// Get the action corresponding to the pressed key
		const action = keyActions[event.key as keyof typeof keyActions];
		// If an action is found, execute it and prevent default behavior
		if (action) {
			action();
			event.preventDefault();
		}
	}

	// Function to handle right arrow key based on text direction
	function handleArrowRight(node: TreeNode) {
		if (dir === 'rtl') {
			// In RTL, expand if not expanded
			if (node.children && !node.isExpanded) toggleNode(node);
		} else {
			// In LTR, focus next if expanded
			if (node.children && node.isExpanded) focusNextNode(node.id);
		}
	}

	// Function to handle left arrow key based on text direction
	function handleArrowLeft(node: TreeNode) {
		if (dir === 'rtl') {
			// In RTL, collapse if expanded
			if (node.children && node.isExpanded) toggleNode(node);
		} else {
			// In LTR, collapse if expanded, otherwise focus previous
			if (node.children && node.isExpanded) toggleNode(node);
			else focusPreviousNode(node.id);
		}
	}

	// Function to focus on the next node
	function focusNextNode(currentId: string) {
		const allNodes = Array.from(nodeMap.keys());
		const index = allNodes.indexOf(currentId);
		focusedNodeId = allNodes[(index + 1) % allNodes.length];
	}

	// Function to focus on the previous node
	function focusPreviousNode(currentId: string) {
		const allNodes = Array.from(nodeMap.keys());
		const index = allNodes.indexOf(currentId);
		focusedNodeId = allNodes[(index - 1 + allNodes.length) % allNodes.length];
	}

	// Function to focus on the first node
	function focusFirstNode() {
		focusedNodeId = Array.from(nodeMap.keys())[0];
	}

	// Function to focus on the last node
	function focusLastNode() {
		const allNodes = Array.from(nodeMap.keys());
		focusedNodeId = allNodes[allNodes.length - 1];
	}

	// Effect to focus on the node element with enhanced visual feedback
	$effect(() => {
		if (focusedNodeId) {
			const element = document.getElementById(`node-${focusedNodeId}`);
			if (element) {
				element.focus();
			}
		}
	});

	// Drag & Drop handlers
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

		// Prevent dropping a folder into itself or its descendants
		if (isDescendant(draggedNode.id, node.id)) return;

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}

		dragOverNode = node;

		// Determine drop position based on mouse position
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const y = event.clientY - rect.top;
		const height = rect.height;

		if (y < height * 0.25) {
			dropPosition = 'before';
		} else if (y > height * 0.75) {
			dropPosition = 'after';
		} else {
			// Only allow 'inside' for nodes that can have children (virtual folders, not root)
			dropPosition = node.nodeType === 'virtual' && node.id !== 'root' ? 'inside' : 'after';
		}
	}

	// Helper function to check if a node is a descendant of another
	function isDescendant(ancestorId: string, nodeId: string): boolean {
		const findNodeInNodes = (nodes: TreeNode[], id: string): TreeNode | null => {
			for (const node of nodes) {
				if (node.id === id) return node;
				if (node.children) {
					const found = findNodeInNodes(node.children, id);
					if (found) return found;
				}
			}
			return null;
		};

		const ancestor = findNodeInNodes(nodes, ancestorId);
		if (!ancestor || !ancestor.children) return false;

		return ancestor.children.some((child) => child.id === nodeId || isDescendant(ancestorId, child.id));
	}

	function handleDragLeave() {
		if (!allowDragDrop) return;
		// Only clear if we're really leaving the node area
		setTimeout(() => {
			dragOverNode = null;
			dropPosition = null;
		}, 50);
	}

	function handleDrop(event: DragEvent, node: TreeNode) {
		if (!allowDragDrop || !draggedNode || !dropPosition || draggedNode.id === node.id) return;

		event.preventDefault();

		// Call the reorder callback
		if (onReorder) {
			onReorder(draggedNode.id, node.id, dropPosition);
		}

		// Reset drag state
		draggedNode = null;
		dragOverNode = null;
		dropPosition = null;
	}

	function handleDragEnd() {
		if (!allowDragDrop) return;
		// Reset drag state
		draggedNode = null;
		dragOverNode = null;
		dropPosition = null;
	}
</script>

<ul role="tree" aria-label={ariaLabel} {dir} class="rtl:space-x-revert custom-scrollbar max-h-[80vh] w-full space-y-1 overflow-y-auto">
	{#each filteredNodes as node (node.id)}
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
			>
				<!-- Expand/Collapse icon with RTL support -->
				{#if node.children}
					<div
						aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
						class={`h-4 w-4 transform transition-transform duration-200
                           ${node.isExpanded ? '' : dir === 'rtl' ? 'rotate-180' : 'rotate-90'}`}
					>
						<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class={dir === 'rtl' ? 'scale-x-[-1]' : ''} aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</div>

					<!-- Badge overlay -->
					{#if showBadges && !node.isExpanded && node.badge?.count && node.badge.count > 0}
						<div
							class={`badge absolute right-1  top-0 translate-y-1/2 rounded-full px-2 py-1 text-xs text-white ${node.badge.color || 'bg-tertiary-500/80'} dark:bg-primary-500/50`}
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
							/>
						</div>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>

<style lang="postcss">
	:global(.focused-label) {
		@apply text-primary-400;
	}

	.custom-scrollbar {
		scrollbar-width: thin;
		scrollbar-color: theme(colors.surface.400) transparent;
	}

	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: theme(colors.primary.500);
		border-radius: 3px;
	}
</style>

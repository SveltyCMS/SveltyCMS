<!--
  @file src/routes/TreeView.svelte
  @component TreeView Component

  @description A recursive, accessible tree view component built with Svelte 5 runes.
  It supports expanding/collapsing nodes, keyboard navigation, and LTR/RTL layouts.

  @props
  - k: An arbitrary key (not used in this component, consider removing it).
  - nodes: An array of TreeNode objects representing the tree structure.
  - selectedId: (Optional) The ID of the currently selected node.
  - ariaLabel: (Optional) The ARIA label for the tree element (default: "Navigation tree").
  - dir: (Optional) The text direction ('ltr' or 'rtl', default: 'ltr').

  @usage
  ```svelte
  <script>
    import TreeView from './TreeView.svelte';

    const treeData = [
      {
        id: '1',
        name: 'Node 1',
        children: [
          { id: '1.1', name: 'Node 1.1' },
          { id: '1.2', name: 'Node 1.2' },
        ],
      },
      { id: '2', name: 'Node 2' },
    ];
  </script>

  <TreeView nodes={treeData} />
  ```
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
		compact = false // Flag for compact view
	} = $props<{
		k: number;
		nodes: TreeNode[];
		selectedId?: string | null;
		ariaLabel?: string;
		dir?: 'ltr' | 'rtl';
		search?: string;
		compact?: boolean;
	}>();

	// Reactive state for nodes
	let nodes = $state<TreeNode[]>(initialNodes);
	let focusedNodeId = $state<string | null>(null);

	// Derived state for filtered nodes
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
		function collectNodes(node: TreeNode) {
			map.set(node.id, node);
			if (node.children) {
				node.children.forEach(collectNodes);
			}
		}
		nodes.forEach(collectNodes);
		return map;
	});

	// Function to toggle node expansion
	function toggleNode(node: TreeNode) {
		node.isExpanded = !node.isExpanded;
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
			ArrowUp: () => focusPreviousNode(node.id) // Focus on the previous node
		};

		// Get the action corresponding to the pressed key
		const action = keyActions[event.key as keyof typeof keyActions];
		// If an action is found, execute it and prevent default behavior
		if (action) {
			action();
			event.preventDefault();
		}
	}

	// Function to handle right arrow key
	function handleArrowRight(node: TreeNode) {
		if (dir === 'rtl') {
			// In RTL, expand if not expanded
			if (node.children && !node.isExpanded) toggleNode(node);
		} else {
			// In LTR, focus next if expanded
			if (node.children && node.isExpanded) focusNextNode(node.id);
		}
	}

	// Function to handle left arrow key
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
		// Get all node IDs as an array
		const allNodes = Array.from(nodeMap.keys());
		// Find the index of the current node
		const index = allNodes.indexOf(currentId);
		// Focus on the next node, wrapping around if necessary
		focusedNodeId = allNodes[(index + 1) % allNodes.length];
	}

	// Function to focus on the previous node
	function focusPreviousNode(currentId: string) {
		// Get all node IDs as an array
		const allNodes = Array.from(nodeMap.keys());
		// Find the index of the current node
		const index = allNodes.indexOf(currentId);
		// Focus on the previous node, wrapping around if necessary
		focusedNodeId = allNodes[(index - 1 + allNodes.length) % allNodes.length];
	}

	// Effect to focus on the node element
	$effect(() => {
		if (focusedNodeId) {
			// Focus on the corresponding node element
			document.getElementById(`node-${focusedNodeId}`)?.focus();
		}
	});
</script>

<ul role="tree" aria-label={ariaLabel} {dir} class="rtl:space-x-revert space-y-1">
	{#each filteredNodes as node (node.id)}
		<li
			role="treeitem"
			aria-expanded={node.children ? node.isExpanded : undefined}
			aria-label={node.ariaLabel || node.name}
			aria-selected={selectedId === node.id}
			class="group relative"
		>
			<button
				type="button"
				class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-white hover:bg-surface-300 focus:bg-surface-300 dark:bg-surface-500 dark:text-surface-200 dark:hover:bg-surface-400 dark:focus:bg-surface-500
		  		{node.children ? '' : 'bg-surface-700 dark:bg-surface-700'} {compact ? 'py-4' : 'py-3'}"
				role="treeitem"
				aria-expanded={node.children ? node.isExpanded : undefined}
				aria-selected={selectedId === node.id}
				tabindex="0"
				onclick={() => toggleNode(node)}
				onkeydown={(event) => handleKeyDown(event, node)}
				aria-controls={`node-${node.id}-children`}
			>
				<!-- Expand/Collapse  -->
				{#if node.children}
					<span
						aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
						class={`h-4 w-4 transform text-white transition-transform ${node.isExpanded ? '' : dir === 'rtl' ? 'rotate-180' : 'rotate-90'}`}
					>
						<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class={dir === 'rtl' ? 'scale-x-[-1]' : ''} aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</span>
				{:else}
					<span class="h-4 w-4" aria-hidden="true"></span>
				{/if}

				<!-- Node label -->
				{#if compact}
					<div class="align-center flex-wrap items-center gap-2">
						<div class="select-none {compact ? 'text-sm' : ''}" id={`node-${node.id}-label`}>{node.name}</div>
						{#if node.icon}
							<iconify-icon icon={node.icon} width="24" height="24" class="text-error-500" aria-hidden="true"></iconify-icon>
						{/if}
					</div>
				{/if}

				{#if !compact}
					<!-- Icons -->
					{#if node.icon}
						<iconify-icon icon={node.icon} width="24" height="24" class="text-error-500" aria-hidden="true"></iconify-icon>
					{/if}
					<!-- Node label -->
					<span class="select-none {compact ? 'text-sm' : ''}" id={`node-${node.id}-label`}>{node.name}</span>
				{/if}
			</button>

			<!-- White line -->
			{#if node.children}
				<div id={`node-${node.id}-children`} class="relative ms-4" role="group" aria-labelledby={`node-${node.id}-label`}>
					<!-- Enhanced left line with gradient fade -->
					<div class="absolute -left-0.5 top-0 h-full w-0.5 bg-gradient-to-b from-surface-100 from-20% to-transparent dark:from-surface-400"></div>

					<!-- Children nodes -->
					{#if node.isExpanded}
						<div transition:fly|local={{ y: -10, duration: 200 }}>
							<TreeView {k} nodes={node.children} {selectedId} ariaLabel={`Children of ${node.name}`} {dir} {search} {compact} />
						</div>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>

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
	}
</script>

<script lang="ts">
	// Import the component itself for recursive usage
	import TreeViewComponent from './TreeView.svelte';
	// Alias for recursive usage
	const TreeView = TreeViewComponent;
	import { fly } from 'svelte/transition';

	// Destructure props with default values using Svelte 5 runes
	const {
		k, // Key (consider removing if not used)
		nodes: initialNodes, // Initial tree nodes
		selectedId = null, // Initially selected node ID
		ariaLabel = 'Navigation tree', // Default ARIA label for the tree
		dir = 'ltr' // Default text direction
	} = $props<{
		k: number;
		nodes: TreeNode[];
		selectedId?: string | null;
		ariaLabel?: string;
		dir?: 'ltr' | 'rtl';
	}>();

	// Reactive state for nodes using Svelte 5 runes
	let nodes = $state<TreeNode[]>(initialNodes);
	// Reactive state for focused node ID
	let focusedNodeId = $state<string | null>(null);

	// Derived state to create a map of node IDs to nodes for efficient lookup
	const nodeMap = $derived.by(() => new Map<string, TreeNode>(nodes.flatMap(collectNodes)));

	// Function to recursively collect all nodes and their IDs into an array of [id, node] pairs
	function collectNodes(node: TreeNode): [string, TreeNode][] {
		return [[node.id, node], ...(node.children?.flatMap(collectNodes) || [])];
	}

	// Function to toggle the expanded state of a node
	function toggleNode(node: TreeNode) {
		node.isExpanded = !node.isExpanded;
	}

	// Function to handle keyboard events on a node
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

	// Function to focus on the next node in the tree
	function focusNextNode(currentId: string) {
		// Get all node IDs as an array
		const allNodes = Array.from(nodeMap.keys()) as string[]; // Explicitly type as string[]
		// Find the index of the current node
		const index = allNodes.indexOf(currentId);
		// Focus on the next node, wrapping around if necessary
		focusedNodeId = allNodes[(index + 1) % allNodes.length];
	}

	// Function to focus on the previous node in the tree
	function focusPreviousNode(currentId: string) {
		// Get all node IDs as an array
		const allNodes = Array.from(nodeMap.keys()) as string[]; // Explicitly type as string[]
		// Find the index of the current node
		const index = allNodes.indexOf(currentId);
		// Focus on the previous node, wrapping around if necessary
		focusedNodeId = allNodes[(index - 1 + allNodes.length) % allNodes.length];
	}

	// Effect to focus on the node element when focusedNodeId changes
	$effect(() => {
		if (focusedNodeId) {
			// Focus on the corresponding node element
			document.getElementById(`node-${focusedNodeId}`)?.focus();
		}
	});
</script>

<ul role="tree" aria-label={ariaLabel} {dir} class="rtl:space-x-revert space-y-1">
	{#each nodes as node (node.id)}
		<li
			role="treeitem"
			aria-expanded={node.children ? node.isExpanded : undefined}
			aria-label={node.ariaLabel || node.name}
			aria-selected={selectedId === node.id}
			class="group relative"
		>
			<button
				id={`node-${node.id}`}
				onkeydown={(e) => handleKeyDown(e, node)}
				tabindex={focusedNodeId === node.id ? 0 : -1}
				class="flex w-full cursor-pointer items-center gap-2 rounded bg-transparent p-2
				 text-left outline-none ring-blue-500 transition-colors
				 hover:bg-gray-100 focus-visible:ring-2 dark:hover:bg-gray-700
				 {selectedId === node.id ? 'bg-blue-50 text-blue-600' : ''}"
				onclick={() => toggleNode(node)}
				aria-controls={`node-${node.id}-children`}
			>
				{#if node.children}
					<span
						aria-label={node.isExpanded ? 'Collapse' : 'Expand'}
						class={`h-4 w-4 transform transition-transform ${node.isExpanded ? (dir === 'rtl' ? '-rotate-180' : 'rotate-90') : ''}`}
					>
						<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class={dir === 'rtl' ? 'scale-x-[-1]' : ''} aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</span>
				{:else}
					<span class="h-4 w-4" aria-hidden="true"></span>
				{/if}

				{#if node.icon}
					<span class="text-gray-400" aria-hidden="true">{node.icon}</span>
				{/if}

				<span class="select-none" id={`node-${node.id}-label`}>{node.name}</span>
			</button>

			{#if node.children}
				<div
					id={`node-${node.id}-children`}
					class="ms-4 border-s-2 border-gray-200 dark:border-gray-700"
					role="group"
					aria-labelledby={`node-${node.id}-label`}
				>
					{#if node.isExpanded}
						<div transition:fly={{ y: -10, duration: 200 }}>
							<TreeView {k} nodes={node.children} {selectedId} ariaLabel={`Children of ${node.name}`} {dir} />
						</div>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>

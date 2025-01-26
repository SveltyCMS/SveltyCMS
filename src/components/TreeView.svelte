<!-- 
  @file src/routes/TreeView.svelte
  @component Kartik TreeView Component

  @desc A recursive tree view component that displays a list of nodes in a tree structure.
 -->
<script lang="ts" module>
	export interface TreeNode {
		id: string;
		name: string;
		children?: TreeNode[];
		isExpanded?: boolean;
		icon?: string;
		onClick?: (node: TreeNode) => void;
		ariaLabel?: string;
	}
</script>

<script lang="ts">
	import TreeView from './TreeView.svelte';
	import { fly } from 'svelte/transition';

	const {
		k,
		nodes: initialNodes,
		selectedId = null,
		ariaLabel = 'Navigation tree',
		dir = 'ltr'
	} = $props<{
		k: number;
		nodes: TreeNode[];
		selectedId?: string | null;
		ariaLabel?: string;
		dir?: 'ltr' | 'rtl';
	}>();

	// Reactive state using Svelte 5 runes
	let nodes = $state<TreeNode[]>(initialNodes);
	let focusedNodeId = $state<string | null>(null);

	// Derived state
	const nodeMap = $derived.by(() => new Map<string, TreeNode>(nodes.flatMap(collectNodes)));

	function collectNodes(node: TreeNode): [string, TreeNode][] {
		return [[node.id, node], ...(node.children?.flatMap(collectNodes) || [])];
	}

	function toggleNode(node: TreeNode) {
		node.isExpanded = !node.isExpanded;
		if (node.onClick) node.onClick(node);
	}

	function handleKeyDown(event: KeyboardEvent, node: TreeNode) {
		const keyActions = {
			Enter: () => toggleNode(node),
			' ': () => toggleNode(node),
			ArrowRight: () => handleArrowRight(node),
			ArrowLeft: () => handleArrowLeft(node),
			ArrowDown: () => focusNextNode(node.id),
			ArrowUp: () => focusPreviousNode(node.id)
		};

		const action = keyActions[event.key as keyof typeof keyActions];
		if (action) {
			action();
			event.preventDefault();
		}
	}

	function handleArrowRight(node: TreeNode) {
		if (dir === 'rtl') {
			if (node.children && !node.isExpanded) toggleNode(node);
		} else {
			if (node.children && node.isExpanded) focusNextNode(node.id);
		}
	}

	function handleArrowLeft(node: TreeNode) {
		if (dir === 'rtl') {
			if (node.children && node.isExpanded) toggleNode(node);
		} else {
			if (node.children && node.isExpanded) toggleNode(node);
			else focusPreviousNode(node.id);
		}
	}

	function focusNextNode(currentId: string) {
		const allNodes = Array.from(nodeMap.keys()) as string[]; // Explicitly type as string[]
		const index = allNodes.indexOf(currentId);
		focusedNodeId = allNodes[(index + 1) % allNodes.length];
	}

	function focusPreviousNode(currentId: string) {
		const allNodes = Array.from(nodeMap.keys()) as string[]; // Explicitly type as string[]
		const index = allNodes.indexOf(currentId);
		focusedNodeId = allNodes[(index - 1 + allNodes.length) % allNodes.length];
	}

	$effect(() => {
		if (focusedNodeId) {
			document.getElementById(`node-${focusedNodeId}`)?.focus();
		}
	});
</script>

<ul role="tree" aria-label={ariaLabel} {dir} class="rtl:space-x-revert space-y-1 text-gray-200 dark:text-gray-200">
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
				class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-transparent
				 p-2 text-left outline-none ring-blue-500
				 transition-colors hover:bg-gray-700 focus-visible:ring-2
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
					<iconify-icon icon={node.icon} width="24" height="24" class="text-gray-400" aria-hidden="true"></iconify-icon>
				{/if}

				<span class="select-none" id={`node-${node.id}-label`}>{node.name}</span>
			</button>

			{#if node.children}
				<div id={`node-${node.id}-children`} class="ms-4 border-s-2 border-gray-200" role="group" aria-labelledby={`node-${node.id}-label`}>
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

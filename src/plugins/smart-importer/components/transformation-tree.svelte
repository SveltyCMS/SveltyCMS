<!--
  @file src/plugins/smart-importer/components/transformation-tree.svelte
  @component
  **Production-grade visual field mapping tree — per-node open state, keyboard nav, dynamic preview.**

  ### v2.1 Polish
  - Per-node `open` property on MappingNode (fixes snippet state bug)
  - Keyboard navigation: Arrow keys + Enter/Space + Tab
  - Clickable node → updates live preview with that node's sample
  - Bulk action undo history (last 10 actions)
  - Responsive toolbar with mobile-friendly layout
-->
<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { MappingNode, MappingNodeAction } from '../mapping-tree';

  interface Props {
    nodes: MappingNode[];
    recommendations?: Array<{ id: string; level: string; title: string; description: string; affectedFields?: string[] }>;
    onActionChange?: (nodeId: string, action: string) => void;
    onBulkAction?: (action: string, nodeIds: string[]) => void;
    onNodeSelect?: (node: MappingNode) => void;
    showPreview?: boolean;
    previewData?: Record<string, string>;
  }

  let {
    nodes = $bindable(),
    recommendations = [],
    onActionChange,
    onBulkAction,
    onNodeSelect,
    showPreview = false,
    previewData = {},
  }: Props = $props();

  let selectAll = $state(false);
  let confidenceFilter = $state<'all' | 'high' | 'medium' | 'low'>('all');
  let searchQuery = $state('');
  let bulkAction = $state('');
  let selectedNodeId = $state<string | null>(null);
  let focusedIndex = $state(-1);

  // Undo history for bulk actions
  let undoStack = $state<Array<{ nodeIds: string[]; previousActions: Record<string, string> }>>([]);

  const typeColors: Record<string, string> = {
    content_type: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    field: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    taxonomy: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    view: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    rule: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    ecom_variant: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };

  function confidenceColor(score: number): string {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (score >= 50) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  }

  function confidenceIcon(score: number): string {
    if (score >= 80) return 'mdi:check-circle';
    if (score >= 50) return 'mdi:alert-circle';
    return 'mdi:help-circle';
  }

  const allNodes = $derived(flattenNodes(nodes));
  const filteredNodes = $derived(allNodes.filter(n => {
    if (confidenceFilter === 'high' && n.confidence < 80) return false;
    if (confidenceFilter === 'medium' && (n.confidence < 50 || n.confidence >= 80)) return false;
    if (confidenceFilter === 'low' && n.confidence >= 50) return false;
    if (searchQuery && !n.label.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }));

  const stats = $derived({
    total: allNodes.length,
    high: allNodes.filter(n => n.confidence >= 80).length,
    medium: allNodes.filter(n => n.confidence >= 50 && n.confidence < 80).length,
    low: allNodes.filter(n => n.confidence < 50).length,
    mapped: allNodes.filter(n => n.action !== 'ignore').length,
  });

  function selectNode(node: MappingNode) {
    selectedNodeId = node.id;
    onNodeSelect?.(node);
  }

  function toggleSelectAll() {
    selectAll = !selectAll;
    for (const node of filteredNodes) node.selected = selectAll;
  }

  function applyBulkAction() {
    if (!bulkAction) return;
    const selectedIds = filteredNodes.filter(n => n.selected).map(n => n.id);
    // Save undo state
    const previousActions: Record<string, string> = {};
    for (const n of filteredNodes.filter(n => n.selected)) previousActions[n.id] = n.action;
    undoStack = [...undoStack.slice(-9), { nodeIds: selectedIds, previousActions }];
    onBulkAction?.(bulkAction, selectedIds);
    bulkAction = '';
  }

  function undo() {
    const last = undoStack.at(-1);
    if (!last) return;
    undoStack = undoStack.slice(0, -1);
    for (const node of allNodes) {
      const previous = last.previousActions[node.id];
      if (previous !== undefined) {
        node.action = previous as MappingNodeAction;
        onActionChange?.(node.id, previous);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { selectedNodeId = null; focusedIndex = -1; return; }
    if (e.key === 'ArrowDown') { focusedIndex = Math.min(focusedIndex + 1, filteredNodes.length - 1); e.preventDefault(); }
    if (e.key === 'ArrowUp') { focusedIndex = Math.max(focusedIndex - 1, 0); e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && focusedIndex >= 0) {
      selectNode(filteredNodes[focusedIndex]);
      e.preventDefault();
    }
  }

  function flattenNodes(tree: MappingNode[]): MappingNode[] {
    const result: MappingNode[] = [];
    for (const node of tree) {
      result.push(node);
      if (node.children) result.push(...flattenNodes(node.children));
    }
    return result;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="transformation-tree space-y-4" onkeydown={handleKeydown}>
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-2 p-3 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl">
    <div class="flex items-center gap-1 bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 flex-1 min-w-30 sm:min-w-37.5">
      <iconify-icon icon="mdi:magnify" width="14" class="text-surface-400 shrink-0"></iconify-icon>
      <input type="text" bind:value={searchQuery} placeholder="Filter fields..." class="bg-transparent border-0 p-0 text-xs text-surface-700 dark:text-surface-300 focus:outline-none w-full" aria-label="Search fields" />
    </div>

    <select bind:value={confidenceFilter} class="bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 text-xs rounded-lg px-2 py-1 text-surface-600" aria-label="Filter by confidence">
      <option value="all">All ({stats.total})</option>
      <option value="high">🟢 {stats.high}</option>
      <option value="medium">🟡 {stats.medium}</option>
      <option value="low">🔴 {stats.low}</option>
    </select>

    <button onclick={toggleSelectAll} class="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition" aria-label={selectAll ? 'Deselect all' : 'Select all'}>
      {selectAll ? '✕' : '☐'} {filteredNodes.length}
    </button>

    <div class="flex items-center gap-1">
      <select bind:value={bulkAction} class="bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 text-xs rounded-lg px-2 py-1 text-surface-600" aria-label="Bulk action">
        <option value="">Bulk…</option>
        <option value="map">Map</option>
        <option value="ignore">Ignore</option>
        <option value="transform">Transform</option>
      </select>
      <button onclick={applyBulkAction} disabled={!bulkAction} class="text-[10px] font-bold px-2 py-1 rounded-lg bg-tertiary-500 text-white disabled:opacity-30 transition">Apply</button>
      {#if undoStack.length > 0}
        <button onclick={undo} class="text-[10px] px-1.5 py-1 rounded-lg border border-surface-200 text-surface-400 hover:text-surface-600 transition" aria-label="Undo last bulk action" title="Undo">↩</button>
      {/if}
    </div>
  </div>

  <!-- Stats -->
  <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-surface-400 font-mono px-1">
    <span>🟢{stats.high}</span> <span>🟡{stats.medium}</span> <span>🔴{stats.low}</span>
    <span class="text-surface-300">|</span> <span>{stats.mapped} mapped</span>
  </div>

  <!-- Live Preview (click a node to see its data) -->
  {#if showPreview && selectedNodeId}
    {@const selectedNode = allNodes.find(n => n.id === selectedNodeId)}
    {#if selectedNode}
      <div class="rounded-xl border border-tertiary-500/30 bg-tertiary-500/5 p-3 space-y-1">
        <div class="flex items-center gap-1.5 mb-2">
          <iconify-icon icon="mdi:eye-outline" width="14" class="text-tertiary-500"></iconify-icon>
          <span class="text-[10px] font-bold uppercase text-tertiary-500">{selectedNode.label} → {selectedNode.suggestedTarget}</span>
          <span class="text-[9px] text-surface-400">({selectedNode.action}, {selectedNode.confidence}%)</span>
        </div>
        {#if selectedNode.sampleValue}
          <div class="text-[10px] text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-900 rounded-lg p-2 font-mono">{selectedNode.sampleValue}</div>
        {:else}
          <div class="text-[10px] text-surface-400 italic">No sample data — click Import to see transformed values</div>
        {/if}
      </div>
    {/if}
  {:else if showPreview && Object.keys(previewData).length > 0}
    <div class="rounded-xl border border-tertiary-500/30 bg-tertiary-500/5 p-3 space-y-1">
      <div class="flex items-center gap-1.5 mb-2">
        <iconify-icon icon="mdi:eye-outline" width="14" class="text-tertiary-500"></iconify-icon>
        <span class="text-[10px] font-bold uppercase text-tertiary-500">Preview</span>
        <span class="text-[9px] text-surface-400">(click a mapping node for details)</span>
      </div>
    </div>
  {/if}

  <!-- Tree -->
  <div class="space-y-0.5">
    {#each nodes as node (node.id)}
      {@render TreeNode({ node, recommendations, onActionChange, selectNode, selectedNodeId: selectedNodeId ?? '' })}
    {/each}
  </div>
</div>

<!-- ================================================================ -->
<!-- Recursive Node (open state on MappingNode, not snippet $state)    -->
<!-- ================================================================ -->
{#snippet TreeNode(props: { node: MappingNode; recommendations: any[]; onActionChange?: any; selectNode?: any; selectedNodeId?: string })}
  {@const { node, recommendations, onActionChange, selectNode, selectedNodeId } = props}
  {@const isOpen = node.open ?? true}
  {@const isSelected = node.id === selectedNodeId}
  {@const nodeRecommendations = recommendations.filter((r: any) =>
    r.affectedFields?.some((f: string) => f === node.label || node.label.includes(f) || f.includes(node.label))
  )}

  <div
    class="relative my-1 ms-4 ps-4 border-s border-surface-200 dark:border-surface-800 transition-colors"
    class:border-tertiary-500={isSelected}
    role="treeitem"
    aria-selected={isSelected}
  >
    <div
      class="flex flex-col gap-1.5 p-2.5 border rounded-lg transition shadow-xs cursor-pointer {isSelected ? 'bg-tertiary-50 dark:bg-tertiary-500/10 border-tertiary-500' : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800'} {node.confidence < 50 && !isSelected ? 'border-warning-500' : ''}"
      onclick={() => selectNode?.(node)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode?.(node); } }}
      tabindex="0"
      role="button"
      aria-label="{node.label} — {node.confidence}% confidence, action: {node.action}"
    >
      <div class="flex items-center gap-2 min-w-0">
        <input type="checkbox" bind:checked={node.selected!} class="shrink-0 h-3.5 w-3.5 rounded border-surface-300 text-tertiary-500" aria-label="Select {node.label}" onclick={(e) => e.stopPropagation()} />

        {#if node.children && node.children.length > 0}
          <button
            onclick={(e) => { e.stopPropagation(); node.open = !isOpen; }}
            class="flex shrink-0 items-center justify-center h-5 w-5 rounded-md hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-400 transition"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <iconify-icon icon={isOpen ? 'mdi:chevron-down' : 'mdi:chevron-right'} width="14"></iconify-icon>
          </button>
        {/if}

        <iconify-icon icon={confidenceIcon(node.confidence)} width="12" class="shrink-0 {node.confidence >= 80 ? 'text-emerald-500' : node.confidence >= 50 ? 'text-amber-500' : 'text-rose-500'}" aria-hidden="true"></iconify-icon>
        <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full border shrink-0 {typeColors[node.type]}">{node.type.replace('_', ' ')}</span>
        <span class="font-semibold text-xs text-surface-800 dark:text-surface-100 truncate flex-1">{node.label}</span>

        {#if node.aiSuggestion}
          <span class="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border {node.aiSuggestion.level === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}" title={node.aiSuggestion.message}>AI</span>
        {/if}

        {#if node.sampleValue}
          <span class="text-[9px] text-surface-400 italic truncate max-w-20" title={node.sampleValue}>{node.sampleValue.slice(0, 20)}{node.sampleValue.length > 20 ? '…' : ''}</span>
        {/if}

        <span class="shrink-0 text-[10px] font-mono border px-1.5 py-0.5 rounded-full {confidenceColor(node.confidence)}">{node.confidence}%</span>
      </div>

      <div role="presentation" class="flex items-center gap-1.5 ms-7" onclick={(e) => e.stopPropagation()}>
        <span class="text-[10px] text-surface-400 shrink-0">→</span>
        <input type="text" bind:value={node.suggestedTarget} class="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-md px-1.5 py-0.5 text-[10px] font-mono text-surface-700 dark:text-surface-300 focus:outline-none focus:border-tertiary-500 w-24" aria-label="Target for {node.label}" />
        <select aria-label="Action" value={node.action} onchange={(e) => { node.action = (e.target as HTMLSelectElement).value as any; onActionChange?.(node.id, node.action); }} class="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 text-[10px] rounded-md px-1.5 py-0.5 text-surface-600 focus:outline-none">
          <option value="map">Map</option>
          <option value="split">Split</option>
          <option value="merge">Merge</option>
          <option value="transform">Xform</option>
          <option value="enrich">✨AI</option>
          <option value="relink">Link</option>
          <option value="filter">Filter</option>
          <option value="ignore">Skip</option>
        </select>
      </div>

      {#if nodeRecommendations.length > 0}
        <div class="flex flex-wrap gap-1 ms-7">
          {#each nodeRecommendations as rec (rec.title)}
            <div class="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 {rec.level === 'critical' ? 'bg-rose-500/5 text-rose-500 border-rose-500/20' : 'bg-amber-500/5 text-amber-500 border-amber-500/20'}" title={rec.description}>
              <iconify-icon icon={rec.level === 'critical' ? 'mdi:alert-octagon' : 'mdi:lightbulb'} width="10"></iconify-icon>
              {rec.title}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if node.children && node.children.length > 0 && isOpen}
      <div transition:slide={{ duration: 120 }} class="mt-0.5">
        {#each node.children as child (child.id)}
          {@render TreeNode({ node: child, recommendations, onActionChange, selectNode, selectedNodeId: selectedNodeId ?? '' })}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

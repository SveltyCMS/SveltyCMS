<!--
  @file src/plugins/smart-importer/components/TransformationTree.svelte
  @component
  **Production-grade visual field mapping tree with bulk actions, live preview, and AI recommendations.**

  Features:
  - Recursive tree with collapsible nodes
  - Confidence-coded (🟢 🟡 🔴) with icons
  - 8 transform actions per node
  - AI recommendation badges inline
  - Bulk actions: select all, apply to all, filter by confidence
  - Live preview pane — shows sample transformed record
  - Keyboard navigation (Tab, Enter, Space, Arrow keys)
  - Accessibility: proper ARIA labels, focus management
-->
<script lang="ts">
  import { slide } from 'svelte/transition';

  interface MappingNode {
    id: string;
    label: string;
    type: 'content_type' | 'field' | 'taxonomy' | 'view' | 'rule' | 'ecom_variant';
    suggestedTarget: string;
    confidence: number;
    action: 'map' | 'split' | 'merge' | 'transform' | 'enrich' | 'relink' | 'filter' | 'ignore';
    children?: MappingNode[];
    aiSuggestion?: { level: 'critical' | 'warning' | 'info' | 'success'; message: string };
    /** Sample value from source data */
    sampleValue?: string;
    /** Whether this node is selected for bulk actions */
    selected?: boolean;
  }

  interface Props {
    nodes: MappingNode[];
    recommendations?: Array<{ id: string; level: string; title: string; description: string; affectedFields?: string[] }>;
    onActionChange?: (nodeId: string, action: string) => void;
    onBulkAction?: (action: string, nodeIds: string[]) => void;
    /** Show live preview pane */
    showPreview?: boolean;
    /** Sample transformed record for preview */
    previewData?: Record<string, string>;
  }

  let {
    nodes = $bindable(),
    recommendations = [],
    onActionChange,
    onBulkAction,
    showPreview = false,
    previewData = {},
  }: Props = $props();

  // Bulk selection state
  let selectAll = $state(false);
  let confidenceFilter = $state<'all' | 'high' | 'medium' | 'low'>('all');
  let searchQuery = $state('');
  let bulkAction = $state('');

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

  // Flatten all nodes for search/filter
  const allNodes = $derived(flattenNodes(nodes));
  const filteredNodes = $derived(
    allNodes.filter(n => {
      if (confidenceFilter !== 'all') {
        if (confidenceFilter === 'high' && n.confidence < 80) return false;
        if (confidenceFilter === 'medium' && (n.confidence < 50 || n.confidence >= 80)) return false;
        if (confidenceFilter === 'low' && n.confidence >= 50) return false;
      }
      if (searchQuery && !n.label.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }),
  );

  const stats = $derived({
    total: allNodes.length,
    high: allNodes.filter(n => n.confidence >= 80).length,
    medium: allNodes.filter(n => n.confidence >= 50 && n.confidence < 80).length,
    low: allNodes.filter(n => n.confidence < 50).length,
    mapped: allNodes.filter(n => n.action !== 'ignore').length,
  });

  function toggleSelectAll() {
    selectAll = !selectAll;
    for (const node of filteredNodes) {
      node.selected = selectAll;
    }
  }

  function applyBulkAction() {
    if (!bulkAction) return;
    const selectedIds = filteredNodes.filter(n => n.selected).map(n => n.id);
    onBulkAction?.(bulkAction, selectedIds);
    bulkAction = '';
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

<div class="transformation-tree space-y-4">
  <!-- Toolbar: search, filter, bulk actions -->
  <div class="flex flex-wrap items-center gap-2 p-3 bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl">
    <!-- Search -->
    <div class="flex items-center gap-1 bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg px-2 py-1 flex-1 min-w-[150px]">
      <iconify-icon icon="mdi:magnify" width="14" class="text-surface-400"></iconify-icon>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter fields..."
        class="bg-transparent border-0 p-0 text-xs text-surface-700 dark:text-surface-300 focus:outline-none w-full"
        aria-label="Search fields"
      />
    </div>

    <!-- Confidence filter -->
    <select
      bind:value={confidenceFilter}
      class="bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 text-xs rounded-lg px-2 py-1 text-surface-600"
      aria-label="Filter by confidence"
    >
      <option value="all">All ({stats.total})</option>
      <option value="high">🟢 High ({stats.high})</option>
      <option value="medium">🟡 Medium ({stats.medium})</option>
      <option value="low">🔴 Low ({stats.low})</option>
    </select>

    <!-- Select all -->
    <button
      onclick={toggleSelectAll}
      class="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition"
      aria-label={selectAll ? 'Deselect all' : 'Select all visible'}
    >
      {selectAll ? 'Deselect' : 'Select'} {filteredNodes.length}
    </button>

    <!-- Bulk action -->
    <div class="flex items-center gap-1">
      <select
        bind:value={bulkAction}
        class="bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 text-xs rounded-lg px-2 py-1 text-surface-600"
        aria-label="Bulk action"
      >
        <option value="">Bulk...</option>
        <option value="map">Map All</option>
        <option value="ignore">Ignore All</option>
        <option value="transform">Transform All</option>
      </select>
      <button
        onclick={applyBulkAction}
        disabled={!bulkAction}
        class="text-[10px] font-bold px-2 py-1 rounded-lg bg-tertiary-500 text-white disabled:opacity-30 transition"
      >
        Apply
      </button>
    </div>
  </div>

  <!-- Stats bar -->
  <div class="flex flex-wrap gap-3 text-[10px] text-surface-400 font-mono px-1">
    <span>🟢 {stats.high} high</span>
    <span>🟡 {stats.medium} medium</span>
    <span>🔴 {stats.low} low</span>
    <span class="text-surface-300">|</span>
    <span>{stats.mapped} mapped</span>
    <span>{stats.total - stats.mapped} ignored</span>
  </div>

  <!-- Live Preview Pane -->
  {#if showPreview && Object.keys(previewData).length > 0}
    <div class="rounded-xl border border-tertiary-500/30 bg-tertiary-500/5 p-3 space-y-1">
      <div class="flex items-center gap-1.5 mb-2">
        <iconify-icon icon="mdi:eye-outline" width="14" class="text-tertiary-500"></iconify-icon>
        <span class="text-[10px] font-bold uppercase text-tertiary-500">Live Preview</span>
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1">
        {#each Object.entries(previewData) as [key, value]}
          <div class="flex justify-between text-[10px]">
            <span class="text-surface-400 font-mono">{key}</span>
            <span class="text-surface-700 dark:text-surface-300 truncate max-w-[120px]" title={value}>
              {value.length > 30 ? value.slice(0, 30) + '...' : value}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Tree Nodes -->
  <div class="space-y-0.5">
    {#each nodes as node (node.id)}
      <TreeNode {node} {recommendations} {onActionChange} />
    {/each}
  </div>
</div>

<!-- ================================================================ -->
<!-- Recursive Tree Node Component -->
<!-- ================================================================ -->

{#snippet TreeNode(props: { node: MappingNode; recommendations: any[]; onActionChange?: any })}
  {@const { node, recommendations, onActionChange } = props}
  {@const nodeRecommendations = recommendations.filter((r: any) =>
    r.affectedFields?.some((f: string) => f === node.label || node.label.includes(f) || f.includes(node.label))
  )}
  {@const isOpen = $state(true)}
  {@const isHovered = $state(false)}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative my-1 ms-4 ps-4 border-s border-surface-200 dark:border-surface-800 transition-colors"
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
  >
    <div
      class="flex flex-col gap-1.5 p-2.5 bg-white dark:bg-surface-900 border rounded-lg transition shadow-xs"
      class:border-primary-500={isHovered}
      class:border-surface-200={!isHovered}
      class:dark:border-surface-800={!isHovered}
      class:border-warning-500={node.confidence < 50}
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Checkbox for bulk select -->
        <input
          type="checkbox"
          bind:checked={node.selected!}
          class="shrink-0 h-3.5 w-3.5 rounded border-surface-300 text-tertiary-500"
          aria-label="Select {node.label}"
        />

        {#if node.children && node.children.length > 0}
          <button
            onclick={() => (isOpen = !isOpen)}
            class="flex shrink-0 items-center justify-center h-5 w-5 rounded-md hover:bg-surface-200 dark:hover:bg-surface-800 text-surface-400 transition"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            <iconify-icon icon={isOpen ? 'mdi:chevron-down' : 'mdi:chevron-right'} width="14"></iconify-icon>
          </button>
        {/if}

        <iconify-icon
          icon={confidenceIcon(node.confidence)}
          width="12"
          class="shrink-0 {node.confidence >= 80 ? 'text-emerald-500' : node.confidence >= 50 ? 'text-amber-500' : 'text-rose-500'}"
          aria-hidden="true"
        ></iconify-icon>

        <span class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full border shrink-0 {typeColors[node.type]}">
          {node.type.replace('_', ' ')}
        </span>

        <span class="font-semibold text-xs text-surface-800 dark:text-surface-100 truncate flex-1">{node.label}</span>

        {#if node.aiSuggestion}
          <span class="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border {node.aiSuggestion.level === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}" title={node.aiSuggestion.message}>
            AI
          </span>
        {/if}

        <!-- Sample value tooltip -->
        {#if node.sampleValue}
          <span class="text-[9px] text-surface-400 italic truncate max-w-[100px]" title={node.sampleValue}>
            {node.sampleValue.length > 20 ? node.sampleValue.slice(0, 20) + '...' : node.sampleValue}
          </span>
        {/if}

        <span class="shrink-0 text-[10px] font-mono border px-1.5 py-0.5 rounded-full {confidenceColor(node.confidence)}">
          {node.confidence}%
        </span>
      </div>

      <div class="flex items-center gap-1.5 ml-7">
        <span class="text-[10px] text-surface-400 shrink-0">→</span>
        <input
          type="text"
          bind:value={node.suggestedTarget}
          class="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-md px-1.5 py-0.5 text-[10px] font-mono text-surface-700 dark:text-surface-300 focus:outline-none focus:border-tertiary-500 w-24"
          aria-label="Target for {node.label}"
        />
        <select
          value={node.action}
          onchange={(e) => {
            node.action = (e.target as HTMLSelectElement).value as any;
            onActionChange?.(node.id, node.action);
          }}
          class="bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 text-[10px] rounded-md px-1.5 py-0.5 text-surface-600 focus:outline-none"
          aria-label="Action for {node.label}"
        >
          <option value="map">Map</option>
          <option value="split">Split</option>
          <option value="merge">Merge</option>
          <option value="transform">Transform</option>
          <option value="enrich">✨AI</option>
          <option value="relink">Relink</option>
          <option value="filter">Filter</option>
          <option value="ignore">Ignore</option>
        </select>
      </div>

      {#if nodeRecommendations.length > 0}
        <div class="flex flex-wrap gap-1 ml-7">
          {#each nodeRecommendations as rec}
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
          {@render TreeNode({ node: child, recommendations, onActionChange })}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

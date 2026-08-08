<!-- 
@file src/components/ui/smart-table/smart-table-saved-views-bar.svelte
@component
**Saved Views Quick Chips Bar**

### Features:
- One-click saved view selection bar
- WCAG 2.2 AA compliant focus rings & keyboard handlers
- Displays active view indicator chip
-->

<script lang="ts">
  import type { SmartTableSavedView } from "@utils/smart-table-saved-views";

  let {
    views = [],
    activeViewId = null,
    onSelectView,
    class: className = "",
  }: {
    views: SmartTableSavedView[];
    activeViewId?: string | null;
    onSelectView?: (view: SmartTableSavedView) => void;
    class?: string;
  } = $props();
</script>

{#if views.length > 0}
  <div class="flex items-center gap-1.5 overflow-x-auto py-1 ps-1 pe-1 {className}" role="region" aria-label="Saved views presets">
    <span class="text-xs font-semibold text-muted-foreground me-1">Views:</span>
    {#each views as view (view.id)}
      {@const isActive = activeViewId === view.id}
      <button
        type="button"
        aria-pressed={isActive}
        onclick={() => onSelectView?.(view)}
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {isActive ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'}"
      >
        <span>{view.name}</span>
      </button>
    {/each}
  </div>
{/if}

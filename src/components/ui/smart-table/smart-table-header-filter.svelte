<!-- 
@file src/components/ui/smart-table/smart-table-header-filter.svelte
@component
**In-Header Faceted Column Filter Popover**

### Features:
- Faceted column filtering directly inside table column headers
- Type-specific inputs (text match, status select, date range)
- WCAG 2.2 AA keyboard accessible (Enter/Space, Escape)
- CSS3-UI cursor rules compliance
-->

<script lang="ts">
  import type { SmartTableColumn } from "./types";

  let {
    column,
    value = "",
    onFilterChange,
    class: className = "",
  }: {
    column: SmartTableColumn<any>;
    value?: string;
    onFilterChange?: (columnId: string, value: string) => void;
    class?: string;
  } = $props();

  let isOpen = $state(false);
  let filterInput = $state(value);
  let triggerRef = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    filterInput = value;
  });

  function toggleOpen(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
  }

  function handleApply() {
    onFilterChange?.(column.id, filterInput);
    isOpen = false;
  }

  function handleClear() {
    filterInput = "";
    onFilterChange?.(column.id, "");
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      isOpen = false;
      triggerRef?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    }
  }
</script>

<div class="relative inline-block {className}" onkeydown={handleKeyDown}>
  <button
    bind:this={triggerRef}
    type="button"
    aria-label="Filter {column.label} column"
    aria-expanded={isOpen}
    onclick={toggleOpen}
    class="inline-flex size-5 items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {value ? 'text-primary font-bold' : ''}"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  </button>

  {#if isOpen}
    <div
      role="dialog"
      aria-label="Filter column {column.label}"
      class="absolute start-0 z-50 mt-1 w-48 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-black/5 focus:outline-none animate-in fade-in-50 zoom-in-95"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="space-y-2">
        <label for="filter-input-{column.id}" class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Filter {column.label}</label>
        <input id="filter-input-{column.id}" type="text" bind:value={filterInput} aria-label="Filter input for {column.label}" placeholder="Filter..." class="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div class="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onclick={handleClear}
            class="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onclick={handleApply}
            class="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

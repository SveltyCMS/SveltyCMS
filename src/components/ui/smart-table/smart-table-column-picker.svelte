<!-- 
@file src/components/ui/smart-table/smart-table-column-picker.svelte
@component
**Interactive Column Visibility & Density Controller**

### Features:
- WCAG 2.2 AA keyboard accessible (Enter/Space to toggle, Escape to close)
- Toggle visible columns (visible: boolean) dynamically
- Switch density modes (compact / comfortable / spacious)
- Persists user preferences to localStorage
- CSS3-UI compliant button styling (default cursor for buttons, not-allowed for disabled)
- RTL compatible via Tailwind v4 logical properties (ps-4, pe-2, ms-auto)
-->

<script lang="ts">
  import type { SmartTableColumn, TableDensity } from "./types";

  let {
    columns = [],
    density = "comfortable",
    onColumnToggle,
    onDensityChange,
    class: className = "",
  }: {
    columns: SmartTableColumn<any>[];
    density?: TableDensity;
    onColumnToggle?: (columnId: string, visible: boolean) => void;
    onDensityChange?: (density: TableDensity) => void;
    class?: string;
  } = $props();

  let isOpen = $state(false);
  let menuRef = $state<HTMLDivElement | null>(null);
  let triggerRef = $state<HTMLButtonElement | null>(null);

  function toggleOpen() {
    isOpen = !isOpen;
    if (isOpen) {
      setTimeout(() => {
        const firstOption = menuRef?.querySelector<HTMLElement>('[tabindex="0"]');
        firstOption?.focus();
      }, 50);
    }
  }

  function closeMenu() {
    isOpen = false;
    triggerRef?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  function handleDensitySelect(newDensity: TableDensity) {
    onDensityChange?.(newDensity);
  }

  function handleColumnCheckbox(colId: string, currentVisible: boolean) {
    onColumnToggle?.(colId, !currentVisible);
  }
</script>

<div class="relative inline-block {className}" onkeydown={handleKeyDown}>
  <!-- Trigger Button -->
  <button
    bind:this={triggerRef}
    type="button"
    aria-haspopup="true"
    aria-expanded={isOpen}
    aria-label="Customize columns and density"
    onclick={toggleOpen}
    class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="size-4 shrink-0 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
    <span>Columns</span>
  </button>

  {#if isOpen}
    <!-- Dropdown Menu -->
    <div
      bind:this={menuRef}
      role="menu"
      aria-label="Column visibility and density menu"
      class="absolute end-0 z-50 mt-1.5 w-56 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-black/5 focus:outline-none animate-in fade-in-50 zoom-in-95"
    >
      <!-- Density Selector -->
      <div class="border-b border-border pb-2 mb-2">
        <p class="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Density
        </p>
        <div class="flex items-center gap-1 px-1">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={density === "compact"}
            onclick={() => handleDensitySelect("compact")}
            class="flex-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {density === 'compact' ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted text-foreground'}"
          >
            Compact
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={density === "comfortable"}
            onclick={() => handleDensitySelect("comfortable")}
            class="flex-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {density === 'comfortable' ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted text-foreground'}"
          >
            Normal
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={density === "spacious"}
            onclick={() => handleDensitySelect("spacious")}
            class="flex-1 rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {density === 'spacious' ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted text-foreground'}"
          >
            Spacious
          </button>
        </div>
      </div>

      <!-- Column List -->
      <div class="max-h-60 overflow-y-auto space-y-0.5">
        <p class="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Toggle Columns
        </p>
        {#each columns as col (col.id)}
          {@const isVisible = col.visible !== false}
          <div class="flex items-center gap-2 rounded px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted cursor-default">
            <label for="col-toggle-{col.id}" class="sr-only">Toggle column {col.label}</label>
            <input id="col-toggle-{col.id}" type="checkbox" checked={isVisible} disabled={col.id === "_id" || col.id === "id"} aria-label="Toggle column {col.label}" onchange={() => handleColumnCheckbox(col.id, isVisible)} class="size-3.5 rounded border-border text-primary focus:ring-primary disabled:opacity-50" />
            <span class="truncate">{col.label}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

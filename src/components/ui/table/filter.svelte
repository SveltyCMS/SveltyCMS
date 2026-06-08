<!--
@file src/components/ui/table/filter.svelte
@component
**SveltyCMS Table Filter Toolbar — WCAG 3.0 Ready**

Table toolbar with search input, density toggle, filter and action buttons.
Designed as a companion to the Table component's `header` snippet.

### Props
- `search` (string): Bindable search query.
- `globalSearchValue` (string): Bindable synced search value.
- `density` ('compact' | 'normal' | 'comfortable'): Bindable density state.
- `showSearch` (boolean): Toggle search input visibility.
- `onfilter` (function): Callback on search input.
- `children` (Snippet): Additional filter controls slot.

### Features:
- search input with clear button and focus animation
- density cycle button with icon per density level
- WCAG 3.0 ready with aria-label on clear and toggle buttons
- full Svelte 5 runes: $props, $bindable, $derived, $effect
-->

<script lang="ts">
import Button from '../button.svelte';

let {
    search = $bindable(''),
    globalSearchValue = $bindable(''),
    density = $bindable('normal'),
    showSearch = $bindable(true),
    filterShow = $bindable(false),
    columnShow = $bindable(false),
    onfilter,
    children
}: {
    search?: string;
    globalSearchValue?: string;
    density?: 'compact' | 'normal' | 'comfortable';
    showSearch?: boolean;
    filterShow?: boolean;
    columnShow?: boolean;
    onfilter?: () => void;
    children?: import('svelte').Snippet;
} = $props();

// Synchronize search and globalSearchValue
$effect(() => {
    if (globalSearchValue !== search) search = globalSearchValue;
});
$effect(() => {
    if (search !== globalSearchValue) globalSearchValue = search;
});

const densities = ['compact', 'normal', 'comfortable'] as const;

function cycleDensity() {
    const idx = densities.indexOf(density as any);
    density = densities[(idx + 1) % densities.length];
}

const densityIcon = $derived.by(() => {
    switch(density) {
        case 'compact': return 'mingcute:rows-4-line';
        case 'comfortable': return 'mingcute:rows-1-line';
        default: return 'mingcute:rows-3-line';
    }
});
</script>

<div class="flex items-center justify-between gap-4 p-4 border-b border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50">
    <div class="flex-1 flex items-center gap-2 max-w-md">
        {#if showSearch}
            <div class="relative w-full group">
                <iconify-icon
                    icon="mingcute:search-line"
                    width="18"
                    class="absolute inset-s-3 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-tertiary-500 dark:text-primary-500 transition-colors"
                ></iconify-icon>
                <input
                    type="text"
                    bind:value={search}
                    oninput={onfilter}
                    placeholder="Search records..."
                    class="w-full bg-white border border-surface-200  rounded-xl py-2 ps-10 pe-4 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-tertiary-500 dark:border-primary-500 outline-none transition-all shadow-xs"
                />
                {#if search}
                    <button
                        class="absolute inset-e-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-error-500 transition-colors"
                        onclick={() => { search = ''; onfilter?.(); }}
                        aria-label="Clear Search"
                    >
                        <iconify-icon icon="mingcute:close-circle-line" width="16"></iconify-icon>
                    </button>
                {/if}
            </div>
        {/if}

        {@render children?.()}
    </div>

    <div class="flex items-center gap-2">
        <Button
            variant="outline"
            size="sm"
            leadingIcon={densityIcon}
            onclick={cycleDensity}
            title={`Density: ${density}`}
            aria-label={`Density: ${density}`}
        />
        <Button
            variant="outline"
            size="sm"
            leadingIcon="mingcute:filter-3-line"
            class="hidden sm:inline-flex"
        >
            Filters
        </Button>
        <Button
            variant="primary"
            size="sm"
            leadingIcon="mingcute:add-line"
        >
            New
        </Button>
    </div>
</div>

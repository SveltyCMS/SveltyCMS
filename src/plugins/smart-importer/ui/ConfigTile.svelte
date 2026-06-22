<!--
  @file src/plugins/smart-importer/ui/ConfigTile.svelte
  @component
  **Config grid tile for Smart AI-Driven Migration Pro.**
  Opens the plugin workspace slot — no dedicated route.

  ### Features:
  - Slot-driven launcher (plugin_workspace overlay)
  - Keyboard-accessible with focus-visible ring
  - Pro/Free badge
-->
<script lang="ts">
  import { pluginWorkspace } from '@stores/plugin-workspace.svelte';

  interface Props {
    pluginId?: string;
    isPro?: boolean;
    enabled?: boolean;
    subtitle?: string;
  }

  let {
    pluginId = 'smart-importer',
    isPro = false,
    enabled = true,
    subtitle = '36+ platforms • AI mapping • Background jobs',
  }: Props = $props();

  function openWorkspace() {
    if (!enabled) return;
    pluginWorkspace.open(pluginId);
  }
</script>

<button
  type="button"
  onclick={openWorkspace}
  class="group flex h-24 w-full flex-col items-center justify-center gap-2 rounded border border-surface-200 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out
         hover:-translate-y-1 hover:border-tertiary-500 hover:bg-primary-50 hover:shadow-xl
         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tertiary-500 focus-visible:ring-offset-2
         dark:bg-surface-800 dark:border-surface-700 dark:hover:border-tertiary-500 dark:hover:bg-surface-700
         lg:h-32
         {enabled ? '' : 'pointer-events-none opacity-60 grayscale'}"
  aria-label="Open Smart AI-Driven Migration Pro — migrate content from 36+ CMS platforms"
  aria-disabled={!enabled}
>
  <iconify-icon
    icon="mdi:database-import-outline"
    class="text-3xl lg:text-4xl text-tertiary-500 transition-transform duration-300 group-hover:scale-110"
  ></iconify-icon>

  <div class="flex flex-col items-center gap-0.5">
    <p class="w-full truncate text-xs font-medium uppercase tracking-wide text-surface-600 group-hover:text-tertiary-600 dark:text-primary-500 dark:group-hover:text-tertiary-500 lg:text-sm">
      Migration
    </p>

    {#if subtitle}
      <p class="text-[9px] text-surface-400 dark:text-surface-500 line-clamp-1">
        {subtitle}
      </p>
    {/if}

    {#if isPro}
      <span class="mt-0.5 text-[9px] px-2 py-px rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold tracking-wider">
        PRO
      </span>
    {:else}
      <span class="mt-0.5 text-[9px] px-2 py-px rounded-full bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400 font-medium">
        Free
      </span>
    {/if}
  </div>
</button>
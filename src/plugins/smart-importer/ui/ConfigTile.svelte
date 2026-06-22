<!--
  @file src/plugins/smart-importer/ui/ConfigTile.svelte
  @component
  **Config grid tile for Smart AI-Driven Migration Pro.**
  Rendered conditionally in the config page when the plugin is enabled.
-->
<script lang="ts">
  import { slide } from 'svelte/transition';

  interface Props {
    /** Whether Pro license is active */
    isPro?: boolean;
    /** Plugin enabled state */
    enabled?: boolean;
  }

  let { isPro = false, enabled = true }: Props = $props();
</script>

<a
  href="/config/migration"
  class="group flex h-24 flex-col items-center justify-center gap-2 rounded border border-surface-200 bg-white p-2 text-center shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:border-tertiary-500 hover:bg-primary-50 hover:shadow-xl dark:bg-surface-800 dark:hover:border-tertiary-500 dark:border-primary-500 dark:hover:bg-surface-700 lg:h-32"
  aria-label="Migration — Smart AI-driven content migration from 36+ CMS platforms"
  data-sveltekit-preload-data="hover"
>
  <iconify-icon
    icon="mdi:database-import-outline"
    class="text-3xl lg:text-4xl text-tertiary-500 transition-transform duration-300 group-hover:scale-110"
  ></iconify-icon>
  <div class="flex flex-col items-center gap-0.5">
    <p class="text-xs font-medium uppercase tracking-wide text-surface-600 group-hover:text-tertiary-600 dark:text-primary-600 dark:group-hover:text-tertiary-500 lg:text-sm">
      Migration
    </p>
    {#if isPro}
      <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold">PRO</span>
    {:else}
      <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-400 dark:bg-surface-800 dark:text-surface-500">Free</span>
    {/if}
  </div>
</a>

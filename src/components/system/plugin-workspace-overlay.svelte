<!--
 @file src/components/system/plugin-workspace-overlay.svelte
 @component Fullscreen overlay that renders the active plugin_workspace slot.
-->

<script lang="ts">
  import { ensurePluginsScanned } from '@src/plugins';
  ensurePluginsScanned();
  import Slot from '@components/system/slot.svelte';
  import { pluginWorkspace } from '@stores/plugin-workspace.svelte';
  import { onMount } from 'svelte';

  onMount(() => {
    pluginWorkspace.syncFromUrl();
  });
</script>

{#if pluginWorkspace.activePluginId}
  <div
    class="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white dark:bg-surface-900"
    role="dialog"
    aria-modal="true"
    aria-label="Plugin workspace"
  >
    <Slot
      name="plugin_workspace"
      props={{ activePluginId: pluginWorkspace.activePluginId }}
    />
  </div>
{/if}
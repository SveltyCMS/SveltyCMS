<!--
@file src/components/site/site-preview-bridge.svelte
@component
**Live preview bridge for the site starter** — connects iframe to CMS postMessage protocol.

### Props
- `entry` (Record): Current page entry data to sync.
- `collection` (string): Collection name (default: pages).
- `enabled` (boolean): Enable bridge (default: true in iframe).
-->

<script lang="ts">
	import { onMount } from 'svelte';
  import type { SitePage } from "@src/services/site/types";
  import { createSitePreviewBridge, postPreviewSave } from "@utils/site-preview-bridge";

  interface Props {
    entry?: SitePage | Record<string, unknown> | null;
    collection?: string;
    enabled?: boolean;
  }

  let {
    entry = $bindable<SitePage | Record<string, unknown> | null>(null),
    collection = "pages",
    enabled = true,
  }: Props = $props();

  let bridgeActive = $state(false);

  onMount(() => {
    if (!enabled) return;

    const inFrame = window.parent !== window;
    if (!inFrame && !new URLSearchParams(window.location.search).has("preview_token")) {
      return;
    }

    const bridge = createSitePreviewBridge({
      visualEditing: inFrame,
      onUpdate: (data) => {
        entry = { ...(entry as Record<string, unknown>), ...data };
      },
      onPreviewSave: (data) => {
        const merged = { ...(entry as Record<string, unknown>), ...data };
        entry = merged;
        postPreviewSave(collection, merged);
      },
    });

    bridgeActive = true;

    return () => {
      bridge.destroy();
      bridgeActive = false;
    };
  });
</script>

{#if bridgeActive}
  <div
    class="pointer-events-none fixed bottom-3 end-3 z-50 rounded-full bg-primary-500/90 px-3 py-1 text-xs font-medium text-white shadow-lg"
    role="status"
    aria-live="polite"
  >
    Live preview connected
  </div>
{/if}
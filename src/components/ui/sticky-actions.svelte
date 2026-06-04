<!--
@file src/components/ui/sticky-actions.svelte
@component
**StickyActions — Registers page action buttons into the layout's sticky bar.**

Wrap your save/delete/reset buttons in this component. When the active theme
has `features.stickyActionBar` enabled, the buttons appear in both their
original position AND the sticky bar at the bottom of the viewport.

@example
<StickyActions>
  <Button variant="primary" onclick={save}>Save</Button>
  <Button variant="ghost" onclick={reset}>Reset</Button>
</StickyActions>
-->
<script lang="ts">
  import { ui } from "@src/stores/ui-store.svelte";
  import { onMount } from "svelte";

  let { children }: { children: import("svelte").Snippet } = $props();

  onMount(() => {
    ui.stickyActionContent = children;
    return () => {
      ui.stickyActionContent = null;
    };
  });
</script>

{@render children()}

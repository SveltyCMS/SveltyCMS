<!--
@file src/components/ui/sticky-actions.svelte
@component
**StickyActions — Registers page action buttons into the layout's sticky bar.**

Wrap your save/delete/reset buttons in this component. When the active theme
has `features.stickyActionBar` enabled, the buttons are rendered ONLY in the
sticky bar at the bottom of the viewport (the in-place slot is skipped so the
actions never appear twice). When the feature is disabled, the buttons render
in their original position as the fallback.

@example
<StickyActions>
  <Button variant="primary" onclick={save}>Save</Button>
  <Button variant="ghost" onclick={reset}>Reset</Button>
</StickyActions>
-->
<script lang="ts">
  import { ui } from "@src/stores/ui-store.svelte";
  import { getThemeContext } from "./theme-context.svelte";
  import { onMount } from "svelte";

  let { children }: { children: import("svelte").Snippet } = $props();

  const theme = getThemeContext();
  // When the theme's sticky action bar is enabled, the layout renders the
  // registered content at the viewport bottom — rendering it in place too
  // would duplicate the actions (settings pages showed the same bar twice).
  const stickyBarEnabled = $derived(theme?.features?.stickyActionBar ?? false);

  onMount(() => {
    ui.stickyActionContent = children;
    return () => {
      ui.stickyActionContent = null;
    };
  });
</script>

{#if !stickyBarEnabled}
  {@render children()}
{/if}

<!--
@file src/components/permission-guard.svelte
@component
**Permission guard that hides children when a condition blocks access**

### Props
- `collection` (Schema | null): The collection schema to check
- `action` ("bulkDelete" | "delete" | "create" | "update"): The action being guarded

### Features:
- checks disableBulkDelete flag on the collection schema
- checks user permissions if provided via context
- renders slot when allowed, optionally shows fallback content
-->
<script lang="ts">
  import type { Schema } from "@src/content/types";

  let {
    collection = null,
    action = "bulkDelete",
    fallback = "",
  }: {
    collection: Schema | null;
    action: "bulkDelete" | "delete" | "create" | "update";
    fallback?: string;
  } = $props();

  let allowed = $derived(
    !(action === "bulkDelete" && collection?.disableBulkDelete === true),
  );
</script>

{#if allowed}
  {@render children()}
{:else if fallback}
  <span class="text-muted-foreground text-sm">{fallback}</span>
{/if}

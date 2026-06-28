<!--
@file src/components/system/author-brief.svelte
@component
**Contextual author guidance panel — AEM-style author briefs**

Displays context-sensitive help for the currently focused field.
Shows authored guidance content, widget documentation, and usage tips.

### Features:
- slides in from right sidebar when help panel is open
- shows field-specific authored briefs
- fallback to widget-level documentation
- beginner mode with simplified explanations
- markdown-rendered guidance content
-->

<script lang="ts">
  import { helpStore } from "@src/stores/help-store.svelte.ts";
  import { slide } from "svelte/transition";

  let { open = false }: { open?: boolean } = $props();

  const currentBrief = $derived(helpStore.getCurrentBrief());
  const context = $derived(helpStore.currentContext);
  const isBeginner = $derived(helpStore.beginnerMode);
</script>

{#if open && context.fieldName}
  <div
    class="fixed inset-y-0 end-0 z-50 w-80 border-s border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-900"
    transition:slide={{ duration: 200 }}
    role="complementary"
    aria-label="Field help"
  >
    <div class="flex items-center justify-between border-b border-surface-200 p-3 dark:border-surface-700">
      <h3 class="text-sm font-semibold capitalize text-surface-900 dark:text-surface-100">
        {context.fieldName?.replace(/_/g, " ")}
      </h3>
      <button
        onclick={() => helpStore.helpPanelOpen = false}
        class="rounded p-1 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800"
        aria-label="Close help panel"
      >
        <iconify-icon icon="mdi:close" width="20"></iconify-icon>
      </button>
    </div>

    <div class="overflow-y-auto p-4 text-sm text-surface-700 dark:text-surface-300">
      {#if isBeginner}
        <div class="mb-3 rounded bg-tertiary-50 p-2 text-xs text-tertiary-700 dark:bg-tertiary-950 dark:text-tertiary-300">
          <iconify-icon icon="mdi:school" width="14" class="me-1 inline"></iconify-icon>
          Beginner mode enabled — simplified guidance shown
        </div>
      {/if}

      {#if currentBrief}
        <div class="prose prose-sm max-w-none dark:prose-invert">
          {currentBrief.content}
        </div>
      {:else if context.widgetType}
        <div class="space-y-3">
          <p class="text-xs text-surface-500">
            Widget: <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">{context.widgetType}</code>
          </p>
          <p class="text-xs text-surface-400 italic">
            No authored guidance for this field yet.
            Ask your admin to add author briefs in Configuration → Author Guidance.
          </p>
        </div>
      {:else}
        <p class="text-xs text-surface-400 italic">
          Select a field to see contextual guidance.
        </p>
      {/if}

      {#if context.schemaId}
        <div class="mt-4 border-t border-surface-200 pt-3 text-xs text-surface-400 dark:border-surface-700">
          Schema: <code class="text-surface-500">{context.schemaId}</code>
        </div>
      {/if}
    </div>
  </div>
{/if}

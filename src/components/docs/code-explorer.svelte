<!--
@file src/components/docs/code-explorer.svelte
@component
**Interactive multi-language code explorer for SveltyCMS documentation**

### Props
- `title` (string): Title of the snippet or example.
- `snippets` (Record<string, string>): Map of language keys (e.g. 'curl', 'typescript', 'graphql') to code string.
- `defaultLang` (string): Initial active language tab (default: first key).

### Features:
- Svelte 5 runes ($state, $props)
- One-click clipboard copy with visual feedback
- Fully accessible tabs with ARIA semantics
- Tailwind v4 theme-aware syntax presentation
-->

<script lang="ts">
  interface SnippetProps {
    title?: string;
    snippets: Record<string, string>;
    defaultLang?: string;
  }

  let { title = "Code Example", snippets = {}, defaultLang }: SnippetProps = $props();

  const availableLangs = $derived(Object.keys(snippets));
  let activeLang = $state<string>("");
  let copied = $state(false);

  $effect(() => {
    if (defaultLang && availableLangs.includes(defaultLang)) {
      activeLang = defaultLang;
    } else if (!availableLangs.includes(activeLang) && availableLangs.length > 0) {
      activeLang = availableLangs[0]!;
    }
  });

  const activeCode = $derived(snippets[activeLang] || "");

  async function copyToClipboard() {
    if (!activeCode) return;
    try {
      await navigator.clipboard.writeText(activeCode);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // Fallback
    }
  }

  const LANGUAGE_LABELS: Record<string, string> = {
    curl: "cURL",
    typescript: "TypeScript",
    javascript: "JavaScript",
    graphql: "GraphQL",
    python: "Python",
    bash: "Bash",
    json: "JSON",
  };
</script>

<div class="my-6 overflow-hidden rounded-xl border border-surface-200 bg-surface-950 text-surface-100 shadow-lg dark:border-surface-800">
  <!-- Header Bar -->
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-800 bg-surface-900/80 px-4 py-2.5">
    <div class="flex items-center gap-2">
      <span class="h-3 w-3 rounded-full bg-error-500/80"></span>
      <span class="h-3 w-3 rounded-full bg-warning-500/80"></span>
      <span class="h-3 w-3 rounded-full bg-success-500/80"></span>
      <span class="ms-2 text-xs font-semibold text-surface-300">{title}</span>
    </div>

    <div class="flex items-center gap-2">
      <!-- Language Tabs -->
      <div class="flex items-center gap-1 rounded-lg bg-surface-950/60 p-1" role="tablist" aria-label="Code language tabs">
        {#each availableLangs as lang (lang)}
          <button
            type="button"
            role="tab"
            aria-selected={activeLang === lang}
            tabindex={activeLang === lang ? 0 : -1}
            class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {activeLang === lang ? 'bg-primary-600 text-white shadow-sm' : 'text-surface-400 hover:text-surface-200'}"
            onclick={() => (activeLang = lang)}
          >
            {LANGUAGE_LABELS[lang] || lang.toUpperCase()}
          </button>
        {/each}
      </div>

      <!-- Copy Button -->
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 bg-surface-800/80 px-2.5 py-1 text-xs font-medium text-surface-300 transition-colors hover:border-surface-600 hover:bg-surface-700 hover:text-white"
        onclick={copyToClipboard}
        aria-label="Copy code to clipboard"
      >
        {#if copied}
          <span class="text-success-400">✓ Copied</span>
        {:else}
          <span>Copy</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Code Container -->
  <div class="overflow-x-auto p-4 font-mono text-sm leading-relaxed">
    <pre class="m-0 text-surface-100"><code>{activeCode}</code></pre>
  </div>
</div>

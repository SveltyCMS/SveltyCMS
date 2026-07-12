<!--
@file src/components/site/site-footer.svelte
@component Site starter footer.
-->

<script lang="ts">
  interface Props {
    siteName: string;
  }

  let { siteName }: Props = $props();
</script>

<footer class="mt-auto border-t border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-900">
  <div class="mx-auto max-w-6xl px-4 py-8 text-center text-sm text-surface-500 sm:px-6">
    <p>
      {siteName} — powered by
      <a href="https://sveltycms.com" class="text-primary-500 hover:underline">SveltyCMS</a>
    </p>
    <p class="mt-1 text-xs">Optional SvelteKit site starter · headless-ready</p>
  </div>
</footer>
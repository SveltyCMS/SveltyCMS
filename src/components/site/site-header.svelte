<!--
@file src/components/site/site-header.svelte
@component Site starter header with navigation and CMS login link.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
  interface Props {
    siteName: string;
  }

  let { siteName }: Props = $props();
</script>

<header class="border-b border-surface-200 bg-white/80 backdrop-blur dark:border-surface-700 dark:bg-surface-900/80">
  <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
    <a href="/" aria-label="{siteName} home" class="text-lg font-bold text-surface-900 dark:text-surface-50">
      {siteName}
    </a>
    <nav class="flex items-center gap-2" aria-label="Site navigation">
      <Button variant="ghost" size="sm" href="/about">About</Button>
      <Button variant="outline" size="sm" href="/login">CMS Login</Button>
    </nav>
  </div>
</header>
<!--
@file src/components/site/site-fallback-home.svelte
@component Fallback homepage when no `pages` collection entry exists yet.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Card from '@components/ui/card.svelte';
  interface Props {
    siteName: string;
  }

  let { siteName }: Props = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
  <Card variant="surface" class="p-8 text-center">
    <h1 class="text-3xl font-bold text-surface-900 dark:text-surface-50">
      Welcome to {siteName}
    </h1>
    <p class="mt-4 text-surface-600 dark:text-surface-300">
      The SvelteKit site starter is active. Create a <strong>Pages</strong> entry with slug
      <code class="rounded bg-surface-100 px-1 dark:bg-surface-800">home</code> and a Svedit layout
      in <strong>Page Layout</strong>, or re-run setup with the <strong>Website Starter</strong>
      preset to seed a homepage automatically.
    </p>
    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <Button variant="primary" href="/login">Open CMS</Button>
      <Button variant="outline" href="/config/collectionbuilder">Collection Builder</Button>
    </div>
  </Card>
</div>
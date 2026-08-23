<!--
@file src/components/site/site-header.svelte
@component Site starter header with navigation and CMS login link.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
  interface Props {
    siteName: string;
    signedIn?: boolean;
  }

  let { siteName, signedIn = false }: Props = $props();
</script>

<header class="border-b border-surface-500/30 bg-white/80 backdrop-blur dark:border-surface-500/40 dark:bg-surface-900/80">
  <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
    <a href="/" aria-label="{siteName} home" class="text-lg font-bold text-surface-900 dark:text-surface-50">
      {siteName}
    </a>
    <nav class="flex items-center gap-2" aria-label="Site navigation">
      <Button variant="ghost" size="sm" href="/shop" data-preload="hover">Shop</Button>
      <Button variant="ghost" size="sm" href="/cart" data-preload="hover">Cart</Button>
      {#if signedIn}
        <Button variant="ghost" size="sm" href="/account/orders" data-preload="hover">Account</Button>
      {/if}
      <Button variant="ghost" size="sm" href="/about">About</Button>
      <Button variant="outline" size="sm" href="/login">CMS Login</Button>
    </nav>
  </div>
</header>
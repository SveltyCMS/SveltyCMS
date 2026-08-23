<!--
@file src/routes/(site)/shop/+page.svelte
@component Public catalog. Add-to-cart posts to /api/commerce/cart (tenant from session).
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let { data } = $props();
	let message = $state('');

	async function addToCart(productId: string) {
		message = '';
		const res = await fetch('/api/commerce/cart', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ productId, qty: 1 })
		});
		const body = await res.json().catch(() => ({}));
		message = res.ok ? 'Added to cart' : body.message || 'Could not add to cart';
	}
</script>

<section class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
	<h1 class="text-2xl font-bold">Shop</h1>
	{#if !data.enabled}
		<p class="mt-4 text-sm text-surface-500">The store is not enabled for this site.</p>
	{:else if data.products.length === 0}
		<p class="mt-4 text-sm text-surface-500">No products yet.</p>
	{:else}
		{#if message}
			<p class="mt-3 text-sm" role="status">{message}</p>
		{/if}
		<ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.products as product (product.id)}
				<li class="rounded-lg border border-surface-500/30 p-4 dark:border-surface-500/40">
					<a href="/shop/{product.slug}" class="font-semibold" data-preload="hover">{product.title}</a>
					<p class="mt-1 font-mono text-sm text-surface-500">{product.sku || '—'}</p>
					{#if product.badges?.length}
						<ul class="mt-2 flex flex-wrap gap-1">
							{#each product.badges as badge (badge)}
								<li class="rounded-full bg-surface-500/10 px-2 py-0.5 text-[10px] font-medium dark:bg-surface-800">{badge}</li>
							{/each}
						</ul>
					{/if}
					<p class="mt-2 tabular-nums">{product.price.toFixed(2)}</p>
					<Button class="mt-3" variant="primary" size="sm" onclick={() => addToCart(product.id)}>Add to cart</Button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

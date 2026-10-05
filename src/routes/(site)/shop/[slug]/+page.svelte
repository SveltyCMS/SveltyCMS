<!--
@file src/routes/(site)/shop/[slug]/+page.svelte
@component Published product. Price is the gross amount.
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import CommerceLegalBar from '@components/site/commerce-legal-bar.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let { data } = $props();
	let message = $state('');

	async function addToCart() {
		message = '';
		const res = await fetch('/api/commerce/cart', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ productId: data.product.id, qty: 1 })
		});
		const body = await res.json().catch(() => ({}));
		message = res.ok ? 'Added to cart' : body.message || 'Could not add to cart';
	}
</script>

<section class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
	<p class="text-sm"><a class="text-primary-500" href="/shop">Shop</a></p>
	<h1 class="mt-2 text-2xl font-bold">{data.product.title}</h1>
	<p class="mt-1 font-mono text-sm text-surface-500">{data.product.sku || '—'}</p>
	<p class="mt-4 text-xl">
		<span class="tabular-nums">{data.product.price.toFixed(2)}</span>
		{data.currency}
	</p>
	<p class="text-sm text-surface-500">{data.vatLabel}</p>
	{#if data.product.priorPriceLabel}
		<p class="text-sm text-surface-500">{data.product.priorPriceLabel}</p>
	{/if}
	{#if data.product.summary}<p class="mt-4">{data.product.summary}</p>{/if}
	{#if data.product.description}<p class="mt-2 whitespace-pre-wrap text-sm">
			{data.product.description}
		</p>{/if}
	{#if message}<p class="mt-3 text-sm" role="status">{message}</p>{/if}
	<Button class="mt-4" variant="primary" onclick={addToCart}>Add to cart</Button>
	<CommerceLegalBar labels={data.labels} />
</section>

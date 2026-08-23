<!--
@file src/routes/(site)/cart/+page.svelte
@component Guest cart — reads /api/commerce/cart (cookie + tenant).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let cart = $state<{ items?: Array<{ productId: string; title: string; qty: number; sku: string; variantSku?: string }>; subtotal?: number } | null>(null);
	let error = $state('');

	async function load() {
		const res = await fetch('/api/commerce/cart');
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Cart unavailable';
			return;
		}
		cart = body.data || body;
	}

	async function setQty(line: { productId: string; variantSku?: string }, qty: number) {
		await fetch('/api/commerce/cart', {
			method: 'PATCH',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ productId: line.productId, variantSku: line.variantSku, qty })
		});
		await load();
	}

	onMount(load);
</script>

<section class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
	<h1 class="text-2xl font-bold">Cart</h1>
	{#if error}
		<p class="mt-4 text-sm text-error-500" role="alert">{error}</p>
	{:else if !cart}
		<p class="mt-4 text-sm text-surface-500">Loading…</p>
	{:else if !cart.items?.length}
		<p class="mt-4 text-sm text-surface-500">Your cart is empty.</p>
	{:else}
		<ul class="mt-6 space-y-3" aria-label="Cart lines">
			{#each cart.items as line (line.productId + (line.variantSku || ''))}
				<li class="flex items-center justify-between gap-3 rounded border border-surface-500/30 px-3 py-2 dark:border-surface-500/40">
					<div>
						<div class="font-medium">{line.title}</div>
						<div class="font-mono text-xs text-surface-500">{line.sku}</div>
					</div>
					<div class="flex items-center gap-2">
						<Button variant="ghost" size="sm" aria-label="Decrease quantity" onclick={() => setQty(line, line.qty - 1)}>-</Button>
						<span class="tabular-nums">{line.qty}</span>
						<Button variant="ghost" size="sm" aria-label="Increase quantity" onclick={() => setQty(line, line.qty + 1)}>+</Button>
					</div>
				</li>
			{/each}
		</ul>
		<p class="mt-4 text-end font-semibold tabular-nums">Subtotal {cart.subtotal?.toFixed(2)}</p>
		<Button class="mt-4" variant="primary" href="/checkout">Checkout</Button>
	{/if}
</section>

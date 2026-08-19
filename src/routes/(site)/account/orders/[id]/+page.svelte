<!--
@file src/routes/(site)/account/orders/[id]/+page.svelte
@component Order detail: cancel window, reorder, receipt, digital downloads.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Button from '@components/ui/button.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let order = $state<Record<string, unknown> | null>(null);
	let downloads = $state<Array<{ title: string; token: string }>>([]);
	let error = $state('');
	let message = $state('');

	const id = $derived(page.params.id);

	async function load() {
		const res = await fetch(`/api/commerce/orders/${id}`);
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Order not found';
			return;
		}
		order = body.data || body;
		if (['processing', 'shipped', 'delivered'].includes(String(order.status))) {
			const d = await fetch(`/api/commerce/orders/${id}/downloads`);
			const dj = await d.json().catch(() => ({}));
			if (d.ok) downloads = dj.data || [];
		}
	}

	async function cancel() {
		const res = await fetch(`/api/commerce/orders/${id}/cancel`, {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: '{}'
		});
		const body = await res.json().catch(() => ({}));
		message = res.ok ? 'Order cancelled' : body.message || 'Cannot cancel';
		await load();
	}

	async function reorder() {
		const res = await fetch(`/api/commerce/orders/${id}/reorder`, {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: '{}'
		});
		if (res.ok) window.location.href = '/cart';
		else {
			const body = await res.json().catch(() => ({}));
			message = body.message || 'Reorder failed';
		}
	}

	onMount(load);
</script>

{#if error}
	<p class="text-sm text-error-500" role="alert">{error}</p>
{:else if !order}
	<p class="text-sm text-surface-500">Loading…</p>
{:else}
	<h1 class="text-2xl font-bold">{order.orderNumber}</h1>
	<p class="mt-1 capitalize text-surface-500">{order.status}</p>
	<p class="mt-2 tabular-nums font-semibold">{Number(order.total || 0).toFixed(2)} {order.currency || ''}</p>
	{#if message}
		<p class="mt-2 text-sm" role="status">{message}</p>
	{/if}
	<ul class="mt-4 space-y-1 text-sm">
		{#each (order.items as Array<{ title: string; qty: number; sku: string }>) || [] as line (line.sku)}
			<li>{line.qty} × {line.title} <span class="font-mono text-surface-500">{line.sku}</span></li>
		{/each}
	</ul>
	<div class="mt-6 flex flex-wrap gap-2">
		<Button variant="outline" size="sm" href="/account/orders/{id}/receipt">Receipt</Button>
		<Button variant="primary" size="sm" onclick={reorder}>Reorder</Button>
		{#if order.canCancel}
			<Button variant="ghost" size="sm" onclick={cancel}>Cancel order</Button>
		{/if}
	</div>
	{#if downloads.length}
		<h2 class="mt-8 text-lg font-semibold">Downloads</h2>
		<ul class="mt-2 space-y-1">
			{#each downloads as file (file.token)}
				<li>
					<a href="/api/commerce/downloads?token={encodeURIComponent(file.token)}" class="text-primary-600">{file.title}</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

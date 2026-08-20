<!--
@file src/routes/(site)/account/orders/+page.svelte
@component Customer order history.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	let orders = $state<Array<{ _id: string; orderNumber: string; status: string; total: number; createdAt: string }>>([]);
	let error = $state('');

	onMount(async () => {
		const res = await fetch('/api/commerce/orders');
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Could not load orders';
			return;
		}
		orders = body.data || [];
	});
</script>

<h1 class="text-2xl font-bold">Orders</h1>
{#if error}
	<p class="mt-3 text-sm text-error-500" role="alert">{error}</p>
{:else if !orders.length}
	<p class="mt-4 text-sm text-surface-500">No orders yet.</p>
{:else}
	<ul class="mt-6 space-y-2" aria-label="Past orders">
		{#each orders as order (order._id)}
			<li class="flex items-center justify-between rounded border border-surface-200 px-3 py-2 dark:border-surface-700">
				<div>
					<a href="/account/orders/{order._id}" class="font-medium" data-preload="smart">{order.orderNumber}</a>
					<div class="text-xs capitalize text-surface-500">{order.status}</div>
				</div>
				<div class="tabular-nums">{Number(order.total || 0).toFixed(2)}</div>
			</li>
		{/each}
	</ul>
{/if}

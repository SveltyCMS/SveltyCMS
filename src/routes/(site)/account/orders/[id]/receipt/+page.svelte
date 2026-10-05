<!--
@file src/routes/(site)/account/orders/[id]/receipt/+page.svelte
@component Printable HTML receipt (use the browser print dialog for PDF).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let order = $state<Record<string, unknown> | null>(null);
	const id = $derived(page.params.id);

	onMount(async () => {
		const res = await fetch(`/api/commerce/orders/${id}`);
		const body = await res.json().catch(() => ({}));
		if (res.ok) order = body.data || body;
	});
</script>

<svelte:head>
	<title>Receipt {order?.orderNumber || ''}</title>
</svelte:head>

{#if order}
	<article class="mx-auto max-w-xl bg-white p-8 text-black print:p-0">
		<h1 class="text-xl font-bold">Receipt</h1>
		<p>{order.orderNumber}</p>
		<p class="capitalize">{order.status}</p>
		{#if order.customerName}<p class="mt-2">{order.customerName}</p>{/if}
		{#if order.shippingAddress}<p class="whitespace-pre-wrap text-sm">
				{order.shippingAddress}
			</p>{/if}
		<p class="mt-2 text-sm">Invoice {order.invoiceNumber || '—'}</p>
		<ul class="mt-4 text-sm">
			{#each (order.items as Array<{ title: string; qty: number }>) || [] as line, index (line.title + index)}
				<li>{line.qty} × {line.title}</li>
			{/each}
		</ul>
		<p class="mt-4 tabular-nums">
			Net {Number(order.netTotal ?? 0).toFixed(2)}
			{order.currency || ''}
		</p>
		<p class="tabular-nums">
			VAT {order.taxRate ? `${order.taxRate}%` : ''}
			{Number(order.taxTotal || 0).toFixed(2)}
			{order.currency || ''}
		</p>
		<p class="font-semibold tabular-nums">
			Total {Number(order.total || 0).toFixed(2)}
			{order.currency || ''}
		</p>
		{#if order.vatNote}<p class="mt-2 text-sm">{order.vatNote}</p>{/if}
		<button type="button" class="mt-6 text-sm underline print:hidden" onclick={() => window.print()}
			>Print / save as PDF</button
		>
	</article>
{/if}

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
		<ul class="mt-4 text-sm">
			{#each (order.items as Array<{ title: string; qty: number }>) || [] as line (line.title)}
				<li>{line.qty} × {line.title}</li>
			{/each}
		</ul>
		<p class="mt-4 font-semibold tabular-nums">Total {Number(order.total || 0).toFixed(2)}</p>
		<button type="button" class="mt-6 text-sm underline print:hidden" onclick={() => window.print()}>Print / save as PDF</button>
	</article>
{/if}

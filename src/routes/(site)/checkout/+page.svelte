<!--
@file src/routes/(site)/checkout/+page.svelte
@component Guest checkout. Server charges order grandTotal; card UI is Stripe Elements.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import PaymentForm from '@src/plugins/stripe/ui/payment-form.svelte';

	let email = $state('');
	let country = $state('');
	let paymentMethod = $state<'stripe' | 'cod' | 'bank_transfer'>('stripe');
	let error = $state('');
	let orderId = $state('');
	let totalCents = $state<number | undefined>(undefined);
	let currency = $state('eur');
	let instructions = $state('');
	let skipShipping = $state(false);

	onMount(async () => {
		const cartRes = await fetch('/api/commerce/cart');
		if (!cartRes.ok) error = 'Cart unavailable';
		const quote = await fetch('/api/commerce/quote', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({})
		});
		const q = await quote.json().catch(() => ({}));
		skipShipping = Boolean(q.data?.skipShipping);
	});

	async function placeOrder(event: Event) {
		event.preventDefault();
		error = '';
		const res = await fetch('/api/commerce/checkout', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ email, country, paymentMethod })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Checkout failed';
			return;
		}
		const order = body.data?.order || body.order;
		orderId = String(order?._id || '');
		totalCents = Number(order?.totalCents);
		currency = String(order?.currency || 'eur');
		instructions = String(body.data?.instructions || '');
	}
</script>

<section class="mx-auto max-w-xl px-4 py-10 sm:px-6">
	<h1 class="text-2xl font-bold">Checkout</h1>
	{#if error}
		<p class="mt-3 text-sm text-error-500" role="alert">{error}</p>
	{/if}

	{#if !orderId}
		<form class="mt-6 space-y-4" onsubmit={placeOrder}>
			<Input type="email" bind:value={email} required aria-label="Email" placeholder="you@example.com" />
			{#if !skipShipping}
				<Input bind:value={country} aria-label="Country (ISO)" placeholder="DE" />
			{/if}
			<fieldset class="space-y-2">
				<legend class="text-sm font-medium">Payment</legend>
				<label class="flex items-center gap-2 text-sm"><input type="radio" name="pay" value="stripe" bind:group={paymentMethod} aria-label="Card (Stripe)" /> Card (Stripe)</label>
				<label class="flex items-center gap-2 text-sm"><input type="radio" name="pay" value="cod" bind:group={paymentMethod} aria-label="Cash on delivery" /> Cash on delivery</label>
				<label class="flex items-center gap-2 text-sm"><input type="radio" name="pay" value="bank_transfer" bind:group={paymentMethod} aria-label="Bank transfer" /> Bank transfer</label>
			</fieldset>
			<Button type="submit" variant="primary">Place order</Button>
		</form>
	{:else if paymentMethod === 'stripe'}
		<div class="mt-6">
			<PaymentForm {orderId} displayAmount={totalCents} displayCurrency={currency} />
		</div>
	{:else}
		<p class="mt-6 text-sm" role="status">Order placed. {instructions || 'We will confirm payment separately.'}</p>
		<a class="mt-3 inline-block text-sm text-primary-600" href="/account/orders/{orderId}">View order</a>
	{/if}
</section>

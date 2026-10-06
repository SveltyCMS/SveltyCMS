<!--
@file src/routes/(site)/checkout/+page.svelte
@component Consumer checkout. The order button states the payment obligation.
Gross total, VAT, and the trader are on the form before submit.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import CommerceLegalBar from '@components/site/commerce-legal-bar.svelte';
	import PaymentForm from '@src/plugins/stripe/ui/payment-form.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let { data } = $props();

	let email = $state('');
	let customerName = $state('');
	let country = $state(untrack(() => data.legal?.homeCountry || 'DE'));
	let line1 = $state('');
	let postal = $state('');
	let city = $state('');
	let vatId = $state('');
	let termsAccepted = $state(false);
	let withdrawalAcknowledged = $state(false);
	let digitalConsent = $state(false);
	let paymentMethod = $state<'stripe' | 'cod' | 'bank_transfer'>('stripe');
	let error = $state('');
	let orderId = $state('');
	let orderSummary = $state<Record<string, unknown> | null>(null);
	let totalCents = $state<number | undefined>(undefined);
	let currency = $state(untrack(() => data.legal?.currency || 'EUR'));
	let instructions = $state('');
	let skipShipping = $state(false);
	let totals = $state<{
		subtotal?: number;
		shipping?: number;
		tax?: number;
		net?: number;
		grandTotal?: number;
		currency?: string;
		vatLines?: Array<{ rate: number; vat: number }>;
	} | null>(null);

	async function refreshQuote() {
		const quote = await fetch('/api/commerce/quote', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ country })
		});
		const body = await quote.json().catch(() => ({}));
		if (!quote.ok) return;
		skipShipping = Boolean(body.data?.skipShipping);
		totals = body.data?.totals || null;
		if (totals?.currency) currency = String(totals.currency);
	}

	onMount(() => {
		void refreshQuote();
	});

	async function placeOrder(event: Event) {
		event.preventDefault();
		error = '';
		const res = await fetch('/api/commerce/checkout', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({
				email,
				customerName,
				country,
				line1,
				postal,
				city,
				vatId,
				paymentMethod,
				termsAccepted,
				withdrawalAcknowledged,
				digitalConsent,
				billingSame: true
			})
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Checkout failed';
			return;
		}
		const order = body.data?.order || body.order;
		orderSummary = order || null;
		orderId = String(order?._id || '');
		totalCents = Number(order?.totalCents);
		currency = String(order?.currency || currency);
		instructions = String(body.data?.instructions || '');
		totals = body.data?.totals || totals;
	}
</script>

<section class="mx-auto max-w-xl px-4 py-10 sm:px-6">
	<h1 class="text-2xl font-bold">Checkout</h1>
	{#if data.legal && data.identityReady}
		<aside class="mt-4 rounded border border-surface-500/30 p-3 text-sm dark:border-surface-500/40">
			<p class="font-medium">{data.legal.legalName}</p>
			<p class="whitespace-pre-wrap">{data.legal.legalAddress}</p>
			<p>{data.legal.legalEmail}</p>
			<p>{data.legal.phone}</p>
			{#if data.legal.vatId}<p>USt-IdNr. {data.legal.vatId}</p>{/if}
			{#if data.legal.taxNumber}<p>{data.legal.taxNumber}</p>{/if}
			{#if data.legal.representative}<p>{data.legal.representative}</p>{/if}
			{#if data.legal.registerCourt}
				<p>{data.legal.registerCourt} {data.legal.registerNumber}</p>
			{/if}
		</aside>
	{:else}
		<p class="mt-4 text-sm text-error-500" role="alert">
			Checkout stays closed until the Commerce settings include the trader name, address, email,
			phone, and a VAT ID or tax number.
		</p>
	{/if}

	{#if error}
		<p class="mt-3 text-sm text-error-500" role="alert">{error}</p>
	{/if}

	{#if !orderId}
		<form class="mt-6 space-y-4" onsubmit={placeOrder}>
			<Input
				type="email"
				bind:value={email}
				required
				aria-label="Email"
				placeholder="you@example.com"
			/>
			<Input bind:value={customerName} required aria-label="Full name" placeholder="Name" />
			<Input
				bind:value={country}
				required
				aria-label="Country (ISO)"
				placeholder="DE"
				onchange={() => void refreshQuote()}
			/>
			<Input bind:value={line1} required={!skipShipping} aria-label="Street" placeholder="Street" />
			<div class="grid gap-3 sm:grid-cols-2">
				<Input
					bind:value={postal}
					required={!skipShipping}
					aria-label="Postal code"
					placeholder="Postal code"
				/>
				<Input bind:value={city} required={!skipShipping} aria-label="City" placeholder="City" />
			</div>
			<Input bind:value={vatId} aria-label="EU VAT ID (optional)" placeholder="DE123456789" />

			{#if totals}
				<dl class="space-y-1 text-sm tabular-nums">
					<div class="flex justify-between gap-3">
						<dt>Subtotal</dt>
						<dd>{totals.subtotal?.toFixed(2)} {currency}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt>Shipping</dt>
						<dd>{totals.shipping?.toFixed(2)} {currency}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt>Net</dt>
						<dd>{totals.net?.toFixed(2)} {currency}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt>VAT {data.labels?.vatIncluded || ''}</dt>
						<dd>{totals.tax?.toFixed(2)} {currency}</dd>
					</div>
					<div class="flex justify-between gap-3 font-semibold">
						<dt>Total</dt>
						<dd>{totals.grandTotal?.toFixed(2)} {currency}</dd>
					</div>
				</dl>
			{/if}

			<fieldset class="space-y-2">
				<legend class="text-sm font-medium">Payment</legend>
				<label class="flex items-center gap-2 text-sm">
					<input type="radio" name="pay" value="stripe" bind:group={paymentMethod} /> Card (Stripe)
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="radio" name="pay" value="cod" bind:group={paymentMethod} /> Cash on delivery
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="radio" name="pay" value="bank_transfer" bind:group={paymentMethod} /> Bank transfer
				</label>
			</fieldset>

			{#if data.labels}
				<Checkbox bind:checked={termsAccepted} required label={data.labels.termsLabel} />
				<Checkbox
					bind:checked={withdrawalAcknowledged}
					required
					label={data.labels.withdrawalLabel}
				/>
				{#if skipShipping}
					<Checkbox bind:checked={digitalConsent} required label={data.labels.digitalLabel} />
				{/if}
			{/if}

			<Button type="submit" variant="primary" disabled={!data.identityReady}>
				{data.labels?.pay || 'Order with obligation to pay'}
			</Button>
		</form>
	{:else}
		<article class="mt-6 space-y-1 text-sm">
			<h2 class="text-lg font-semibold">Order {orderSummary?.orderNumber}</h2>
			<p>Invoice {orderSummary?.invoiceNumber}</p>
			{#if totals}
				<p class="tabular-nums">Net {totals.net?.toFixed(2)} {currency}</p>
				<p class="tabular-nums">VAT {totals.tax?.toFixed(2)} {currency}</p>
				<p class="tabular-nums font-semibold">Total {totals.grandTotal?.toFixed(2)} {currency}</p>
			{/if}
			{#if orderSummary?.vatNote}<p>{orderSummary.vatNote}</p>{/if}
			<p>
				Withdraw at <a class="text-primary-500" href="/widerruf">/widerruf</a> within 14 days of delivery.
			</p>
		</article>
		{#if paymentMethod === 'stripe'}
			<div class="mt-6">
				<PaymentForm {orderId} displayAmount={totalCents} displayCurrency={currency} />
			</div>
		{:else}
			<p class="mt-6 text-sm" role="status">
				Order placed. {instructions || 'We will confirm payment separately.'}
			</p>
			<a class="mt-3 inline-block text-sm text-primary-500" href="/account/orders/{orderId}"
				>View order</a
			>
		{/if}
	{/if}

	{#if data.labels}
		<CommerceLegalBar labels={data.labels} />
	{/if}
</section>

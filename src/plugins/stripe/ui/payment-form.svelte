<!--
@file src/plugins/stripe/ui/payment-form.svelte
@component Stripe Elements payment form. Amount is never posted — the server
charges order grandTotal (F1). Display amount is optional UI only.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	interface Props {
		orderId: string;
		label?: string;
		displayAmount?: number;
		displayCurrency?: string;
		onSuccess?: (intentId: string) => void;
		onError?: (error: string) => void;
	}

	let {
		orderId,
		label = 'Pay',
		displayAmount,
		displayCurrency = 'eur',
		onSuccess,
		onError
	}: Props = $props();

	let cardElement = $state<HTMLDivElement>();
	let stripe = $state<any>(null);
	let elements = $state<any>(null);
	let card = $state<any>(null);
	let error = $state('');
	let processing = $state(false);
	let succeeded = $state(false);
	let publishableKey = $state('');

	onMount(async () => {
		try {
			const res = await fetch('/api/stripe/config');
			const config = await res.json();
			publishableKey = config.data?.publishableKey || config.publishableKey || '';
		} catch {
			publishableKey = '';
		}

		const StripeJS = (window as any).Stripe;
		if (!StripeJS) {
			error = 'Stripe.js not loaded. Please refresh the page.';
			return;
		}

		stripe = StripeJS(publishableKey);
		elements = stripe.elements({
			appearance: { theme: 'stripe', variables: { borderRadius: '12px' } }
		});
		card = elements.create('card', {
			style: {
				base: {
					fontSize: '16px',
					fontFamily: 'inherit',
					'::placeholder': { color: '#aab7c4' }
				}
			}
		});
		card.mount(cardElement);
		card.on('change', (e: any) => (error = e.error?.message ?? ''));
	});

	async function handlePayment() {
		if (!stripe || !card || !orderId) return;
		processing = true;
		error = '';

		try {
			const res = await fetch('/api/commerce/pay', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({ orderId })
			});
			const payload = await res.json();
			const clientSecret = payload.data?.clientSecret || payload.clientSecret;
			if (!clientSecret) throw new Error(payload.message || 'Failed to create payment intent');

			const result = await stripe.confirmCardPayment(clientSecret);
			if (result.error) {
				error = result.error.message;
				onError?.(result.error.message);
				processing = false;
				return;
			}

			await fetch('/api/commerce/confirm', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({ orderId, intentId: result.paymentIntent.id })
			});

			succeeded = true;
			onSuccess?.(result.paymentIntent.id);
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : String(err) || 'Payment failed';
			onError?.(error);
		} finally {
			processing = false;
		}
	}

	const display = $derived(
		typeof displayAmount === 'number'
			? `${(displayAmount / 100).toFixed(2)} ${displayCurrency.toUpperCase()}`
			: ''
	);
</script>

<div class="space-y-4">
	{#if succeeded}
		<div class="flex items-center gap-3 rounded border border-success-500/20 bg-success-500/10 p-4">
			<iconify-icon icon="mdi:check-circle" class="text-2xl text-success-500"></iconify-icon>
			<div>
				<p class="font-bold text-success-600 dark:text-success-400">Payment successful!</p>
				<p class="text-sm text-surface-500">Your payment has been processed.</p>
			</div>
		</div>
	{:else}
		<div
			bind:this={cardElement}
			class="min-h-11 rounded border border-surface-500/30 bg-surface-500/10 p-3 transition-all focus-within:border-tertiary-500 focus-within:ring-2 focus-within:ring-primary-500/20 dark:border-surface-500/40 dark:bg-surface-900"
		></div>

		{#if error}
			<p class="text-xs font-medium text-error-500" role="alert">{error}</p>
		{/if}

		<Button aria-label={label} variant="primary" class="w-full" onclick={handlePayment} loading={processing} disabled={!stripe || !orderId}>
			{label}{display ? ` — ${display}` : ''}
		</Button>

		<p class="text-center text-[10px] text-surface-400">
			Secured by Stripe. Your card details are never stored on our servers.
		</p>
	{/if}
</div>

<!--
@file src/plugins/stripe/ui/PaymentForm.svelte
@component Stripe Elements payment form for collecting card details.
Uses Stripe.js loaded via CDN for PCI-compliant iframe isolation.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';

	interface Props {
		amount: number;
		currency?: string;
		label?: string;
		onSuccess?: (intentId: string) => void;
		onError?: (error: string) => void;
	}

	let {
		amount,
		currency = 'usd',
		label = 'Pay',
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
		// Load publishable key from plugin config
		try {
			const res = await fetch('/api/plugins/stripe/config');
			const config = await res.json();
			publishableKey = config.publishableKey || '';
		} catch {
			// Fallback: Stripe.js may already be loaded with key
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
		card.on('change', (e: any) => error = e.error?.message ?? '');
	});

	async function handlePayment() {
		if (!stripe || !card) return;
		processing = true;
		error = '';

		try {
			// 1. Create PaymentIntent on server
			const res = await fetch('/api/plugins/stripe/create-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ amount, currency })
			});
			const { clientSecret } = await res.json();
			if (!clientSecret) throw new Error('Failed to create payment intent');

			// 2. Confirm with Stripe
			const result = await stripe.confirmCardPayment(clientSecret);
			if (result.error) {
				error = result.error.message;
				onError?.(result.error.message);
				processing = false;
				return;
			}

			// 3. Verify on server
			await fetch('/api/plugins/stripe/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ intentId: result.paymentIntent.id })
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
</script>

<div class="space-y-4">
	{#if succeeded}
		<div class="flex items-center gap-3 p-4 rounded-xl bg-success-500/10 border border-success-500/20">
			<iconify-icon icon="mdi:check-circle" class="text-success-500 text-2xl"></iconify-icon>
			<div>
				<p class="font-bold text-success-600 dark:text-success-400">Payment successful!</p>
				<p class="text-sm text-surface-500">Your payment has been processed.</p>
			</div>
		</div>
	{:else}
		<div bind:this={cardElement} class="min-h-[44px] p-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 transition-all focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-tertiary-500 dark:border-primary-500"></div>

		{#if error}
			<p class="text-xs text-error-500 font-medium" role="alert">{error}</p>
		{/if}

		<Button variant="primary" class="w-full" onclick={handlePayment} loading={processing} disabled={!stripe}>
			{label} — ${(amount / 100).toFixed(2)} {currency.toUpperCase()}
		</Button>

		<p class="text-[10px] text-surface-400 text-center">
			Secured by Stripe. Your card details are never stored on our servers.
		</p>
	{/if}
</div>

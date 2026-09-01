<!--
@file src/plugins/stripe/ui/PaymentStatus.svelte
@component Payment status badge for entry list columns.
-->
<script lang="ts">
	import { formatMoney } from '@src/services/commerce/price';

	interface Props {
		status?: string;
		amount?: number;
		currency?: string;
	}

	let { status, amount, currency = 'EUR' }: Props = $props();

	const config = $derived.by(() => {
		switch (status) {
			case 'succeeded':
				return { color: 'text-success-500', icon: 'mdi:check-circle', label: 'Paid' };
			case 'processing':
				return { color: 'text-warning-500', icon: 'mdi:clock-outline', label: 'Processing' };
			case 'requires_payment_method':
				return { color: 'text-error-500', icon: 'mdi:alert-circle', label: 'Failed' };
			default:
				return { color: 'text-surface-400', icon: 'mdi:help-circle', label: status || 'None' };
		}
	});

	const formattedAmount = $derived(amount != null ? formatMoney(amount, currency) : '');
</script>

{#if status}
	<div class="flex items-center gap-1.5">
		<iconify-icon icon={config.icon} width="16" class={config.color}></iconify-icon>
		<span class="text-xs font-medium {config.color}">{config.label}</span>
		{#if formattedAmount}
			<span class="text-xs text-surface-400">{formattedAmount}</span>
		{/if}
	</div>
{/if}

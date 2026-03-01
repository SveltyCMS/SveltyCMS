<!--
@file src/widgets/custom/Price/Input.svelte
@component
**Price Input Component**

Renders a currency selector and a number input side-by-side.

@features
- **Accessible**: Labeled inputs.
- **Responsive**: Flex layout.
-->

<script lang="ts">
	import type { FieldType } from './index';
	import type { PriceValue } from './types';

	interface Props {
		field: FieldType;
		value: PriceValue | null | undefined;
	}

	let { field, value = $bindable() }: Props = $props();

	// Initialize value if null/undefined with a reactive default
	$effect(() => {
		if (value === null || value === undefined || typeof value !== 'object') {
			const defaultCurr = (field as any).defaultCurrency || (field as any).defaults?.defaultCurrency || 'EUR';
			value = { amount: null, currency: defaultCurr };
		}
	});

	const currencies = $derived((field as any).allowedCurrencies || (field as any).defaults?.allowedCurrencies || ['EUR', 'USD', 'GBP']);
</script>

<div class="flex gap-2 w-full">
	<!-- Currency Selector -->
	<div class="w-1/3 min-w-[80px]">
		{#if value}
			<select bind:value={value.currency} class="select w-full" aria-label="{field.label} Currency" disabled={(field as any).readonly}>
				{#each currencies as code}
					<option value={code}>{code}</option>
				{/each}
			</select>
		{:else}
			<div class="select w-full animate-pulse bg-surface-200 dark:bg-surface-700 h-10 rounded"></div>
		{/if}
	</div>

	<!-- Amount Input -->
	<div class="flex-1">
		{#if value}
			<input
				type="number"
				bind:value={value.amount}
				min={(field as any).min ?? (field as any).defaults?.min}
				max={(field as any).max ?? (field as any).defaults?.max}
				step={(field as any).step ?? (field as any).defaults?.step}
				class="input w-full"
				placeholder="0.00"
				aria-label="{field.label} Amount"
				disabled={(field as any).readonly}
			/>
		{:else}
			<div class="input w-full animate-pulse bg-surface-200 dark:bg-surface-700 h-10 rounded"></div>
		{/if}
	</div>
</div>

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

	let { field, value = $bindable(null) }: Props = $props();

	// Initialize value if null
	$effect(() => {
		if (value === null || typeof value !== 'object') {
			// Do not overwrite if it's explicitly null/undefined unless we want to force defaults on mount?
			// Better to init only partial if mostly empty.
			const defaultCurr = (field as any).defaultCurrency || 'EUR';
			value = { amount: null, currency: defaultCurr };
		}
	});

	const currencies = $derived((field as any).allowedCurrencies || ['EUR', 'USD', 'GBP']);
</script>

<div class="flex gap-2 w-full">
	<!-- Currency Selector -->
	<div class="w-1/3 min-w-[80px]">
		<select bind:value={value!.currency} class="select w-full" aria-label="{field.label} Currency" disabled={(field as any).readonly}>
			{#each currencies as code}
				<option value={code}>{code}</option>
			{/each}
		</select>
	</div>

	<!-- Amount Input -->
	<div class="flex-1">
		<input
			type="number"
			bind:value={value!.amount}
			min={(field as any).min}
			max={(field as any).max}
			step={(field as any).step}
			class="input w-full"
			placeholder="0.00"
			aria-label="{field.label} Amount"
			disabled={(field as any).readonly}
		>
	</div>
</div>

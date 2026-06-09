<!--
@file src/widgets/custom/Price/Input.svelte
@component
**Price Input Component**

Renders a currency selector and a number input side-by-side.

@features
- **Accessible**: Labeled inputs with ARIA support and error description mapping.
- **Responsive**: Flex layout.
-->

<script lang="ts">
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { minValue, nullable, number, object, optional, parse, pipe, regex, string } from 'valibot';
	import type { FieldType } from './index';
	import type { PriceValue } from './types';

	let { 
		field, 
		value = $bindable(),
		error 
	}: { 
		field: FieldType; 
		value?: PriceValue | null | undefined;
		error?: string | null;
	} = $props();

	const currencies = $derived((field as any).allowedCurrencies || ['EUR', 'USD', 'GBP']);
	const defaultCurrency = $derived((field as any).defaultCurrency || 'EUR');
	
	// Ensure value is initialized properly
	$effect(() => {
		if (!value || typeof value !== 'object') {
			value = { amount: null, currency: $state.snapshot(defaultCurrency) };
		}
	});

	// Derived symbol
	const currencySymbol = $derived.by(() => {
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency: value?.currency || defaultCurrency,
				currencyDisplay: 'symbol'
			}).formatToParts(0).find(p => p.type === 'currency')?.value || '';
		} catch {
			return '';
		}
	});

	const fieldName = $derived(getFieldName(field));

	function handleUpdate() {
		const min = (field as any).min ?? 0;

		const schema = object({
			amount: field.required ? pipe(number(), minValue(min)) : nullable(pipe(number(), minValue(min))),
			currency: pipe(string(), regex(/^[A-Z]{3}$/))
		});

		handleWidgetValidation(() => parse(field.required ? schema : optional(schema), value), {
			fieldName,
			updateStore: true
		});
	}
</script>

<div class="price-widget flex flex-col gap-1">
	<div 
		class="flex items-center gap-0 rounded border overflow-hidden transition-all bg-white dark:bg-surface-900 border-surface-400 dark:border-surface-600 focus-within:ring-2 focus-within:ring-primary-500"
		class:!border-error-500={!!error}
		class:ring-2={!!error}
		class:ring-error-500={!!error}
	>
		<!-- Currency Select -->
		<div class="relative border-e border-surface-300 dark:border-surface-700 bg-surface-50 dark:bg-surface-800">
			<select 
				bind:value={value!.currency} 
				onchange={handleUpdate}
				class="select border-none bg-transparent py-2 ps-3 pe-8 text-sm font-medium focus:ring-0 cursor-pointer"
				disabled={(field as any).readonly}
				aria-label="{field.label} currency"
			>
				{#each currencies as code}
					<option value={code}>{code}</option>
				{/each}
			</select>
			<div class="pointer-events-none absolute inset-y-0 end-2 flex items-center text-surface-400">
				<iconify-icon icon="mdi:chevron-down" width="16"></iconify-icon>
			</div>
		</div>

		<!-- Amount Input -->
		<div class="relative grow flex items-center px-3">
			<span class="text-surface-400 font-mono me-2" aria-hidden="true">{currencySymbol}</span>
			<input
				type="number"
				bind:value={value!.amount}
				oninput={handleUpdate}
				min={(field as any).min}
				max={(field as any).max}
				step={(field as any).step || 0.01}
				class="w-full border-none bg-transparent py-2 text-sm font-semibold outline-none focus:ring-0 text-surface-900 dark:text-surface-50"
				placeholder="0.00"
				disabled={(field as any).readonly}
				aria-label="{field.label} amount"
				aria-invalid={!!error}
				aria-describedby={error ? `${fieldName}-error` : undefined}
			/>
		</div>
	</div>

	{#if error}
		<p id="{fieldName}-error" class="text-[10px] font-medium text-error-500 px-1" role="alert">{error}</p>
	{/if}
</div>

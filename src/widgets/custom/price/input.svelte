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
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
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
	const currencyOptions = $derived(currencies.map((code: string) => ({ value: code, label: code })));

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
		<div class="relative shrink-0 border-e border-surface-300 bg-surface-50 dark:border-surface-700 dark:bg-surface-800">
			<Select
				bind:value={value!.currency}
				options={currencyOptions}
				allowEmptySelection
				size="sm"
				disabled={(field as any).readonly}
				class="w-auto [&_select]:cursor-pointer [&_select]:border-0 [&_select]:bg-transparent [&_select]:py-2 [&_select]:ps-3 [&_select]:pe-8 [&_select]:text-sm [&_select]:font-medium [&_select]:shadow-none [&_select]:focus:ring-0"
				onchange={handleUpdate}
			/>
		</div>

		<!-- Amount Input -->
		<div class="relative grow flex items-center px-3 [&>div]:min-w-0 [&>div]:grow [&>div]:space-y-0">
			<span class="text-surface-400 font-mono me-2" aria-hidden="true">{currencySymbol}</span>
			<Input
				type="number"
				value={value!.amount ?? ''}
				oninput={(e) => {
					const raw = (e.currentTarget as HTMLInputElement).value;
					value!.amount = raw === '' ? null : Number(raw);
					handleUpdate();
				}}
				min={(field as any).min}
				max={(field as any).max}
				step={(field as any).step || 0.01}
				inputClass="h-auto w-full border-0 bg-transparent py-2 text-sm font-semibold text-surface-900 shadow-none outline-none focus-visible:ring-0 dark:text-surface-50"
				placeholder="0.00"
				disabled={(field as any).readonly}
				aria-label={`${field.label} amount`}
				aria-invalid={!!error}
				aria-describedby={error ? `${fieldName}-error` : undefined}
			/>
		</div>
	</div>

	{#if error}
		<p id="{fieldName}-error" class="text-[10px] font-medium text-error-500 px-1" role="alert">{error}</p>
	{/if}
</div>

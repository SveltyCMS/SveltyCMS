<!--
@file src/widgets/custom/Number/Input.svelte
@component
**Number Widget Component**

@example
<Number field={{ label: "Price", db_fieldName: "price", required: true, min: 0, required={field?.required as boolean | undefined}
				readonly={field?.readonly as boolean | undefined}
				disabled={field?.disabled as boolean | undefined}
				min={field?.min as number | undefined}
				max={field?.max as number | undefined}
				step={(field?.step as number) || 1}
				class="input w-full flex-1 rounded-none text-black dark:text-primary-500"00 }} />

### Props
- `field`: FieldType
- `value`: any

### Features
- **Number Validation**: Stores as actual number type (not string)
- **Non-Translatable**: Numbers are universal values
- **Semantic HTML**: Uses type="number" for proper mobile keyboards
- **Min/Max Validation**: Numeric range constraints
- **Step Controls**: Configurable increment/decrement
- **Locale Support**: Respects user's number formatting preferences
- **Enhanced Validation**: Integration with validation store
- **Touch State Management**: Proper error display based on interaction
- **Debounced Validation**: Performance-optimized validation
- **Prefix/Suffix Support**: For units (e.g., "$", "kg", "px")
- **Accessibility**: Full ARIA support and semantic HTML
-->

<script lang="ts">
	import { tokenTarget } from '@src/services/token/token-target';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { maxValue, minValue, nullable, number as numberSchema, parse, pipe } from 'valibot';
	import type { FieldType } from '.';

	let { 
		field, 
		value = $bindable(),
		error 
	}: { 
		field: FieldType; 
		value?: number | Record<string, number | null> | null | undefined;
		error?: string | null;
	} = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : 'en');
	const fieldName = $derived(getFieldName(field));

	const safeValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object') {
			return (value as Record<string, number | null>)[LANGUAGE] ?? null;
		}
		return typeof value === 'number' ? value : null;
	});

	const numberSchemaVal = $derived.by(() => {
		let schema: any = numberSchema('Value must be a number');
		if (typeof field.min === 'number') schema = pipe(schema, minValue(field.min, `Min: ${field.min}`));
		if (typeof field.max === 'number') schema = pipe(schema, maxValue(field.max, `Max: ${field.max}`));
		return field.required ? schema : nullable(schema);
	});

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		const raw = e.currentTarget.value;
		const numeric = raw === '' ? null : parseFloat(raw);
		
		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [LANGUAGE]: numeric };
		} else {
			value = numeric;
		}

		handleWidgetValidation(() => parse(numberSchemaVal, numeric), {
			fieldName,
			updateStore: true
		});
	}

	function handleClear() {
		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [LANGUAGE]: null };
		} else {
			value = null;
		}
		validationStore.clearError(fieldName);
	}
</script>

<div class="number-widget flex flex-col gap-1">
	<div 
		class="flex items-center rounded border transition-all bg-white dark:bg-surface-900 border-surface-400 dark:border-surface-600 focus-within:ring-2 focus-within:ring-primary-500"
		class:!border-error-500={!!error}
		class:ring-2={!!error}
		class:ring-error-500={!!error}
	>
		{#if field.prefix}
			<span class="px-3 py-2 bg-surface-100 dark:bg-surface-800 border-e border-surface-300 dark:border-surface-700 text-surface-500 text-sm font-medium">
				{field.prefix}
			</span>
		{/if}

		<div class="relative grow flex items-center px-3">
			<iconify-icon icon="mdi:numeric" width="18" class="text-surface-400 me-2" aria-hidden="true"></iconify-icon>
			<input
				type="number"
				value={safeValue ?? ''}
				oninput={handleInput}
				min={field.min as number}
				max={field.max as number}
				step={(field.step as number) || 1}
				placeholder={(field.placeholder as string) || '0'}
				class="w-full border-none bg-transparent py-2 text-sm font-semibold outline-none focus:ring-0 text-surface-900 dark:text-surface-50"
				disabled={field.readonly as boolean}
				aria-label={(field.label as string) || 'Numeric value'}
				aria-invalid={!!error}
				aria-describedby={error ? `${fieldName}-error` : undefined}
				aria-required={field.required as boolean}
				use:tokenTarget={{ name: fieldName, label: (field.label as string), collection: (field as any).collection }}
			/>
		</div>

		{#if field.suffix}
			<span class="px-3 py-2 bg-surface-100 dark:bg-surface-800 border-s border-surface-300 dark:border-surface-700 text-surface-500 text-sm font-medium">
				{field.suffix}
			</span>
		{/if}

		{#if safeValue !== null}
			<button 
				type="button" 
				class="btn-icon btn-icon-sm hover:bg-surface-200 dark:hover:bg-surface-700 p-1 me-1 opacity-60 hover:opacity-100"
				onclick={handleClear}
				aria-label="Clear value"
				title="Clear"
			>
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			</button>
		{/if}
	</div>

	{#if error}
		<p id="{fieldName}-error" class="text-[10px] font-medium text-error-500 px-1" role="alert">{error}</p>
	{/if}
</div>

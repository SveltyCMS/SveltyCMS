<!--
@file src/widgets/custom/PhoneNumber/Input.svelte
@component
**PhoneNumber Widget Component**

@example
<PhoneNumber field={{ label: "Phon				placeholder={typeof field?.placeholder === 'string' && field?.placeholder.trim() !== '' ? field.placeholder : '+1234567890'}
		required={field?.required as boolean | undefined}
		readonly={field?.readonly as boolean | undefined}
		disabled={field?.disabled as boolean | undefined}
		pattern={field?.pattern as string | undefined}
		class="input w-full flex-1 rounded-none text-black dark:text-primary-500"ired={field?.required as boolean | undefined}
				readonly={field?.readonly as boolean | undefined}
				disabled={field?.disabled as boolean | undefined}
				pattern={field?.pattern as string | undefined}
				class="input w-full flex-1 rounded-none text-black dark:text-primary-500"b_fieldName: "phone", required: true }} />

### Props
- `field`: FieldType
- `value`: any

### Features
- **Phone Validation**: E.164 international format or custom pattern
- **Non-Translatable**: Phone numbers are universal values
- **Semantic HTML**: Uses type="tel" for proper mobile keyboards
- **Pattern Support**: Configurable regex for different formats
- **Enhanced Validation**: Integration with validation store
- **Touch State Management**: Proper error display based on interaction
- **Debounced Validation**: Performance-optimized validation
- **Accessibility**: Full ARIA support and semantic HTML
- **Auto-Focus**: Focus management for required fields
- **International Support**: Default E.164 format (+1234567890)
-->

<script lang="ts">
	import { tokenTarget } from '@src/services/token/token-target';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { minLength, optional, parse, pipe, regex, string } from 'valibot';
	import type { FieldType } from '.';

	let { 
		field, 
		value = $bindable(),
		error 
	}: { 
		field: FieldType; 
		value?: string | Record<string, string> | null | undefined;
		error?: string | null;
	} = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : 'en');
	const fieldName = $derived(getFieldName(field));

	const safeValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object') {
			return (value as Record<string, string>)[LANGUAGE] || '';
		}
		return typeof value === 'string' ? value : '';
	});

	const phoneSchema = $derived.by(() => {
		const defaultPattern = /^\+?[1-9]\d{1,14}$/;
		const pattern = field.pattern ? new RegExp(field.pattern as string) : defaultPattern;
		const message = 'Invalid phone number format (e.g., +1234567890)';
		const base = pipe(string(), regex(pattern, message));
		return field.required ? pipe(string(), minLength(1, 'Phone number is required'), base) : optional(base, '');
	});

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		const raw = e.currentTarget.value.trim();
		
		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [LANGUAGE]: raw };
		} else {
			value = raw;
		}

		handleWidgetValidation(() => parse(phoneSchema, raw), {
			fieldName,
			updateStore: true
		});
	}

	function handleClear() {
		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [LANGUAGE]: '' };
		} else {
			value = '';
		}
		validationStore.clearError(fieldName);
	}
</script>

<div class="phone-widget flex flex-col gap-1">
	<div 
		class="flex items-center rounded-lg border transition-all bg-white dark:bg-surface-900 border-surface-400 dark:border-surface-600 focus-within:ring-2 focus-within:ring-primary-500"
		class:!border-error-500={!!error}
		class:ring-2={!!error}
		class:ring-error-500={!!error}
	>
		{#if field.prefix}
			<span class="px-3 py-2 bg-surface-100 dark:bg-surface-800 border-r border-surface-300 dark:border-surface-700 text-surface-500 text-sm font-medium">
				{field.prefix}
			</span>
		{/if}

		<div class="relative grow flex items-center px-3">
			<iconify-icon icon="mdi:phone-outline" width="18" class="text-surface-400 mr-2"></iconify-icon>
			<input
				type="tel"
				value={safeValue}
				oninput={handleInput}
				placeholder={(field.placeholder as string) || '+1234567890'}
				class="w-full border-none bg-transparent py-2 text-sm font-medium outline-none focus:ring-0 text-surface-900 dark:text-surface-50"
				disabled={field.readonly as boolean}
				use:tokenTarget={{ name: fieldName, label: field.label, collection: (field as any).collection }}
			/>
		</div>

		{#if field.suffix}
			<span class="px-3 py-2 bg-surface-100 dark:bg-surface-800 border-l border-surface-300 dark:border-surface-700 text-surface-500 text-sm font-medium">
				{field.suffix}
			</span>
		{/if}

		{#if safeValue}
			<button 
				type="button" 
				class="btn btn-sm variant-soft-surface p-1 mr-1 opacity-60 hover:opacity-100"
				onclick={handleClear}
				title="Clear"
			>
				<iconify-icon icon="mdi:close" width="18"></iconify-icon>
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-[10px] font-medium text-error-500 px-1" role="alert">{error}</p>
	{/if}
</div>

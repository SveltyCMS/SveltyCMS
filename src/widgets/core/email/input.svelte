<!--
@file src/widgets/custom/Email/Input.svelte
@component
**Email Widget Component**

@example
<Email bind:field={field} bind:value={value} />

### Props
- `field`: FieldType
- `value`: any

### Features
- **Email Validation**: HTML5 email validation with Valibot schema
- **Non-Translatable**: Correctly treats email addresses as universal data
- **Semantic HTML**: Uses type="email" for proper mobile keyboards
- **Enhanced Validation**: Integration with validation store
- **Touch State Management**: Proper error display based on interaction
- **Debounced Validation**: Performance-optimized validation
- **Accessibility**: Full ARIA support and semantic HTML
- **Auto-Focus**: Focus management for required fields
-->

<script lang="ts">
	import { app, validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { email as emailValidator, minLength, optional, parse, pipe, string } from 'valibot';
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

	// Email schema from index.ts logic
	const emailSchema = $derived(
		field.required
			? pipe(string(), minLength(1, 'Email is required'), emailValidator('Invalid email format'))
			: optional(pipe(string(), emailValidator('Invalid email format')), '')
	);

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		const raw = e.currentTarget.value.trim().toLowerCase();
		
		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [LANGUAGE]: raw };
		} else {
			value = raw;
		}

		handleWidgetValidation(() => parse(emailSchema, raw), {
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

<div class="email-widget flex flex-col gap-1">
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
			<iconify-icon icon="mdi:email-outline" width="18" class="text-surface-400 mr-2" aria-hidden="true"></iconify-icon>
			<input
				type="email"
				value={safeValue}
				oninput={handleInput}
				placeholder={(field.placeholder as string) || 'email@example.com'}
				class="w-full border-none bg-transparent py-2 text-sm font-medium outline-none focus:ring-0 text-surface-900 dark:text-surface-50"
				disabled={field.readonly as boolean}
				aria-label={(field.label as string) || 'Email address'}
				aria-invalid={!!error}
				aria-describedby={error ? `${fieldName}-error` : undefined}
				aria-required={field.required as boolean}
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
				aria-label="Clear email"
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

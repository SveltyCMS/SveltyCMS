<!-- 
@file src/widgets/custom/email/Email.svelte
@component
**Email widget**

@example
<Email label="Email" db_fieldName="email" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	// Valibot validation
	import { string, email as emailValidator, pipe, parse, type ValiError } from 'valibot';
	import { getFieldName } from '@root/src/utils/utils';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = {} }: Props = $props();

	const fieldName = getFieldName(field);
	value = value || collectionValue.value[fieldName] || {};

	let _data = $state<Record<string, string>>(mode.value === 'create' ? {} : value);
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let inputElement = $state<HTMLInputElement | null>(null);

	// Language is constant since email is not translatable
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;

	// Update translation progress when data changes

	// Create validation schema for email
	const emailSchema = pipe(string(), emailValidator('Please enter a valid email address'));

	// Validation function
	function validateInput() {
		try {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = window.setTimeout(() => {
				try {
					const value = _data[_language];

					// First validate if required
					if (field?.required && (!value || value.trim() === '')) {
						validationError = 'This field is required';
						validationStore.setError(fieldName, validationError);
						return;
					}

					// Then validate email format if value exists
					if (value && value.trim() !== '') {
						parse(emailSchema, value);
					}

					validationError = null;
					validationStore.clearError(fieldName);
				} catch (error) {
					if ((error as ValiError<typeof emailSchema>).issues) {
						const valiError = error as ValiError<typeof emailSchema>;
						validationError = valiError.issues[0]?.message || 'Invalid input';
						validationStore.setError(fieldName, validationError);
					}
				}
			}, 300);
		} catch (error) {
			console.error('Validation error:', error);
			validationError = 'An unexpected error occurred during validation';
			validationStore.setError(fieldName, 'Validation error');
		}
	}

	// Focus management
	onMount(() => {
		if (field?.required && !_data[_language]) {
			inputElement?.focus();
		}
	});

	// Cleanup
	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<div class="input-container relative mb-4">
	<!-- Email Input -->
	<input
		type="email"
		bind:this={inputElement}
		aria-label={field?.label || field?.db_fieldName}
		bind:value={_data[_language]}
		onblur={validateInput}
		name={field.db_fieldName}
		id={field.db_fieldName}
		placeholder={field.placeholder || field.db_fieldName}
		required={field?.required}
		class="input w-full text-black dark:text-primary-500"
		class:error={!!validationError}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		aria-required={field?.required}
		data-testid="email-input"
	/>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>

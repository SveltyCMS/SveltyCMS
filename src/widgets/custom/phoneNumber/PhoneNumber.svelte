<!-- 
@file src/widgets/custom/phoneNumber/PhoneNumber.svelte
@component
**PhoneNumber widget component that allows users to enter a phone number**

@example
<PhoneNumber label="Phone Number" db_fieldName="phoneNumber" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	import { getFieldName } from '@utils/utils';

	// Valibot validation
	import { string, regex, pipe, parse, type ValiError } from 'valibot';

	let { field, value = collectionValue.value[getFieldName(field)] || {} }: Props = $props();

	const fieldName = getFieldName(field);

	const _data = $state(mode.value === 'create' ? {} : value);
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;

	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;
	let inputElement: HTMLInputElement | null = $state(null);

	// Create validation schema for phone number
	const phoneSchema = pipe(string(), regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format, must be a valid international number'));

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

					// Then validate phone format if value exists
					if (value && value.trim() !== '') {
						parse(phoneSchema, value);
					}

					validationError = null;
					validationStore.clearError(fieldName);
				} catch (error) {
					if ((error as ValiError<typeof phoneSchema>).issues) {
						const valiError = error as ValiError<typeof phoneSchema>;
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
	import { onMount, onDestroy } from 'svelte';
	interface Props {
		field: FieldType;
		value?: any;
	}

	onMount(() => {
		if (field?.required && !_data[_language]) {
			inputElement?.focus();
		}
	});

	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	export const WidgetData = async () => _data;
</script>

<div class="input-container relative mb-4">
	<div class="variant-filled-surface btn-group flex w-full rounded">
		<input
			type="tel"
			bind:this={inputElement}
			bind:value={_data[_language]}
			onblur={validateInput}
			name={field?.db_fieldName}
			id={field?.db_fieldName}
			placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
			required={field?.required}
			readonly={field?.readonly}
			class="input w-full text-black dark:text-primary-500"
			class:error={!!validationError}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
			aria-required={field?.required}
			data-testid="phone-input"
		/>
	</div>

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

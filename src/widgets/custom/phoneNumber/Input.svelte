<!--
@file src/widgets/custom/phoneNumber/Input.svelte
@component
**PhoneNumber Widget Input Component**

Provides telephone number input with HTML5 validation and mobile keyboard optimization.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<PhoneNumberInput bind:value={phoneNumber} field={{ pattern: "[0-9+-\\s]+" }} />
<!-- HTML5 tel input with pattern validation and mobile keyboard

### Props
- `field: FieldType` - Widget field definition with pattern validation and metadata
- `value: string | null | undefined` - Phone number string (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **HTML5 Tel Input**: Native telephone input type for optimal mobile experience
- **Pattern Validation**: Configurable regex patterns for format validation
- **Mobile Optimized**: Telephone keypad layout on mobile devices
- **International Support**: Handles various phone number formats and country codes
- **Error State Styling**: Visual error indication with red border and messaging
- **Accessibility**: Full ARIA support with error association and invalid states
- **Required Field Support**: HTML5 required attribute integration
- **Placeholder Text**: Configurable placeholder for user guidance
- **Debounced Validation**: Prevents excessive validation calls during typing
- **Validation Store Integration**: Integrates with the app's validation system
- **Focus Management**: Auto-focus on required empty fields
- **PostCSS Styling**: Modern CSS with utility-first approach
-->

<script lang="ts">
	import { validationStore } from '@stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { onDestroy, onMount } from 'svelte';
	import { parse, pipe, regex, string, type ValiError } from 'valibot';
	import type { FieldType } from './';

	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();

	const fieldName = getFieldName(field);

	let inputElement: HTMLInputElement | null = $state(null);
	let debounceTimeout: number | undefined;
	let isValidating = $state(false);

	// Create validation schema for phone number
	const phoneSchema = pipe(string(), regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format, must be a valid international number'));

	// Validation function with debouncing
	function validateInput(immediate = false) {
		if (debounceTimeout) clearTimeout(debounceTimeout);

		const doValidation = () => {
			isValidating = true;
			try {
				// Required field validation
				if (field?.required && (!value || value.trim() === '')) {
					const errorMsg = 'This field is required';
					validationStore.setError(fieldName, errorMsg);
					return;
				}

				// Phone format validation if value exists
				if (value && value.trim() !== '') {
					parse(phoneSchema, value);
				}

				validationStore.clearError(fieldName);
			} catch (error) {
				if ((error as ValiError<typeof phoneSchema>).issues) {
					const valiError = error as ValiError<typeof phoneSchema>;
					const errorMsg = valiError.issues[0]?.message || 'Invalid input';
					validationStore.setError(fieldName, errorMsg);
				}
			} finally {
				isValidating = false;
			}
		};

		if (immediate) {
			doValidation();
		} else {
			debounceTimeout = window.setTimeout(doValidation, 300);
		}
	}

	// Handle input changes
	function handleInput() {
		validateInput(false);
	}

	// Handle blur events
	function handleBlur() {
		validateInput(true);
	}

	// Focus management
	onMount(() => {
		if (field?.required && (!value || value.trim() === '')) {
			inputElement?.focus();
		}
	});

	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});
</script>

<div class="input-container">
	<input
		type="tel"
		id={field.db_fieldName}
		name={field.db_fieldName}
		required={field.required}
		placeholder={field.placeholder as string}
		pattern={field.pattern as string}
		bind:value
		bind:this={inputElement}
		oninput={handleInput}
		onblur={handleBlur}
		class="input"
		class:invalid={error}
		class:validating={isValidating}
		aria-invalid={!!error}
		aria-describedby={error ? `${field.db_fieldName}-error` : undefined}
	/>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	/* Styles are identical to the Text input component */
	.input-container {
		position: relative;
		padding-bottom: 1.5rem;
		width: 100%;
	}

	.input.invalid {
		border-color: #ef4444;
	}

	.input.validating {
		border-color: #3b82f6;
		box-shadow: 0 0 0 1px #3b82f6;
	}

	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>

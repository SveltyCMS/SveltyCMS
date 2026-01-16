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
	import { onMount, onDestroy } from 'svelte';
	import type { FieldType } from '.';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { contentLanguage } from '@stores/store.svelte';

	import { getFieldName } from '@utils/utils';
	import { tokenTarget } from '@src/services/token/tokenTarget';

	// Valibot validation
	import { string, regex, pipe, parse, type ValiError, minLength, optional } from 'valibot';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = $bindable() }: Props = $props();

	const fieldName = $derived(getFieldName(field));
	// Use current content language for translated fields, default for non-translated
	const _language = $derived(field.translated ? contentLanguage.value : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Initialize value
	$effect(() => {
		if (!value) {
			value = { [_language]: '' };
		}
	});

	const safeValue = $derived(value?.[_language] ?? '');
	const validationError = $derived(validationStore.getError(fieldName));
	let debounceTimeout: number | undefined;
	let inputElement = $state<HTMLInputElement | null>(null);
	let isTouched = $state(false);
	let isValidating = $state(false);

	// Create validation schema for phone number
	// Default E.164 pattern unless a custom pattern is provided
	const defaultPattern = /^\+?[1-9]\d{1,14}$/;
	const validationPattern = $derived(typeof field.pattern === 'string' && field.pattern.trim() !== '' ? new RegExp(field.pattern) : defaultPattern);

	const phoneSchema = $derived(
		field?.required
			? pipe(
					string(),
					minLength(1, 'This field is required'),
					regex(validationPattern, 'Invalid phone number format. Please use international format (e.g., +1234567890)')
				)
			: optional(pipe(string(), regex(validationPattern, 'Invalid phone number format. Please use international format (e.g., +1234567890)')), '')
	);

	// Validation function with debounce
	function validateInput(immediate = false) {
		if (debounceTimeout) clearTimeout(debounceTimeout);

		const doValidation = () => {
			try {
				isValidating = true;
				const currentValue = safeValue;

				// First validate if required
				if (field?.required && (!currentValue || currentValue.trim() === '')) {
					validationStore.setError(fieldName, 'This field is required');
					return;
				}

				// Then validate phone format if value exists
				if (currentValue && currentValue.trim() !== '') {
					parse(phoneSchema, currentValue);
				}

				validationStore.clearError(fieldName);
			} catch (error) {
				if ((error as ValiError<any>).issues) {
					const valiError = error as ValiError<any>;
					const errorMessage = valiError.issues[0]?.message || 'Invalid input';
					validationStore.setError(fieldName, errorMessage);
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
	function handleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (!value) {
			value = {};
		}
		value = { ...value, [_language]: target.value };
	}

	// Handle blur
	function handleBlur() {
		isTouched = true;
		validateInput(true);
	}

	// Focus management
	onMount(() => {
		if (field?.required && !safeValue) {
			inputElement?.focus();
		}
	});

	// Cleanup
	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => value;
</script>

<div class="input-container relative mb-4">
	<div class="preset-filled-surface-500  flex w-full rounded" role="group">
		{#if field?.prefix}
			<button class="px-2!" type="button" aria-label={`${field.prefix} prefix`}>
				{field?.prefix}
			</button>
		{/if}

		<div class="relative w-full flex-1">
			<input
				type="tel"
				value={safeValue || ''}
				oninput={handleInput}
				onblur={handleBlur}
				use:tokenTarget={{
					name: field.db_fieldName,
					label: field.label,
					collection: (field as any).collection
				}}
				name={field?.db_fieldName}
				id={field?.db_fieldName}
				placeholder={typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? '')}
				required={field?.required as boolean | undefined}
				readonly={field?.readonly as boolean | undefined}
				disabled={field?.disabled as boolean | undefined}
				class="input w-full rounded-none text-black dark:text-primary-500"
				class:!border-error-500={!!validationError}
				class:!ring-1={!!validationError || isValidating}
				class:!ring-error-500={!!validationError}
				class:border-primary-500!={isValidating && !validationError}
				class:!ring-primary-500={isValidating && !validationError}
				aria-invalid={!!validationError}
				aria-describedby={validationError ? `${fieldName}-error` : undefined}
				aria-required={field?.required}
				data-testid="phone-input"
			/>
		</div>

		{#if field?.suffix}
			<button class="px-2!" type="button" aria-label={`${field.suffix} suffix`}>
				{field?.suffix}
			</button>
		{/if}

		<!-- Validation indicator -->
		{#if isValidating}
			<div class="flex items-center px-2" aria-label="Validating">
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
			</div>
		{/if}
	</div>

	<!-- Error Message -->
	{#if validationError && isTouched}
		<p
			id={`${field.db_fieldName}-error`}
			class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500"
			role="alert"
			aria-live="polite"
		>
			{validationError}
		</p>
	{/if}
</div>

<style>
	.input-container {
		min-height: 2.5rem;
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

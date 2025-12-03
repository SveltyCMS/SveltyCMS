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
	import { onMount, onDestroy } from 'svelte';
	import type { FieldType } from '.';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// Stores
	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { contentLanguage } from '@stores/store.svelte';
	import { collection } from '@src/stores/collectionStore.svelte';
	import { activeInputStore } from '@src/stores/activeInputStore.svelte';

	// Utils
	import { getFieldName } from '@utils/utils';

	// Valibot validation
	import { string, email as emailValidator, pipe, parse, type ValiError, minLength, optional } from 'valibot';
	import { getFieldName } from '@utils/utils';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = $bindable() }: Props = $props();

	const fieldName = getFieldName(field);
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

	// Create validation schema for email
	const emailSchema = $derived(
		field?.required
			? pipe(string(), minLength(1, 'This field is required'), emailValidator('Please enter a valid email address'))
			: optional(pipe(string(), emailValidator('Please enter a valid email address')), '')
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

				// Then validate email format if value exists
				if (currentValue && currentValue.trim() !== '') {
					parse(emailSchema, currentValue);
				}

				validationStore.clearError(fieldName);
			} catch (error) {
				if ((error as ValiError<typeof emailSchema>).issues) {
					const valiError = error as ValiError<typeof emailSchema>;
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

	// Handle focus events
	function handleFocus(e: FocusEvent) {
		// If the token picker is already open (activeInputStore has a value),
		// update it to point to this input.
		if (activeInputStore.value) {
			activeInputStore.set({
				element: e.currentTarget as HTMLInputElement,
				field: {
					name: field.db_fieldName,
					label: field.label,
					collection: collection.value?.name
				}
			});
		}
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
	<div class="variant-filled-surface btn-group flex w-full rounded" role="group">
		{#if field?.prefix}
			<button class="!px-2" type="button" aria-label={`${field.prefix} prefix`}>
				{field?.prefix}
			</button>
		{/if}

		<div class="relative w-full flex-1">
			<input
				type="email"
				value={safeValue || ''}
				oninput={handleInput}
				onblur={handleBlur}
				onfocus={handleFocus}
				name={field?.db_fieldName}
				id={field?.db_fieldName}
				placeholder={typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? '')}
				required={field?.required as boolean | undefined}
				readonly={field?.readonly as boolean | undefined}
				disabled={field?.disabled as boolean | undefined}
				class="input w-full rounded-none text-black dark:text-primary-500"
				class:error={!!validationError}
				class:validating={isValidating}
				aria-invalid={!!validationError}
				aria-describedby={validationError ? `${fieldName}-error` : undefined}
				aria-required={field?.required}
				data-testid="email-input"
			/>
			<iconify-icon icon="mdi:code-braces" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-surface-400" width="16"
			></iconify-icon>
		</div>

		{#if field?.suffix}
			<button class="!px-2" type="button" aria-label={`${field.suffix} suffix`}>
				{field?.suffix}
			</button>
		{/if}

		<!-- Validation indicator -->
		{#if isValidating}
			<div class="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Validating">
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
			</div>
		{/if}

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
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
		box-shadow: 0 0 0 1px rgb(239 68 68);
	}

	.validating {
		border-color: rgb(59 130 246);
		box-shadow: 0 0 0 1px rgb(59 130 246);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>

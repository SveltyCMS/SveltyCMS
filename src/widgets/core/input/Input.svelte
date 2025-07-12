<!--
@file src/widgets/core/input/Input.svelte
@component
**Enhanced Input Widget Component with improved validation integration**

@example
<Input field={{ label: "Title", db_fieldName: "title", translated: true, required: true }} />

### Props
- `field`: FieldType (configuration for the input, e.g., label, required, translated)
- `value`: any (object storing input values, e.g., { en: "Hello", fr: "" })

### Features
- **Enhanced Validation**: Integration with improved validation store
- **Multilingual Support**: Handles translatable fields with reactive updates
- **Touch State Management**: Proper error display based on interaction
- **Async Validation**: Support for server-side validation
- **Performance Optimized**: Debounced validation with cleanup
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import type { FieldType } from '.';

	// Utils
	import { track } from '@src/utils/reactivity.svelte';
	import { getFieldName } from '@src/utils/utils';

	// Valibot validation
	import { string, pipe, parse, type ValiError, nonEmpty, nullable, transform } from 'valibot';
	import { contentLanguage, validationStore } from '@root/src/stores/store.svelte';

	// Props
	interface Props {
		field: FieldType;
		value?: any;
		validateOnMount?: boolean;
		validateOnChange?: boolean;
		validateOnBlur?: boolean;
		debounceMs?: number;
	}

	let {
		field,
		value = $bindable({ [contentLanguage.value.toLowerCase()]: '' }),
		validateOnMount = false,
		validateOnChange = true,
		validateOnBlur = true,
		debounceMs = 300
	}: Props = $props();

	// Field name for validation
	const fieldName = getFieldName(field);

	// Language handling
	let _language = $derived(field?.translated ? contentLanguage.value.toLowerCase() : (publicEnv.DEFAULT_CONTENT_LANGUAGE as string).toLowerCase());

	// Character count
	let count = $derived(value[_language]?.length ?? 0);

	// Validation state - now using the enhanced validation store
	let inputElement: HTMLInputElement | null = null;
	let debounceTimeout: number | undefined;

	// Get validation state from store
	let validationError = $derived(validationStore.getError(fieldName));
	let isValidating = $state(false);
	let isTouched = $state(false);

	// Memoized badge class calculation
	const badgeClassCache = new Map<string, string>();
	const getBadgeClass = (length: number) => {
		const key = `${length}-${field?.minlength}-${field?.maxlength}-${field?.count}`;
		if (badgeClassCache.has(key)) return badgeClassCache.get(key)!;

		let result: string;
		if (field?.minlength && length < field?.minlength) result = 'bg-red-600';
		else if (field?.maxlength && length > field?.maxlength) result = 'bg-red-600';
		else if (field?.count && length === field?.count) result = 'bg-green-600';
		else if (field?.count && length > field?.count) result = 'bg-orange-600';
		else if (field?.minlength) result = '!variant-filled-surface';
		else result = '!variant-ghost-surface';

		badgeClassCache.set(key, result);
		return result;
	};

	// Create validation schema
	let validationSchema = $derived(
		field?.required
			? pipe(
					string(),
					nonEmpty(),
					transform((val) => (inputElement?.type === 'number' ? Number(val) : val))
				)
			: nullable(string())
	);

	// Enhanced validation function
	async function validateInput(immediate = false): Promise<string | null> {
		const currentValue = value?.[_language];

		// Clear existing timeout
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
			debounceTimeout = undefined;
		}

		// Set up validation with debounce (unless immediate)
		const doValidation = async () => {
			isValidating = true;

			try {
				// Required field validation
				if (field?.required && (currentValue === null || currentValue === undefined || currentValue === '')) {
					const error = 'This field is required';
					validationStore.setError(fieldName, error);
					return error;
				}

				// Length validations
				if (currentValue !== null && currentValue !== undefined) {
					if (field?.minlength && currentValue.length < field.minlength) {
						const error = `Minimum length is ${field.minlength}`;
						validationStore.setError(fieldName, error);
						return error;
					}
					if (field?.maxlength && currentValue.length > field.maxlength) {
						const error = `Maximum length is ${field.maxlength}`;
						validationStore.setError(fieldName, error);
						return error;
					}

					// Number validation for number inputs
					if (inputElement?.type === 'number') {
						const num = Number(currentValue);
						if (isNaN(num)) {
							const error = 'Invalid number format';
							validationStore.setError(fieldName, error);
							return error;
						}
						if (inputElement.min && num < Number(inputElement.min)) {
							const error = `Value must be at least ${inputElement.min}`;
							validationStore.setError(fieldName, error);
							return error;
						}
						if (inputElement.max && num > Number(inputElement.max)) {
							const error = `Value must not exceed ${inputElement.max}`;
							validationStore.setError(fieldName, error);
							return error;
						}
					}
				}

				// Valibot schema validation
				try {
					parse(validationSchema, currentValue);
					validationStore.clearError(fieldName);
					return null;
				} catch (error) {
					if ((error as ValiError<typeof validationSchema>).issues) {
						const valiError = error as ValiError<typeof validationSchema>;
						const errorMessage = valiError.issues[0]?.message || 'Invalid input';
						validationStore.setError(fieldName, errorMessage);
						return errorMessage;
					}
					throw error;
				}
			} catch (error) {
				console.error('Validation error:', error);
				const errorMessage = 'An unexpected error occurred during validation';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			} finally {
				isValidating = false;
			}
		};

		if (immediate) {
			return await doValidation();
		} else {
			return new Promise((resolve) => {
				debounceTimeout = window.setTimeout(async () => {
					const result = await doValidation();
					resolve(result);
				}, debounceMs);
			});
		}
	}

	// Handle input changes
	function handleInput() {
		if (validateOnChange) {
			validateInput(false);
		}
	}

	// Handle blur events
	async function handleBlur() {
		isTouched = true;
		if (validateOnBlur) {
			await validateInput(true);
		}
	}

	// Handle focus events
	function handleFocus() {
		// Could be used for custom focus behavior
	}

	// Cleanup function
	$effect(() => {
		return () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			badgeClassCache.clear();
		};
	});

	// Initialize validation on mount if requested
	$effect(() => {
		if (validateOnMount) {
			// Small delay to ensure component is fully mounted
			setTimeout(() => validateInput(true), 0);
		}
	});

	// Watch for value changes from external sources
	$effect(() => {
		// This effect runs when value[_language] changes
		const currentValue = value[_language];
		if (isTouched && validateOnChange) {
			validateInput(false);
		}
	});
</script>

<div class="input-container relative mb-4">
	<div class="variant-filled-surface btn-group flex w-full rounded" role="group">
		{#if field?.prefix}
			<button class="!px-2" aria-label={`${field.prefix} prefix`}>
				{field?.prefix}
			</button>
		{/if}

		<input
			type="text"
			bind:value={
				() => value[_language],
				(v) => {
					const temp = { ...value };
					temp[_language] = v;
					value = temp;
				}
			}
			oninput={handleInput}
			onblur={handleBlur}
			onfocus={handleFocus}
			name={field?.db_fieldName}
			id={field?.db_fieldName}
			bind:this={inputElement}
			placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
			required={field?.required}
			disabled={field?.disabled}
			readonly={field?.readonly}
			minlength={field?.minlength}
			maxlength={field?.maxlength}
			class="input w-full flex-1 rounded-none text-black dark:text-primary-500"
			class:error={!!validationError}
			class:validating={isValidating}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
			aria-required={field?.required}
			data-testid="text-input"
		/>

		<!-- suffix and count -->
		{#if field?.suffix || field?.count || field?.minlength || field?.maxlength}
			<div class="flex items-center" role="status" aria-live="polite">
				{#if field?.count || field?.minlength || field?.maxlength}
					<span class="badge mr-1 rounded-full {getBadgeClass(count)}" aria-label="Character count">
						{#if field?.count && field?.minlength && field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.count && field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.count && field?.minlength}
							{count} => {field?.minlength}
						{:else if field?.minlength && field?.maxlength}
							{count} => {field?.minlength}/{field?.maxlength}
						{:else if field?.count}
							{count}/{field?.count}
						{:else if field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.minlength}
							min {field?.minlength}
						{/if}
					</span>
				{/if}
				{#if field?.suffix}
					<span class="!px-1" aria-label={`${field.suffix} suffix`}>{field?.suffix}</span>
				{/if}
			</div>
		{/if}

		<!-- Validation indicator -->
		{#if isValidating}
			<div class="flex items-center px-2" aria-label="Validating">
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
			</div>
		{/if}
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">
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

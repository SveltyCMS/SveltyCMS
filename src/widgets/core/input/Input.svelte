<!--
@file src/widgets/core/input/Input.svelte
@component
**Enterprise-Grade Text Input Widget Component**

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
- **Character Counting**: Visual feedback for length constraints
- **Accessibility**: Full ARIA support and semantic HTML
- **Visual Indicators**: Real-time validation feedback
-->

<script lang="ts">
	import type { FieldType } from '.';

	// Utils
	import { getFieldName } from '@src/utils/utils';
	import { untrack } from 'svelte';

	// Valibot validation
	import {
		string,
		pipe,
		parse,
		type ValiError,
		nonEmpty,
		nullable,
		transform,
		minLength as valibotMinLength,
		maxLength as valibotMaxLength
	} from 'valibot';
	import { validationStore } from '@root/src/stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings';

	// Props
	interface Props {
		field: FieldType;
		value?: any;
		validateOnMount?: boolean;
		validateOnChange?: boolean;
		validateOnBlur?: boolean;
		debounceMs?: number;
	}

	let { field, value = $bindable(), validateOnMount = false, validateOnChange = true, validateOnBlur = true, debounceMs = 300 }: Props = $props();

	// Get default language from environment with safe fallback
	const _language = ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase();

	// Initialize value if null/undefined
	// Safe value access with fallback
	let safeValue = $derived(value?.[_language] ?? '');

	// Character count
	let count = $derived(safeValue?.length ?? 0);

	// Validation state - now using the enhanced validation store
	let debounceTimeout: number | undefined;
	let hasValidatedOnMount = $state(false);
	let inputElement: HTMLInputElement | null = null;

	// Get validation state from store
	// Define fieldName using getFieldName utility
	let fieldName = getFieldName(field);
	let validationError = $derived(validationStore.getError(fieldName));
	let isValidating = $state(false);
	let isTouched = $state(false);

	// Memoized badge class calculation
	const badgeClassCache = new Map<string, string>();
	const getBadgeClass = (length: number) => {
		const key = `${length}-${field?.minLength}-${field?.maxLength}-${field?.count}`;
		if (badgeClassCache.has(key)) return badgeClassCache.get(key)!;

		let result: string;
		if (field?.minLength && length < (field?.minLength as number)) result = 'bg-red-600';
		else if (field?.maxLength && length > (field?.maxLength as number)) result = 'bg-red-600';
		else if (field?.count && length === (field?.count as number)) result = 'bg-green-600';
		else if (field?.count && length > (field?.count as number)) result = 'bg-orange-600';
		else if (field?.minLength) result = '!variant-filled-surface';
		else result = '!variant-ghost-surface';

		badgeClassCache.set(key, result);
		return result;
	};

	// Create validation schema
	let validationSchema = $derived.by(() => {
		const rules: Array<unknown> = [transform((val: string) => (typeof val === 'string' ? val.trim() : val))];

		if (field?.required) {
			rules.push(nonEmpty('This field is required'));
		}

		if (typeof field?.minLength === 'number') {
			rules.push(valibotMinLength(field.minLength, `Minimum length is ${field.minLength}`));
		}

		if (typeof field?.maxLength === 'number') {
			rules.push(valibotMaxLength(field.maxLength, `Maximum length is ${field.maxLength}`));
		}

		return field?.required ? pipe(string(), ...(rules as [])) : nullable(pipe(string(), ...(rules as [])));
	});

	// Enhanced validation function
	async function validateInput(immediate = false): Promise<string | null> {
		const currentValue = safeValue;

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
					if (process.env.NODE_ENV !== 'production') {
						console.log(`[Input Widget] Setting required field error for ${fieldName}:`, error);
					}
					validationStore.setError(fieldName, error);
					return error;
				}

				// Length validations
				if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
					if (field?.minLength && currentValue.length < field.minLength) {
						const error = `Minimum length is ${field.minLength}`;
						validationStore.setError(fieldName, error);
						return error;
					}
					if (field?.maxLength && currentValue.length > field.maxLength) {
						const error = `Maximum length is ${field.maxLength}`;
						validationStore.setError(fieldName, error);
						return error;
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

	// Safe value setter function
	function updateValue(newValue: string) {
		if (!value) {
			value = {};
		}
		value = { ...value, [_language]: newValue };
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

	// Initialize validation on mount if requested - only run once
	$effect(() => {
		if (validateOnMount && !hasValidatedOnMount) {
			hasValidatedOnMount = true;
			// Validation happens silently - logs only in dev mode for debugging
			// Use untrack to prevent circular dependencies and run validation immediately
			untrack(() => {
				validateInput(true);
			});
		}
	});

	// Watch for value changes from external sources
	$effect(() => {
		// This effect runs when safeValue changes
		if (isTouched && validateOnChange) {
			validateInput(false);
		}
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

		<input
			type="text"
			value={safeValue}
			oninput={(e) => {
				updateValue(e.currentTarget.value);
				handleInput();
			}}
			onblur={handleBlur}
			onfocus={handleFocus}
			name={field?.db_fieldName}
			id={field?.db_fieldName}
			bind:this={inputElement}
			placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
			required={field?.required as boolean | undefined}
			disabled={field?.disabled as boolean | undefined}
			readonly={field?.readonly as boolean | undefined}
			minlength={field?.minLength as number | undefined}
			maxlength={field?.maxLength as number | undefined}
			class="input w-full flex-1 rounded-none text-black dark:text-primary-500"
			class:error={!!validationError}
			class:validating={isValidating}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
			aria-required={field?.required}
			data-testid="text-input"
		/>

		<!-- suffix and count -->
		{#if field?.suffix || field?.count || field?.minLength || field?.maxLength}
			<div class="flex items-center" role="status" aria-live="polite">
				{#if field?.count || field?.minLength || field?.maxLength}
					<span class="badge mr-1 rounded-full {getBadgeClass(count)}" aria-label="Character count">
						{#if field?.count && field?.minLength && field?.maxLength}
							{count}/{field?.maxLength}
						{:else if field?.count && field?.maxLength}
							{count}/{field?.maxLength}
						{:else if field?.count && field?.minLength}
							{count} => {field?.minLength}
						{:else if field?.minLength && field?.maxLength}
							{count} => {field?.minLength}/{field?.maxLength}
						{:else if field?.count}
							{count}/{field?.count}
						{:else if field?.maxLength}
							{count}/{field?.maxLength}
						{:else if field?.minLength}
							min {field?.minLength}
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
		position: relative;
		padding-bottom: 1.5rem;
		width: 100%;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input {
		flex-grow: 1;
	}

	.input.invalid {
		border-color: #ef4444;
	}

	.error {
		border-color: rgb(239 68 68);
		box-shadow: 0 0 0 1px rgb(239 68 68);
	}

	.validating {
		border-color: rgb(59 130 246);
		box-shadow: 0 0 0 1px rgb(59 130 246);
	}

	.counter {
		position: absolute;
		right: 0.75rem;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.counter.error {
		color: #ef4444;
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

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>

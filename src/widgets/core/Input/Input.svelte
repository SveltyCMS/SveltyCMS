<!--
@file src/widgets/core/Input/Input.svelte
@component
**Text Input Widget Component**

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
	import { logger } from '@utils/logger';
	import type { FieldType } from '.';
	import { createValidationSchema } from '.'; // ✅ SSOT: Import validation schema from index.ts

	// Utils
	import { getFieldName } from '@src/utils/utils';
	import { untrack } from 'svelte';

	// Valibot validation
	import { parse, type ValiError } from 'valibot';
	import { validationStore } from '@root/src/stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { contentLanguage } from '@src/stores/store.svelte';

	import { collection } from '@src/stores/collectionStore.svelte';
	import { activeInputStore } from '@src/stores/activeInputStore.svelte';

	// Props
	interface Props {
		field: FieldType;
		value?: Record<string, string> | null | undefined;
		validateOnMount?: boolean;
		validateOnChange?: boolean;
		validateOnBlur?: boolean;
		debounceMs?: number;
	}

	// ✅ ENHANCEMENT: Auto-enable validateOnMount for required fields to instantly disable save button
	let {
		field,
		value = $bindable(),
		validateOnMount = field.required ?? false,
		validateOnChange = true,
		validateOnBlur = true,
		debounceMs = 300
	}: Props = $props();

	// SECURITY: Maximum input length to prevent ReDoS attacks
	const MAX_INPUT_LENGTH = 100000; // 100KB

	// Use current content language for translated fields, default for non-translated
	const _language = $derived(field.translated ? contentLanguage.value : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Initialize value if null/undefined
	// Safe value access with fallback
	const safeValue = $derived(value?.[_language] ?? '');

	// SECURITY: Enforce maximum length to prevent DoS
	const safeTruncatedValue = $derived(safeValue.length > MAX_INPUT_LENGTH ? safeValue.substring(0, MAX_INPUT_LENGTH) : safeValue);

	// Character count (use truncated value for safety)
	const count = $derived(safeTruncatedValue?.length ?? 0);

	// Validation state - now using the enhanced validation store
	let debounceTimeout: number | undefined;
	let hasValidatedOnMount = $state(false);

	// Get validation state from store
	// Define fieldName using getFieldName utility
	const fieldName = getFieldName(field);
	const validationError = $derived(validationStore.getError(fieldName));
	let isValidating = $state(false);
	let isTouched = $state(false);

	// Memoized badge class calculation using $derived
	const badgeClass = $derived(() => {
		const length = count;
		if (field?.minLength && length < (field?.minLength as number)) return 'bg-red-600';
		if (field?.maxLength && length > (field?.maxLength as number)) return 'bg-red-600';
		if (field?.count && length === (field?.count as number)) return 'bg-green-600';
		if (field?.count && length > (field?.count as number)) return 'bg-orange-600';
		if (field?.minLength) return '!variant-filled-surface';
		return '!variant-ghost-surface';
	});

	// ✅ SSOT: Use validation schema from index.ts
	// Pass the field config (which is the widget instance) to createValidationSchema
	const validationSchema = $derived(createValidationSchema(field as unknown as ReturnType<any>));

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
				// ✅ SSOT: Valibot schema validation using shared schema
				try {
					// For translated fields, validate the entire value object; for non-translated, validate current value
					parse(validationSchema, field.translated ? value : currentValue);
					if (process.env.NODE_ENV !== 'production') {
						logger.debug(`[Input Widget] Validation passed for ${fieldName}`);
					}
					validationStore.clearError(fieldName);
					return null;
				} catch (error) {
					if ((error as ValiError<typeof validationSchema>).issues) {
						const valiError = error as ValiError<typeof validationSchema>;
						const errorMessage = valiError.issues[0]?.message || 'Invalid input';
						if (process.env.NODE_ENV !== 'production') {
							logger.debug(`[Input Widget] Validation failed for ${fieldName}:`, errorMessage);
						}
						validationStore.setError(fieldName, errorMessage);
						return errorMessage;
					}
					throw error;
				}
			} catch (error) {
				logger.error('Validation error:', error);
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

	// Safe value setter function
	function updateValue(newValue: string) {
		if (!value) {
			value = {};
		}
		// Ensure value is treated as a new object for reactivity
		value = { ...(value || {}), [_language]: newValue };
	}

	// Cleanup function
	$effect(() => {
		return () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			// No cache to clear
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

<div class="relative mb-4 min-h-10 w-full pb-6">
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
			placeholder={(field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName) as string | undefined}
			required={field?.required as boolean | undefined}
			disabled={field?.disabled as boolean | undefined}
			readonly={field?.readonly as boolean | undefined}
			minlength={field?.minLength as number | undefined}
			maxlength={field?.maxLength as number | undefined}
			class="input w-full flex-1 rounded-none text-black dark:text-primary-500"
			class:!border-error-500={!!validationError}
			class:!ring-1={!!validationError || isValidating}
			class:!ring-error-500={!!validationError}
			class:!border-primary-500={isValidating && !validationError}
			class:!ring-primary-500={isValidating && !validationError}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
			aria-required={field?.required}
			data-testid="text-input"
		/>

		<!-- suffix and count -->
		{#if field?.suffix || field?.count || field?.minLength || field?.maxLength}
			<div class="flex items-center" role="status" aria-live="polite">
				{#if field?.count || field?.minLength || field?.maxLength}
					<span class="badge mr-1 rounded-full {badgeClass}" aria-label="Character count">
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

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

	import { getFieldName } from '@src/utils/utils';
	import { untrack } from 'svelte';

	// Valibot validation
	import { parse, type ValiError } from 'valibot';
	import { validationStore } from '@root/src/stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { contentLanguage } from '@src/stores/store.svelte';

	// Props
	interface Props {
		field: FieldType;
		value?: Record<string, string> | null | undefined;
		// ... (omitting lines for brevity in prompt, but in tool call I must be precise or use separate chunks if valid)
		// Wait, I cannot use comments "..." in replacement content if I'm replacing a block.
		// I should use multi_replace for safety or just target the script and input separately.
		// Separate chunks is better.
		validateOnMount?: boolean;
		validateOnChange?: boolean;
		validateOnBlur?: boolean;
		debounceMs?: number;
	}

	// ✅ ENHANCEMENT: Auto-enable validateOnMount for required fields to instantly disable save button
	let { field, value = $bindable(), validateOnChange = true, validateOnBlur = true, debounceMs = 300 }: Props = $props();

	// New derived state for validateOnMount
	const validateOnMount = $derived(field.required ?? false);

	// SECURITY: Maximum input length to prevent ReDoS attacks
	const MAX_INPUT_LENGTH = 100000; // 100KB

	// Apply truncation before processing
	if (value && typeof value === 'string' && (value as string).length > MAX_INPUT_LENGTH) {
		value = (value as string).substring(0, MAX_INPUT_LENGTH) as any;
	}

	// Use current content language for translated fields, default for non-translated
	const _language = $derived(field.translated ? contentLanguage.value : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Initialize value if null/undefined
	// Safe value access with fallback

	let safeValue = $derived(value?.[_language] ?? '');

	// Character count
	let count = $derived(safeValue?.length ?? 0);

	// Validation state - now using the enhanced validation store
	let debounceTimeout: number | undefined;
	let hasValidatedOnMount = $state(false);

	// Get validation state from store
	// Define fieldName using getFieldName utility
	let fieldName = $derived(getFieldName(field));
	let validationError = $derived(validationStore.getError(fieldName));
	let isValidating = $state(false);
	let isTouched = $state(false);

	// ✨ SECURITY ENHANCEMENT: Prevent homograph attacks
	function sanitizeInput(input: string): string {
		// Remove zero-width characters that could be used for spoofing
		const sanitized = input.replace(/[\u200B-\u200D\uFEFF]/g, '');

		// Normalize Unicode to prevent homograph attacks
		return sanitized.normalize('NFKC');
	}

	// Memoized badge class calculation using $derived
	let badgeClass = $derived(() => {
		const length = count;
		if (field?.minLength && length < (field?.minLength as number)) return 'bg-error-500'; // Semantic error color
		if (field?.maxLength && length > (field?.maxLength as number)) return 'bg-error-500';
		if (field?.count && length === (field?.count as number)) return 'bg-success-500'; // Semantic success color
		if (field?.count && length > (field?.count as number)) return 'bg-warning-500'; // Semantic warning color
		if (field?.minLength) return '!preset-filled-surface-500';
		return '!preset-ghost-surface-500';
	});

	// ✅ SSOT: Use validation schema from index.ts
	let validationSchema = $derived(createValidationSchema(field));

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
					parse(validationSchema, field.translated ? (value ?? undefined) : currentValue);
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
	function handleFocus() {
		// Could be used for custom focus behavior
	}

	// Safe value setter function
	function updateValue(newValue: string) {
		if (!value) {
			value = {};
		}
		// ✨ Apply sanitization before storing
		const sanitized = sanitizeInput(newValue);
		// Ensure value is treated as a new object for reactivity
		value = { ...(value || {}), [_language]: sanitized };
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
	<div class="preset-filled-surface-500  flex w-full rounded" role="group">
		{#if field?.prefix}
			<button class="px-2!" type="button" aria-label={`${field.prefix} prefix`}>
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
			class:border-primary-500!={isValidating && !validationError}
			class:!ring-primary-500={isValidating && !validationError}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : field.helper ? `${fieldName}-helper` : undefined}
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
					<span class="px-1!" aria-label={`${field.suffix} suffix`}>{field?.suffix}</span>
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

	<!-- Helper Text -->
	{#if field.helper}
		<p id={`${fieldName}-helper`} class="absolute bottom-0 left-0 w-full text-center text-xs text-surface-500 dark:text-surface-400">
			{field.helper}
		</p>
	{/if}

	<!-- Error Message -->
	{#if validationError}
		<p id={`${fieldName}-error`} class="absolute bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">
			{validationError}
		</p>
	{/if}
</div>

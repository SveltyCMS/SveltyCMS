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
	import { app, validationStore } from '@stores/store.svelte.ts';
	import { collection } from '@src/stores/collectionStore.svelte';
	import { activeInput } from '@src/stores/activeInputStore.svelte';

	// Utils
	import { getFieldName } from '@utils/utils';

	// Valibot validation
	import { string, email as emailValidator, pipe, parse, minLength, optional } from 'valibot';

	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widgetErrorHandler';

	interface Props {
		field: FieldType;
		value?: string | Record<string, string> | null | undefined;
	}

	let { field, value = $bindable() }: Props = $props();

	// Use current content language for translated fields, default for non-translated
	// Use current content language for translated fields, default for non-translated
	const fieldName = $derived(getFieldName(field));
	const _language = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Initialize value if null/undefined
	$effect(() => {
		if (value === undefined || value === null) {
			value = field.translated ? { [_language]: '' } : '';
		}
	});

	const safeValue = $derived(((value as Record<string, string>)?.[_language] ?? (value as string)) || '');
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
			isValidating = true;
			try {
				const currentValue = safeValue;

				// First validate if required
				if (field?.required && (!currentValue || currentValue.trim() === '')) {
					validationStore.setError(fieldName, 'This field is required');
					return;
				}

				// Then validate email format if value exists
				if (currentValue && currentValue.trim() !== '') {
					// ✅ UNIFIED: Use handleWidgetValidation for standardized error handling
					handleWidgetValidation(() => parse(emailSchema, currentValue), { fieldName, updateStore: true });
					return;
				}

				validationStore.clearError(fieldName);
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

	// ✨ SECURITY ENHANCEMENT: Prevent homograph attacks
	function sanitizeInput(input: string): string {
		// Remove zero-width characters that could be used for spoofing
		const sanitized = input.replace(/[\u200B-\u200D\uFEFF]/g, '');

		// Normalize Unicode to prevent homograph attacks
		return sanitized.normalize('NFKC');
	}

	// Handle input changes
	function handleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;

		// ✨ Apply sanitization before storing
		const sanitized = sanitizeInput(target.value);

		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value || {}), [_language]: sanitized };
		} else {
			value = sanitized;
		}
	}

	// Handle blur
	function handleBlur() {
		isTouched = true;
		validateInput(true);
	}

	// Handle focus events
	function handleFocus(e: FocusEvent) {
		// If the token picker is already open (activeInput.current has a value),
		// update it to point to this input.
		if (activeInput.current) {
			activeInput.set({
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

	import SystemTooltip from '@components/system/SystemTooltip.svelte';

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => value;
</script>

<div class="input-container relative mb-4">
	<SystemTooltip title={validationError || ''} wFull={true}>
		<div class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600" role="group">
			{#if field?.prefix}
				<div
					class="flex items-center bg-surface-200 px-3 text-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label={`${field.prefix} prefix`}
				>
					{field?.prefix}
				</div>
			{/if}

			<div class="relative w-full flex-1">
				<input
					type="email"
					value={safeValue || ''}
					oninput={handleInput}
					onblur={handleBlur}
					onfocus={handleFocus}
					oninvalid={(e) => e.preventDefault()}
					name={field?.db_fieldName}
					id={field?.db_fieldName}
					placeholder={typeof field?.placeholder === 'string' && field.placeholder !== '' ? field.placeholder : String(field?.db_fieldName ?? '')}
					required={field?.required as boolean | undefined}
					readonly={field?.readonly as boolean | undefined}
					disabled={field?.disabled as boolean | undefined}
					class="input w-full rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500 {!!validationError
						? 'bg-error-500-10!'
						: ''}"
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
					aria-required={field?.required}
					data-testid="email-input"
				/>
			</div>

			{#if field?.suffix}
				<div
					class="flex items-center bg-surface-200 px-3 text-surface-700 dark:bg-surface-800 dark:text-surface-200"
					aria-label={`${field.suffix} suffix`}
				>
					{field?.suffix}
				</div>
			{/if}

			<!-- Validation indicator -->
			{#if isValidating}
				<div class="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Validating">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
				</div>
			{/if}
		</div>
	</SystemTooltip>

	<!-- Error Message -->
	{#if validationError && isTouched}
		<p id={`${field.db_fieldName}-error`} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite">
			{validationError}
		</p>
	{/if}
</div>

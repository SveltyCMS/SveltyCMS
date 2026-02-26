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
	// Components
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { tokenTarget } from '@src/services/token/token-target';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	// Stores
	import { app, validationStore } from '@src/stores/store.svelte.ts';
	import { getFieldName } from '@utils/utils';
	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { onDestroy, onMount } from 'svelte';

	// Valibot validation
	import { minLength, optional, parse, pipe, regex, string } from 'valibot';
	import type { FieldType } from '.';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = $bindable() }: Props = $props();

	const fieldName = $derived(getFieldName(field));
	// Use current content language for translated fields, default for non-translated
	const LANGUAGE = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Initialize value if null/undefined
	$effect(() => {
		if (value === undefined || value === null) {
			value = field.translated ? { [LANGUAGE]: '' } : '';
		}
	});

	const safeValue = $derived(value?.[LANGUAGE] ?? '');
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
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		const doValidation = () => {
			isValidating = true;
			try {
				const currentValue = safeValue;

				// First validate if required
				if (field?.required && (!currentValue || currentValue.trim() === '')) {
					validationStore.setError(fieldName, 'This field is required');
					return;
				}

				// Then validate phone format if value exists
				if (currentValue && currentValue.trim() !== '') {
					// ✅ UNIFIED: Use handleWidgetValidation for standardized error handling
					handleWidgetValidation(() => parse(phoneSchema, currentValue), {
						fieldName,
						updateStore: true
					});
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

	// Handle input changes
	function handleInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...value, [LANGUAGE]: target.value };
		} else {
			value = target.value;
		}
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
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}
	});

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
					type="tel"
					value={safeValue || ''}
					oninput={handleInput}
					onblur={handleBlur}
					oninvalid={(e) => e.preventDefault()}
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
					class="input w-full rounded-none border-none bg-white font-medium text-black outline-none focus:ring-0 dark:bg-surface-900 dark:text-primary-500 {validationError
						? 'bg-error-500-10!'
						: ''}"
					aria-invalid={!!validationError}
					aria-describedby={validationError ? `${fieldName}-error` : undefined}
					aria-required={field?.required}
					data-testid="phone-input"
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
				<div class="flex items-center bg-white px-2 dark:bg-surface-900" aria-label="Validating">
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

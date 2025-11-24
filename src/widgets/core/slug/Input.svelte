<!--
@file src/widgets/core/slug/Input.svelte
@component
**Slug Input Widget Component**

A specialized input for URL-friendly slugs that can be generated from token patterns.

@example
<Slug field={{ label: "URL Slug", db_fieldName: "slug", pattern: "{{entry.title | slugify}}" }} />
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import type { FieldType } from '.';
	import { getFieldName } from '@src/utils/utils';
	import { untrack } from 'svelte';
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
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { contentLanguage } from '@src/stores/store.svelte';

	// Token system
	import TokenPicker from '@components/TokenPicker.svelte';
	import { getAvailableTokens } from '@src/services/token/TokenRegistry';
	import { replaceTokens } from '@src/services/token/TokenService';
	import type { TokenDefinition, TokenContext } from '@src/services/token/types';
	import { collection } from '@src/stores/collectionStore.svelte';
	import { collectionValue } from '@src/stores/collectionStore.svelte';
	import { page } from '$app/state';
	import { tokenTarget } from '@src/actions/tokenTarget';

	interface Props {
		field: FieldType;
		value?: Record<string, string> | null | undefined;
		validateOnMount?: boolean;
		validateOnChange?: boolean;
		validateOnBlur?: boolean;
		debounceMs?: number;
	}

	let {
		field,
		value = $bindable(),
		validateOnMount = false,
		validateOnChange = true,
		validateOnBlur = true,
		debounceMs = 300
	}: Props = $props();

	// Token picker state
	let showTokenPicker = $state(false);
	let availableTokens = $state<TokenDefinition[]>([]);
	const user = $derived(page.data?.user);
	const roles = $derived(page.data?.roles || []);
	const currentCollection = $derived(collection.value);
	const currentEntry = $derived(collectionValue.value as Record<string, unknown> | undefined);

	// Load available tokens
	$effect(() => {
		if (currentCollection) {
			availableTokens = getAvailableTokens(
				currentCollection,
				user,
				{},
				currentEntry,
				publicEnv as Record<string, unknown>,
				roles,
				field
			);
		}
	});

	// Language for non-translated fields
	const _language = $derived(
		field.translated
			? contentLanguage.value
			: ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase()
	);

	let safeValue = $derived(value?.[_language] ?? '');
	let count = $derived(safeValue?.length ?? 0);

	// Validation state
	let debounceTimeout: number | undefined;
	let hasValidatedOnMount = $state(false);
	let fieldName = getFieldName(field);
	let validationError = $derived(validationStore.getError(fieldName));
	let isValidating = $state(false);
	let isTouched = $state(false);

	// Validation schema
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

	// Auto-generate slug from pattern
	async function generateSlugFromPattern(): Promise<void> {
		const pattern = (field as { pattern?: string }).pattern;
		const autoUpdate = (field as { autoUpdate?: boolean }).autoUpdate ?? true;
		if (!pattern || !autoUpdate) {
			return;
		}

		try {
			const context: TokenContext = {
				entry: currentEntry,
				collection: currentCollection,
				user,
				site: publicEnv as Record<string, unknown>,
				system: {
					now: new Date()
				}
			};

			const result = await replaceTokens(pattern, context);
			if (result.result && result.result !== safeValue) {
				updateValue(result.result);
			}
		} catch (error) {
			logger.error('Error generating slug from pattern:', error);
		}
	}

	// Watch for entry changes and auto-update slug
	$effect(() => {
		const autoUpdate = (field as { autoUpdate?: boolean }).autoUpdate ?? true;
		const pattern = (field as { pattern?: string }).pattern;
		if (autoUpdate && pattern && currentEntry) {
			// Debounce the generation
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			debounceTimeout = window.setTimeout(() => {
				generateSlugFromPattern();
			}, 500);
		}
	});

	// Validation function
	async function validateInput(immediate = false): Promise<string | null> {
		const currentValue = safeValue;

		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
			debounceTimeout = undefined;
		}

		const doValidation = async () => {
			isValidating = true;

			try {
				if (field?.required && (currentValue === null || currentValue === undefined || currentValue === '')) {
					const error = 'This field is required';
					validationStore.setError(fieldName, error);
					return error;
				}

				if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
					if (
						typeof field?.minLength === 'number' &&
						typeof currentValue === 'string' &&
						currentValue.length < field.minLength
					) {
						const error = `Minimum length is ${field.minLength}`;
						validationStore.setError(fieldName, error);
						return error;
					}
					if (
						typeof field?.maxLength === 'number' &&
						typeof currentValue === 'string' &&
						currentValue.length > field.maxLength
					) {
						const error = `Maximum length is ${field.maxLength}`;
						validationStore.setError(fieldName, error);
						return error;
					}
				}

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

	function handleInput() {
		if (validateOnChange) {
			validateInput(false);
		}
	}

	async function handleBlur() {
		isTouched = true;
		if (validateOnBlur) {
			await validateInput(true);
		}
	}

	function updateValue(newValue: string) {
		if (!value) {
			value = {};
		}
		value = { ...(value || {}), [_language]: newValue };
	}

	let inputRef = $state<HTMLInputElement | null>(null);

	function handleTokenSelect(tokenString: string) {
		const currentValue = safeValue || '';
		const cursorPos = inputRef?.selectionStart || currentValue.length;
		const newValue = currentValue.slice(0, cursorPos) + tokenString + currentValue.slice(cursorPos);
		updateValue(newValue);
		showTokenPicker = false;

		setTimeout(() => {
			if (inputRef) {
				inputRef.focus();
				const newCursorPos = cursorPos + tokenString.length;
				inputRef.setSelectionRange(newCursorPos, newCursorPos);
			}
		}, 0);
	}

	$effect(() => {
		return () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
		};
	});

	$effect(() => {
		if (validateOnMount && !hasValidatedOnMount) {
			hasValidatedOnMount = true;
			untrack(() => {
				validateInput(true);
			});
		}
	});

	$effect(() => {
		if (isTouched && validateOnChange) {
			validateInput(false);
		}
	});

	export const WidgetData = async () => value;
</script>

<div class="relative mb-4 min-h-10 w-full pb-6">
	<div class="variant-filled-surface btn-group flex w-full rounded" role="group">
		<input
			bind:this={inputRef}
			type="text"
			value={safeValue}
			use:tokenTarget={{
				name: field.db_fieldName,
				label: field.label,
				collection: collection.value?.name
			}}
			oninput={(e) => {
				updateValue(e.currentTarget.value);
				handleInput();
			}}
			onblur={handleBlur}
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
			data-testid="slug-input"
		/>

		<!-- Token Picker Button -->
		<button
			type="button"
			onclick={() => {
				showTokenPicker = true;
			}}
			class="btn-icon btn-sm"
			aria-label="Insert token"
			title="Insert token"
		>
			<iconify-icon icon="mdi:code-tags" width="18"></iconify-icon>
		</button>

		<!-- Generate from Pattern Button -->
		{#if (field as { pattern?: string }).pattern}
			<button
				type="button"
				onclick={generateSlugFromPattern}
				class="btn-icon btn-sm"
				aria-label="Generate from pattern"
				title="Generate from pattern"
			>
				<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
			</button>
		{/if}
	</div>

	<!-- Helper text showing pattern -->
	{#if (field as { pattern?: string }).pattern}
		<p class="mt-1 text-xs text-surface-500">
			Pattern: <code class="text-primary-400">{(field as { pattern?: string }).pattern}</code>
		</p>
	{/if}

	<!-- Error Message -->
	{#if validationError}
		<p
			id={`${fieldName}-error`}
			class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500"
			role="alert"
			aria-live="polite"
		>
			{validationError}
		</p>
	{/if}
</div>

<!-- Token Picker -->
<TokenPicker
	tokens={availableTokens}
	onSelect={handleTokenSelect}
	bind:open={showTokenPicker}
	onClose={() => {
		showTokenPicker = false;
	}}
/>


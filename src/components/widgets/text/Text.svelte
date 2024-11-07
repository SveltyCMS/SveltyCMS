<!-- 
 @file src/components/widgets/text/Text.svelte 
 @description Text field with 
 
 Features: 
 - Count and length badge
 - Translation progress
 - Valibot validation
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';
	import { onMount, onDestroy } from 'svelte';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage.toLowerCase() : publicEnv.DEFAULT_CONTENT_LANGUAGE.toLowerCase();
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	let debounceTimeout: number | undefined;
	let inputElement: HTMLInputElement | null = null;

	// Reactive statement to update count with memoization
	$: count = _data[_language]?.length ?? 0;

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

	// Valibot validation
	import { string, minLength, maxLength, pipe, parse, type ValiError } from 'valibot';

	// Define the validation schema for the text field
	$: valueSchema = pipe(
		string(),
		field?.minlength ? minLength(field.minlength, `Minimum length is ${field.minlength}`) : string(),
		field?.maxlength ? maxLength(field.maxlength, `Maximum length is ${field.maxlength}`) : string()
	);

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(data: unknown): string | null {
		try {
			parse(valueSchema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if ((error as ValiError<typeof valueSchema>).issues) {
				console.debug('Validation error : ', error);
				const valiError = error as ValiError<typeof valueSchema>;
				const errorMessage = valiError.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Debounced validation function with error boundary
	function validateInput() {
		try {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = window.setTimeout(() => {
				validationError = validateSchema(_data[_language]);
			}, 300);
		} catch (error) {
			console.error('Validation error:', error);
			validationError = 'An unexpected error occurred during validation';
			validationStore.setError(fieldName, 'Validation error');
		}
	}

	// Cleanup on component destroy
	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		badgeClassCache.clear();
	});

	// Focus management
	onMount(() => {
		if (field?.required && !_data[_language]) {
			inputElement?.focus();
		}
	});

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<div class="variant-filled-surface btn-group flex w-full rounded" role="group">
	{#if field?.prefix}
		<button class="!px-2" aria-label={`${field.prefix} prefix`}>
			{field?.prefix}
		</button>
	{/if}

	<input
		type="text"
		bind:value={_data[_language]}
		on:blur={validateInput}
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
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-xs text-error-500" role="alert">
		{validationError}
	</p>
{/if}

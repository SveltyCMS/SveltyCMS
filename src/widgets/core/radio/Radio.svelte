<!-- 
@file src/widgets/core/radio/Radio.svelte
@component 
**Radio widget component that allows users to select a single option from a list of options.**
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';
	import { onMount, onDestroy } from 'svelte';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	// Valibot validation
	import { string, pipe, parse, type ValiError, nonEmpty } from 'valibot';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = {} }: Props = $props();

	const fieldName = getFieldName(field);
	value = value || collectionValue.value[fieldName] || {};

	let _data = $state(mode.value === 'create' ? {} : value);
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let inputElement = $state<HTMLInputElement | null>(null);

	// Computed values
	let _language = $derived(field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE);

	// Update translation progress when data or field changes
	$effect(() => {
		updateTranslationProgress(_data, field);
	});

	// Create validation schema for radio
	const radioSchema = pipe(string(), nonEmpty('Selection is required'));

	// Validation function
	function validateInput() {
		try {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = window.setTimeout(() => {
				try {
					const value = _data[_language];

					// First validate if required
					if (field?.required && (!value || value.trim() === '')) {
						validationError = 'This field is required';
						validationStore.setError(fieldName, validationError);
						return;
					}

					// Then validate value if exists
					if (value && value.trim() !== '') {
						parse(radioSchema, value);
					}

					validationError = null;
					validationStore.clearError(fieldName);
				} catch (error) {
					if ((error as ValiError<typeof radioSchema>).issues) {
						const valiError = error as ValiError<typeof radioSchema>;
						validationError = valiError.issues[0]?.message || 'Invalid input';
						validationStore.setError(fieldName, validationError);
					}
				}
			}, 300);
		} catch (error) {
			console.error('Validation error:', error);
			validationError = 'An unexpected error occurred during validation';
			validationStore.setError(fieldName, 'Validation error');
		}
	}

	// Focus management and cleanup
	onMount(() => {
		if (field?.required && !_data[_language]) {
			inputElement?.focus();
		}
	});

	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	export const WidgetData = async () => _data;
</script>

<div class="input-container relative mb-4">
	<div class="flex w-full items-center gap-2">
		<!-- Radio -->
		<input
			bind:this={inputElement}
			id={fieldName}
			type="radio"
			bind:value={_data.value}
			onblur={validateInput}
			color={field.color}
			required={field?.required}
			class="input border-surface-300 checked:border-tertiary-600 checked:bg-tertiary-600 float-left mt-1 mr-4 h-4 w-4 cursor-pointer appearance-none rounded-full border bg-white bg-contain bg-center bg-no-repeat align-top text-black transition duration-200 focus:outline-hidden dark:text-white"
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
			data-testid="radio-input"
		/>

		<!-- Label -->
		<input
			type="text"
			id={`label-${fieldName}`}
			onblur={validateInput}
			placeholder="Define Label"
			bind:value={_data[_language]}
			required={field?.required}
			class="input dark:text-primary-500 w-full text-black"
			class:error={!!validationError}
			aria-labelledby={`label-${fieldName}`}
			aria-required={field?.required}
		/>
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="text-error-500 absolute bottom-[-1rem] left-0 w-full text-center text-xs" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style>
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>

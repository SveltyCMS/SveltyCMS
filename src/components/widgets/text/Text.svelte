<!-- 
 @file src/components/widgets/text/Text.svelte 
 @description Text field. 
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

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

	// Reactive statement to update count
	$: count = _data[_language]?.length ?? 0;

	const getBadgeClass = (length: number) => {
		if (field?.minlength && length < field?.minlength) return 'bg-red-600';
		else if (field?.maxlength && length > field?.maxlength) return 'bg-red-600';
		else if (field?.count && length === field?.count) return 'bg-green-600';
		else if (field?.count && length > field?.count) return 'bg-orange-600';
		else if (field?.minlength) return '!variant-filled-surface';
		else return '!variant-ghost-surface';
	};

	// Valibot validation
	import { object, string, number, boolean, optional, minLength, maxLength, pipe, parse, type InferInput, type ValiError } from 'valibot';

	// Define the validation schema for the text field
	const valueSchema = pipe(
		string(),
		field?.minlength ? minLength(field.minlength, `Minimum length is ${field.minlength}`) : string(),
		field?.maxlength ? maxLength(field.maxlength, `Maximum length is ${field.maxlength}`) : string()
	);

	const widgetSchema = object({
		value: optional(valueSchema),
		db_fieldName: string(),
		icon: optional(string()),
		color: optional(string()),
		width: optional(number()),
		required: optional(boolean())
	});

	type WidgetSchemaType = InferInput<typeof widgetSchema>;

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(data: unknown): string | null {
		try {
			parse(widgetSchema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if ((error as ValiError<typeof widgetSchema>).issues) {
				console.debug('Validation error : ', error);
				const valiError = error as ValiError<typeof widgetSchema>;
				const errorMessage = valiError.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Debounced validation function
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validationError = validateSchema({
				value: _data[_language],
				db_fieldName: getFieldName(field)
			});
		}, 300);
	}

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<div class="variant-filled-surface btn-group flex w-full rounded">
	{#if field?.prefix}
		<button class="!px-2">{field?.prefix}</button>
	{/if}

	<input
		type="text"
		bind:value={_data[_language]}
		on:blur={validateInput}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		disabled={field?.disabled}
		readonly={field?.readonly}
		minlength={field?.minlength}
		maxlength={field?.maxlength}
		class="input w-full flex-1 rounded-none text-black dark:text-primary-500"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${fieldName}-error` : undefined}
	/>

	<!-- suffix -->
	{#if field?.suffix}
		<button class="!px-1">
			{#if field?.count || field?.minlength || field?.maxlength}
				<span class="badge mr-1 rounded-full {getBadgeClass(count)}">
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
			{field?.suffix}
		</button>
	{:else if field?.count || field?.minlength || field?.maxlength}
		<span class="badge rounded-none {getBadgeClass(count)}">
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
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-xs text-error-500">{validationError}</p>
{/if}

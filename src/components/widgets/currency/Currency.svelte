<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData, contentLanguage } from '@stores/store';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;

	let numberInput: HTMLInputElement;
	let language = $contentLanguage;

	export const WidgetData = async () => _data;

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value;
		const decimalSeparator = getDecimalSeparator(language);
		if (value[value.length - 1] !== decimalSeparator) {
			const number = parseFloat(value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.'));
			if (!isNaN(number)) {
				target.value = new Intl.NumberFormat(language, { maximumFractionDigits: 20 }).format(number);
			} else {
				target.value = value;
			}
		}
	}

	function getDecimalSeparator(language: string) {
		const numberWithDecimalSeparator = new Intl.NumberFormat(language).format(1.1);
		return numberWithDecimalSeparator.substring(1, 2);
	}

	$: if (numberInput) {
		const value = numberInput.value;
		const decimalSeparator = getDecimalSeparator(language);
		const number = parseFloat(value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.'));
		if (!isNaN(number)) {
			numberInput.value = new Intl.NumberFormat(language, { maximumFractionDigits: 20 }).format(number);
		} else {
			numberInput.value = value;
		}
	}

	// Reactive statement to update count
	$: count = _data[_language]?.length ?? 0;
	const getBadgeClass = (length: number) => {
		if (field?.minlength && length < field?.minlength) {
			return 'bg-red-600';
		} else if (field?.maxlength && length > field?.maxlength) {
			return 'bg-red-600';
			// } else if (field?.count && length === field?.count) {
			// 	return 'bg-green-600';
			// } else if (field?.count && length > field?.count) {
			// 	return 'bg-orange-600';
		} else if (field?.minlength) {
			return '!variant-filled-surface';
		} else {
			return '!variant-ghost-surface';
		}
	};

	// zod validation
	import * as z from 'zod';

	// Customize the error messages for each rule
	const validateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		size: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional(),

		// Widget Specfic
		checked: z.boolean(),
		label: z.string().min(1, 'Label cannot be empty')
	});

	function validateInput() {
		try {
			// Change .parseAsync to .parse
			validateSchema.parse(_data[_language]);
			validationError = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				validationError = error.errors[0].message;
			}
		}
	}
</script>

<div class="variant-filled-surface btn-group flex w-full rounded">
	{#if field?.prefix}
		<button class=" !px-2">{field?.prefix}</button>
	{/if}

	<input
		type="text"
		bind:value={_data[_language]}
		bind:this={numberInput}
		on:input|preventDefault={handleInput}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		minlength={field?.minlength}
		maxlength={field?.maxlength}
		step={field?.step}
		class="input text-black dark:text-primary-500"
	/>

	<!-- suffix -->
	{#if field?.suffix}
		<button class="!px-1">
			{#if field?.minlength || field?.maxlength}
				<span class="badge mr-1 rounded-full {getBadgeClass(count)}">
					{#if field?.minlength && field?.maxlength}
						{count}/{field?.maxlength}
					{:else if field?.maxlength}
						{count}/{field?.maxlength}
					{:else if field?.minlength}
						min {field?.minlength}
					{/if}
				</span>
			{/if}
			{field?.suffix}
		</button>
	{:else if field?.minlength || field?.maxlength}
		<span class="badge rounded-none {getBadgeClass(count)}">
			{#if field?.minlength && field?.maxlength}
				{count}/{field?.maxlength}
			{:else if field?.maxlength}
				{count}/{field?.maxlength}
			{:else if field?.minlength}
				min {field?.minlength}
			{/if}
		</span>
	{/if}
</div>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}

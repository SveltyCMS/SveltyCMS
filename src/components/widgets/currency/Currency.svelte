<script lang="ts">
	import { locale } from '$i18n/i18n-svelte';
	import { get } from 'svelte/store';
	import * as z from 'zod';

	export let field: any = undefined;
	export let value: string = '';

	export let widgetValue;
	$: widgetValue = value;

	let formattedValue = '';

	const widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		placeholder: field.placeholder,
		prefix: field.prefix,
		suffix: field.suffix,
		min: field.min,
		max: field.max,
		step: field.step,
		negative: field.negative,
		required: field.required
	};

	const numberSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		placeholder: z.string().optional(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
		min: z.number().gte(field.min, { message: 'Value too small' }).optional(),
		max: z.number().lte(field.max, { message: 'Value too large' }).optional(),
		step: z.number().multipleOf(field.step, { message: 'Step too large' }).optional(),
		negative: z.boolean().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			numberSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();

	// create a reactive statement that updates the formatted value whenever the value changes
	$: {
		// round the value to 2 decimal places
		const roundedValue = Math.round(value * 100) / 100;

		formattedValue = new Intl.NumberFormat(get(locale), {
			style: 'currency',
			currencyDisplay: 'symbol',
			currency: 'EUR'
		}).format(roundedValue);
	}

	// create a zod schema for validation
	const schema = z.number().min(field.min).max(field.max);
</script>

<div class="input-group grid-cols-[auto_1fr_auto]">
	<!-- prefix -->
	{#if field.prefix}
		<div class="text-surface-600 dark:text-surface-200 sm:!pr-[1rem] !pr-0">{field.prefix}</div>
	{/if}

	<input
		bind:value
		type="number"
		step={field.step}
		required={field.required}
		placeholder={field.placeholder && field.placeholder !== ''
			? field.placeholder
			: field.db_fieldName}
		class="input w-full {field.suffix ? '' : 'col-span-2'}"
	/>

	<!-- suffix -->
	{#if field.suffix}
		<span class="text-surface-600 dark:text-surface-200 self-center pr-2">{field.suffix}</span>
	{/if}
</div>

<!-- display formatted value -->
<p class="text-center">
	Formated <span class="uppercase">{get(locale)}</span> Value :
	<span class="text-primary-600 ">{formattedValue}</span>
</p>

<!-- error messages -->

{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}

<style>
	.invalid {
		color: red;
	}
</style>

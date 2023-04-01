<script lang="ts">
	import { locale } from '$i18n/i18n-svelte';
	import { get } from 'svelte/store';
	import * as z from 'zod';

	export let field: any = undefined;
	export let value: string = '';

	export let widgetValue: number | null = null;
	$: widgetValue = value ? parseFloat(value.replace(/[^\d.-]/g, '')) : null;

	const widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		placeholder: field.placeholder,
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

	// Check if user input is number
	const onKeyPress = (e: KeyboardEvent) => {
		if (!isFinite(parseInt(e.key))) {
			e.preventDefault();
			validationError = 'Invalid character';
			return;
		} else {
			validationError = null;
		}
	};

	// Reformat the number value without dots and commas so numberformat can format the number (else we get a NaN)
	$: if (value != null && value !== '') {
		value = new Intl.NumberFormat(get(locale)).format(parseFloat(value.replace(/[^\d.-]/g, '')));
	}

	// Initial format
	const format = (node: HTMLInputElement) => {
		if (node && node.value != '') {
			node.value = new Intl.NumberFormat(get(locale)).format(
				parseFloat(node.value.replace(/[^\d.-]/g, ''))
			);
		}
	};

	// If the locale changes, update the value
	locale.subscribe((n) => {
		if (value != null) {
			value = new Intl.NumberFormat(n).format(parseFloat(value.replace(/[^\d.-]/g, '')));
		}
	});
</script>

<!-- TODO: 
	user type="number"
	add negative={field.negative} 
	fix null value
-->
<input
	bind:value
	on:keypress={onKeyPress}
	use:format
	type="text"
	min={field.min}
	max={field.max}
	step={field.step}
	required={field.required}
	placeholder={field.placeholder && field.placeholder !== ''
		? field.placeholder
		: field.db_fieldName}
	class="input w-full rounded-md"
/>
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}

<script lang="ts">
	import { locale } from '$i18n/i18n-svelte';
	import { get } from 'svelte/store';
	import * as z from 'zod';

	const numberSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		placeholder: z.string().optional(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
		min: z.number().gte(5, { message: 'Value too small' }).optional(),
		max: z.number().lte(5, { message: 'Value too large' }).optional(),
		step: z.number().multipleOf(5, { message: 'Step too large' }).optional(),
		negative: z.boolean().optional(),
		required: z.boolean().optional()
	});

	export let field: any = undefined;
	export let value: string = '';

	export let widgetValue: number | null = null;
	$: widgetValue = value ? parseFloat(value.replace(/[^\d.-]/g, '')) : null;

	let validationError: string | null = null;
	$: validationError = (() => {
		try {
			numberSchema.parse(widgetValue);
			return null;
		} catch (error) {
			return error.message;
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
	$: if (value) {
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
		value = new Intl.NumberFormat(n).format(parseFloat(value.replace(/[^\d.-]/g, '')));
	});
</script>

<div class="input-group grid-cols-[auto_1fr_auto]">
	<!-- prefix -->
	{#if field.prefix}
		<div class="text-surface-600 dark:text-surface-200 sm:!pr-[1rem] !pr-0">{field.prefix}</div>
	{/if}

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
		class="input w-full {field.suffix ? '' : 'col-span-2'}"
	/>

	<!-- suffix -->
	{#if field.suffix}
		<span class="-mr-1 text-surface-600 dark:text-surface-200">{field.suffix}</span>
	{/if}
</div>

<!-- error messages -->
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}

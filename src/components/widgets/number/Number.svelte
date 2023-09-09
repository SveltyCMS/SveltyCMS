<script lang="ts">
	import type { FieldType } from '.';
	import { contentLanguage, defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';
	//console.log('contentLanguage', $contentLanguage);
	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = defaultContentLanguage;
	let valid = true;

	let numberInput: HTMLInputElement;
	let language = $contentLanguage;

	export const WidgetData = async () => _data;

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value;
		const decimalSeparator = getDecimalSeparator(language);
		if (value[value.length - 1] !== decimalSeparator) {
			const number = parseFloat(
				value
					.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '')
					.replace(decimalSeparator, '.')
			);
			if (!isNaN(number)) {
				target.value = new Intl.NumberFormat(language, { maximumFractionDigits: 20 }).format(
					number
				);
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
		const number = parseFloat(
			value.replace(new RegExp(`[^0-9${decimalSeparator}]`, 'g'), '').replace(decimalSeparator, '.')
		);
		if (!isNaN(number)) {
			numberInput.value = new Intl.NumberFormat(language, { maximumFractionDigits: 20 }).format(
				number
			);
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
</script>

<div class="btn-group variant-filled-surface flex w-full rounded">
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
		placeholder={field?.placeholder && field?.placeholder !== ''
			? field?.placeholder
			: field?.db_fieldName}
		required={field?.required}
		readonly={field?.readonly}
		minlength={field?.minlength}
		maxlength={field?.maxlength}
		step={field?.step}
		class="input flex-1 rounded-none"
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
					{:else if field?.minlength && field?.maxlength}
						{count} => {field?.minlength}/{field?.maxlength}
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
			{:else if field?.minlength && field?.maxlength}
				{count} => {field?.minlength}/{field?.maxlength}
			{:else if field?.minlength}
				min {field?.minlength}
			{/if}
		</span>
	{/if}
</div>

{#if !valid}
	<p class="text-error-500">Field is required.</p>
{/if}

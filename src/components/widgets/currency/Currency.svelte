<script lang="ts">
	import { locale } from '$i18n/i18n-svelte';
	import { get } from 'svelte/store';

	export let field: any = undefined;
	export let value: string = '';

	export let widgetValue;
	$: widgetValue = value;

	// Check if user input is number
	// TODO use alerts
	const onKeyPress = (e) => {
		if (!isFinite(e.key)) {
			e.preventDefault();
			return;
		}
	};
	// Reformat the number value without dots and commas so numberformat can format the number (else we get a NaN)
	$: if (value) {
		value = new Intl.NumberFormat(get(locale)).format(
			value.replaceAll('.', '').replaceAll(',', '')
		);
	}
	// Initial format
	const format = (node) => {
		if (node.value != '') {
			node.value = new Intl.NumberFormat(get(locale)).format(
				node.value.replaceAll('.', '').replaceAll(',', '')
			);
		}
	};
	// If the locale changes, update the value
	locale.subscribe((n) => {
		value = new Intl.NumberFormat(n).format(value.replaceAll('.', '').replaceAll(',', ''));
	});
</script>

<!-- TODO:Add Int.Number Formating(typesave-i18n?) -->
<input
	bind:value
	on:keypress={onKeyPress}
	use:format
	type="text"
	placeholder={field.placeholder && field.placeholder !== ''
		? field.placeholder
		: field.db_fieldName}
	class="input w-full rounded-md"
/>

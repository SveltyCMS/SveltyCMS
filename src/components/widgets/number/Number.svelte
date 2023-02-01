<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	// Check if user input is number
	// TODO use alerts
	const onKeyPress = (e) => {
		if (!isFinite(e.key)) {
			alert('Not A number');
		}
	};

	$: value = value.replace(/[^0-9]/g, '');
</script>

<!-- TODO:Add Int.Number Formating(typesave-i18n?) -->
<input
	bind:value
	on:keypress={onKeyPress}
	type="text"
	inputmode="numeric"
	pattern="[0-9]*"
	placeholder={field.placeholder && field.placeholder !== ''
		? field.placeholder
		: field.db_fieldName}
	class="input w-full rounded-md"
/>

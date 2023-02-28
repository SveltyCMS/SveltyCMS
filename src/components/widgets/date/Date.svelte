<script lang="ts">
	import { date } from 'typesafe-i18n/formatters';
	import { language } from '$src/stores/store';

	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	// TODO: Allow User/System to define Date formate
	let format = 'ddd, MMMM D, YYYY';

	// Use the language variable to determine the desired date format
	//$: format = date.formats[language];
</script>

<!-- TODO: Enhance Date entry -->
<input type="date" bind:value class="input rounded-md" />

<script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	let selected = 'Mr.'; // define as Placeholder

	// TODO Translate Array
	let options = ['Mr.', 'Ms.', 'Mrs.', 'Dr.']; // replace data from collection
</script>

<label class="input-label">
	<select bind:value name="selected" id="selected">
		<!-- TODO: add placeholder -->
		{#each options as value}<option {value}>{value}</option>{/each}
	</select>
</label>

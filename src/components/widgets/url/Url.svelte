<script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let field: any = undefined;
	export let value = '';
	export let widgetValue;
	let errorMessage = '';

	// TODO: Check url Only -facing CORS issue

	function checkURL() {
		let isValid = true;
		let isReachable = true;

		const regex =
			/^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$/;
		if (!regex.test(value)) {
			isValid = false;
			isReachable = false;
		}
		if (!isValid) {
			errorMessage = "Not a valid url input won't input won't save VALUE";
		} else if (!isReachable) {
			errorMessage = 'Url is not reachable, but Input will allow save VALUE';
			widgetValue = 'URL is not reachable';
		} else {
			widgetValue = 'URL is reachable';
		}
	}
</script>

<input
	bind:value
	on:input={checkURL}
	placeholder={field.placeholder && field.placeholder !== ''
		? field.placeholder
		: field.db_fieldName}
	type="url"
	id="website"
	autocomplete="off"
	class="input w-full rounded-md"
/>

{#if errorMessage !== ''}
	<p class="text-error-600">{errorMessage}</p>
{/if}

<span dangerouslySetInnerHTML={widgetValue} />

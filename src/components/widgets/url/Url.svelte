<script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let field: any = undefined;
	export let value = '';
	export let widgetValue: any;
	let errorMessage = '';
	let urlIsReachable = false;

	// Zod vailidation
	import z from 'zod';

	const urlSchema = z.string().refine((value) => isValidURL(value), {
		message: 'Invalid url'
	});

	function isValidURL(value: string) {
		if (!value) {
			return false;
		}
		try {
			if (!value.startsWith('http://') && !value.startsWith('https://')) {
				value = 'https://' + value;
			}
			new URL(value);
			return true;
		} catch {
			return false;
		}
	}

	async function checkURL() {
		const inputElement = document.querySelector('input');
		if (!inputElement) return;

		let url = inputElement.value;
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}

		try {
			urlSchema.parse(url);
			errorMessage = '';

			if (typeof window !== 'undefined') {
				const response = await fetch(url);
				if (response.ok) {
					widgetValue = response.url;
					urlIsReachable = true;
				} else {
					widgetValue = 'URL is not reachable';
					urlIsReachable = false;
				}
			}
		} catch (error) {
			errorMessage = (error as Error).message;
			urlIsReachable = false;
		}
	}
	// console.log('urlSchema' + urlSchema.parse);
	// console.log('isValidURL' + isValidURL);
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

{@html widgetValue}

{#if urlIsReachable}
	<span style="color:green;">✔️</span>
{/if}

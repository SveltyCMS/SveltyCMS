<script lang="ts">
	export let field: any = undefined;
	export let value = '';
	export let widgetValue: any;
	let errorMessage = '';
	let urlIsReachable = false;

	import z from 'zod';

	const urlSchema = z.string().refine((value) => isValidURL(value), {
		message: 'Invalid url'
	});

	function isValidURL(value: string) {
		console.log('isValidURL called with value:', value);
		if (!value) {
			return false;
		}
		try {
			if (!value.startsWith('http://') && !value.startsWith('https://')) {
				value = 'https://' + value;
			}
			new URL(value);
			console.log('isValidURL returning true');
			return true;
		} catch {
			console.log('isValidURL returning false');
			return false;
		}
	}

	async function checkURL() {
		const inputElement = document.querySelector('#website') as HTMLInputElement;
		if (!inputElement) return;

		let url = inputElement.value;
		if (!url) {
			errorMessage = '';
			widgetValue = '';
			urlIsReachable = false;
			return;
		}

		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}

		if (isValidURL(url)) {
			try {
				urlSchema.parse(url);
				errorMessage = '';

				if (typeof window !== 'undefined') {
					const proxyUrl = 'https://api.allorigins.win/raw?url=';
					const response = await fetch(proxyUrl + encodeURIComponent(url));
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
		} else {
			errorMessage = 'Invalid URL';
			urlIsReachable = false;
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
	class="input w-full rounded-md"
/>

{#if errorMessage !== ''}
	<p class="text-error-600">{errorMessage}</p>
{/if}

{@html widgetValue}

{#if urlIsReachable}
	<span class="text-green-500">✔️</span>
{/if}

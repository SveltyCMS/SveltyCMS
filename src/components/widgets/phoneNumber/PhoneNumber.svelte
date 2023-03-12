<script lang="ts">
	export let field: any = undefined;
	export let values = '';

	export let widgetValue;
	$: widgetValue = value;

	// https://github.com/gyurielf/svelte-tel-input
	// add format like  https://svelte-tel-input.vercel.app/

	import TelInput, { normalizedCountries } from 'svelte-tel-input';
	// Any Country Code Alpha-2 (ISO 3166)
	let selectedCountry = 'DE';

	// You must use E164 number format. It's guarantee the parsing and storing consistency. The library will always update (via binding) to E164 format.
	let value = '';

	// Optional - Extended information about the parsed phone number
	let parsedTelInput: { nationalNumber: any } | null = null;

	// Field validity
	let isValid = true;
</script>

<div class="input-group input-group-divider grid-cols-[auto_1fr_auto]">
	<select
		class="country-select {!isValid && 'invalid'} "
		aria-label="Default select example"
		name="Country"
		bind:value={selectedCountry}
	>
		<option value={null} hidden={selectedCountry !== null}>Please select</option>
		{#each normalizedCountries as country (country.id)}
			<option
				value={country.iso2}
				selected={country.iso2 === selectedCountry}
				aria-selected={country.iso2 === selectedCountry}
			>
				{country.iso2} (+{country.dialCode})
			</option>
		{/each}
	</select>

	<TelInput
		bind:valid={isValid}
		bind:country={selectedCountry}
		bind:value
		bind:parsedTelInput
		class="basic-tel-input {!isValid && 'invalid'}"
	/>
</div>

<!-- Just to show the nicely parsed phone number to you-->
{#if value && isValid && parsedTelInput?.nationalNumber}
	<h3>
		<span>Tel: <a href="tel:{value}">{selectedCountry} {parsedTelInput.nationalNumber}</a></span>
	</h3>
{/if}

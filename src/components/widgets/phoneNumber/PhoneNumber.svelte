<script lang="ts">
	export let field: any = undefined;
	export let value: string = '';

	export let widgetValue;
	$: widgetValue = value;

	import { TelInput, normalizedCountries } from 'svelte-tel-input';
	import type { NormalizedTelNumber, CountryCode, E164Number } from 'svelte-tel-input/types';

	// Any Country Code Alpha-2 (ISO 3166)
	let country: CountryCode | null = 'HU';
	let selectedCountry = null;

	// You must use E164 number format. It's guarantee the parsing and storing consistency.
	//let value: E164Number | null = '+36301234567';

    // Validity
    let valid = true;

	// Optional - Extended details about the parsed phone number
	let parsedTelInput: NormalizedTelNumber | null = null;
</script>

<div class="wrapper">
	<select
		class="country-select {!valid && 'invalid'}"
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
    <TelInput bind:country bind:value bind:valid bind:parsedTelInput class="basic-tel-input {!isValid && 'invalid'}" />
</div>

<style>
  .wrapper :global(.basic-tel-input) {
      height: 32px;
      padding-left: 12px;
      padding-right: 12px;
      border-radius: 6px;
      border: 1px solid;
      outline: none;
  }

  .wrapper :global(.country-select) {
      height: 36px;
      padding-left: 12px;
      padding-right: 12px;
      border-radius: 6px;
      border: 1px solid;
      outline: none;
  }

  .wrapper :global(.invalid) {
    border-color: red;
  }
</style>
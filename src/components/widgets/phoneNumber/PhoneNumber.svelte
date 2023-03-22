<script lang="ts">
	export let field: any = undefined;
	export let value: string = '';

	export let widgetValue;
	$: widgetValue = value;

	// https://github.com/gyurielf/svelte-tel-input
	// add format like  https://svelte-tel-input.vercel.app/

	import TelInput, { normalizedCountries } from 'svelte-tel-input';

	// Any Country Code Alpha-2 (ISO 3166)
	let selectedCountry = 'DE';

	// Optional - Extended information about the parsed phone number
	let parsedTelInput: { nationalNumber: any } | null = null;

	// import { z } from 'zod';

	// const schema = z.object({
	// 	phone: z.string().min(10, 'Phone number is too short')
	// });

	// const validate = (values) => {
	// 	try {
	// 		schema.parse(values);
	// 		return true;
	// 	} catch (error) {
	// 		return false;
	// 	}
	// };

	// In your component
	// let phone = '';
	let isValid = true;

	// function handleInput(event) {
	// 	phone = event.target.value;
	// 	isValid = validate({ phone });
	// }
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

	<!-- TODO: fix typescript -->
	<TelInput
		bind:valid={isValid}
		bind:country={selectedCountry}
		bind:value
		bind:parsedTelInput
		placeholder={field.placeholder}
		class="basic-tel-input {!isValid && 'invalid'}"
	/>
</div>

<!-- Just to show the nicely parsed phone number to you-->
<!-- TODO: fix typescript -->
{#if value && isValid && parsedTelInput?.nationalNumber}
	<p class="text-center">
		<span
			>Saved as E164: <a
				href="tel:+{normalizedCountries.find((c) => c.iso2 === selectedCountry)
					.dialCode}{parsedTelInput.nationalNumber}"
				>+{normalizedCountries.find((c) => c.iso2 === selectedCountry).dialCode}
				{parsedTelInput.nationalNumber}</a
			></span
		>
	</p>
{/if}

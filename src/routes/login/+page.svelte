<script lang="ts">
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import SveltyCMSLogoFull from '@src/components/SveltyCMS_LogoFull.svelte';
	import type { PageData } from './$types';
	import { systemLanguage, AVAILABLE_SYSTEMLANGUAGES } from '@stores/store';

	export let data: PageData;
	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';
	import Autocomplete from '@components/Autocomplete.svelte';

	let _languageTag = languageTag(); // Get the current language tag

	// Seasons
	let date = new Date();

	function handleLocaleChange(event: any) {
		$systemLanguage = event.target.value;
	}
	let inputlanguagevalue = '';
	$: filteredLanguages = AVAILABLE_SYSTEMLANGUAGES.filter((value) => (value ? value.includes(inputlanguagevalue) : true));

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';
</script>

<div class={`flex min-h-screen w-full overflow-y-auto bg-${background}`}>
	<SignIn
		{active}
		FormSchemaLogin={data.loginForm}
		FormSchemaForgot={data.forgotForm}
		FormSchemaReset={data.resetForm}
		on:click={() => (active = 0)}
		on:pointerenter={() => (background = '#242728')}
	/>

	<SignUp bind:active FormSchemaSignUp={data.signUpForm} on:click={() => (active = 1)} on:pointerenter={() => (background = 'white')} />
	{#if active == undefined}
		<!-- CSS Logo -->
		<SveltyCMSLogoFull />

		<!-- Language Select -->
		<div
			class="absolute bottom-1/4 left-1/2 flex -translate-x-1/2 -translate-y-1/2 transform cursor-pointer items-center justify-center rounded-full dark:text-black"
		>
			<!-- Autocomplete input -->
			{#if AVAILABLE_SYSTEMLANGUAGES.length > 5}
				<!-- <Autocomplete {options} placeholder={_languageTag} bind:value={inputlanguagevalue} /> -->
				<input
					id="languageAuto"
					name="language"
					type="text"
					list="locales"
					bind:value={inputlanguagevalue}
					placeholder={_languageTag}
					aria-label="Enter Language"
					class="w-1/2 rounded-full border-2 bg-[#242728] uppercase text-white placeholder:text-white focus:ring-2"
					on:input={() => ($systemLanguage = inputlanguagevalue.toLowerCase())}
				/>

				<datalist id="locales" class="w-1/2 divide-y divide-white uppercase">
					{#each filteredLanguages as locale}
						<option class="uppercase text-error-500">{locale.toUpperCase()}</option>
					{/each}
				</datalist>
			{:else}
				<!-- Dropdown select -->
				<select
					id="languageSelect"
					name="language"
					bind:value={_languageTag}
					on:change={handleLocaleChange}
					aria-label="Select Language"
					class="rounded-full border-2 border-white bg-[#242728] uppercase text-white focus:ring-2 focus:ring-blue-500 active:ring active:ring-blue-300"
				>
					{#each filteredLanguages as locale}
						<option value={locale} selected={locale === _languageTag}>{locale.toUpperCase()}</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- CMS Version -->
		<a
			href="https://github.com/Rar9/SveltyCMS"
			target="_blank"
			rel="noopener"
			class=" absolute bottom-5 left-1/2 right-1/3 flex min-w-[100px] max-w-[250px] -translate-x-1/2 -translate-y-1/2 transform justify-center gap-6 rounded-full bg-gradient-to-r from-surface-50/20 to-[#242728]/20"
		>
			<p class="text-[#242728]">Ver.</p>
			<p class="text-white">{pkg}</p>
		</a>
	{/if}
</div>

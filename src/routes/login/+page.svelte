<script lang="ts">
	import { PUBLIC_SEASSONS, PUBLIC_SITENAME } from '$env/static/public';
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import Logo from './components/icons/Logo.svelte';
	import type { PageData } from './$types';
	import { systemLanguage, AVAILABLE_SYSTEMLANGUAGES } from '@stores/store';

	export let data: PageData;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag, availableLanguageTags } from '@src/paraglide/runtime';
	import Autocomplete from '@components/Autocomplete.svelte';
	let _languageTag = languageTag(); // Get the current language tag

	// Seasons
	let date = new Date();
	let isDecember = date.getMonth() === 11;
	let isHalloween = date.getMonth() === 9 && date.getDate() === 31;

	function handleLocaleChange(event: any) {
		$systemLanguage = event.target.value;
	}
	let inputlangeuagevalue = '';
	$: filteredLanguages = AVAILABLE_SYSTEMLANGUAGES.filter((value) => (value ? value.includes(inputlangeuagevalue) : true));

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';

	let options = availableLanguageTags;
</script>

<div class="body" style="background:{background} ">
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
		<a
			href="https://github.com/Rar9/SimpleCMS"
			target="_blank"
			rel="noopener"
			class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
		>
			<div class="relative top-[-150px] h-[170px] w-[170px] justify-center rounded-full bg-white">
				<!-- Seasons -->
				{#if PUBLIC_SEASSONS}
					{#if isDecember}
						<img src="/SantaHat.avif" alt="Santa hat" loading="lazy" class="absolute -right-5 -top-5 h-20 w-20" />
					{/if}

					{#if isHalloween}
						<img src="/Halloween.avif" alt="Spider" loading="lazy" class="absolute -bottom-[170px] left-0" />
					{/if}
				{/if}

				<!-- red circle -->
				<svg width="160" height="160" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
					<circle
						cx="80"
						cy="80"
						r="75"
						stroke-width="2"
						stroke-dasharray="191 191"
						stroke-dashoffset="191"
						transform="rotate(51.5, 80, 80)"
						class="fill-none stroke-error-500"
					/>

					<circle
						cx="80"
						cy="80"
						r="75"
						stroke-width="2"
						stroke-dasharray="191 191"
						stroke-dashoffset="191"
						transform="rotate(231.5, 80, 80)"
						class="fill-none stroke-error-500"
					/>
				</svg>
				<!-- black circle -->
				<svg width="170" height="170" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
					<circle
						cx="85"
						cy="85"
						r="80"
						stroke-width="2"
						stroke-dasharray="205 205"
						stroke-dashoffset="205"
						transform="rotate(50, 85, 85)"
						class="fill-none stroke-black"
					/>
					<circle
						cx="85"
						cy="85"
						r="80"
						stroke-width="2"
						stroke-dasharray="205 205"
						stroke-dashoffset="205"
						transform="rotate(230, 85, 85)"
						class="fill-none stroke-black"
					/>
				</svg>

				<div class="absolute left-1/2 top-[77px] flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center text-center">
					<!-- Logo -->
					<Logo fill="black" className="w-8 h-8" />
					<!-- PUBLIC SITENAME -->
					<div class="text-3xl font-bold text-error-500">{PUBLIC_SITENAME}</div>
					<!-- Slogan -->
					<div class="-mt-[1px] text-[11px] font-bold text-black">{m.logo_slogan()}</div>
				</div>
			</div>
		</a>

		<!-- TODO: Fix Language switcher -->
		<div
			class="absolute bottom-1/4 left-1/2 flex -translate-x-1/2 -translate-y-1/2 transform cursor-pointer items-center justify-center rounded-full dark:text-black"
		>
			<!-- Autocomplete input -->
			{#if AVAILABLE_SYSTEMLANGUAGES.length > 5}
				<!-- <Autocomplete {options} placeholder={_languageTag} bind:value={inputlangeuagevalue} /> -->
				<input
					type="text"
					list="locales"
					bind:value={inputlangeuagevalue}
					placeholder={_languageTag}
					class="w-1/2 rounded-full border-2 bg-[#242728] uppercase text-white placeholder:text-white focus:ring-2"
					on:input={() => ($systemLanguage = inputlangeuagevalue.toLowerCase())}
				/>

				<datalist id="locales" class="w-1/2 divide-y divide-white uppercase">
					{#each filteredLanguages as locale}
						<option class="uppercase text-error-500">{locale.toUpperCase()}</option>
					{/each}
				</datalist>
			{:else}
				<!-- Dropdown select -->
				<label for="languageSelect" class="sr-only">Select Language</label>

				<select
					bind:value={_languageTag}
					on:change={handleLocaleChange}
					class="rounded-full border-2 border-white bg-[#242728] uppercase text-white focus:ring-2 focus:ring-blue-500 active:ring active:ring-blue-300"
				>
					{#each filteredLanguages as locale}
						<option value={locale} selected={locale === _languageTag}>{locale.toUpperCase()}</option>
					{/each}
				</select>
			{/if}
		</div>
	{/if}
</div>

<style lang="postcss">
	.body {
		width: 100vw;
		height: 100vh;
		display: flex;
		overflow: hidden;
		background: linear-gradient(90deg, #242728 50%, white 50%);
	}
</style>

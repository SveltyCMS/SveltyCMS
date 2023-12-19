<script lang="ts">
	import { PUBLIC_SEASONS, PUBLIC_SITENAME } from '$env/static/public';
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import Logo from './components/icons/Logo.svelte';
	import type { PageData } from './$types';
	import { systemLanguage, AVAILABLE_SYSTEMLANGUAGES } from '@stores/store';
	import { Confetti } from 'svelte-confetti';

	export let data: PageData;
	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag, availableLanguageTags } from '@src/paraglide/runtime';
	import Autocomplete from '@components/Autocomplete.svelte';
	let _languageTag = languageTag(); // Get the current language tag

	// Seasons
	let date = new Date();
	let isDecember = date.getMonth() === 11;
	let isHalloween = date.getMonth() === 9 && date.getDate() === 31;
	let isNewYear = date.getMonth() === 0 && date.getDate() === 1;

	function handleLocaleChange(event: any) {
		$systemLanguage = event.target.value;
	}
	let inputlanguagevalue = '';
	$: filteredLanguages = AVAILABLE_SYSTEMLANGUAGES.filter((value) => (value ? value.includes(inputlanguagevalue) : true));

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';

	let options = availableLanguageTags;
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
		<a
			href="https://github.com/Rar9/SimpleCMS"
			target="_blank"
			rel="noopener"
			class="absolute left-1/2 top-1/3 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center border"
		>
			<!--White Inner Background -->
			<div class="absolute top-[-150px] h-[170px] w-[170px] justify-center rounded-full bg-white">
				<!-- Seasons -->
				{#if PUBLIC_SEASONS}
					{#if isDecember && !isNewYear}
						<img src="/SantaHat.avif" alt="Santa hat" class="absolute -right-5 -top-5 h-20 w-20" />
					{/if}

					{#if isHalloween}
						<img src="/Halloween.avif" alt="Spider" class="absolute -bottom-[170px] left-0" />
					{/if}

					{#if isNewYear && !isDecember}
						<div class="absolute left-1/2 top-[-50px] justify-center">
							<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 120]} />
							<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[550, 550]} colorRange={[120, 240]} />
							<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[1000, 1050]} colorRange={[240, 360]} />
						</div>
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
					<div class="text-3xl font-bold text-error-500">
						{PUBLIC_SITENAME}
					</div>
					<!-- Slogan -->
					<div class="-mt-[1px] text-[12px] font-bold text-black">
						{m.logo_slogan()}
					</div>
				</div>
			</div>
		</a>

		<!-- TODO: Fix Language switcher -->
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
			href="https://github.com/Rar9/SimpleCMS"
			target="_blank"
			rel="noopener"
			class=" absolute bottom-5 left-1/2 right-1/3 flex min-w-[100px] -translate-x-1/2 -translate-y-1/2 transform justify-center gap-6 rounded-full bg-gradient-to-r from-surface-50/20 to-[#242728]/20"
		>
			<p class="text-[#242728]">Ver.</p>
			<p class="text-white">{pkg}</p>
		</a>
	{/if}
</div>

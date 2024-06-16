<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import type { PageData } from './$types';

	// Components
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';

	// Stores
	import { systemLanguage } from '@stores/store';

	// ParaglideJS
	import { languageTag } from '@src/paraglide/runtime';

	const _languageTag = languageTag(); // Get the current language tag

	let inputlanguagevalue = '';

	// Use the inferred return type of languageTag
	type LanguageCode = ReturnType<typeof languageTag>;

	function handleLanguageSelection(event: Event) {
		const target = event.target as HTMLInputElement;
		let selectedLanguage = target.value.toLowerCase() as LanguageCode;
		systemLanguage.set(selectedLanguage);
	}

	$: filteredLanguages = publicEnv.AVAILABLE_SYSTEM_LANGUAGES.filter((value: string) => (value ? value.includes(inputlanguagevalue) : true));

	// Ensure all available languages are included
	$: if (!inputlanguagevalue) {
		filteredLanguages = publicEnv.AVAILABLE_SYSTEM_LANGUAGES;
	}

	// Access package version from environment variable
	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';

	export let data: PageData;

	import { onMount } from 'svelte';

	let timeRemaining = { minutes: 0, seconds: 0 };
	let interval: ReturnType<typeof setInterval>;

	// Function to calculate the time remaining until the next reset
	function calculateTimeRemaining() {
		const now = new Date();
		const minutes = now.getMinutes();
		const seconds = now.getSeconds();
		const timePassed = (minutes % 10) * 60 + seconds;
		const timeRemainingInSeconds = 600 - timePassed;
		const minutesRemaining = Math.floor(timeRemainingInSeconds / 60);
		const secondsRemaining = timeRemainingInSeconds % 60;

		return {
			minutes: minutesRemaining,
			seconds: secondsRemaining
		};
	}

	// Function to update the time remaining every second
	function updateTimeRemaining() {
		timeRemaining = calculateTimeRemaining();
	}

	// Set up the interval to update the countdown every second
	onMount(() => {
		updateTimeRemaining();
		interval = setInterval(updateTimeRemaining, 1000);
		return () => clearInterval(interval);
	});
</script>

<div class={`flex min-h-lvh w-full overflow-y-auto bg-[#242728] bg-${background}`}>
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
		<!-- DEMO MODE -->
		{#if publicEnv.DEMO == true}
			<div
				class="absolute bottom-8 left-1/2 flex min-w-[350px] -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded-xl bg-error-500 py-2 md:p-4 text-center text-white md:bottom-1"
			>
				<p class="text-2xl font-bold">SveltyCMS DEMO MODE</p>
				<p>This site will reset every 10 min.</p>
				<p class="text-xl font-bold">
					Next reset in: {timeRemaining.minutes}:{timeRemaining.seconds < 10 ? `0${timeRemaining.seconds}` : timeRemaining.seconds}
				</p>
			</div>
		{/if}

		<!-- CSS Logo -->
		<SveltyCMSLogoFull />

		<!-- Language Select -->
		<div
			class="absolute bottom-1/4 left-1/2 flex -translate-x-1/2 -translate-y-1/2 transform cursor-pointer items-center justify-center rounded-full dark:text-black"
		>
			<!-- Autocomplete input -->
			{#if publicEnv.AVAILABLE_SYSTEM_LANGUAGES.length > 5}
				<input
					id="languageAuto"
					name="language"
					type="text"
					list="locales"
					bind:value={inputlanguagevalue}
					on:input={handleLanguageSelection}
					placeholder={_languageTag}
					aria-label="Enter Language"
					class="w-1/2 rounded-full border-2 bg-[#242728] uppercase text-white placeholder:text-white focus:ring-2"
				/>
				<datalist id="locales" class="w-1/2 divide-y divide-white uppercase">
					{#each publicEnv.AVAILABLE_SYSTEM_LANGUAGES as locale}
						<option class="uppercase text-error-500">{locale.toUpperCase()}</option>
					{/each}
				</datalist>
			{:else}
				<!-- Dropdown select -->
				<select
					id="languageSelect"
					name="language"
					bind:value={$systemLanguage}
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
			class="absolute bottom-5 left-1/2 right-1/3 flex min-w-[100px] max-w-[250px] -translate-x-1/2 -translate-y-1/2 transform justify-center gap-6 rounded-full bg-gradient-to-r from-surface-50/20 to-[#242728]/20"
		>
			<p class="text-[#242728]">Ver.</p>
			<p class="text-white">{pkg}</p>
		</a>
	{/if}
</div>

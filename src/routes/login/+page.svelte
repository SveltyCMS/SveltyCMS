<!-- 
@file: Authentication Form Component for SveltyCMS
@description: This component handles both SignIn and SignUp functionality for the SveltyCMS.

Features:
 - Dual SignIn and SignUp functionality with dynamic form switching
 - Dynamic language selection with a debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer displayed when active
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`, and `firstUserExists`)
 - Reset state functionality for easy return to initial screen
 - Accessibility features for language selection and form navigation
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import type { PageData } from './$types';
	import { onMount, onDestroy } from 'svelte';

	// Components
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';

	// Stores
	import { page } from '$app/stores';
	import { systemLanguage } from '@stores/store';

	// ParaglideJS
	import { languageTag } from '@src/paraglide/runtime';
	import * as m from '@src/paraglide/messages';

	const _languageTag = languageTag(); // Get the current language tag

	let inputlanguagevalue = '';
	// Use the inferred return type of languageTag
	type LanguageCode = ReturnType<typeof languageTag>;
	let debounceTimeout: ReturnType<typeof setTimeout>;

	function handleLanguageSelection(event: Event) {
		const target = event.target as HTMLInputElement;
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			const selectedLanguage = target.value.toLowerCase() as LanguageCode;
			systemLanguage.set(selectedLanguage);
		}, 300);
	}

	$: filteredLanguages = publicEnv.AVAILABLE_SYSTEM_LANGUAGES.filter((value: string) => (value ? value.includes(inputlanguagevalue) : true));

	// Ensure all available languages are included
	$: if (!inputlanguagevalue) {
		filteredLanguages = publicEnv.AVAILABLE_SYSTEM_LANGUAGES;
	}

	// Access package version from environment variable
	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;

	// Set initial FirstUserExists state
	const pageData = $page.data as PageData;
	const firstUserExists = pageData.firstUserExists;
	// Set initial active states for SignIn and SignUp
	let active: undefined | 0 | 1 = publicEnv.SEASONS || publicEnv.DEMO ? undefined : firstUserExists ? undefined : 1;
	let background: 'white' | '#242728' = publicEnv.SEASONS || publicEnv.DEMO ? '#242728' : firstUserExists ? 'white' : '#242728';

	export let data: PageData;

	let timeRemaining: { minutes: number; seconds: number } = { minutes: 0, seconds: 0 };
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
	// Database resets every 10 minutes only if you drop it form your server)

	if (publicEnv.DEMO) {
		onMount(() => {
			updateTimeRemaining();
			interval = setInterval(updateTimeRemaining, 1000);
			return () => clearInterval(interval);
		});

		onDestroy(() => {
			clearInterval(interval);
		});
	}

	// Function to reset to initial state
	function resetToInitialState() {
		active = publicEnv.SEASONS || publicEnv.DEMO ? 0 : firstUserExists ? undefined : 1;
		background = publicEnv.SEASONS || publicEnv.DEMO ? '#242728' : firstUserExists ? 'white' : '#242728';
	}

	// Special case for the first user on fresh installation
	function handleSignInClick() {
		if (!firstUserExists) {
			active = 1; // Show SignUp for fresh installation
		} else {
			active = 0; // Show SignIn for existing users
		}
	}
</script>

<div class={`flex min-h-lvh w-full overflow-y-auto bg-${background}`}>
	<SignIn
		{active}
		FormSchemaLogin={data.loginForm}
		FormSchemaForgot={data.forgotForm}
		FormSchemaReset={data.resetForm}
		on:click={handleSignInClick}
		on:pointerenter={() => (background = '#242728')}
		on:back={resetToInitialState}
	/>

	<SignUp
		bind:active
		FormSchemaSignUp={data.signUpForm}
		on:click={() => (active = 1)}
		on:pointerenter={() => (background = 'white')}
		on:back={resetToInitialState}
	/>

	{#if active == undefined}
		{#if publicEnv.DEMO}
			<!-- DEMO MODE -->
			<div
				class="absolute bottom-2 left-1/2 flex min-w-[350px] -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded-xl bg-error-500 p-3 text-center text-white sm:bottom-12"
				aria-live="polite"
				aria-atomic="true"
			>
				<p class="text-2xl font-bold">{m.login_demo_title()}</p>
				<p>{m.login_demo_message()}</p>
				<p class="text-xl font-bold">
					{m.login_demo_nextreset()}
					{timeRemaining.minutes}:{timeRemaining.seconds < 10 ? `0${timeRemaining.seconds}` : timeRemaining.seconds}
				</p>
			</div>
		{/if}

		<!-- CMS Logo -->
		<SveltyCMSLogoFull />

		<!-- Language Select -->
		<div class="absolute bottom-1/4 left-1/2 flex -translate-x-1/2 transform items-center justify-center rounded-full dark:text-black">
			<!-- Autocomplete Language input -->
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
					class="rounded-full border-2 bg-[#242728] uppercase text-white focus:ring-2 focus:ring-blue-500"
				>
					{#each filteredLanguages as locale}
						<option value={locale} class="uppercase">{locale.toUpperCase()}</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- CMS Version -->
		<a
			href="https://github.com/SveltyCMS/SveltyCMS"
			target="_blank"
			rel="noopener"
			class="absolute bottom-5 left-1/2 right-1/3 flex min-w-[100px] max-w-[250px] -translate-x-1/2 -translate-y-1/2 transform justify-center gap-6 rounded-full bg-gradient-to-r from-surface-50/20 to-[#242728]/20"
		>
			<p class="text-[#242728]">Ver.</p>
			<p class="text-white">{pkg}</p>
		</a>
	{/if}
</div>

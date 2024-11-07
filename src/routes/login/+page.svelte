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
	import type { Writable } from 'svelte/store';
	import { getLanguageName } from '@utils/languageUtils';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	type SystemLanguage = typeof systemLanguage extends Writable<infer T> ? T : never;

	let searchQuery = '';
	let isDropdownOpen = false;
	let searchInput: HTMLInputElement;
	let debounceTimeout: ReturnType<typeof setTimeout>;

	function handleLanguageSelection(lang: SystemLanguage) {
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			systemLanguage.set(lang);
			isDropdownOpen = false;
			searchQuery = '';
		}, 300);
	}

	// Sort languages alphabetically
	$: availableLanguages = [...publicEnv.AVAILABLE_SYSTEM_LANGUAGES].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')));

	$: filteredLanguages = availableLanguages.filter(
		(lang: string) =>
			getLanguageName(lang, $systemLanguage).toLowerCase().includes(searchQuery.toLowerCase()) ||
			getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
	) as SystemLanguage[];

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.language-selector')) {
			isDropdownOpen = false;
			searchQuery = '';
		}
	}

	$: if (typeof window !== 'undefined') {
		if (isDropdownOpen) {
			window.addEventListener('click', handleClickOutside);
			// Focus search input when dropdown opens
			setTimeout(() => searchInput?.focus(), 0);
		} else {
			window.removeEventListener('click', handleClickOutside);
		}
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
		<div class="language-selector absolute bottom-1/4 left-1/2 -translate-x-1/2 transform">
			{#if publicEnv.AVAILABLE_SYSTEM_LANGUAGES.length > 5}
				<div class="relative">
					<!-- Current Language Display -->
					<button
						class="flex items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white hover:bg-[#363a3b] focus:ring-2"
						on:click|stopPropagation={() => (isDropdownOpen = !isDropdownOpen)}
					>
						<span>{getLanguageName($systemLanguage)} ({$systemLanguage.toUpperCase()})</span>
						<svg class="h-5 w-5 transition-transform {isDropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					<!-- Dropdown -->
					{#if isDropdownOpen}
						<div class="absolute -left-6 -top-3 z-10 mt-2 w-48 rounded-lg border bg-[#242728] shadow-lg">
							<!-- Search Input -->
							<div class="border-b border-gray-700 p-2">
								<input
									type="text"
									bind:this={searchInput}
									bind:value={searchQuery}
									placeholder="Search language..."
									class="w-full rounded-md bg-[#363a3b] px-3 py-2 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2"
								/>
							</div>

							<!-- Language List -->
							<div class="max-h-48 divide-y divide-gray-700 overflow-y-auto py-1">
								{#each filteredLanguages as lang}
									<button
										class="flex w-full items-center justify-between px-4 py-2 text-left text-white hover:bg-[#363a3b] {$systemLanguage === lang
											? 'bg-[#363a3b]'
											: ''}"
										on:click={() => handleLanguageSelection(lang)}
									>
										<span>{getLanguageName(lang)} ({lang.toUpperCase()})</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Simple dropdown for 5 or fewer languages -->
				<select bind:value={$systemLanguage} class="rounded-full border-2 bg-[#242728] px-4 py-2 text-white focus:ring-2">
					{#each availableLanguages as lang}
						<option value={lang}>{getLanguageName(lang)} ({lang.toUpperCase()})</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- CMS Version -->
		{#if !isDropdownOpen}
			<a
				href="https://github.com/SveltyCMS/SveltyCMS"
				target="_blank"
				rel="noopener"
				class="absolute bottom-5 left-1/2 right-1/3 z-0 flex min-w-[100px] max-w-[250px] -translate-x-1/2 -translate-y-1/2 transform justify-center gap-6 rounded-full bg-gradient-to-r from-surface-50/20 to-[#242728]/20"
			>
				<p class="text-[#242728]">Ver.</p>
				<p class="text-white">{pkg}</p>
			</a>
		{/if}
	{/if}
</div>

<style>
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}
</style>

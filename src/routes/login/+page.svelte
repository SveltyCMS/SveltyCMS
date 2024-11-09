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

	// State Management
	const pageData = $page.data as PageData;
	const firstUserExists = pageData.firstUserExists;
	let active = $state<undefined | 0 | 1>(publicEnv.SEASONS || publicEnv.DEMO ? undefined : firstUserExists ? undefined : 1);
	let background = $state<'white' | '#242728'>(publicEnv.SEASONS || publicEnv.DEMO ? '#242728' : firstUserExists ? 'white' : '#242728');
	let timeRemaining = $state({ minutes: 0, seconds: 0 });
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);
	let isTransitioning = $state(false);
	let debounceTimeout = $state<ReturnType<typeof setTimeout>>();

	// Props using $props rune
	const { data } = $props<{ data: PageData }>();

	// Derived state using $derived rune
	const availableLanguages = $derived(
		[...publicEnv.AVAILABLE_SYSTEM_LANGUAGES].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')))
	);

	const filteredLanguages = $derived(
		availableLanguages.filter(
			(lang: string) =>
				getLanguageName(lang, $systemLanguage).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		) as SystemLanguage[]
	);

	// Package version
	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;

	// Form validation
	if (!data.loginForm || !data.forgotForm || !data.resetForm || !data.signUpForm) {
		throw new Error('Required form schemas are missing');
	}

	function handleLanguageSelection(lang: SystemLanguage) {
		if (isTransitioning) return;
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			systemLanguage.set(lang);
			isDropdownOpen = false;
			searchQuery = '';
		}, 300);
	}

	function handleClickOutside(event: MouseEvent) {
		if (isTransitioning) return;
		const target = event.target as HTMLElement;
		if (!target.closest('.language-selector')) {
			isDropdownOpen = false;
			searchQuery = '';
		}
	}

	// Side effects using $effect rune
	$effect(() => {
		if (typeof window !== 'undefined' && isDropdownOpen) {
			window.addEventListener('click', handleClickOutside);
			// Focus search input when dropdown opens
			setTimeout(() => searchInput?.focus(), 0);
			return () => window.removeEventListener('click', handleClickOutside);
		}
	});

	// Demo mode timer management
	// Function to calculate the time remaining until the next reset
	function calculateTimeRemaining() {
		const now = new Date();
		const minutes = now.getMinutes();
		const seconds = now.getSeconds();
		const timePassed = (minutes % 10) * 60 + seconds;
		const timeRemainingInSeconds = 600 - timePassed;
		return {
			minutes: Math.floor(timeRemainingInSeconds / 60),
			seconds: timeRemainingInSeconds % 60
		};
	}

	// Function to update the time remaining every second
	function updateTimeRemaining() {
		timeRemaining = calculateTimeRemaining();
	}

	let interval: ReturnType<typeof setInterval>;

	// Set up the interval to update the countdown every second
	// Database resets every 10 minutes only if you drop it form your server)
	if (publicEnv.DEMO) {
		onMount(() => {
			updateTimeRemaining();
			interval = setInterval(updateTimeRemaining, 1000);
		});

		onDestroy(() => clearInterval(interval));
	}

	// State management functions
	function resetToInitialState() {
		if (isTransitioning) return;
		isTransitioning = true;
		active = undefined;
		background = publicEnv.SEASONS || publicEnv.DEMO ? '#242728' : firstUserExists ? 'white' : '#242728';
		setTimeout(() => {
			isTransitioning = false;
		}, 300);
	}

	// Special case for the first user on fresh installation
	function handleSignInClick() {
		if (isTransitioning) return;
		isTransitioning = true;

		// First reset to initial state to show the logo
		active = undefined;
		background = 'white';

		// Then after a short delay, transition to signin
		setTimeout(() => {
			if (!firstUserExists) {
				active = 1; // Show SignUp for fresh installation
				background = '#242728';
			} else {
				active = 0; // Show SignIn for existing users
				background = 'white';
			}
			isTransitioning = false;
		}, 300);
	}

	// Handle SignUp click
	function handleSignUpClick() {
		if (isTransitioning) return;
		isTransitioning = true;

		// First reset to initial state to show the logo
		active = undefined;
		background = '#242728';

		// Then after a short delay, transition to signup
		setTimeout(() => {
			active = 1;
			background = '#242728';
			isTransitioning = false;
		}, 300);
	}

	// Handle pointer enter events
	function handleSignInPointerEnter() {
		if (active === undefined && !isTransitioning) {
			background = 'white';
		}
	}

	function handleSignUpPointerEnter() {
		if (active === undefined && !isTransitioning) {
			background = '#242728';
		}
	}

	// Handle dropdown toggle
	function handleDropdownToggle() {
		if (isTransitioning) return;
		isDropdownOpen = !isDropdownOpen;
	}
</script>

<div class={`flex min-h-lvh w-full overflow-y-auto bg-${background} ${isTransitioning ? 'pointer-events-none' : ''} transition-colors duration-300`}>
	<SignIn
		{active}
		FormSchemaLogin={data.loginForm}
		FormSchemaForgot={data.forgotForm}
		FormSchemaReset={data.resetForm}
		onClick={handleSignInClick}
		onPointerEnter={handleSignInPointerEnter}
		onBack={resetToInitialState}
		{isTransitioning}
	/>

	<SignUp
		bind:active
		FormSchemaSignUp={data.signUpForm}
		onClick={handleSignUpClick}
		onPointerEnter={handleSignUpPointerEnter}
		onBack={resetToInitialState}
		{isTransitioning}
	/>

	{#if active == undefined}
		{#if publicEnv.DEMO}
			<!-- DEMO MODE -->
			<div
				class="absolute bottom-2 left-1/2 flex min-w-[350px] -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded-xl bg-error-500 p-3 text-center text-white transition-opacity duration-300 sm:bottom-12"
				class:opacity-50={isTransitioning}
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
		<div
			class="language-selector absolute bottom-1/4 left-1/2 -translate-x-1/2 transform transition-opacity duration-300"
			class:opacity-50={isTransitioning}
		>
			{#if publicEnv.AVAILABLE_SYSTEM_LANGUAGES.length > 5}
				<div class="relative">
					<!-- Current Language Display -->
					<button
						class="flex items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 hover:bg-[#363a3b] focus:ring-2"
						onclick={handleDropdownToggle}
						disabled={isTransitioning}
					>
						<span>{getLanguageName($systemLanguage)} ({$systemLanguage.toUpperCase()})</span>
						<svg
							class="h-5 w-5 transition-transform duration-300 {isDropdownOpen ? 'rotate-180' : ''}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					<!-- Dropdown -->
					{#if isDropdownOpen}
						<div class="absolute -left-6 -top-3 z-10 mt-2 w-48 rounded-lg border bg-[#242728] shadow-lg transition-opacity duration-300">
							<!-- Search Input -->
							<div class="border-b border-gray-700 p-2">
								<input
									type="text"
									bind:this={searchInput}
									bind:value={searchQuery}
									placeholder="Search language..."
									disabled={isTransitioning}
									class="w-full rounded-md bg-[#363a3b] px-3 py-2 text-white transition-colors duration-300 placeholder:text-gray-400 focus:outline-none focus:ring-2"
								/>
							</div>

							<!-- Language List -->
							<div class="max-h-48 divide-y divide-gray-700 overflow-y-auto py-1">
								{#each filteredLanguages as lang}
									<button
										class="flex w-full items-center justify-between px-4 py-2 text-left text-white transition-colors duration-300 hover:bg-[#363a3b] {$systemLanguage ===
										lang
											? 'bg-[#363a3b]'
											: ''}"
										onclick={() => handleLanguageSelection(lang)}
										disabled={isTransitioning}
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
				<select
					bind:value={$systemLanguage}
					class="rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 focus:ring-2"
					disabled={isTransitioning}
				>
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
				class="absolute bottom-5 left-1/2 right-1/3 z-0 flex min-w-[100px] max-w-[250px] -translate-x-1/2 -translate-y-1/2 transform justify-center gap-6 rounded-full bg-gradient-to-r from-surface-50/20 to-[#242728]/20 transition-opacity duration-300"
				class:opacity-50={isTransitioning}
				tabindex={isTransitioning ? -1 : 0}
			>
				<p class="text-[#242728]">Ver.</p>
				<p class="text-white">{pkg}</p>
			</a>
		{/if}
	{/if}
</div>

<style lang="postcss">
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

<!-- 
@file Authentication Form Component for SveltyCMS
@component
**This component handles both SignIn and SignUp functionality for the SveltyCMS**

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

	// Components
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import Seasons from '@components/system/icons/Seasons.svelte';

	// Stores
	import { systemLanguage } from '@stores/store.svelte';
	import { getLanguageName } from '@utils/languageUtils';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	import { setSystemLanguage } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	const { data } = $props<{ data: PageData }>();

	// State Management
	const firstUserExists = $state(data.firstUserExists);
	const firstCollection = $state(data.firstCollection);

	// Check for reset password URL parameters (initially false, updated by effect)
	let hasResetParams = $state(false);

	// Set Initial active state based on conditions (will be updated by effect)
	let active = $state<undefined | 0 | 1>(
		publicEnv.DEMO || publicEnv.SEASONS
			? undefined // If DEMO or SEASONS is enabled, show logo
			: firstUserExists
				? undefined // Show SignIn if the first user exists
				: 1 // Otherwise, show SignUp
	);

	// Update active state when URL parameters are detected
	$effect(() => {
		if (typeof window !== 'undefined') {
			const urlParams = new URLSearchParams(window.location.search);
			const token = urlParams.get('token');
			const email = urlParams.get('email');
			const hasParams = !!(token && email);

			if (hasParams !== hasResetParams) {
				hasResetParams = hasParams;
				if (hasResetParams) {
					active = 0; // Show SignIn component for reset password
				}
			}
		}
	});

	// Set initial background based on conditions (will be updated reactively)
	let background = $state<'white' | '#242728'>(
		publicEnv.DEMO
			? '#242728' // Dark background for DEMO mode
			: publicEnv.SEASONS
				? 'white' // Light background for SEASONS mode
				: firstUserExists
					? 'white' // Light background for existing users
					: '#242728' // Dark background for new users
	);

	// Update background when hasResetParams changes
	$effect(() => {
		if (hasResetParams) {
			background = 'white'; // White background for reset password form
		}
	});

	let timeRemaining = $state({ minutes: 0, seconds: 0 });
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);
	let isTransitioning = $state(false);
	let debounceTimeout = $state<ReturnType<typeof setTimeout>>();

	// Derived state using $derived rune
	const availableLanguages = $derived(
		Array.isArray(publicEnv.LOCALES)
			? [...publicEnv.LOCALES].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')))
			: ['en']
	);

	const filteredLanguages = $derived(
		availableLanguages.filter(
			(lang: string) =>
				getLanguageName(lang, systemLanguage.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Ensure a valid language is always used
	const currentLanguage = $derived(
		systemLanguage.value && Array.isArray(publicEnv.LOCALES) && publicEnv.LOCALES.includes(systemLanguage.value) ? systemLanguage.value : 'en'
	);

	// Package version
	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;

	// Language selection
	function handleLanguageSelection(lang: string) {
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			setSystemLanguage(lang as (typeof systemLanguage)['value']);
			isDropdownOpen = false;
			searchQuery = '';
		}, 100); // Reduced delay for faster feedback
	}

	// Function to handle clicks outside of the language selector
	function handleClickOutside(event: MouseEvent) {
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

	// Set up the interval to update the countdown every second
	$effect(() => {
		let interval: ReturnType<typeof setInterval> | undefined;
		if (publicEnv.DEMO) {
			updateTimeRemaining();
			interval = setInterval(updateTimeRemaining, 1000);
			return () => {
				if (interval) clearInterval(interval);
			};
		}
	});

	// State management functions
	function resetToInitialState() {
		if (isTransitioning) return;
		isTransitioning = true;
		active = undefined;
		background = publicEnv.DEMO ? '#242728' : publicEnv.SEASONS ? '#242728' : firstUserExists ? 'white' : '#242728';
		setTimeout(() => {
			isTransitioning = false;
		}, 300);
	}

	// Special case for the first user on fresh installation
	function handleSignInClick(event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		if (isTransitioning) return;
		isTransitioning = true;
		// First reset to initial state to show the logo
		active = 0;
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
		}, 600);
	}

	// Handle SignUp click
	function handleSignUpClick(event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		if (isTransitioning) return;
		isTransitioning = true;
		active = 1;
		background = '#242728';
		setTimeout(() => {
			isTransitioning = false;
		}, 600);
	}

	// Handle pointer enter events
	function handleSignInPointerEnter() {
		if (active === undefined && !publicEnv.DEMO && !publicEnv.SEASONS) {
			background = 'white';
		}
	}

	function handleSignUpPointerEnter() {
		if (active === undefined && !publicEnv.DEMO && !publicEnv.SEASONS) {
			background = '#242728';
		}
	}

	// Handle dropdown toggle
	function handleDropdownToggle() {
		isDropdownOpen = !isDropdownOpen;
	}

	// Prefetch when active state changes to SignIn (0) or SignUp (1)
	$effect(() => {
		if (active !== undefined) {
			console.log(`[DEBUG] Active state changed to: ${active}, triggering prefetch...`);

			// Call prefetch action on the server
			fetch('/login?/prefetch', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					lang: systemLanguage.value || 'en'
				})
			})
				.then((response) => {
					if (response.ok) {
						console.log('[DEBUG] Prefetch action completed successfully');
					} else {
						console.log('[DEBUG] Prefetch action failed:', response.status);
					}
				})
				.catch((err) => {
					console.log('[DEBUG] Prefetch fetch error:', err);
				});
		}
	});
</script>

<div class={`flex min-h-lvh w-full overflow-y-auto bg-${background} transition-colors duration-300`}>
	<!-- SignIn and SignUp Forms -->
	<SignIn
		bind:active
		FormSchemaLogin={data.loginForm}
		FormSchemaForgot={data.forgotForm}
		FormSchemaReset={data.resetForm}
		onClick={handleSignInClick}
		onPointerEnter={handleSignInPointerEnter}
		onBack={resetToInitialState}
	/>

	<SignUp
		bind:active
		FormSchemaSignUp={data.signUpForm}
		isInviteFlow={data.isInviteFlow || false}
		token={data.token || ''}
		invitedEmail={data.invitedEmail || ''}
		inviteError={data.inviteError || ''}
		onClick={handleSignUpClick}
		onPointerEnter={handleSignUpPointerEnter}
		onBack={resetToInitialState}
	/>

	{#if active == undefined}
		{#if publicEnv.DEMO}
			<!-- DEMO MODE -->
			<div
				class="absolute bottom-2 left-1/2 flex min-w-[350px] -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded-xl bg-error-500 p-3 text-center text-white transition-opacity duration-300 sm:bottom-12"
				class:opacity-50={isTransitioning}
				aria-live="polite"
				aria-atomic="true"
				role="status"
				aria-label="Demo mode active. Timer showing time remaining until next reset."
			>
				<p class="text-2xl font-bold">{m.login_demo_title()}</p>
				<p>{m.login_demo_message()}</p>
				<p class="text-xl font-bold">
					{m.login_demo_nextreset()}
					<!-- Announce remaining time in an accessible format -->
					<span aria-label="Time remaining: {timeRemaining.minutes} minutes and {timeRemaining.seconds} seconds">
						{timeRemaining.minutes}:{timeRemaining.seconds < 10 ? `0${timeRemaining.seconds}` : timeRemaining.seconds}
					</span>
				</p>
			</div>
		{/if}

		<!-- CMS Logo -->
		<div class="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center">
			<SveltyCMSLogoFull />
			<!-- Seasons -->
			<Seasons />
		</div>

		<!-- Language Select -->
		<div
			class="language-selector absolute bottom-1/4 left-1/2 -translate-x-1/2 transform transition-opacity duration-300"
			class:opacity-50={isTransitioning}
		>
			{#if Array.isArray(publicEnv.LOCALES) && publicEnv.LOCALES.length > 5}
				<div class="relative">
					<!-- Current Language Display -->
					<button
						class="flex items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 hover:bg-[#363a3b] focus:ring-2"
						onclick={handleDropdownToggle}
					>
						<span>{getLanguageName(currentLanguage)} ({currentLanguage.toUpperCase()})</span>
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
									class="w-full rounded-md bg-[#363a3b] px-3 py-2 text-white transition-colors duration-300 placeholder:text-gray-400 focus:outline-none focus:ring-2"
								/>
							</div>

							<!-- Language List -->
							<div class="max-h-48 divide-y divide-gray-700 overflow-y-auto py-1">
								{#each filteredLanguages as lang}
									<button
										class="flex w-full items-center justify-between px-4 py-2 text-left text-white transition-colors duration-300 hover:bg-[#363a3b] {currentLanguage ===
										lang
											? 'bg-[#363a3b]'
											: ''}"
										onclick={() => handleLanguageSelection(lang)}
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
					bind:value={systemLanguage.value}
					class="rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 focus:ring-2"
					onchange={(e: Event) => {
						const target = e.target as HTMLSelectElement;
						if (target) {
							const lang = target.value;
							handleLanguageSelection(lang);
						}
					}}
				>
					{#each availableLanguages as lang}
						<option value={lang}>{getLanguageName(lang)} ({lang.toUpperCase()})</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- CMS Version -->
		{#if !isDropdownOpen}
			<!-- Collection Preview -->
			{#if firstCollection && (active === 0 || active === 1)}
				<div
					class="absolute bottom-16 left-1/2 z-0 flex min-w-[200px] max-w-[300px] -translate-x-1/2 transform flex-col items-center gap-2 rounded-lg bg-gradient-to-r from-surface-50/10 to-[#242728]/10 p-3 text-center transition-opacity duration-300"
					class:opacity-50={isTransitioning}
				>
					<div class="text-xs text-gray-300">After login, you'll go to:</div>
					<div class="text-sm font-medium text-white">{firstCollection.name}</div>
				</div>
			{/if}

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

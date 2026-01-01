<!--
@file Authentication Form Component for SveltyCMS
@component
**This component handles both SignIn and SignUp functionality for the SveltyCMS**

### Props:
 - `data`: { firstUserExists: boolean, demoMode: boolean, showDatabaseError: boolean }
 - `dev`: boolean
 
### Features:
 - Dual SignIn and SignUp functionality with dynamic form switching
 - Dynamic language selection with a debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer displayed when active
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`, and `firstUserExists`)
 - Reset state functionality for easy return to initial screen
 - Accessibility features for language selection and form navigation
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { getPublicSetting, publicEnv } from '@src/stores/globalSettings.svelte';
	// Components
	import Seasons from '@components/system/icons/Seasons.svelte';
	import SveltyCMSLogoFull from '@components/system/icons/SveltyCMS_LogoFull.svelte';
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import VersionCheck from '@components/VersionCheck.svelte';
	// Stores
	import { systemLanguage } from '@stores/store.svelte';
	import { getLanguageName } from '@utils/languageUtils';
	import { locales as availableLocales } from '@src/paraglide/runtime';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	const { data } = $props();

	// Derive firstUserExists to make it reactive (fixes state_referenced_locally warning)
	const firstUserExists = $derived(data.firstUserExists);

	// Check for reset password URL parameters (initially false, updated by effect)
	let hasResetParams = $state(false);

	// Set Initial active state - always starts undefined, will be set by user interaction
	let active: undefined | 0 | 1 = $state(undefined);

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

	// Background state - mutable for user interactions
	let background = $state('#242728');

	// Initialize background based on conditions
	$effect(() => {
		// Only set initial background, don't override user interactions
		if (active === undefined && !hasResetParams) {
			if (publicEnv?.DEMO) {
				background = '#242728';
			} else if (publicEnv?.SEASONS) {
				background = 'white';
			} else if (firstUserExists) {
				background = 'white';
			} else {
				background = '#242728';
			}
		}
	});

	// Update background when hasResetParams changes
	$effect(() => {
		if (hasResetParams) {
			background = 'white'; // White background for reset password form
		}
	});

	let timeRemaining = $state({ minutes: 0, seconds: 0 });
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let searchInput: HTMLInputElement | null = $state(null);
	let isTransitioning = $state(false);
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined = $state();

	// Derived state using $derived rune
	const availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	const filteredLanguages = $derived(
		availableLanguages.filter(
			(lang: string) =>
				getLanguageName(lang, systemLanguage.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Ensure a valid language is always used
	const currentLanguage = $derived(systemLanguage.value && availableLocales.includes(systemLanguage.value) ? systemLanguage.value : 'en');

	// Language selection
	function handleLanguageSelection(lang: string) {
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			// Set cookie via store (bridge to ParaglideJS)
			systemLanguage.set(lang as (typeof systemLanguage)['value']);
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
		if (getPublicSetting('DEMO')) {
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
		background = data.demoMode ? '#242728' : getPublicSetting('SEASONS') ? '#242728' : firstUserExists ? 'white' : '#242728';
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
		if (active === undefined && !data.demoMode && !getPublicSetting('SEASONS')) {
			background = 'white';
		}
	}

	function handleSignUpPointerEnter() {
		if (active === undefined && !data.demoMode && !getPublicSetting('SEASONS')) {
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
					} else {
						logger.debug('[DEBUG] Prefetch action failed:', response.status);
					}
				})
				.catch((err) => {
					logger.debug('[DEBUG] Prefetch fetch error:', err);
				});
		}
	});
</script>

<div class={`flex min-h-lvh w-full overflow-y-auto bg-${background} transition-colors duration-300`}>
	<!-- Database Error Display -->
	{#if data.showDatabaseError}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="max-w-2xl rounded-lg bg-white p-8 shadow-xl">
				<div class="mb-4 flex items-center gap-3">
					<svg class="h-8 w-8 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<h2 class="text-2xl font-bold text-error-500">{m.db_error_title()}</h2>
				</div>

				<p class="mb-4 text-lg">{m.db_error_description()}</p>

				<div class="mb-4 rounded-lg bg-surface-200 p-4">
					<p class="font-semibold">{m.db_error_reason_label()}</p>
					<p class="text-sm">{data.errorReason}</p>
				</div>

				<div class="mb-6">
					<h3 class="mb-2 font-semibold">{m.db_error_solutions_title()}</h3>
					<ul class="list-inside list-disc space-y-1 text-sm">
						<li>{m.db_error_solution_1()}</li>
						<li>{m.db_error_solution_2()}</li>
						<li>{m.db_error_solution_3()}</li>
						<li>{m.db_error_solution_4()}</li>
					</ul>
				</div>

				{#if data.canReset}
					<div class="flex gap-4">
						<button
							type="button"
							onclick={async () => {
								if (confirm(m.db_error_reset_confirm())) {
									const response = await fetch('/api/setup/reset', { method: 'POST' });
									const result = await response.json();
									if (result.success) {
										window.location.href = '/setup';
									} else {
										alert('Failed to reset setup: ' + result.error);
									}
								}
							}}
							class="preset-filled-warning-500 btn"
						>
							{m.db_error_reset_setup()}
						</button>
						<button type="button" onclick={() => window.location.reload()} class="preset-filled-secondary-500 btn"> {m.db_error_refresh_page()} </button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- SignIn and SignUp Forms -->
	<SignIn
		bind:active
		onClick={handleSignInClick}
		onPointerEnter={handleSignInPointerEnter}
		onBack={resetToInitialState}
		firstCollectionPath={data.firstCollectionPath || ''}
	/>

	<SignUp
		bind:active
		isInviteFlow={data.isInviteFlow || false}
		token={data.token || ''}
		invitedEmail={data.invitedEmail || ''}
		inviteError={data.inviteError || ''}
		onClick={handleSignUpClick}
		onPointerEnter={handleSignUpPointerEnter}
		onBack={resetToInitialState}
		firstCollectionPath={data.firstCollectionPath || ''}
	/>

	{#if active == undefined}
		{#if data.demoMode}
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
			{#if Array.isArray(getPublicSetting('LOCALES')) && getPublicSetting('LOCALES').length > 5}
				<div class="relative">
					<!-- Current Language Display -->
					<button
						class="flex w-64 items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 hover:bg-[#363a3b] focus:ring-2"
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
						<div class="absolute -left-6 -top-3 z-10 mt-2 w-64 rounded-lg border bg-[#242728] shadow-lg transition-opacity duration-300">
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
		<div class="absolute bottom-5 left-1/2 -translate-x-1/2">
			<VersionCheck transparent={true} />
		</div>
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

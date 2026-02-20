<!--
@file src/routes/login/+page.svelte 
@component
**Authentication Form Component handles both SignIn and SignUp functionality for the SveltyCMS**

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
	import { locales as availableLocales } from '@src/paraglide/runtime';
	import { getPublicSetting, publicEnv } from '@src/stores/global-settings.svelte';
	// Stores
	import { systemLanguage } from '@src/stores/store.svelte.ts';
	import { getLanguageName } from '@utils/language-utils';

	// Components
	import SignIn from './components/sign-in.svelte';
	import SignUp from './components/sign-up.svelte';
	import Seasons from '@src/components/system/icons/seasons.svelte';
	import SveltyCMSLogoFull from '@src/components/system/icons/svelty-cms-logo-full.svelte';
	import VersionCheck from '@src/components/version-check.svelte';

	// Skeleton V4
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';

	// SvelteKit
	import { deserialize } from '$app/forms';

	// Paraglide Messages
	import {
		applayout_systemlanguage,
		db_error_description,
		db_error_reason_label,
		db_error_refresh_page,
		db_error_reset_confirm,
		db_error_reset_setup,
		db_error_solution_1,
		db_error_solution_2,
		db_error_solution_3,
		db_error_solution_4,
		db_error_solutions_title,
		db_error_title,
		login_demo_message,
		login_demo_nextreset,
		login_demo_title
	} from '@src/paraglide/messages';

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
			if (data.demoMode) {
				background = '#242728';
			} else if (publicEnv.SEASONS) {
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
		const timePassed = (minutes % 20) * 60 + seconds;
		const timeRemainingInSeconds = 1200 - timePassed;
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
		if (data.demoMode) {
			updateTimeRemaining();
			interval = setInterval(updateTimeRemaining, 1000);
			return () => {
				if (interval) {
					clearInterval(interval);
				}
			};
		}
	});

	// State management functions
	function resetToInitialState() {
		if (isTransitioning) {
			return;
		}
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
		if (isTransitioning) {
			return;
		}
		isTransitioning = true;

		if (firstUserExists) {
			active = 0; // Show SignIn for existing users
			background = 'white';
		} else {
			active = 1; // Show SignUp for fresh installation
			background = '#242728';
		}

		setTimeout(() => {
			isTransitioning = false;
		}, 400); // Match CSS transition duration
	}

	// Handle SignUp click
	function handleSignUpClick(event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		if (isTransitioning) {
			return;
		}
		isTransitioning = true;
		active = 1;
		background = '#242728';
		setTimeout(() => {
			isTransitioning = false;
		}, 400); // Match CSS transition duration
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
</script>

<div class={`flex min-h-lvh w-full overflow-y-auto bg-${background} transition-colors duration-300`} role="main" aria-label="Authentication Page">
	<!-- Seasons (always present, opacity/position managed) -->
	<div
		class="pointer-events-none fixed inset-0 z-10 transition-all duration-300"
		class:opacity-0={active === undefined}
		class:opacity-100={active !== undefined}
	>
		<Seasons />
	</div>

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
					<h2 class="text-2xl font-bold text-error-500">{db_error_title()}</h2>
				</div>

				<p class="mb-4 text-lg">{db_error_description()}</p>

				<div class="mb-4 rounded-lg bg-surface-200 p-4">
					<p class="font-semibold">{db_error_reason_label()}</p>
					<p class="text-sm">{data.errorReason}</p>
				</div>

				<div class="mb-6">
					<h3 class="mb-2 font-semibold">{db_error_solutions_title()}</h3>
					<ul class="list-inside list-disc space-y-1 text-sm">
						<li>{db_error_solution_1()}</li>
						<li>{db_error_solution_2()}</li>
						<li>{db_error_solution_3()}</li>
						<li>{db_error_solution_4()}</li>
					</ul>
				</div>

				{#if data.canReset}
					<div class="flex gap-4">
						<button
							type="button"
							onclick={async () => {
								if (confirm(db_error_reset_confirm())) {
									const response = await fetch('?/resetSetup', { method: 'POST', body: new FormData() });
									const result = deserialize(await response.text());

									if (result.type === 'success') {
										const data = result.data as { success: boolean; error?: string };
										if (data.success) {
											window.location.href = '/setup';
										} else {
											alert('Failed to reset setup: ' + (data.error || 'Unknown error'));
										}
									} else {
										const errorMsg = (result as { data?: { error?: string } }).data?.error || 'Failed to reset setup';
										alert('Failed to reset setup: ' + errorMsg);
									}
								}
							}}
							class="preset-filled-warning-500 btn"
						>
							{db_error_reset_setup()}
						</button>
						<button type="button" onclick={() => window.location.reload()} class="preset-filled-secondary-500 btn">{db_error_refresh_page()}</button>
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
				<p class="text-2xl font-bold">{login_demo_title()}</p>
				<p>{login_demo_message()}</p>
				<p class="text-xl font-bold">
					{login_demo_nextreset()}
					<!-- Announce remaining time in an accessible format -->
					<span aria-label="Time remaining: {timeRemaining.minutes} minutes and {timeRemaining.seconds} seconds">
						{timeRemaining.minutes}:{timeRemaining.seconds < 10 ? `0${timeRemaining.seconds}` : timeRemaining.seconds}
					</span>
				</p>
			</div>
		{/if}

		<!-- CMS Logo -->
		<div
			class="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
			style="filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3));"
		>
			<SveltyCMSLogoFull />
		</div>

		<!-- Language Select -->
		<div
			class="language-selector absolute bottom-1/4 left-1/2 -translate-x-1/2 transform transition-opacity duration-300"
			class:opacity-50={isTransitioning}
		>
			<Menu positioning={{ placement: 'top', gutter: 10 }}>
				<Menu.Trigger
					class="flex w-30 items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 hover:bg-[#363a3b] focus:ring-2"
					aria-label="Select language"
				>
					<span>{getLanguageName(currentLanguage)}</span>
					<iconify-icon icon="mdi:chevron-up" width={20}></iconify-icon>
				</Menu.Trigger>

				<Portal>
					<Menu.Positioner>
						<Menu.Content class="card p-2 shadow-xl preset-filled-surface-100-900 z-9999 w-64 border border-surface-200 dark:border-surface-500">
							<!-- Header to inform user about System Language context -->
							<div
								class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1"
							>
								{applayout_systemlanguage()}
							</div>

							{#if Array.isArray(getPublicSetting('LOCALES')) && getPublicSetting('LOCALES').length > 5}
								<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50">
									<input
										type="text"
										bind:this={searchInput}
										bind:value={searchQuery}
										placeholder="Search language..."
										class="w-full rounded-md bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none"
										aria-label="Search languages"
										onclick={(e) => e.stopPropagation()}
									/>
								</div>

								<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
									{#each filteredLanguages as lang (lang)}
										<Menu.Item
											value={lang}
											onclick={() => handleLanguageSelection(lang)}
											class="flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer"
										>
											<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
											<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2">{lang.toUpperCase()}</span>
										</Menu.Item>
									{/each}
								</div>
							{:else}
								{#each availableLanguages.filter((l) => l !== currentLanguage) as lang (lang)}
									<Menu.Item
										value={lang}
										onclick={() => handleLanguageSelection(lang)}
										class="flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer"
									>
										<span class="text-sm font-medium">{getLanguageName(lang)}</span>
										<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2">{lang.toUpperCase()}</span>
									</Menu.Item>
								{/each}
							{/if}
						</Menu.Content>
					</Menu.Positioner>
				</Portal>
			</Menu>
		</div>
		<!-- CMS Version -->
		<div class="absolute bottom-5 left-1/2 -translate-x-1/2"><VersionCheck transparent={true} /></div>
	{/if}
</div>

<style>
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
		scrollbar-width: thin;
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

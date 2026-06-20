<!--
@file src/routes/login/+page.svelte
@component
**Authentication Form Component handles both SignIn and SignUp functionality for the SveltyCMS**

### Props:
 - `data`: { hasAdminUser: boolean, demoMode: boolean, showDatabaseError: boolean }
 - `dev`: boolean

### Features:
 - Dual SignIn and SignUp functionality with dynamic form switching
 - Dynamic language selection with a debounced input field or dropdown for multiple languages
 - Demo mode support with auto-reset timer displayed when active
 - Initial form display adapts based on environment variables (`SEASON`, `DEMO`, and `hasAdminUser`)
 - Reset state functionality for easy return to initial screen
 - Accessibility features for language selection and form navigation
-->

<script lang="ts">
// Native UI
import Dropdown from "@components/ui/dropdown.svelte";
import Seasons from "@src/components/system/icons/seasons.svelte";
import SveltyCMSLogoFull from "@src/components/system/icons/svelty-cms-logo-full.svelte";
import VersionCheck from "@src/components/version-check.svelte";
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
	login_demo_title,
} from "@src/paraglide/messages";
import { locales as availableLocales } from "@src/paraglide/runtime";
import {
	getPublicSetting,
	publicEnv,
} from "@src/stores/global-settings.svelte";
// Stores
import { systemLanguage } from "@src/stores/store.svelte.ts";
import { getLanguageName } from "@utils/language-utils";
// SvelteKit
// Components
import SignIn from "./components/sign-in.svelte";
import SignUp from "./components/sign-up.svelte";
	import Button from '@components/ui/button.svelte';

// Props
const { data } = $props();
const loginBranding = $derived(
	(data as { loginBranding?: import('@utils/theme-merge').LoginBranding }).loginBranding,
);

// Derive hasAdminUser to make it reactive (fixes state_referenced_locally warning)
const hasAdminUser = $derived(data.hasAdminUser);
const returningUser = $derived(data.returningUser);

// Check for reset password URL parameters (initially false, updated by effect)
let hasResetParams = $state(false);

// Initial active state: returning users (a session cookie is present — see +page.server.ts)
// land on the Sign In form directly; new visitors start at the Sign In / Sign Up chooser.
let active: undefined | 0 | 1 = $state(undefined);
$effect(() => { active = returningUser ? 0 : undefined; });

// Update active state when URL parameters are detected
$effect(() => {
	if (typeof window !== "undefined") {
		const urlParams = new URLSearchParams(window.location.search);
		const token = urlParams.get("token");
		const email = urlParams.get("email");
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
let background = $state("#242728");
const darkBackground = $derived(loginBranding?.accentColor || "#242728");

// Initialize background based on conditions
$effect(() => {
	// Only set initial background, don't override user interactions
	if (active === undefined && !hasResetParams) {
		if (data.demoMode) {
			background = darkBackground;
		} else if (publicEnv.SEASONS) {
			background = "white";
		} else if (hasAdminUser) {
			background = "white";
		} else {
			background = darkBackground;
		}
	}
});

// Update background when hasResetParams changes
$effect(() => {
	if (hasResetParams) {
		background = "white"; // White background for reset password form
	}
});

let timeRemaining = $state({ minutes: 0, seconds: 0 });
let searchQuery = $state("");
let isDropdownOpen = $state(false);
let searchInput: HTMLInputElement | null = $state(null);
let isTransitioning = $state(false);
let debounceTimeout: ReturnType<typeof setTimeout> | undefined = $state();

// Derived state using $derived rune
const availableLanguages = $derived(
	[...availableLocales].sort((a, b) =>
		getLanguageName(a, "en").localeCompare(getLanguageName(b, "en")),
	),
);

const filteredLanguages = $derived(
	availableLanguages.filter(
		(lang: string) =>
			getLanguageName(lang, systemLanguage.value)
				.toLowerCase()
				.includes(searchQuery.toLowerCase()) ||
			getLanguageName(lang, "en")
				.toLowerCase()
				.includes(searchQuery.toLowerCase()),
	),
);

// Ensure a valid language is always used
const currentLanguage = $derived(
	systemLanguage.value && availableLocales.includes(systemLanguage.value as any)
		? systemLanguage.value
		: "en",
);

// Language selection
function handleLanguageSelection(lang: string) {
	clearTimeout(debounceTimeout);
	debounceTimeout = setTimeout(() => {
		// Set cookie via store (bridge to ParaglideJS)
		systemLanguage.set(lang as (typeof systemLanguage)["value"]);
		isDropdownOpen = false;
		searchQuery = "";
	}, 100); // Reduced delay for faster feedback
}

// Function to handle clicks outside of the language selector
function handleClickOutside(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".language-selector")) {
		isDropdownOpen = false;
		searchQuery = "";
	}
}

// Side effects using $effect rune
$effect(() => {
	if (typeof window !== "undefined" && isDropdownOpen) {
		window.addEventListener("click", handleClickOutside);
		// Focus search input when dropdown opens
		setTimeout(() => searchInput?.focus(), 0);
		return () => window.removeEventListener("click", handleClickOutside);
	}
});

// Demo mode timer management
function calculateTimeRemaining() {
	const now = new Date();
	const minutes = now.getMinutes();
	const seconds = now.getSeconds();
	const ttlMinutes = publicEnv.DEMO_TTL || 60;
	const timePassed = (minutes % ttlMinutes) * 60 + seconds;
	const timeRemainingInSeconds = ttlMinutes * 60 - timePassed;
	return {
		minutes: Math.floor(timeRemainingInSeconds / 60),
		seconds: timeRemainingInSeconds % 60,
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
	background = data.demoMode
		? darkBackground
		: getPublicSetting("SEASONS")
			? darkBackground
			: hasAdminUser
				? "white"
				: darkBackground;
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

	if (hasAdminUser) {
		active = 0; // Show SignIn for existing users
		background = "white";
	} else {
		active = 1; // Show SignUp for fresh installation
		background = darkBackground;
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
	background = darkBackground;
	setTimeout(() => {
		isTransitioning = false;
	}, 400); // Match CSS transition duration
}

// Handle pointer enter events
function handleSignInPointerEnter() {
	if (active === undefined && !data.demoMode && !getPublicSetting("SEASONS")) {
		background = "white";
	}
}

function handleSignUpPointerEnter() {
	if (active === undefined && !data.demoMode && !getPublicSetting("SEASONS")) {
		background = darkBackground;
	}
}
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	{#if loginBranding?.brandedLogin && loginBranding.customCss}
		<style>
			{loginBranding.customCss}
		</style>
	{/if}
</svelte:head>

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
			<div class="max-w-2xl rounded bg-white p-8 shadow-xl">
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

				<div class="mb-4 rounded bg-surface-200 p-4">
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
						<Button variant="warning"
							type="button"
							onclick={async () => {
								if (confirm(db_error_reset_confirm())) {
									const { resetSetup } = await import('./auth.remote');
									const result = await resetSetup();
									if (result.success) {
										window.location.href = '/setup';
									} else {
										alert('Failed to reset setup: ' + (result.message || 'Unknown error'));
									}
								}
							}} aria-label={db_error_reset_setup()}
						>
							{db_error_reset_setup()}
						</Button>
						<Button variant="secondary" type="button" onclick={() => window.location.reload()}>{db_error_refresh_page()}</Button>
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
		branding={loginBranding}
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
		branding={loginBranding}
	/>

	{#if active == undefined}
		{#if data.demoMode}
			<!-- DEMO MODE -->
			<div
				class="absolute bottom-2.75 inset-s-1/2 flex min-w-87.5 -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded bg-error-500 p-3 text-center text-white transition-opacity duration-300 sm:bottom-12"
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

		<!-- CMS Logo / Tenant Branding -->
		<div
			class="absolute inset-s-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center transition-[filter] duration-300"
			style="filter: drop-shadow(0 6px 10px {background === 'white' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.85)'});"
		>
			{#if loginBranding?.brandedLogin && loginBranding.logoUrl}
				<img
					src={loginBranding.logoUrl}
					alt={loginBranding.siteName}
					class="h-16 object-contain"
				/>
			{:else}
				<SveltyCMSLogoFull siteName={loginBranding?.siteName} />
			{/if}
			{#if loginBranding?.brandedLogin && loginBranding.siteName && loginBranding.siteName !== 'SveltyCMS'}
				<div class="mt-2 text-center text-xl font-bold text-white drop-shadow-lg">{loginBranding.siteName}</div>
			{/if}
		</div>

		<!-- Language Select -->
		<div
			class="language-selector absolute bottom-1/4 inset-x-0 flex justify-center transition-opacity duration-300"
			class:opacity-50={isTransitioning}
		>
			<Dropdown position="bottom" closeOnSelect={false} class="p-3! w-60 bg-black/90! border-white/10! dark:bg-black/90! dark:border-white/10! backdrop-blur-md! rounded-2xl! shadow-2xl">
				{#snippet trigger()}
					<span class="flex items-center justify-between gap-3 text-white bg-black/75 hover:bg-black/85 px-5 py-2.5 rounded-full transition-colors cursor-pointer shadow-lg">
						<span class="text-base font-semibold">{getLanguageName(currentLanguage)}</span>
						<iconify-icon icon="mdi:chevron-down" width={24}></iconify-icon>
					</span>
				{/snippet}
				<!-- Header to inform user about System Language context -->
				<div
					class="px-3 py-1.5 text-[10px] font-bold text-white/40 uppercase tracking-widest text-center border-b border-white/10 mb-2"
				>
					{applayout_systemlanguage()}
				</div>

				{#if Array.isArray(getPublicSetting('LOCALES')) && (getPublicSetting('LOCALES') as any[]).length > 5}
					<div class="px-2 pb-2 mb-2 border-b border-white/10">
						<input
							type="text"
							bind:this={searchInput}
							bind:value={searchQuery}
							placeholder="Search language..."
							class="w-full rounded bg-white/10 px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20 text-white border-none"
							aria-label="Search languages"
							onclick={(e) => e.stopPropagation()}
						/>
					</div>

					<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
						{#each filteredLanguages as lang (lang)}
							{const selected = lang === currentLanguage}
							<Button
								variant="ghost"
								onclick={() => handleLanguageSelection(lang)}
								aria-label={getLanguageName(lang)}
								class="flex w-full items-center justify-between px-3 py-2 text-start rounded-sm cursor-pointer hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-colors {selected ? 'bg-tertiary-500 dark:bg-primary-500/10 text-tertiary-500 dark:text-primary-500' : ''}"
							>
								<span class="flex items-center gap-2 text-sm font-medium text-surface-900 dark:text-surface-200">
									{getLanguageName(lang)}
									{#if selected}
										<iconify-icon icon="mdi:check" width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
									{/if}
								</span>
								<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
							</Button>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col gap-1">
						{#each availableLanguages as lang (lang)}
								{const selected = lang === currentLanguage}
								<Button
									variant="ghost"
									onclick={() => handleLanguageSelection(lang)}
									aria-label={getLanguageName(lang)}
									class="flex w-full items-center justify-between px-3 py-2 text-start rounded-sm cursor-pointer hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-colors {selected ? 'bg-tertiary-500 dark:bg-primary-500/10 text-tertiary-500 dark:text-primary-500' : ''}"
								>
									<span class="flex items-center gap-2 text-sm font-medium text-surface-900 dark:text-surface-200">
										{getLanguageName(lang)}
										{#if selected}
											<iconify-icon icon="mdi:check" width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										{/if}
									</span>
									<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
								</Button>
							{/each}
					</div>
				{/if}
			</Dropdown>
		</div>
		<!-- CMS Version -->
		<div class="absolute bottom-5 inset-s-1/2 -translate-x-1/2"><VersionCheck transparent={true} /></div>
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

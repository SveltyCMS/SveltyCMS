<!--
@file src/routes/setup/+page.svelte
@description Professional multi-step setup wizard for SveltyCMS with clean, modern design

Features:

-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { setupAdminSchema } from '@src/utils/formSchemas';
	import { onMount } from 'svelte';
	import { safeParse } from 'valibot';
	// Theme & language (Skeleton mode management)
	import SiteName from '@components/SiteName.svelte';
	import { modeCurrent, popup, type PopupSettings, setInitialClassState, setModeCurrent, setModeUserPrefers } from '@skeletonlabs/skeleton';
	import { getPublicSetting } from '@src/stores/globalSettings';
	import { systemLanguage } from '@stores/store.svelte';
	import { getLanguageName } from '@utils/languageUtils';
	import { get } from 'svelte/store';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	const steps = [
		{
			label: m.setup_step_database(),
			desc: m.setup_step_database_desc(),
			shortDesc: 'Database connection settings'
		},
		{
			label: m.setup_step_admin(),
			desc: m.setup_step_admin_desc(),
			shortDesc: 'Administrator account setup'
		},
		{
			label: m.setup_step_system(),
			desc: m.setup_step_system_desc(),
			shortDesc: 'Basic system configuration'
		},
		{
			label: m.setup_step_complete(),
			desc: m.setup_step_complete_desc(),
			shortDesc: 'Review and complete setup'
		}
	];

	let currentStep = $state(0);
	// Language selector state
	let isLangOpen = $state(false);
	let langSearch = $state('');
	let langSearchInput: HTMLInputElement | null = $state(null);
	// Import Paraglide runtime locales as a richer fallback when settings only expose default
	import { locales as paraglideLocales } from '@src/paraglide/runtime';
	const availableLanguages = $derived(
		(() => {
			const raw = getPublicSetting('LOCALES');
			// Normalize: allow comma/space separated string or array
			let normalized: string[] = [];
			if (Array.isArray(raw)) normalized = raw as string[];
			else if (typeof raw === 'string') normalized = raw.split(/[ ,;]+/).filter(Boolean);
			// If we only have a single locale (likely setup mode default), fall back to full Paraglide list
			if (normalized.length <= 1) normalized = [...paraglideLocales];
			// Ensure uniqueness and stable sort by English name
			return [...new Set(normalized)].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')));
		})()
	);
	const filteredLanguages = $derived(
		availableLanguages.filter(
			(l) =>
				getLanguageName(l as string, systemLanguage.value)
					.toLowerCase()
					.includes(langSearch.toLowerCase()) ||
				getLanguageName(l as string, 'en')
					.toLowerCase()
					.includes(langSearch.toLowerCase())
		) as string[]
	);

	function selectLanguage(lang: string) {
		// Immediate update for clearer UX in setup (no debounce needed here)
		systemLanguage.set(lang as (typeof systemLanguage)['value']);
		isLangOpen = false;
		langSearch = '';
	}
	function toggleLang() {
		isLangOpen = !isLangOpen;
	}
	function outsideLang(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.language-selector')) {
			isLangOpen = false;
			langSearch = '';
		}
	}
	$effect(() => {
		if (typeof window !== 'undefined' && isLangOpen) {
			window.addEventListener('click', outsideLang);
			setTimeout(() => langSearchInput?.focus(), 0);
			return () => window.removeEventListener('click', outsideLang);
		}
	});

	let mediaQuery: MediaQueryList | null = null;

	onMount(() => {
		// Apply initial class state (mirrors app layout behavior for standalone setup route)
		try {
			setInitialClassState();
		} catch {}
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const savedTheme = localStorage.getItem('theme');
		const prefersDark = mediaQuery.matches;
		// In existing app layout newMode = savedTheme === 'light'; replicate for consistency
		const newMode = savedTheme ? savedTheme === 'light' : !prefersDark; // boolean: true => light
		setModeUserPrefers(newMode);
		setModeCurrent(newMode);
		const handleChange = (e: MediaQueryListEvent) => {
			if (!localStorage.getItem('theme')) {
				// only update if user hasn't chosen explicitly
				const prefersDarkChange = e.matches;
				const mode = !prefersDarkChange; // invert to keep boolean mapping (true => light)
				setModeUserPrefers(mode);
				setModeCurrent(mode);
			}
		};
		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery && mediaQuery.removeEventListener('change', handleChange);
	});

	// Light/Dark toggle (mirrors LeftSidebar implementation semantics)
	const toggleTheme = () => {
		const currentMode = get(modeCurrent);
		const newMode = !currentMode;
		setModeUserPrefers(newMode);
		setModeCurrent(newMode);
		localStorage.setItem('theme', newMode ? 'light' : 'dark');
	};

	// Popup tooltip config
	const SwitchThemeTooltip: PopupSettings = { event: 'hover', target: 'SetupSwitchTheme', placement: 'bottom-start' };
	let totalSteps = steps.length;

	// Heading composition helper: extracts before/after around site name across languages (site name may be at start or end)
	function computeHeadingParts(full: string) {
		const candidatesRaw = [systemSettings.siteName, getPublicSetting('SITE_NAME') as string, 'SveltyCMS'];
		const candidates = [...new Set(candidatesRaw.filter(Boolean))] as string[];
		// Prioritize longer names first to avoid partial matches
		candidates.sort((a, b) => b.length - a.length);
		for (const name of candidates) {
			const idx = full.indexOf(name);
			if (idx !== -1) {
				return {
					before: full.slice(0, idx).trimEnd(),
					siteName: name,
					after: full.slice(idx + name.length).trimStart()
				};
			}
		}
		// Fallback: treat entire string as prefix, site name styled separately appended
		return { before: full.trim(), siteName: candidates[0] || 'SveltyCMS', after: '' };
	}

	let headingParts = $state({ before: '', siteName: '', after: '' });
	$effect(() => {
		// Paraglide message requires the { publicEnv: { SITE_NAME } } token object.
		// In early setup, env may be undefined; fall back to systemSettings or default.
		try {
			if (m.setup_heading_title) {
				const siteNameToken = getPublicSetting('SITE_NAME') || systemSettings.siteName || 'SveltyCMS';
				// Message pattern: "Setup {publicEnv.SITE_NAME}" or localized variant.
				// Provide expected shape: { publicEnv: { SITE_NAME: string } }
				const localized = m.setup_heading_title({ publicEnv: { SITE_NAME: siteNameToken } });
				headingParts = computeHeadingParts(localized);
			}
		} catch (e) {
			// Last-resort fallback without translation tokens to avoid runtime crash
			const siteNameToken = systemSettings.siteName || 'SveltyCMS';
			headingParts = computeHeadingParts(`Setup ${siteNameToken}`);
		}
	});

	// Form data
	let dbConfig = $state({
		type: 'mongodb',
		host: 'localhost',
		port: '27017',
		name: 'SveltyCMS',
		user: '',
		password: ''
	});
	let adminUser = $state({
		username: '',
		email: '',
		password: '',
		confirmPassword: ''
	});
	let systemSettings = $state({
		siteName: 'My SveltyCMS Site',
		defaultLanguage: 'en',
		availableLanguages: ['en'],
		mediaFolder: './static/media',
		timezone: 'UTC'
	});

	// Password validation rules
	let passwordRequirements = $state({
		length: false,
		letter: false,
		number: false,
		special: false,
		match: false
	});

	// Check password requirements
	function checkPasswordRequirements() {
		const password = adminUser.password;
		const confirmPassword = adminUser.confirmPassword;

		passwordRequirements.length = password.length >= 8;
		passwordRequirements.letter = /[a-zA-Z]/.test(password);
		passwordRequirements.number = /[0-9]/.test(password);
		passwordRequirements.special = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
		passwordRequirements.match = password === confirmPassword && password !== '';
	}

	// Run checks whenever password fields change
	$effect(() => {
		checkPasswordRequirements();
	});

	// UI states
	let isLoading = $state(false);
	let isRedirecting = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	type ValidationErrors = {
		host?: string;
		port?: string;
		name?: string;
		username?: string;
		email?: string;
		password?: string;
		confirmPassword?: string;
		siteName?: string;
		[key: string]: string | undefined;
	};
	let validationErrors = $state<ValidationErrors>({});

	// Password visibility states
	let showDbPassword = $state(false);
	let showAdminPassword = $state(false);
	let showConfirmPassword = $state(false);

	// Password visibility toggle functions
	const toggleDbPassword = () => {
		showDbPassword = !showDbPassword;
	};

	const toggleAdminPassword = () => {
		showAdminPassword = !showAdminPassword;
	};

	const toggleConfirmPassword = () => {
		showConfirmPassword = !showConfirmPassword;
	};

	// Ensure availableLanguages always includes the defaultLanguage
	$effect(() => {
		if (!systemSettings.availableLanguages.includes(systemSettings.defaultLanguage)) {
			systemSettings.availableLanguages = [...systemSettings.availableLanguages, systemSettings.defaultLanguage];
		}
	});

	onMount(async () => {
		try {
			/***
			const urlParams = new URLSearchParams(window.location.search);
			const fromLanguage = urlParams.get('from') === 'language';

			if (!fromLanguage) {
				goto('/setup/language');
				return;
			}
			***/

			const response = await fetch('/api/setup/status');
			const data = await response.json();
			if (data.isComplete) goto('/');
		} catch {}
	});

	function validateStep(step: number): boolean {
		validationErrors = {};

		switch (step) {
			case 0: // Database
				if (!dbConfig.host) validationErrors.host = m.setup_validation_host_required();
				if (!dbConfig.port) validationErrors.port = m.setup_validation_port_required();
				if (!dbConfig.name) validationErrors.name = m.setup_validation_dbname_required();
				break;
			case 1: // Admin
				// Use centralized validation schema
				const validationResult = safeParse(setupAdminSchema, {
					username: adminUser.username,
					email: adminUser.email,
					password: adminUser.password,
					confirmPassword: adminUser.confirmPassword
				});

				if (!validationResult.success) {
					for (const issue of validationResult.issues) {
						const path = issue.path?.[0]?.key as string;
						if (path) {
							validationErrors[path] = issue.message;
						}
					}
				}
				break;
			case 2: // System
				if (!systemSettings.siteName) validationErrors.siteName = m.setup_validation_sitename_required();
				break;
		}

		return Object.keys(validationErrors).length === 0;
	}

	function nextStep() {
		if (currentStep < totalSteps - 1 && validateStep(currentStep)) {
			currentStep++;
			errorMessage = '';
			successMessage = '';
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
			errorMessage = '';
			successMessage = '';
		}
	}

	async function testDatabaseConnection() {
		if (!validateStep(0)) return;

		isLoading = true;
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch('/api/setup/test-database', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(dbConfig)
			});
			const data = await response.json();

			if (data.success) {
				successMessage = m.setup_db_test_success();
			} else {
				errorMessage = m.setup_db_test_failed({ error: data.error || '' });
			}
		} catch (error) {
			if (error instanceof Error) {
				errorMessage = m.setup_db_test_error({ error: error.message });
			} else {
				errorMessage = m.setup_db_test_unknown_error();
			}
		} finally {
			isLoading = false;
		}
	}

	async function completeSetup() {
		// Debug: Log admin email before submitting
		console.log('Submitting setup with admin email:', adminUser.email);
		if (!validateStep(2)) return;

		isLoading = true;
		errorMessage = '';

		// Validate admin email before submitting
		if (!adminUser.email || typeof adminUser.email !== 'string' || !adminUser.email.trim() || !adminUser.email.includes('@')) {
			errorMessage = 'Admin email is required and must be valid.';
			validationErrors.email = 'Please enter a valid email address.';
			isLoading = false;
			return;
		}

		try {
			const response = await fetch('/api/setup/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ database: dbConfig, admin: adminUser, system: systemSettings })
			});
			const data = await response.json();

			if (data.success) {
				successMessage = m.setup_complete_success();

				// Immediately start the redirect process to prevent flash
				isRedirecting = true;
				successMessage = m.setup_complete_redirect();

				// Redirect after showing the loading animation
				setTimeout(() => goto('/login'), 2000);
			} else {
				errorMessage = m.setup_complete_failed({ error: data.error || '' });
			}
		} catch (error) {
			if (error instanceof Error) {
				errorMessage = m.setup_complete_error({ error: error.message });
			} else {
				errorMessage = m.setup_complete_unknown_error();
			}
		} finally {
			// Only reset loading if we're not redirecting
			if (!isRedirecting) {
				isLoading = false;
			}
		}
	}
</script>

<svelte:head>
	<title>SveltyCMS Setup</title>
	<!-- Ensure Skeleton sets initial mode classes for standalone setup route -->
	{@html '<script>(' + setInitialClassState.toString() + ')();</script>'}
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Bricolage+Grotesque:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<style>
		html,
		body {
			height: 100%;
			overflow: auto !important; /* Override the theme's overflow-hidden */
		}
	</style>
</svelte:head>

<div class="bg-surface-50-900 min-h-screen w-full transition-colors">
	<!-- Top bar with theme + language selectors -->
	<div class="flex items-center justify-end gap-4 px-4 py-3">
		<!-- Language selector (mirrors login simplified) -->
		<div class="language-selector relative">
			{#if availableLanguages.length > 5}
				<button onclick={toggleLang} class="variant-ghost btn btn-sm flex items-center gap-2">
					<span>{getLanguageName(systemLanguage.value)} ({systemLanguage.value.toUpperCase()})</span>
					<svg class="h-3.5 w-3.5 transition-transform {isLangOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</button>
				{#if isLangOpen}
					<div
						class="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
					>
						<input
							bind:this={langSearchInput}
							bind:value={langSearch}
							placeholder={m.setup_search_placeholder()}
							class="input-sm input mb-2 w-full"
						/>
						<div class="max-h-56 overflow-y-auto">
							{#each filteredLanguages as lang}
								<button
									onclick={() => selectLanguage(lang)}
									class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-200/60 dark:hover:bg-surface-600/60 {systemLanguage.value ===
									lang
										? 'bg-surface-200/80 font-medium dark:bg-surface-600/70'
										: ''}"
								>
									<span>{getLanguageName(lang)} ({lang.toUpperCase()})</span>
									{#if systemLanguage.value === lang}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
											<path
												fill-rule="evenodd"
												d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
												clip-rule="evenodd"
											/>
										</svg>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{:else}
				<select
					bind:value={systemLanguage.value}
					class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium shadow-sm focus:border-[#ff3e00] focus:outline-none focus:ring-2 focus:ring-[#ff3e00]/20 dark:border-slate-700 dark:bg-slate-800"
					onchange={(e: Event) => selectLanguage((e.target as HTMLSelectElement).value)}
				>
					{#each availableLanguages as lang}
						<option value={lang}>{getLanguageName(lang)} ({lang.toUpperCase()})</option>
					{/each}
				</select>
			{/if}
		</div>
		<!-- Theme switch (Skeleton modeCurrent with popup tooltip) -->
		<div>
			<button use:popup={SwitchThemeTooltip} onclick={toggleTheme} aria-label={m.setup_theme_toggle_fallback()} class="variant-ghost btn-icon">
				{#if !$modeCurrent}
					<iconify-icon icon="bi:sun" width="22"></iconify-icon>
				{:else}
					<iconify-icon icon="bi:moon-fill" width="22"></iconify-icon>
				{/if}
			</button>
			<div class="card variant-filled z-50 max-w-sm p-2" data-popup="SetupSwitchTheme">
				<!-- Reuse existing translation key; fallback to simple text if unavailable -->
				{#if m.applayout_switchmode}
					{m.applayout_switchmode({ $modeCurrent: !$modeCurrent ? 'Light' : 'Dark' })}
				{:else}
					{m.setup_theme_toggle_fallback()}
				{/if}
				<div class="variant-filled arrow"></div>
			</div>
		</div>
	</div>
	<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
		<!-- Header -->
		<div class="mb-6 rounded-xl border border-surface-200 bg-white p-4 shadow-xl dark:border-white dark:bg-surface-800 sm:p-6 lg:mb-10">
			<div class="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center">
				<div class="flex flex-shrink-0 items-center justify-center lg:justify-start">
					<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-12 w-auto sm:h-16" />
				</div>
				<div class="border-l-0 border-surface-200 dark:border-surface-600 lg:border-l lg:pl-5">
					<h1 class="mb-1 text-center text-xl font-bold leading-tight sm:text-2xl lg:text-left lg:text-3xl">
						{#if headingParts.before}{headingParts.before}&nbsp;{/if}<SiteName />{#if headingParts.after}&nbsp;{headingParts.after}{/if}
					</h1>
					<p class="text-center text-sm sm:text-base lg:text-left">{m.setup_heading_subtitle()}</p>
				</div>
				<div class="ml-auto hidden rounded border border-indigo-100 bg-indigo-50 px-4 py-2 lg:flex">
					<div class="text-xs font-medium uppercase tracking-wider text-surface-500">{m.setup_heading_badge()}</div>
				</div>
			</div>
		</div>

		<!-- Main Content with Left Side Steps -->
		<div class="flex flex-col gap-4 lg:min-h-[560px] lg:flex-row lg:gap-6">
			<!-- Step Indicator (Left Side) - Horizontal on mobile, vertical on desktop -->
			<div class="w-full shrink-0 lg:w-72">
				<div
					class="flex h-full flex-col rounded-xl border border-surface-200 bg-white shadow-xl dark:border-white dark:bg-surface-800 lg:sticky lg:top-8"
				>
					<!-- Mobile: Horizontal step indicator -->
					<div class="relative flex items-start justify-between p-4 lg:hidden">
						{#each steps as _step, i}
							<div class="relative z-10 flex flex-1 flex-col items-center">
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all sm:h-10 sm:w-10 sm:text-sm {i <
									currentStep
										? 'bg-primary-500 text-white'
										: i === currentStep
											? 'bg-primary-500 text-white shadow-xl'
											: 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400'}"
								>
									<span class="flex items-center justify-center leading-none">
										{#if i < currentStep}
											✓
										{:else}
											{i + 1}
										{/if}
									</span>
								</div>
								<div class="mt-2 text-center">
									<div
										class="text-xs font-medium sm:text-sm {i <= currentStep
											? 'text-surface-900 dark:text-white'
											: 'text-surface-500 dark:text-surface-400'} max-w-16 truncate sm:max-w-20"
									>
										{_step.label.split(' ')[0]}
									</div>
								</div>
							</div>
						{/each}

						<!-- Connecting lines for mobile -->
						<div class="absolute left-12 right-12 top-8 flex h-0.5 sm:left-14 sm:right-14 sm:top-9">
							{#each steps as _unused, i}
								{#if i !== steps.length - 1}
									<div
										class="mx-1 h-0.5 flex-1 {i < currentStep ? 'bg-emerald-500' : 'border-t-2 border-dashed border-slate-200 bg-transparent'}"
									></div>
								{/if}
							{/each}
						</div>
					</div>

					<!-- Desktop: Vertical step indicator -->
					<div class="hidden p-6 lg:block">
						{#each steps as _step, i}
							<div class="relative last:pb-0">
								<button
									class="flex w-full items-start gap-4 rounded-lg p-4 transition-all {i <= currentStep
										? 'hover:bg-slate-50'
										: 'cursor-not-allowed opacity-50'}"
									disabled={i > currentStep}
									onclick={() => i <= currentStep && (currentStep = i)}
								>
									<div
										class="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white transition-all {i <
										currentStep
											? 'bg-primary-500 '
											: i === currentStep
												? 'bg-error-500 shadow-xl'
												: 'bg-slate-100 '}"
									>
										<span class="flex items-center justify-center leading-none">
											{#if i < currentStep}
												✓
											{:else}
												{i + 1}
											{/if}
										</span>
									</div>
									<div class="text-left">
										<div class="text-base font-medium {i <= currentStep ? 'text-slate-800' : 'text-slate-400'}">{_step.label}</div>
										<div class="mt-1 text-sm {i <= currentStep ? 'text-slate-500' : 'text-slate-400'}">{_step.shortDesc}</div>
									</div>
								</button>
								{#if i !== steps.length - 1}
									<div
										class="absolute left-[1.45rem] top-[3.5rem] h-[calc(100%-3.5rem)] w-[2px] {i < currentStep
											? 'bg-primary-500'
											: 'border-l-2 border-dashed border-slate-200'}"
									></div>
								{/if}
							</div>
						{/each}

						<!-- Setup Steps Legend -->
						<div class="mt-auto border-t border-slate-100 pt-6">
							<h4 class="mb-3 text-sm font-semibold tracking-tight text-slate-700">Legend</h4>
							<div class="mb-3 flex items-center">
								<div class="mr-3 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-semibold text-white">
									<span class="flex items-center justify-center leading-none">✓</span>
								</div>
								<span class="text-sm text-slate-600">{m.setup_legend_completed()}</span>
							</div>
							<div class="mb-3 flex items-center">
								<div class="mr-3 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#ff3e00] text-xs font-semibold text-white">
									<span class="flex items-center justify-center leading-none">{currentStep + 1}</span>
								</div>
								<span class="text-sm text-slate-600">{m.setup_legend_current()}</span>
							</div>
							<div class="flex items-center">
								<div
									class="mr-3 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-400"
								>
									<span class="flex items-center justify-center leading-none">3</span>
								</div>
								<span class="text-sm text-slate-600">{m.setup_legend_pending()}</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Main Card (Right Side) -->
			<div class="flex flex-1 flex-col rounded-xl border-surface-200 bg-white shadow-xl dark:border-white dark:bg-surface-800">
				<div class="flex h-full flex-col overflow-hidden rounded-xl border">
					<!-- Card Header with Step Title -->
					<div class=" border-b px-4 py-3 sm:px-6 sm:py-4">
						{#if currentStep === 0}
							<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
								<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
									<path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
									<path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
									<path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
								</svg>
								Database Configuration
							</h2>
						{:else if currentStep === 1}
							<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
								<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
								</svg>
								Administrator Account
							</h2>
						{:else if currentStep === 2}
							<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
								<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
									<path
										fill-rule="evenodd"
										d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
										clip-rule="evenodd"
									/>
								</svg>
								System Configuration
							</h2>
						{:else if currentStep === 3}
							<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
								<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
									<path
										fill-rule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clip-rule="evenodd"
									/>
								</svg>
								Review & Complete
							</h2>
						{/if}
					</div>

					<!-- Card Content -->
					<div class="p-4 sm:p-6 lg:p-8">
						{#if currentStep === 0}
							<div class="fade-in">
								<!-- Database Configuration -->
								<div class="mb-6 sm:mb-8">
									<p class="text-sm sm:text-base">
										{m.setup_database_intro()}
									</p>
								</div>

								<div class="space-y-4 sm:space-y-6">
									<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
										<div>
											<label for="db-type" class="mb-1 block text-sm font-medium">{m.setup_label_database_type()}</label>
											<select id="db-type" bind:value={dbConfig.type} class="input rounded">
												<option value="mongodb">MongoDB</option>
												<option value="postgresql">PostgreSQL</option>
												<option value="mysql">MySQL</option>
											</select>
										</div>
										<div>
											<label for="db-host" class="mb-1 block text-sm font-medium">{m.setup_database_host()}</label>
											<input
												id="db-host"
												bind:value={dbConfig.host}
												type="text"
												placeholder="localhost"
												class="input w-full rounded {validationErrors.host ? 'border-error-500' : 'border-slate-200'}"
											/>
											{#if validationErrors.host}
												<div class="mt-1 text-xs text-error-500">{validationErrors.host}</div>
											{/if}
										</div>
										<div>
											<label for="db-port" class="mb-1 block text-sm font-medium">{m.setup_database_port()}</label>
											<input
												id="db-port"
												bind:value={dbConfig.port}
												type="text"
												placeholder="27017"
												class="input w-full rounded {validationErrors.port ? 'border-error-500' : 'border-slate-200'}"
											/>
											{#if validationErrors.port}
												<div class="mt-1 text-xs text-error-500">{validationErrors.port}</div>
											{/if}
										</div>
										<div>
											<label for="db-name" class="mb-1 block text-sm font-medium">{m.setup_database_name()}</label>
											<input
												id="db-name"
												bind:value={dbConfig.name}
												type="text"
												placeholder="SveltyCMS"
												class="input w-full rounded {validationErrors.name ? 'border-error-500' : 'border-slate-200'}"
											/>
											{#if validationErrors.name}
												<div class="mt-1 text-xs text-error-500">{validationErrors.name}</div>
											{/if}
										</div>
										<div>
											<label for="db-user" class="mb-1 block text-sm font-medium">{m.setup_database_user()}</label>
											<input id="db-user" bind:value={dbConfig.user} type="text" placeholder="Database username" class="input rounded" />
										</div>
										<div>
											<label for="db-password" class="mb-1 block text-sm font-medium">{m.setup_database_password()}</label>
											<div class="relative">
												<input
													id="db-password"
													bind:value={dbConfig.password}
													type={showDbPassword ? 'text' : 'password'}
													placeholder="Database password"
													class="input w-full rounded"
												/>
												<button
													type="button"
													onclick={toggleDbPassword}
													class="absolute inset-y-0 right-0 flex min-w-[2.5rem] touch-manipulation items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
													aria-label={showDbPassword ? 'Hide password' : 'Show password'}
												>
													<iconify-icon icon={showDbPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18"></iconify-icon>
												</button>
											</div>
										</div>
									</div>

									<button
										onclick={testDatabaseConnection}
										disabled={isLoading}
										class="variant-filled-tertiary btn w-full dark:variant-filled-primary"
									>
										{#if isLoading}
											<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"></div>
											Testing Connection...
										{:else}
											{m.setup_button_test_connection()}
										{/if}
									</button>
								</div>
							</div>
						{:else if currentStep === 1}
							<div class="fade-in">
								<!-- Admin User -->
								<div class="mb-8">
									<p class="">Create your administrator account with full access to manage content, users, and system settings.</p>
								</div>

								<div class="space-y-6">
									<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
										<div>
											<label for="admin-username" class="mb-1 block text-sm font-medium">{m.setup_admin_username()}</label>
											<input
												id="admin-username"
												bind:value={adminUser.username}
												type="text"
												placeholder="Enter username"
												class="input w-full rounded {validationErrors.username ? 'border-error-500' : 'border-slate-200'}"
											/>
											{#if validationErrors.username}
												<div class="mt-1 text-xs text-error-500">{validationErrors.username}</div>
											{/if}
										</div>
										<div>
											<label for="admin-email" class="mb-1 block text-sm font-medium">{m.setup_admin_email()}</label>
											<input
												id="admin-email"
												bind:value={adminUser.email}
												type="email"
												placeholder="admin@example.com"
												class="input w-full rounded {validationErrors.email ? 'border-error-500' : 'border-slate-200'}"
											/>
											{#if validationErrors.email}
												<div class="mt-1 text-xs text-error-500">{validationErrors.email}</div>
											{/if}
										</div>
										<div>
											<label for="admin-password" class="mb-1 block text-sm font-medium">{m.setup_admin_password()}</label>
											<div class="relative">
												<input
													id="admin-password"
													bind:value={adminUser.password}
													oninput={checkPasswordRequirements}
													type={showAdminPassword ? 'text' : 'password'}
													placeholder="Enter secure password"
													class="input w-full rounded {validationErrors.password ? 'border-error-500' : 'border-slate-200'}"
												/>
												<button
													type="button"
													onclick={toggleAdminPassword}
													class="btn absolute"
													aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
												>
													<iconify-icon icon={showAdminPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18"></iconify-icon>
												</button>
											</div>
											{#if validationErrors.password}
												<div class="mt-1 text-xs text-error-500">{validationErrors.password}</div>
											{/if}
										</div>
										<div>
											<label for="admin-confirm-password" class="mb-1 block text-sm font-medium">{m.setup_admin_confirm_password()}</label>
											<div class="relative">
												<input
													id="admin-confirm-password"
													bind:value={adminUser.confirmPassword}
													oninput={checkPasswordRequirements}
													type={showConfirmPassword ? 'text' : 'password'}
													placeholder="Confirm your password"
													class="input w-full rounded {validationErrors.confirmPassword ? 'border-error-500' : 'border-slate-200'}"
												/>
												<button
													type="button"
													onclick={toggleConfirmPassword}
													class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
													aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
												>
													<iconify-icon icon={showConfirmPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18"></iconify-icon>
												</button>
											</div>
											{#if validationErrors.confirmPassword}
												<div class="mt-1 text-xs text-error-500">{validationErrors.confirmPassword}</div>
											{/if}
										</div>
									</div>

									<div class="mt-4 rounded border-l-4 border-tertiary-500 bg-white p-4 shadow-xl dark:bg-surface-500">
										<h4 class="mb-2 text-sm font-semibold tracking-tight">Password Requirements</h4>
										<ul class="space-y-2 text-sm">
											<li class="flex items-center {passwordRequirements.length ? 'text-primary-600' : 'text-slate-500'}">
												<span
													class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border {passwordRequirements.length
														? 'border-primary-300 bg-emerald-100 text-primary-600'
														: 'border-slate-300 bg-slate-100 text-slate-400'}"
												>
													{#if passwordRequirements.length}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
															<path
																fill-rule="evenodd"
																d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																clip-rule="evenodd"
															/>
														</svg>
													{/if}
												</span>
												Minimum 8 characters
											</li>
											<li class="flex items-center {passwordRequirements.letter ? 'text-primary-600' : 'text-slate-500'}">
												<span
													class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border {passwordRequirements.letter
														? 'border-primary-300 bg-emerald-100 text-primary-600'
														: 'border-slate-300 bg-slate-100 text-slate-400'}"
												>
													{#if passwordRequirements.letter}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
															<path
																fill-rule="evenodd"
																d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																clip-rule="evenodd"
															/>
														</svg>
													{/if}
												</span>
												At least one letter (A-Z or a-z)
											</li>
											<li class="flex items-center {passwordRequirements.number ? 'text-primary-600' : 'text-slate-500'}">
												<span
													class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border {passwordRequirements.number
														? 'border-primary-300 bg-emerald-100 text-emerald-600'
														: 'border-slate-300 bg-slate-100 text-slate-400'}"
												>
													{#if passwordRequirements.number}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
															<path
																fill-rule="evenodd"
																d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																clip-rule="evenodd"
															/>
														</svg>
													{/if}
												</span>
												At least one number (0-9)
											</li>
											<li class="flex items-center {passwordRequirements.special ? 'text-primary-600' : 'text-slate-500'}">
												<span
													class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border {passwordRequirements.special
														? 'border-primary-300 bg-emerald-100 text-primary-600'
														: 'border-slate-300 bg-slate-100 text-slate-400'}"
												>
													{#if passwordRequirements.special}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
															<path
																fill-rule="evenodd"
																d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																clip-rule="evenodd"
															/>
														</svg>
													{/if}
												</span>
												At least one special character (@$!%*#?&)
											</li>
											<li class="flex items-center {passwordRequirements.match ? 'text-primary-600' : 'text-slate-500'}">
												<span
													class="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border {passwordRequirements.match
														? 'border-primary-300 bg-emerald-100 text-primary-600'
														: 'border-slate-300 bg-slate-100 text-slate-400'}"
												>
													{#if passwordRequirements.match}
														<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
															<path
																fill-rule="evenodd"
																d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
																clip-rule="evenodd"
															/>
														</svg>
													{/if}
												</span>
												Passwords match
											</li>
											<li class="mt-2 flex items-center border-t border-slate-200 pt-2 text-slate-500">
												<span class="mr-2 inline-flex h-5 w-5 items-center justify-center">
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-tertiary-500" viewBox="0 0 20 20" fill="currentColor">
														<path
															fill-rule="evenodd"
															d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
															clip-rule="evenodd"
														/>
													</svg>
												</span>
												This account will have full administrative privileges
											</li>
										</ul>
									</div>
								</div>
							</div>
						{:else if currentStep === 2}
							<div class="fade-in">
								<!-- System Settings -->
								<div class="mb-8">
									<p class="">Configure the basic settings for your CMS including site name, language preferences, and media storage.</p>
								</div>

								<div class="space-y-6">
									<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
										<div>
											<label for="site-name" class="mb-1 block text-sm font-medium">Site Name</label>
											<input
												id="site-name"
												bind:value={systemSettings.siteName}
												type="text"
												placeholder="My SveltyCMS Site"
												class="input w-full rounded {validationErrors.siteName ? 'border-error-500' : 'border-slate-200'}"
											/>
											{#if validationErrors.siteName}
												<div class="mt-1 text-xs text-error-500">{validationErrors.siteName}</div>
											{/if}
										</div>
										<div>
											<label for="default-language" class="mb-1 block text-sm font-medium">Default Language</label>
											<select id="default-language" bind:value={systemSettings.defaultLanguage} class="input w-full rounded">
												{#each availableLanguages as lang}
													<option value={lang}>{getLanguageName(lang)} ({lang.toUpperCase()})</option>
												{/each}
											</select>
										</div>
										<div>
											<label for="timezone" class="mb-1 block text-sm font-medium">Timezone</label>
											<select id="timezone" bind:value={systemSettings.timezone} class="input w-full rounded">
												<option value="UTC">UTC (Coordinated Universal Time)</option>
												<option value="America/New_York">Eastern Time (ET)</option>
												<option value="America/Chicago">Central Time (CT)</option>
												<option value="America/Denver">Mountain Time (MT)</option>
												<option value="America/Los_Angeles">Pacific Time (PT)</option>
												<option value="Europe/London">London (GMT)</option>
												<option value="Europe/Paris">Paris (CET)</option>
												<option value="Asia/Tokyo">Tokyo (JST)</option>
											</select>
										</div>
										<div>
											<label for="media-folder" class="mb-1 block text-sm font-medium">Media Storage Path</label>
											<input
												id="media-folder"
												bind:value={systemSettings.mediaFolder}
												type="text"
												placeholder="./static/media"
												class="input w-full rounded"
											/>
										</div>
									</div>
								</div>
							</div>
						{:else if currentStep === 3}
							<div class="fade-in">
								<!-- Review & Complete -->
								<div class="mb-8">
									<p class="">Please review your configuration before completing the setup. Once finished, you'll be redirected to the login page.</p>
								</div>

								<div class="space-y-6">
									<div class="mt-4 space-y-6 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
										<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
											<div>
												<h3 class="mb-3 flex items-center font-semibold tracking-tight">
													<span class="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-500"></span>
													Database Configuration
												</h3>
												<div class="space-y-2 text-sm">
													<div><span class="font-medium">Type:</span> {dbConfig.type}</div>
													<div><span class="font-medium">Host:</span> {dbConfig.host}</div>
													<div><span class="font-medium">Port:</span> {dbConfig.port}</div>
													<div><span class="font-medium">Database:</span> {dbConfig.name}</div>
													{#if dbConfig.user}
														<div><span class="font-medium">Username:</span> {dbConfig.user}</div>
													{/if}
												</div>
											</div>

											<div>
												<h3 class="mb-3 flex items-center font-semibold tracking-tight">
													<span class="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-500"></span>
													Administrator Account
												</h3>
												<div class="space-y-2 text-sm">
													<div><span class="font-medium">Username:</span> {adminUser.username}</div>
													<div><span class="font-medium">Email:</span> {adminUser.email}</div>
													<div><span class="font-medium">Password:</span> ••••••••</div>
												</div>
											</div>

											<div>
												<h3 class="mb-3 flex items-center font-semibold tracking-tight">
													<span class="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-500"></span>
													System Settings
												</h3>
												<div class="t space-y-2 text-sm">
													<div><span class="font-medium">Site Name:</span> {systemSettings.siteName}</div>
													<div><span class="font-medium">Language:</span> {systemSettings.defaultLanguage}</div>
													<div><span class="font-medium">Timezone:</span> {systemSettings.timezone}</div>
												</div>
											</div>

											<div>
												<h3 class="mb-3 flex items-center font-semibold tracking-tight">
													<span class="mr-2 inline-block h-2 w-2 rounded-full bg-indigo-500"></span>
													Media Storage
												</h3>
												<div class="space-y-2 text-sm">
													<div><span class="font-medium">Path:</span> {systemSettings.mediaFolder}</div>
												</div>
											</div>
										</div>
									</div>

									<button
										onclick={completeSetup}
										disabled={isLoading}
										class="flex min-h-[3rem] w-full touch-manipulation items-center justify-center gap-2 rounded-md bg-emerald-600 px-6 py-4 text-base font-medium text-white transition-all hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{#if isLoading}
											<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"></div>
											Completing Setup...
										{:else}
											{m.setup_button_complete()}
										{/if}
									</button>
								</div>
							</div>
						{/if}

						<!-- Status Messages -->
						{#if successMessage && !isRedirecting}
							<div class="bg-primara-50 mt-4 flex items-center gap-2 rounded-md border-l-4 border-primary-400 p-3.5 text-sm text-green-800">
								<svg class="h-4 w-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
								</svg>
								{successMessage}
							</div>
						{/if}

						{#if errorMessage}
							<div class="mt-4 flex items-center gap-2 rounded-md border-l-4 border-error-400 bg-red-50 p-3.5 text-sm text-error-600">
								<svg class="h-4 w-4 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								{errorMessage}
							</div>
						{/if}
					</div>
					<!-- End of Card Content -->

					<!-- Navigation -->
					<div
						class="mt-6 flex flex-col gap-3 border-t border-slate-200 px-4 pb-4 pt-4 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pb-6 sm:pt-6"
					>
						<button
							onclick={prevStep}
							disabled={currentStep === 0}
							class="variant-filled-tertiary btn order-2 dark:variant-filled-primary sm:order-1"
						>
							← {m.setup_button_previous()}
						</button>

						<div class="order-1 text-center text-sm font-medium sm:order-2">
							Step {currentStep + 1} of {totalSteps}
						</div>

						{#if currentStep < totalSteps - 1}
							<button onclick={nextStep} class="variant-filled-tertiary btn order-3 dark:variant-filled-primary">
								{m.setup_button_next()} →
							</button>
						{:else}
							<div class="order-3"></div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Redirect Loading Overlay -->
{#if isRedirecting}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-50">
		<div class="text-center">
			<!-- Loading Animation -->
			<div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
				<!-- Outer spinning ring -->
				<div class="h-16 w-16 animate-spin rounded-full border-4 border-slate-200 border-t-[#ff3e00]"></div>
			</div>

			<!-- Message -->
			<h3 class="mb-2 text-lg font-semibold text-slate-800">{m.twofa_setup_complete_title()}</h3>
			<p class="text-sm text-slate-600">
				{successMessage}
			</p>
		</div>
	</div>
{/if}

<style>
	/* Any component-specific styles can go here */
	.fade-in {
		animation: fadeIn 0.3s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Accent color variables */
	:root {
		--accent-color: #6366f1;
		--accent-color-light: rgba(99, 102, 241, 0.1);
		--accent-color-medium: rgba(99, 102, 241, 0.5);
	}
</style>

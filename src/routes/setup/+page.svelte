<!--
@file src/routes/setup/+page.svelte
@description Professional multi-step setup wizard for SveltyCMS with clean, modern design
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import SiteName from '@components/SiteName.svelte';
	import { modeCurrent, popup, type PopupSettings, setInitialClassState, setModeCurrent } from '@skeletonlabs/skeleton';
	import { getPublicSetting } from '@src/stores/globalSettings';
	import { setupAdminSchema } from '@src/utils/formSchemas';
	import { systemLanguage } from '@stores/store.svelte';
	import { getLanguageName } from '@utils/languageUtils';
	import { onDestroy, onMount } from 'svelte';
	import { safeParse } from 'valibot';
	import AdminConfig from './AdminConfig.svelte';
	import DatabaseConfig from './DatabaseConfig.svelte';
	import ReviewConfig from './ReviewConfig.svelte';
	import SystemConfig from './SystemConfig.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
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
	// Language dropdown UI state
	let isLangOpen = $state(false);
	let langSearch = $state('');
	// (Removed unused langSearchInput ref)

	function selectLanguage(lang: string) {
		systemLanguage.set(lang as (typeof systemLanguage)['value']);
		isLangOpen = false;
		langSearch = '';
	}
	function toggleLang() {
		isLangOpen = !isLangOpen;
	}
	function outsideLang(e: MouseEvent) {
		const t = e.target as HTMLElement;
		if (!t.closest('.language-selector')) {
			isLangOpen = false;
			langSearch = '';
		}
	}

	// Wizard steps configuration
	interface StepDef {
		label: string;
		shortDesc: string;
	}
	// Using localized step labels & descriptions
	const steps: StepDef[] = [
		{ label: m.setup_step_database(), shortDesc: m.setup_step_database_desc() },
		{ label: m.setup_step_admin(), shortDesc: m.setup_step_admin_desc() },
		{ label: m.setup_step_system(), shortDesc: m.setup_step_system_desc() },
		{ label: m.setup_step_complete(), shortDesc: m.setup_step_complete_desc() }
	];
	let currentStep = $state(0);
	const totalSteps = $derived(steps.length);

	// Persist step across locale changes (layout re-keys subtree when language switches)
	$effect(() => {
		if (typeof sessionStorage !== 'undefined') {
			try {
				sessionStorage.setItem('setupCurrentStep', String(currentStep));
			} catch {}
		}
	});

	// Legend data (used in vertical stepper legend)
	const legendItems = [
		{ key: 'completed', label: m.setup_legend_completed(), content: '✓' },
		{ key: 'current', label: m.setup_legend_current(), content: '●' },
		{ key: 'pending', label: m.setup_legend_pending(), content: '•' }
	];

	// Theme toggle tooltip & handler
	const SwitchThemeTooltip: PopupSettings = {
		event: 'hover',
		target: 'SetupSwitchTheme',
		placement: 'bottom'
	};
	function toggleTheme() {
		// Skeleton expects boolean toggle for dark mode
		setModeCurrent(!$modeCurrent);
	}

	// Form state
	let dbConfig = $state({ type: 'mongodb', host: 'localhost', port: '27017', name: 'SveltyCMS', user: '', password: '' });
	let adminUser = $state({ username: '', email: '', password: '', confirmPassword: '' });
	let systemSettings = $state({
		siteName: 'SveltyCMS',
		// System UI language settings (from Paraglide locales)
		defaultSystemLanguage: 'en',
		systemLanguages: ['en'],
		// Content language settings (editor/content translations – freeform)
		defaultContentLanguage: 'en',
		contentLanguages: ['en', 'de'],
		mediaFolder: './mediaFolder',
		timezone: 'UTC'
	});
	// Password validation rules
	let passwordRequirements = $state({ length: false, letter: false, number: false, special: false, match: false });
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
	// Toggle for showing detailed DB test info
	let showDbDetails = $state(false);

	// --- Session persistence (prevent losing form data on reload) ---
	const PERSIST_PREFIX = 'setupWizard:';
	const KEY_DB = PERSIST_PREFIX + 'dbConfig';
	const KEY_ADMIN = PERSIST_PREFIX + 'adminUser';
	const KEY_SYSTEM = PERSIST_PREFIX + 'systemSettings';
	const KEY_STEP = 'setupCurrentStep'; // legacy existing key for step

	function loadPersisted() {
		if (typeof sessionStorage === 'undefined') return;
		try {
			const db = sessionStorage.getItem(KEY_DB);
			if (db) Object.assign(dbConfig, JSON.parse(db));
			const adm = sessionStorage.getItem(KEY_ADMIN);
			if (adm) Object.assign(adminUser, JSON.parse(adm));
			const sys = sessionStorage.getItem(KEY_SYSTEM);
			if (sys) Object.assign(systemSettings, JSON.parse(sys));
		} catch {}
	}
	function clearPersisted() {
		try {
			sessionStorage.removeItem(KEY_DB);
			sessionStorage.removeItem(KEY_ADMIN);
			sessionStorage.removeItem(KEY_SYSTEM);
			sessionStorage.removeItem(KEY_STEP);
		} catch {}
	}
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
	const toggleDbPassword = () => (showDbPassword = !showDbPassword);
	const toggleAdminPassword = () => (showAdminPassword = !showAdminPassword);
	const toggleConfirmPassword = () => (showConfirmPassword = !showConfirmPassword);
	let lastDbTest = $state<any>(null);
	// Fingerprint current database settings to invalidate successful test when user edits fields afterwards
	const dbConfigFingerprint = $derived(
		JSON.stringify({
			type: dbConfig.type,
			host: dbConfig.host,
			port: dbConfig.port,
			name: dbConfig.name,
			user: dbConfig.user,
			password: dbConfig.password
		})
	);
	let lastTestFingerprint = $state<string | null>(null);
	const dbConfigChangedSinceTest = $derived(!!lastTestFingerprint && lastTestFingerprint !== dbConfigFingerprint && !!lastDbTest?.success);
	// Removed unused UI detail toggles & connection string preview (can reintroduce if needed)
	let dbNameManuallyChanged = $state(false);
	let isFullUri = $derived(dbConfig.host.startsWith('mongodb://') || dbConfig.host.startsWith('mongodb+srv://'));
	$effect(() => {
		if (!systemSettings.systemLanguages.includes(systemSettings.defaultSystemLanguage)) {
			systemSettings.systemLanguages = [...systemSettings.systemLanguages, systemSettings.defaultSystemLanguage];
		}
		if (!systemSettings.contentLanguages.includes(systemSettings.defaultContentLanguage)) {
			systemSettings.contentLanguages = [...systemSettings.contentLanguages, systemSettings.defaultContentLanguage];
		}
	});
	$effect(() => {
		if (!dbNameManuallyChanged && systemSettings.siteName) {
			const slug = systemSettings.siteName.replace(/[^a-zA-Z0-9_]+/g, '_');
			dbConfig.name = slug || 'SveltyCMS';
		}
	});
	onMount(async () => {
		try {
			const res = await fetch('/api/setup/status');
			const data = await res.json();
			if (data.isComplete) goto('/');
		} catch {}
		document.addEventListener('click', outsideLang);
		// Restore persisted form data & step
		loadPersisted();
		// Restore persisted step after initial mount (after potential locale-triggered remount)
		try {
			const stored = sessionStorage.getItem(KEY_STEP);
			if (stored !== null) {
				const parsed = parseInt(stored, 10);
				if (!Number.isNaN(parsed) && parsed >= 0 && parsed < steps.length) currentStep = parsed;
			}
		} catch {}
	});
	onDestroy(() => {
		document.removeEventListener('click', outsideLang);
	});
	function validateStep(step: number) {
		validationErrors = {};
		switch (step) {
			case 0: // Database
				if (!dbConfig.host) validationErrors.host = m.setup_validation_host_required();
				if (!isFullUri && !dbConfig.port) validationErrors.port = m.setup_validation_port_required();
				if (!dbConfig.name) validationErrors.name = m.setup_validation_dbname_required();
				break;
			case 1: // Admin
				// Use centralized validation schema
				const r = safeParse(setupAdminSchema, {
					username: adminUser.username,
					email: adminUser.email,
					password: adminUser.password,
					confirmPassword: adminUser.confirmPassword
				});
				if (!r.success) {
					for (const issue of r.issues) {
						const path = issue.path?.[0]?.key as string;
						if (path) validationErrors[path] = issue.message;
					}
				}
				break;
			case 2: // System
				if (!systemSettings.siteName) validationErrors.siteName = m.setup_validation_sitename_required();
				break;
		}
		return Object.keys(validationErrors).length === 0;
	}
	async function testDatabaseConnection() {
		if (!validateStep(0)) return;
		isLoading = true;
		errorMessage = '';
		successMessage = '';
		showDbDetails = false; // collapse previous details
		try {
			const start = performance.now();
			const response = await fetch('/api/setup/test-database', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(dbConfig)
			});
			const data = await response.json();
			const latency = performance.now() - start;
			// initialize base test record
			lastDbTest = { ...data, latencyMs: Math.round(latency) };
			if (data.success) {
				successMessage = m.setup_db_test_success();
				lastTestFingerprint = dbConfigFingerprint; // store fingerprint of tested config
			} else {
				const originalError = data.error || '';
				const lower = originalError.toLowerCase();
				let classified = '';
				if (!dbConfig.user || !dbConfig.password) {
					classified = m.setup_db_test_missing_credentials();
				} else if (/auth|authoriz|credential|login|passwd|password|user/.test(lower)) {
					classified = originalError; // keep auth error as-is
				}
				// Friendly classification hint from server (if provided)
				let classHint = '';
				if (data.classification) {
					const key = `setup_db_test_class_${data.classification}` as keyof typeof m;
					if (key in m && typeof (m as any)[key] === 'function') {
						try {
							classHint = (m as any)[key]();
						} catch {}
					}
				}
				const finalError = classified || classHint || originalError || 'Unknown error';
				lastDbTest.error = originalError; // preserve raw
				errorMessage = m.setup_db_test_failed({ error: finalError });
			}
		} catch (e) {
			errorMessage = e instanceof Error ? m.setup_db_test_error({ error: e.message }) : m.setup_db_test_unknown_error();
			lastDbTest = { success: false, error: errorMessage };
		} finally {
			isLoading = false;
		}
	}
	async function completeSetup() {
		if (!validateStep(2)) {
			currentStep = 2;
			return;
		}
		isLoading = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/setup/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ database: dbConfig, admin: adminUser, system: systemSettings })
			});
			const data = await response.json();
			if (data.success) {
				successMessage = m.setup_complete_success();
				isRedirecting = true;
				clearPersisted();
				// Prefer direct redirect to first collection if backend auto logged-in
				const target = data.loggedIn && data.redirectPath ? data.redirectPath : '/login';
				setTimeout(() => goto(target), 1200);
			} else {
				errorMessage = m.setup_complete_failed({ error: data.error || '' });
			}
		} catch (e) {
			errorMessage = e instanceof Error ? m.setup_complete_error({ error: e.message }) : m.setup_complete_unknown_error();
		} finally {
			if (!isRedirecting) isLoading = false;
		}
	}
	const canProceedFlag = $derived(() =>
		currentStep === 0
			? !!lastDbTest?.success && lastTestFingerprint === dbConfigFingerprint // require successful test of current config
			: validateStep(currentStep)
	);
	// Persist wizard state objects & step
	$effect(() => {
		try {
			sessionStorage.setItem(KEY_STEP, String(currentStep));
		} catch {}
	});
	$effect(() => {
		try {
			sessionStorage.setItem(KEY_DB, JSON.stringify({ ...dbConfig }));
		} catch {}
	});
	$effect(() => {
		try {
			sessionStorage.setItem(KEY_ADMIN, JSON.stringify({ ...adminUser }));
		} catch {}
	});
	$effect(() => {
		try {
			sessionStorage.setItem(KEY_SYSTEM, JSON.stringify({ ...systemSettings }));
		} catch {}
	});
	function nextStep() {
		// Only advance if derived flag true for current step
		if (currentStep < steps.length - 1 && !!canProceedFlag) {
			currentStep++;
			errorMessage = '';
			successMessage = '';
			showDbDetails = false;
		}
	}
	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
			errorMessage = '';
			successMessage = '';
		}
	}
</script>

<svelte:head>
	<title>SveltyCMS Setup</title>
	{@html '<script>(' + setInitialClassState.toString() + ')();</script>'}
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Bricolage+Grotesque:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<style>
		html,
		body {
			height: 100%;
			overflow: auto !important;
		}
	</style>
</svelte:head>

<!-- (Markup continues below; removed stray duplicated content) -->

<div class="bg-surface-50-900 min-h-screen w-full transition-colors">
	<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
		<!-- Header -->
		<div class="mb-4 rounded-xl border border-surface-200 bg-white p-4 shadow-xl dark:border-white dark:bg-surface-800 sm:p-6 lg:mb-6">
			<div class="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center">
				<div class="flex flex-shrink-0 items-center justify-center lg:justify-start">
					<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-12 w-auto sm:h-16" />
				</div>
				<div class="border-l-0 border-surface-200 dark:border-surface-600 lg:border-l lg:pl-5">
					<h1 class="mb-1 text-center text-xl font-bold leading-tight sm:text-2xl lg:text-left lg:text-3xl"><SiteName /></h1>
					<p class="text-center text-sm sm:text-base lg:text-left">{m.setup_heading_subtitle()}</p>
				</div>
				<div class="ml-auto hidden rounded border border-indigo-100 bg-indigo-50 px-4 py-2 lg:flex">
					<div class="text-xs font-medium uppercase tracking-wider text-surface-500">{m.setup_heading_badge()}</div>
				</div>
				<!-- Top bar with theme + language selectors -->
				<div class="flex items-center justify-end gap-4 px-4 py-3">
					<!-- Language selector -->
					<div class="language-selector relative">
						{#if availableLanguages.length > 5}
							<button onclick={toggleLang} class="variant-ghost btn rounded">
								<span>{getLanguageName(systemLanguage.value)} ({systemLanguage.value.toUpperCase()})</span>
								<svg class="h-3.5 w-3.5 transition-transform {isLangOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg
								>
							</button>
							{#if isLangOpen}
								<div
									class="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
								>
									<input bind:value={langSearch} placeholder={m.setup_search_placeholder()} class="input-sm input mb-2 w-full" />
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
													<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"
														><path
															fill-rule="evenodd"
															d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
															clip-rule="evenodd"
														/></svg
													>
												{/if}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						{:else}
							<select bind:value={systemLanguage.value} class="input" onchange={(e: Event) => selectLanguage((e.target as HTMLSelectElement).value)}>
								{#each availableLanguages as lang}<option value={lang}>{getLanguageName(lang)} ({lang.toUpperCase()})</option>{/each}
							</select>
						{/if}
					</div>
					<!-- Theme switch tooltip -->
					<div>
						<button use:popup={SwitchThemeTooltip} onclick={toggleTheme} aria-label={m.setup_theme_toggle_fallback()} class="variant-ghost btn-icon">
							{#if !$modeCurrent}<iconify-icon icon="bi:sun" width="22"></iconify-icon>{:else}<iconify-icon icon="bi:moon-fill" width="22"
								></iconify-icon>{/if}
						</button>
						<div class="card variant-filled z-50 max-w-sm p-2" data-popup="SetupSwitchTheme">
							{#if m.applayout_switchmode}{m.applayout_switchmode({
									$modeCurrent: !$modeCurrent ? 'Light' : 'Dark'
								})}{:else}{m.setup_theme_toggle_fallback()}{/if}
							<div class="variant-filled arrow"></div>
						</div>
					</div>
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
									<span>{i < currentStep ? '✓' : i + 1}</span>
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
							{#each steps as _unused, i}{#if i !== steps.length - 1}<div
										class="mx-1 h-0.5 flex-1 {i < currentStep ? 'bg-emerald-500' : 'border-t-2 border-dashed border-slate-200 bg-transparent'}"
									></div>{/if}{/each}
						</div>
					</div>

					<!-- Desktop: Vertical step indicator -->
					<div class="hidden p-6 lg:block">
						{#each steps as _step, i}
							<div class="relative last:pb-0">
								<button
									class="flex w-full items-start gap-4 rounded-lg p-4 transition-all {i <= currentStep
										? 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
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
										<span>{i < currentStep ? '✓' : i + 1}</span>
									</div>
									<div class="text-left">
										<div
											class="text-base font-medium {i < currentStep
												? 'text-slate-800 dark:text-slate-200'
												: i === currentStep
													? 'text-slate-900 dark:text-white'
													: 'text-slate-400 dark:text-slate-600'}"
										>
											{_step.label}
										</div>
										<div
											class="mt-1 text-sm {i < currentStep
												? 'text-slate-500 dark:text-slate-400'
												: i === currentStep
													? 'text-slate-600 dark:text-slate-300'
													: 'text-slate-400 dark:text-slate-600'}"
										>
											{_step.shortDesc}
										</div>
									</div>
								</button>
								{#if i !== steps.length - 1}<div
										class="absolute left-[1.45rem] top-[3.5rem] h-[calc(100%-3.5rem)] w-[2px] {i < currentStep
											? 'bg-primary-500'
											: 'border-l-2 border-dashed border-slate-200'}"
									></div>{/if}
							</div>
						{/each}
						<!-- Setup Steps Legend -->
						<div class=" mt-6 border-t pt-6">
							<h4 class="mb-4 text-sm font-semibold tracking-tight text-slate-700 dark:text-slate-200">Legend</h4>
							<ul class="space-y-2 text-xs">
								{#each legendItems as item}
									<li class="grid grid-cols-[1.4rem_auto] items-center gap-x-3">
										<div
											class="flex h-5 w-5 items-center justify-center rounded-full font-semibold leading-none
												{item.key === 'completed' ? ' bg-primary-500 text-white' : ''}
												{item.key === 'current' ? ' bg-error-500 text-white shadow-sm' : ''}
												{item.key === 'pending' ? ' bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600' : ''}"
										>
											<span class="text-[0.65rem]">{item.content}</span>
										</div>
										<span class="text-slate-600 dark:text-slate-400">{item.label}</span>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			</div>

			<!-- Main Card (Right Side) -->
			<div class="flex flex-1 flex-col rounded-xl border-surface-200 bg-white shadow-xl dark:border-white dark:bg-surface-800">
				<div class="flex h-full flex-col overflow-hidden rounded-xl border">
					<!-- Card Header with Step Title -->
					<div class=" border-b px-4 py-3 sm:px-6 sm:py-4">
						<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
							{#if currentStep === 0}
								<iconify-icon icon="mdi:database" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_database()}
							{:else if currentStep === 1}
								<iconify-icon icon="mdi:account" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_admin()}
							{:else if currentStep === 2}
								<iconify-icon icon="mdi:cog" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_system()}
							{:else}
								<iconify-icon icon="mdi:check-circle" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_complete()}
							{/if}
						</h2>
					</div>

					<!-- Card Content -->
					<div class="p-4 sm:p-6 lg:p-8">
						{#if currentStep === 0}
							<DatabaseConfig
								bind:dbConfig
								{validationErrors}
								{isLoading}
								{showDbPassword}
								{toggleDbPassword}
								{testDatabaseConnection}
								{dbConfigChangedSinceTest}
							/>
						{:else if currentStep === 1}
							<div class="fade-in">
								<!-- Admin User -->
								<AdminConfig
									bind:adminUser
									{validationErrors}
									{passwordRequirements}
									{showAdminPassword}
									{showConfirmPassword}
									{toggleAdminPassword}
									{toggleConfirmPassword}
									{checkPasswordRequirements}
								/>
							</div>
						{:else if currentStep === 2}
							<!-- System Settings -->
							<div class="fade-in"><SystemConfig {systemSettings} validationErrors={validationErrors as any} {availableLanguages} /></div>
						{:else if currentStep === 3}
							<!-- Review & Complete via component -->
							<div class="fade-in space-y-6">
								<ReviewConfig {dbConfig} {adminUser} {systemSettings} />
								<button onclick={completeSetup} disabled={isLoading} class="variant-filled-tertiary btn w-full dark:variant-filled-primary"
									>{#if isLoading}<div class="h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-transparent border-t-white"></div>
										Completing Setup...{:else}{m.setup_button_complete()}{/if}</button
								>
							</div>
						{/if}
						<!-- Status Messages -->
						{#if (successMessage || errorMessage) && lastDbTest}
							<div
								class="mt-4 flex flex-col rounded-md border-l-4 p-0 text-sm"
								class:border-primary-400={!!successMessage}
								class:border-error-400={!!errorMessage}
							>
								<div
									class="flex items-start gap-2 px-3.5 py-3"
									class:bg-primary-50={!!successMessage}
									class:text-green-800={!!successMessage}
									class:bg-red-50={!!errorMessage}
									class:text-error-600={!!errorMessage}
								>
									<svg class="mt-0.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										{#if successMessage}
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										{:else}
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										{/if}
									</svg>
									<div class="flex-1 pr-4">{successMessage || errorMessage}</div>
									<button type="button" class="btn-sm ml-auto mt-0.5 flex items-center gap-1" onclick={() => (showDbDetails = !showDbDetails)}>
										<iconify-icon icon={showDbDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="h-4 w-4"></iconify-icon>
										<span class="hidden sm:inline">{showDbDetails ? m.setup_db_test_details_hide() : m.setup_db_test_details_show()}</span>
									</button>
								</div>
								{#if showDbDetails}
									<div class="border-t border-surface-200 bg-surface-50 text-xs dark:border-surface-600 dark:bg-surface-700">
										<div class="grid grid-cols-2 gap-x-4 gap-y-2 p-3 sm:grid-cols-6">
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.setup_db_test_latency()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{lastDbTest.latencyMs ?? '—'} ms</span>
											</div>
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.setup_db_test_engine()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{dbConfig.type}</span>
											</div>
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.label_host?.() || m.setup_db_test_host()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{dbConfig.host}</span>
											</div>
											{#if !isFullUri}
												<div class="sm:col-span-1">
													<span class="font-semibold">{m.label_port?.() || m.setup_db_test_port()}:</span>
													<span class="text-terrary-500 dark:text-primary-500">{dbConfig.port}</span>
												</div>
											{/if}
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.label_database?.() || m.setup_db_test_database()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{dbConfig.name}</span>
											</div>
											{#if dbConfig.user}
												<div class="sm:col-span-1">
													<span class="font-semibold">{m.label_user?.() || m.setup_db_test_user()}:</span>
													<span class="text-terrary-500 dark:text-primary-500">{dbConfig.user}</span>
												</div>
											{/if}
											{#if lastDbTest.classification}
												<div class="sm:col-span-2">
													<span class="font-semibold">Code:</span>
													<span class="text-terrary-500 dark:text-primary-500">{lastDbTest.classification}</span>
												</div>
											{/if}
										</div>
										{#if !lastDbTest.success}
											<div class="border-t border-surface-200 p-3 dark:border-surface-600">
												<div class="mb-1 font-semibold text-error-600">{m.setup_db_test_error_details()}</div>
												<pre
													class="whitespace-pre-wrap break-all rounded bg-red-50 p-2 text-[11px] leading-snug text-error-700 dark:bg-error-900/20 dark:text-white">{lastDbTest.error ||
														errorMessage ||
														m.setup_db_test_no_error()}</pre>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
					<!-- Navigation -->
					<div
						class="mt-6 flex flex-col gap-3 border-t border-slate-200 px-4 pb-4 pt-4 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pb-6 sm:pt-6"
					>
						{#if currentStep > 0}
							<button onclick={prevStep} class="variant-filled-tertiary btn order-2 dark:variant-filled-primary sm:order-1">
								<iconify-icon icon="mdi:arrow-left-bold" class="mr-1 h-4 w-4" aria-hidden="true"></iconify-icon>
								{m.button_previous()}
							</button>
						{:else}
							<!-- Spacer to maintain centered step text & next button alignment on first step -->
							<div class="order-2 sm:order-1"></div>
						{/if}
						<div class="order-1 text-center text-sm font-medium sm:order-2">
							{m.setup_progress_step_of({ current: String(currentStep + 1), total: String(totalSteps) })}
						</div>
						{#if currentStep < steps.length - 1}
							<button
								onclick={nextStep}
								disabled={!canProceedFlag}
								aria-disabled={!canProceedFlag}
								class="disabled:saturate-75 variant-filled-tertiary btn order-3 transition-all
									dark:variant-filled-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-300 disabled:text-surface-500
									disabled:opacity-50 disabled:shadow-none dark:disabled:bg-surface-700"
							>
								{m.button_next()}
								<iconify-icon icon="mdi:arrow-right-bold" class="ml-1 h-4 w-4" aria-hidden="true"></iconify-icon>
							</button>
						{:else}<div class="order-3"></div>{/if}
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
			<p class="text-sm text-slate-600">{successMessage}</p>
		</div>
	</div>
{/if}

<style>
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
</style>

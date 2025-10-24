<!--
@file src/routes/setup/+page.svelte
@description Professional multi-step setup wizard for SveltyCMS with clean, modern design

### Features:
- Type-safe Svelte 5 rune-based state management
- Responsive design with mobile/desktop step indicators
- Professional visual design with icons and animations
- Integration with setupStore for persistence
- Database-agnostic integration with IDBAdapter and authDBInterface
@note Code is organized into numbered sections for clarity:
      
      1. State Management
      2. Type Definitions
      3. Local UI State
      4. Lifecycle Hooks
      5. Derived State
      6. Core Logic & API Calls
      7. UI Handlers
      8. Lazy Component State & Error Handling
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	// Stores
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { setupStore } from '@stores/setupStore.svelte';
	import { systemLanguage } from '@stores/store.svelte';
	// Componets
	import SiteName from '@components/SiteName.svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';
	import WelcomeModal from './WelcomeModal.svelte';
	import VersionCheck from '@components/VersionCheck.svelte';

	// Skeleton
	import { type ModalSettings, ToastProvider } from '@skeletonlabs/skeleton-svelte';
	import type { ModalComponent } from '@skeletonlabs/skeleton-svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Utils
	import { setupAdminSchema } from '@utils/formSchemas';
	import { getLanguageName } from '@utils/languageUtils';
	import { systemConfigSchema } from '@utils/setupValidationSchemas';
	import { setGlobalToastStore, showToast } from '@utils/toast';
	// Valiation
	import { safeParse } from 'valibot';
	// Import default configuration from single source of truth
	import { DEFAULT_SYSTEM_LANGUAGES } from '@src/routes/api/setup/constants';

	// --- 1. STATE MANAGEMENT ---
	const { wizard, load: loadStore, clear: clearStore, setupPersistence } = setupStore;

	// --- 2. TYPE DEFINITIONS ---
	type ValidationErrors = Record<string, string>;
	type PasswordRequirements = {
		length: boolean;
		letter: boolean;
		number: boolean;
		special: boolean;
		match: boolean;
	};
	type DatabaseTestResult = {
		success: boolean;
		message?: string;
		error?: string;
		userFriendly?: string;
		latencyMs?: number;
		classification?: string;
		details?: any;
	};
	type SetupCompleteResponse = {
		success: boolean;
		error?: string;
		redirectPath?: string;
		loggedIn?: boolean;
	};

	// --- 3. LOCAL UI STATE ---
	let isLoading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let lastDbTestResult = $state<DatabaseTestResult | null>(null);
	let validationErrors = $state<ValidationErrors>({});
	let lastTestFingerprint = $state<string | null>(null);
	let showDbDetails = $state(false);

	let showDbPassword = $state(false);
	let showAdminPassword = $state(false);
	let showConfirmPassword = $state(false);

	// Language dropdown UI state
	let isLangOpen = $state(false);
	let langSearch = $state('');

	// --- DARK MODE AUTO-DETECT ---
	let prefersDark = false;
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('sveltycms_dark_mode');
		if (stored === null) {
			prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			if (prefersDark) {
				document.documentElement.classList.add('dark');
				localStorage.setItem('sveltycms_dark_mode', 'true');
			} else {
				document.documentElement.classList.remove('dark');
				localStorage.setItem('sveltycms_dark_mode', 'false');
			}
		}
	}

	// --- 4. LIFECYCLE HOOKS ---
	// Component registry for Skeleton Labs v2 modals
	// Must use { ref: Component } format per v2 docs
	const modalComponentRegistry: Record<string, ModalComponent> = {
		welcomeModal: { ref: WelcomeModal }
	};

	// Initialize modal store at module level (after component registry)
	const modalStore = getModalStore();

	onMount(() => {
		setGlobalToastStore(getToastStore());

		console.log('onMount - modalStore:', modalStore);
		console.log('onMount - modalComponentRegistry:', modalComponentRegistry);

		// Load existing data from localStorage
		loadStore();

		document.addEventListener('click', outsideLang);

		// Initialize persistence effect now that we're in component context
		setupPersistence();

		// Check if we should show the welcome modal
		// Using sessionStorage so it shows once per browser session
		// If setup is already complete, don't show the modal
		const welcomeShown = sessionStorage.getItem('sveltycms_welcome_modal_shown');
		console.log('welcomeShown from sessionStorage:', welcomeShown);

		// Show the welcome modal after component mounts
		if (!welcomeShown) {
			console.log('Welcome modal not shown this session, will trigger...');
			// Use requestAnimationFrame to ensure DOM is fully ready
			requestAnimationFrame(() => {
				setTimeout(() => {
					console.log('Triggering welcome modal NOW...');
					showWelcomeModal();
					// Set the flag so it doesn't show again this session
					sessionStorage.setItem('sveltycms_welcome_modal_shown', 'true');
				}, 100);
			});
		} else {
			console.log('Welcome modal already shown this session, skipping...');
		}
	});

	onDestroy(() => {
		document.removeEventListener('click', outsideLang);
	});

	function showWelcomeModal() {
		console.log('showWelcomeModal called, modalStore:', modalStore);
		const modal: ModalSettings = {
			type: 'component',
			component: 'welcomeModal', // Use the string key for the registered component
			response: (confirmed: boolean) => {
				if (confirmed) {
					console.log('User clicked Get Started in welcome modal.');
					// Potentially trigger navigation to step 1 or some other setup start action
				} else {
					console.log('User closed welcome modal without starting.');
					// What happens if they close? Maybe nothing, they just see the faded setup page.
				}
			}
		};
		console.log('Triggering modal with settings:', modal);
		modalStore.trigger(modal);
		console.log('Modal trigger called');
	}

	// --- 5. DERIVED STATE ---
	const dbConfigFingerprint = $derived<string>(JSON.stringify(wizard.dbConfig));
	const isFullUri = $derived<boolean>(
		wizard.dbConfig.host.startsWith('mongodb://') || wizard.dbConfig.host.startsWith('mongodb+srv://') || wizard.dbConfig.type === 'mongodb+srv'
	);
	const dbConfigChangedSinceTest = $derived<boolean>(
		!!lastTestFingerprint && lastTestFingerprint !== dbConfigFingerprint && !!lastDbTestResult?.success
	);

	const passwordRequirements = $derived<PasswordRequirements>({
		length: wizard.adminUser.password.length >= 8,
		letter: /[a-zA-Z]/.test(wizard.adminUser.password),
		number: /[0-9]/.test(wizard.adminUser.password),
		special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(wizard.adminUser.password),
		match: wizard.adminUser.password === wizard.adminUser.confirmPassword && wizard.adminUser.password !== ''
	});

	// Wizard steps configuration
	interface StepDef {
		label: string;
		shortDesc: string;
	}

	const steps = $derived<StepDef[]>([
		{ label: m.setup_step_database(), shortDesc: m.setup_step_database_desc() },
		{ label: m.setup_step_admin(), shortDesc: m.setup_step_admin_desc() },
		{ label: m.setup_step_system(), shortDesc: m.setup_step_system_desc() },
		{
			label: m.setup_step_email ? m.setup_step_email() : 'Email (Optional)',
			shortDesc: m.setup_step_email_desc ? m.setup_step_email_desc() : 'Configure SMTP for email functionality'
		},
		{ label: m.setup_step_complete(), shortDesc: m.setup_step_complete_desc() }
	]);
	const totalSteps = $derived<number>(steps.length);

	const stepCompleted = $derived<boolean[]>([
		wizard.dbTestPassed || wizard.highestStepReached > 0,
		wizard.highestStepReached > 1 && validateStep(1, false),
		wizard.highestStepReached > 2 && validateStep(2, false),
		wizard.highestStepReached > 3, // Email is optional, always considered complete
		false
	]);

	// Derived per-step clickability (allows navigation to completed steps, current step, and next available step)
	const stepClickable = $derived<boolean[]>([
		true, // Step 0 (Database) is always clickable
		wizard.highestStepReached >= 1, // Step 1 (Admin) is clickable if we've reached it
		wizard.highestStepReached >= 2, // Step 2 (System) is clickable if we've reached it
		wizard.highestStepReached >= 3, // Step 3 (Email) is clickable if we've reached it
		wizard.highestStepReached >= 4 // Step 4 (Complete) is clickable if we've reached it
	]);

	const canProceed = $derived.by<boolean>(() => {
		if (wizard.currentStep === 0) return wizard.dbTestPassed;
		if (wizard.currentStep === 1 || wizard.currentStep === 2) return validateStep(wizard.currentStep, false);
		if (wizard.currentStep === 3) return true; // Email step is optional, always can proceed
		return false;
	});

	// System languages: ONLY from project.inlang/settings.json locales
	const systemLanguages = $derived.by<string[]>(() => {
		const raw = publicEnv.LOCALES;
		let normalized: string[] = [];

		if (typeof raw === 'string' && (raw as string).trim()) {
			normalized = (raw as string).split(/[ ,;]+/).filter(Boolean);
		} else if (Array.isArray(raw) && raw.length > 0) {
			normalized = raw.filter((item): item is string => typeof item === 'string');
		}

		// Use DEFAULT_SYSTEM_LANGUAGES from seed.ts as single source of truth
		if (normalized.length === 0) {
			return [...DEFAULT_SYSTEM_LANGUAGES];
		}

		return [...new Set(normalized)].sort((a: string, b: string) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')));
	});

	// Legend data (used in vertical stepper legend)
	const legendItems = [
		{ key: 'completed', label: m.setup_legend_completed(), content: '✓' },
		{ key: 'current', label: m.setup_legend_current(), content: '●' },
		{ key: 'pending', label: m.setup_legend_pending(), content: '•' }
	];

	// --- 6. CORE LOGIC & API CALLS ---
	function validateStep(step: number, mutateErrors = true): boolean {
		const errs: ValidationErrors = {};
		switch (step) {
			case 0:
				if (!wizard.dbConfig.host) errs.host = m.setup_validation_host_required();
				if (!isFullUri && !wizard.dbConfig.port) errs.port = m.setup_validation_port_required();
				if (!wizard.dbConfig.name) errs.name = m.setup_validation_dbname_required();
				break;
			case 1:
				// Use main schema for instant feedback; server will re-validate
				const adminResult = safeParse(setupAdminSchema, { ...wizard.adminUser });
				if (!adminResult.success) {
					for (const issue of adminResult.issues) {
						const path = issue.path?.[0]?.key as string;
						if (path) errs[path] = issue.message;
					}
				}
				break;
			case 2:
				// Use main schema for instant feedback; server will re-validate
				const systemResult = safeParse(systemConfigSchema, { ...wizard.systemSettings });
				if (!systemResult.success) {
					for (const issue of systemResult.issues) {
						const path = issue.path?.[0]?.key as string;
						if (path) errs[path] = issue.message;
					}
				}
				break;
		}
		if (mutateErrors) validationErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function testDatabaseConnection(): Promise<void> {
		// Handle client-side validation failure
		if (!validateStep(0, true)) {
			// Show a general error in the main block
			errorMessage = 'Please fill in all required fields before testing the connection.';
			// Create a mock result to ensure the error block appears and is expanded
			lastDbTestResult = { success: false, error: 'Client-side validation failed.' };
			showDbDetails = true; // Expand the details on validation failure
			return;
		}

		isLoading = true;
		errorMessage = '';
		successMessage = '';
		lastDbTestResult = null;

		try {
			// Send the wizard.dbConfig directly
			const response = await fetch('/api/setup/test-database', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(wizard.dbConfig) // Send the clean object
			});

			const data: DatabaseTestResult = await response.json();
			lastDbTestResult = data;

			console.log('Database test response:', data);

			if (data.success) {
				successMessage = data.message || 'Connection successful!';
				wizard.dbTestPassed = true;
				lastTestFingerprint = dbConfigFingerprint;
				errorMessage = '';
				showDbDetails = false; // Collapse details on success
				validationErrors = {};
			} else {
				errorMessage = data.userFriendly || data.error || 'Database connection failed. Please check your configuration.';
				wizard.dbTestPassed = false;
				successMessage = '';
				showDbDetails = true; // Auto-expand details on failure

				const newValidationErrors: ValidationErrors = {};
				if (data.classification) {
					switch (data.classification) {
						case 'authentication_failed':
						case 'user_not_found':
						case 'wrong_password':
							newValidationErrors.user = 'Please check your username';
							newValidationErrors.password = 'Please check your password';
							break;
						case 'credentials_required':
						case 'auth_required':
						case 'likely_auth_required':
						case 'password_required':
							newValidationErrors.user = 'Username required for authentication';
							newValidationErrors.password = 'Password required for authentication';
							break;
						case 'dns_not_found':
						case 'connection_refused':
							newValidationErrors.host = 'Please check your hostname or server status';
							break;
						case 'invalid_port':
							newValidationErrors.port = 'Please check your port number';
							break;
						case 'database_not_found':
							newValidationErrors.name = 'Database not found - please check the name';
							break;
						case 'invalid_hostname':
							newValidationErrors.host = 'Invalid hostname format';
							break;
						case 'invalid_uri':
							newValidationErrors.host = 'Invalid connection string format';
							break;
					}
				}

				if (Object.keys(newValidationErrors).length > 0) {
					validationErrors = newValidationErrors;
				}

				console.error('Database test failed:', {
					userFriendly: data.userFriendly,
					error: data.error,
					classification: data.classification,
					details: data.details
				});
			}
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : 'A network error occurred.';
			errorMessage = `Network error: ${errorMsg}`;
			wizard.dbTestPassed = false;
			successMessage = '';
			console.error('Network error during database test:', e);
		} finally {
			isLoading = false;
		}
	}

	async function completeSetup(): Promise<void> {
		if (!validateStep(2, true)) {
			wizard.currentStep = 2;
			return;
		}
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/setup/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					database: wizard.dbConfig,
					admin: wizard.adminUser,
					system: wizard.systemSettings,
					firstCollection: wizard.firstCollection, // Pass pre-seeded collection for faster redirect
					skipWelcomeEmail: wizard.emailSettings.skipWelcomeEmail // Pass SMTP configuration status
				})
			});

			const data: SetupCompleteResponse = await response.json();

			if (!response.ok || !data.success) {
				// Show error toast on failure
				const errorMsg = data.error || 'Failed to finalize setup.';
				showToast(errorMsg, 'error', 5000);
				errorMessage = errorMsg;
				throw new Error(errorMsg);
			}

			// Setup complete - show success toast
			showToast('Setup complete! Welcome to SveltyCMS! 🎉', 'success', 3000);

			// Clear store data
			clearStore();

			// Wait for toast to be visible, then redirect
			setTimeout(() => {
				window.location.href = data.redirectPath || '/config/collectionbuilder';
			}, 1500);
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred during finalization.';
			errorMessage = errorMsg;
			// Error toast already shown above in the if block, don't show duplicate
			// Only show toast here if it's a network error (not thrown by us)
			if (!errorMessage.includes('Failed to')) {
				showToast(errorMsg, 'error', 5000);
			}
		} finally {
			isLoading = false;
		}
	}

	// --- 7. UI HANDLERS ---
	let dbConfigComponent = $state<any>(null);

	async function nextStep() {
		if (!canProceed) return;

		// On database step, write private.ts and seed database
		if (wizard.currentStep === 0) {
			if (dbConfigComponent && typeof dbConfigComponent.installDatabaseDriver === 'function') {
				await dbConfigComponent.installDatabaseDriver(wizard.dbConfig.type);
			}

			// STEP 2: Write private.ts and seed database when user clicks "Next"
			// This happens while user is filling in system settings/admin form
			if (wizard.dbTestPassed) {
				try {
					isLoading = true;
					console.log('🎯 Writing config and seeding database...');

					const seedResponse = await fetch('/api/setup/seed', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(wizard.dbConfig)
					});

					const seedData = await seedResponse.json();
					if (seedData.success) {
						console.log('✅ Database initialized successfully');
						showToast('Database initialized successfully! ✨', 'success', 3000);

						// Store first collection info for faster redirect
						if (seedData.firstCollection) {
							wizard.firstCollection = seedData.firstCollection;
							console.log('📁 First collection:', seedData.firstCollection.name);
						}
					} else {
						console.warn('⚠️  Database initialization had issues:', seedData.error);
						showToast('Setup will continue, data will be created as needed.', 'info', 4000);
					}
				} catch (seedError) {
					console.warn('⚠️  Error during database initialization:', seedError);
					// Don't block user from continuing
				} finally {
					isLoading = false;
				}
			}
		}

		if (wizard.currentStep === 1 || wizard.currentStep === 2) {
			if (!validateStep(wizard.currentStep, true)) return;
		}

		if (wizard.currentStep < totalSteps - 1) {
			wizard.currentStep++;
			if (wizard.currentStep > wizard.highestStepReached) {
				wizard.highestStepReached = wizard.currentStep;
			}
		}

		errorMessage = '';
		lastDbTestResult = null;
		showDbDetails = false;
	}

	function prevStep() {
		if (wizard.currentStep > 0) {
			wizard.currentStep--;
			errorMessage = '';
		}
	}

	function skipEmailStep() {
		// Mark email as skipped
		wizard.emailSettings.smtpConfigured = false;
		wizard.emailSettings.skipWelcomeEmail = true;

		// Move to next step
		if (wizard.currentStep < totalSteps - 1) {
			wizard.currentStep++;
			if (wizard.currentStep > wizard.highestStepReached) {
				wizard.highestStepReached = wizard.currentStep;
			}
		}
	}

	function selectLanguage(lang: string) {
		systemLanguage.set(lang as typeof systemLanguage.value);
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

	// Component utility functions
	function toggleDbPassword() {
		showDbPassword = !showDbPassword;
	}

	function toggleAdminPassword() {
		showAdminPassword = !showAdminPassword;
	}

	function toggleConfirmPassword() {
		showConfirmPassword = !showConfirmPassword;
	}

	function clearDbTestError() {
		errorMessage = '';
		successMessage = '';
		lastDbTestResult = null;
		lastTestFingerprint = null;
		wizard.dbTestPassed = false;
		showDbDetails = false; // Always hide details when clearing

		// Clear field-specific validation errors
		const clearedErrors: ValidationErrors = {};
		for (const key in validationErrors) {
			if (!['host', 'port', 'name', 'user', 'password'].includes(key)) {
				clearedErrors[key] = validationErrors[key]; // Keep non-db validation errors
			}
		}
		validationErrors = clearedErrors;
	}

	function checkPasswordRequirements() {
		// Password requirements are already computed in derived state
	}

	// --- 9. LAZY COMPONENT STATE & ERROR HANDLING ---
	let DatabaseConfig: any = null;
	let AdminConfig: any = null;
	let SystemConfig: any = null;
	let EmailConfig: any = null;
	let ReviewConfig: any = null;
	let stepLoadError = $state('');
	let CurrentStepComponent = $state<any>(null);

	$effect(() => {
		stepLoadError = '';
		const loadStep = async (step: number) => {
			try {
				switch (step) {
					case 0:
						if (!DatabaseConfig) DatabaseConfig = (await import('./DatabaseConfig.svelte')).default;
						break;
					case 1:
						if (!AdminConfig) AdminConfig = (await import('./AdminConfig.svelte')).default;
						break;
					case 2:
						if (!SystemConfig) SystemConfig = (await import('./SystemConfig.svelte')).default;
						break;
					case 3:
						if (!EmailConfig) EmailConfig = (await import('./EmailConfig.svelte')).default;
						break;
					case 4:
						if (!ReviewConfig) ReviewConfig = (await import('./ReviewConfig.svelte')).default;
						break;
				}
			} catch (err) {
				stepLoadError = `Failed to load step component. Please reload or contact support. (${err instanceof Error ? err.message : String(err)})`;
			}
		};
		// Load current step
		loadStep(wizard.currentStep).then(() => {
			switch (wizard.currentStep) {
				case 0:
					CurrentStepComponent = DatabaseConfig;
					break;
				case 1:
					CurrentStepComponent = AdminConfig;
					break;
				case 2:
					CurrentStepComponent = SystemConfig;
					break;
				case 3:
					CurrentStepComponent = EmailConfig;
					break;
				case 4:
					CurrentStepComponent = ReviewConfig;
					break;
				default:
					CurrentStepComponent = null;
			}
		});
		// Prefetch next step in background
		if (wizard.currentStep < 4) {
			loadStep(wizard.currentStep + 1);
		}
	});
</script>

<svelte:head>
	<title>SveltyCMS Setup</title>
	{@html '<script>(' + setInitialClassState.toString() + ')();</script>'}
	<style>
		:global(.setup-page .toast-container) {
			position: fixed !important;
			bottom: 1.5rem !important;
			right: 1.5rem !important;
			left: auto !important;
			top: auto !important;
			transform: none !important;
			z-index: 99999 !important;
		}
		:global(.setup-page .toast) {
			transform: none !important;
			animation: none !important;
		}
	</style>
</svelte:head>

<div class="bg-surface-50-900 min-h-screen w-full transition-colors">
	<!-- Modal with component registry for this page -->
	<Modal components={modalComponentRegistry} />
	<ToastProvider />
	<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
		<!-- Header -->
		<div class="mb-4 flex-shrink-0 rounded-xl border border-surface-200 bg-white p-3 shadow-xl dark:border-white dark:bg-surface-800 sm:p-6 lg:mb-6">
			<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div class="flex flex-1 items-center gap-3 sm:gap-4">
					<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer">
						<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-12 w-auto" />
					</a>
					<h1 class="text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">
						<a
							href="https://github.com/SveltyCMS/SveltyCMS"
							target="_blank"
							rel="noopener noreferrer"
							class="transition-colors hover:text-primary-500"
						>
							<SiteName siteName={wizard.systemSettings.siteName} highlight="CMS" />
						</a>
					</h1>
				</div>

				<div class="flex flex-shrink-0 items-center gap-1 sm:gap-4">
					<div class="hidden rounded border border-indigo-100 bg-indigo-50 px-3 py-1.5 lg:flex">
						<div class="text-xs font-medium uppercase tracking-wider text-surface-500">{m.setup_heading_badge()}</div>
					</div>
					<div class="language-selector relative">
						{#if systemLanguages.length > 5}
							<button onclick={toggleLang} class="preset-tonal border border-surface-500 btn rounded px-2 py-1">
								<span class="hidden sm:inline">{getLanguageName(systemLanguage.value)}</span>
								<span class="font-mono text-xs font-bold">{systemLanguage.value.toUpperCase()}</span>
								<svg
									class="ml-1 h-3.5 w-3.5 transition-transform {isLangOpen ? 'rotate-180' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							{#if isLangOpen}
								<div
									class="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
								>
									<input bind:value={langSearch} placeholder={m.setup_search_placeholder()} class="input-sm input mb-2 w-full" />
									<div class="max-h-56 overflow-y-auto">
										{#each systemLanguages.filter((l) => getLanguageName(l).toLowerCase().includes(langSearch.toLowerCase())) as lang}
											<button
												onclick={() => selectLanguage(lang)}
												class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-200/60 dark:hover:bg-surface-600/60 {systemLanguage.value ===
												lang
													? 'bg-surface-200/80 font-medium dark:bg-surface-600/70'
													: ''}"
											>
												<span>{getLanguageName(lang)} {lang.toUpperCase()}</span>
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
							<select bind:value={systemLanguage.value} class="input" onchange={(e) => selectLanguage((e.target as HTMLSelectElement).value)}>
								{#each systemLanguages as lang}<option value={lang}>{getLanguageName(lang)} {lang.toUpperCase()}</option>{/each}
							</select>
						{/if}
					</div>
					<ThemeToggle showTooltip={true} tooltipPlacement="bottom" buttonClass="preset-tonal border border-surface-500 btn-icon" iconSize={22} />
				</div>

				<p class="w-full text-center text-sm sm:text-base">{m.setup_heading_subtitle()}</p>
			</div>
		</div>
		<!-- Version Check  -->
		<div class="mb-4 flex justify-center">
			<VersionCheck />
		</div>

		<!-- Main Content with Left Side Steps -->
		<div class="flex flex-col gap-4 lg:flex-row lg:gap-6">
			<!-- Step Indicator (Left Side) - Horizontal on mobile, vertical on desktop -->
			<div class="w-full shrink-0 lg:w-72">
				<div class="flex flex-col rounded-xl border border-surface-200 bg-white shadow-xl dark:border-white dark:bg-surface-800">
					<!-- Mobile: Horizontal step indicator -->
					<div class="relative flex items-start justify-between p-4 lg:hidden" role="list" aria-label="Setup progress">
						{#each steps as _step, i}
							<!-- Mobile step (button for backward navigation) -->
							<div class="relative z-10 flex flex-1 flex-col items-center" role="listitem">
								<button
									type="button"
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-10 sm:w-10 sm:text-sm {stepCompleted[
										i
									]
										? 'bg-primary-500 text-white'
										: i === wizard.currentStep
											? 'bg-error-500 text-white shadow-xl'
											: 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400'} {stepClickable[i] || i === wizard.currentStep
										? 'cursor-pointer'
										: 'cursor-not-allowed'}"
									aria-current={i === wizard.currentStep ? 'step' : undefined}
									aria-label={`${_step.label} – ${stepCompleted[i] ? 'Completed' : i === wizard.currentStep ? 'Current step' : 'Pending step'}`}
									disabled={!(stepClickable[i] || i === wizard.currentStep)}
									onclick={() => (stepClickable[i] || i === wizard.currentStep) && (wizard.currentStep = i)}
								>
									<span class="text-[0.65rem]">
										{stepCompleted[i] ? '✓' : i === wizard.currentStep ? '●' : '•'}
									</span>
								</button>
								<div class="mt-2 text-center">
									<div
										class="text-xs font-medium sm:text-sm {i <= wizard.currentStep
											? 'text-surface-900 dark:text-white'
											: 'text-surface-500 dark:text-surface-400'} max-w-16 truncate sm:max-w-20"
									>
										{_step.label.split(' ')[0]}
									</div>
								</div>
							</div>
						{/each}

						<!-- Connecting lines for mobile -->
						<div class="absolute left-12 right-12 top-8 flex h-0.5 sm:left-14 sm:right-14 sm:top-9" aria-hidden="true">
							{#each steps as _unused, i}{#if i !== steps.length - 1}<div
										class="mx-1 h-0.5 flex-1 {stepCompleted[i] ? 'bg-primary-500' : 'border-t-2 border-dashed border-slate-200 bg-transparent'}"
									></div>{/if}{/each}
						</div>
					</div>

					<!-- Desktop: Vertical step indicator -->
					<div class="hidden p-6 lg:block">
						{#each steps as _step, i}
							<div class="relative last:pb-0">
								<button
									class="flex w-full items-start gap-4 rounded-lg p-4 transition-all {stepClickable[i] || i === wizard.currentStep
										? 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
										: 'cursor-not-allowed opacity-50'}"
									disabled={!(stepClickable[i] || i === wizard.currentStep)}
									onclick={() => (stepClickable[i] || i === wizard.currentStep) && (wizard.currentStep = i)}
								>
									<div
										class="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white transition-all {stepCompleted[
											i
										]
											? 'bg-primary-500 text-white'
											: i === wizard.currentStep
												? 'bg-error-500 text-white shadow-xl'
												: 'bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600'}"
									>
										<span class="text-[0.65rem]">
											{stepCompleted[i] ? '✓' : i === wizard.currentStep ? '●' : '•'}
										</span>
									</div>
									<div class="text-left">
										<div
											class="text-base font-medium {i < wizard.currentStep
												? 'text-slate-800 dark:text-slate-200'
												: i === wizard.currentStep
													? 'text-slate-900 dark:text-white'
													: 'text-slate-400 dark:text-slate-600'}"
										>
											{_step.label}
										</div>
										<div
											class="mt-1 text-sm {i < wizard.currentStep
												? 'text-slate-500 dark:text-slate-400'
												: i === wizard.currentStep
													? 'text-slate-600 dark:text-slate-300'
													: 'text-slate-400 dark:text-slate-600'}"
										>
											{_step.shortDesc}
										</div>
									</div>
								</button>
								{#if i !== steps.length - 1}<div
										class="absolute left-[1.65rem] top-[3.5rem] h-[calc(100%-3.5rem)] w-[2px] {stepCompleted[i]
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
				<div class="flex flex-col rounded-xl border">
					<!-- Card Header with Step Title -->
					<div class="flex flex-shrink-0 justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
						<h2 class="flex items-center text-lg font-semibold tracking-tight sm:text-xl">
							{#if wizard.currentStep === 0}
								<iconify-icon icon="mdi:database" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_database()}
							{:else if wizard.currentStep === 1}
								<iconify-icon icon="mdi:account" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_admin()}
							{:else if wizard.currentStep === 2}
								<iconify-icon icon="mdi:cog" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_system()}
							{:else}
								<iconify-icon icon="mdi:check-circle" class="mr-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5" aria-hidden="true"></iconify-icon>
								{m.setup_step_complete()}
							{/if}
						</h2>
						<button
							onclick={() => {
								if (typeof window !== 'undefined' && !confirm('Clear all setup data?')) return;
								clearStore();
							}}
							type="button"
							class="preset-tonal border border-surface-500 btn btn-sm rounded text-xs"
							aria-label="Reset data"
							title="Reset data"
						>
							<iconify-icon icon="mdi:backup-restore" class="mr-1 h-4 w-4" aria-hidden="true"></iconify-icon>
							Reset Data
						</button>
					</div>

					<!-- Card Content -->
					<div class="p-4 sm:p-6 lg:p-8">
						{#if stepLoadError}
							<div class="mb-4 rounded bg-red-100 p-4 text-red-700">{stepLoadError}</div>
						{:else if CurrentStepComponent}
							<CurrentStepComponent
								bind:dbConfig={wizard.dbConfig}
								{validationErrors}
								{isLoading}
								bind:showDbPassword
								{toggleDbPassword}
								{testDatabaseConnection}
								{dbConfigChangedSinceTest}
								{clearDbTestError}
								bind:this={dbConfigComponent}
								bind:adminUser={wizard.adminUser}
								{passwordRequirements}
								bind:showAdminPassword
								bind:showConfirmPassword
								{toggleAdminPassword}
								{toggleConfirmPassword}
								{checkPasswordRequirements}
								systemSettings={wizard.systemSettings}
								availableLanguages={systemLanguages}
								{completeSetup}
								onNext={nextStep}
								onBack={prevStep}
								onSkip={skipEmailStep}
							/>
						{:else}
							<div class="animate-pulse">Loading step...</div>
						{/if}

						<!-- Status Messages -->
						{#if (successMessage || errorMessage) && lastDbTestResult}
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
									<div class="flex-1 pr-4">
										{successMessage || errorMessage}
									</div>
									<button type="button" class="btn-sm ml-auto mt-0.5 flex items-center gap-1" onclick={() => (showDbDetails = !showDbDetails)}>
										<iconify-icon icon={showDbDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="h-4 w-4"></iconify-icon>
										<span class="hidden sm:inline">{showDbDetails ? m.setup_db_test_details_hide() : m.setup_db_test_details_show()}</span>
									</button>
									<!-- Dismiss status message -->
									<button
										type="button"
										class="btn-icon btn-sm ml-1 mt-0.5 h-6 w-6 shrink-0 rounded hover:bg-surface-200/60 dark:hover:bg-surface-600/60"
										aria-label="Close message"
										onclick={() => {
											successMessage = '';
											errorMessage = '';
											showDbDetails = false;
										}}
									>
										<iconify-icon icon="mdi:close" class="h-4 w-4"></iconify-icon>
									</button>
								</div>
								{#if showDbDetails}
									<div class="border-t border-surface-200 bg-surface-50 text-xs dark:border-surface-600 dark:bg-surface-700">
										<div class="grid grid-cols-2 gap-x-4 gap-y-2 p-3 sm:grid-cols-6">
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.setup_db_test_latency()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{lastDbTestResult.latencyMs ?? '—'} ms</span>
											</div>
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.setup_db_test_engine()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{wizard.dbConfig.type}</span>
											</div>
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.label_host()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{wizard.dbConfig.host}</span>
											</div>
											{#if !isFullUri}
												<div class="sm:col-span-1">
													<span class="font-semibold">{m.label_port()}:</span>
													<span class="text-terrary-500 dark:text-primary-500">{wizard.dbConfig.port}</span>
												</div>
											{/if}
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.label_database()}:</span>
												<span class="text-terrary-500 dark:text-primary-500">{wizard.dbConfig.name}</span>
											</div>
											{#if wizard.dbConfig.user}
												<div class="sm:col-span-1">
													<span class="font-semibold">{m.label_user?.() || m.setup_db_test_user()}:</span>
													<span class="text-terrary-500 dark:text-primary-500">{wizard.dbConfig.user}</span>
												</div>
											{/if}
											{#if lastDbTestResult.classification}
												<div class="sm:col-span-2">
													<span class="font-semibold">Code:</span>
													<span class="text-terrary-500 dark:text-primary-500">{lastDbTestResult.classification}</span>
												</div>
											{/if}
										</div>
										{#if !lastDbTestResult.success}
											<div class="border-t border-surface-200 p-3 dark:border-surface-600">
												{#if lastDbTestResult.userFriendly}
													<div class="mb-2 font-semibold text-error-600">Error:</div>
													<div class="mb-3 rounded bg-red-50 p-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-white">
														{lastDbTestResult.userFriendly}
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
					<!-- Navigation -->
					<div class="flex flex-shrink-0 items-center justify-between border-t border-slate-200 px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6">
						<!-- Previous Button -->
						<div class="flex-1">
							{#if wizard.currentStep > 0}
								<button onclick={prevStep} class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500">
									<iconify-icon icon="mdi:arrow-left-bold" class="mr-1 h-4 w-4" aria-hidden="true"></iconify-icon>
									{m.button_previous()}
								</button>
							{/if}
						</div>

						<!-- Step Indicator -->
						<div class="flex-shrink-0 text-center text-sm font-medium">
							{m.setup_progress_step_of({ current: String(wizard.currentStep + 1), total: String(totalSteps) })}
						</div>

						<!-- Next/Complete Button -->
						<div class="flex flex-1 justify-end">
							{#if wizard.currentStep < steps.length - 1}
								<button
									onclick={nextStep}
									disabled={!canProceed}
									aria-disabled={!canProceed}
									class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {canProceed ? '' : 'cursor-not-allowed opacity-60'}"
								>
									{m.button_next()}
									<iconify-icon icon="mdi:arrow-right-bold" class="ml-1 h-4 w-4" aria-hidden="true"></iconify-icon>
								</button>
							{:else if wizard.currentStep === steps.length - 1}
								<button
									onclick={completeSetup}
									disabled={isLoading}
									aria-disabled={isLoading}
									class="preset-filled-tertiary-500 btn transition-all dark:preset-filled-primary-500 {isLoading ? 'cursor-not-allowed opacity-60' : ''}"
								>
									{isLoading ? 'Completing...' : m.button_complete?.() || 'Complete'}
									<iconify-icon icon="mdi:check-bold" class="ml-1 h-4 w-4" aria-hidden="true"></iconify-icon>
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!--
@file src/routes/setup/+page.svelte
@component
**Professional multi-step setup wizard for SveltyCMS**
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	// Stores

	// Native UI Components v4
	// NOTE: <DialogManager /> is mounted once in the ROOT layout (src/routes/+layout.svelte).
	// It renders from the shared global `modalState`, so mounting a second instance here made
	// every setup-wizard modal render twice, pixel-aligned — the top copy swallowed the click
	// and the lower copy was inert. Do not re-add it. See dialog-manager.svelte for the guard.
	// ParaglideJS
	import {
		label_database,
		label_host,
		label_port,
		label_user,
		setup_db_test_details_hide,
		setup_db_test_details_show,
		setup_db_test_engine,
		setup_db_test_latency,
		setup_db_test_user,
		setup_legend_completed,
		setup_legend_current,
		setup_legend_pending,
		setup_step_admin,
		setup_step_admin_desc,
		setup_step_complete,
		setup_step_complete_desc,
		setup_step_database,
		setup_step_database_desc,
		setup_step_email,
		setup_step_email_desc,
		setup_step_system,
		setup_step_system_desc
	} from '@src/paraglide/messages';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { setupStore } from '@src/stores/setup-store.svelte.ts';
	import { app } from '@src/stores/store.svelte';
	// Utils
	import { getLanguageName } from '@utils/language-utils';
	import { modalState } from '@utils/modal.svelte';
	// Utils
	import { showConfirm } from '@utils/modal.svelte';
	import { adminPage } from '@utils/admin-transitions';
	// Using iconify-icon web component
	import { onMount, tick } from 'svelte';
	import AdminConfig from './admin-config.svelte';
	import DatabaseConfig from './database-config.svelte';
	import EmailConfig from './email-config.svelte';
	import ReviewConfig from './review-config.svelte';
	import SetupCardHeader from './setup-card-header.svelte';
	import SetupHeader from './setup-header.svelte';
	import SetupNavigation from './setup-navigation.svelte';
	import SystemConfig from './system-config.svelte';
	// Step Content Components
	import WelcomeModal from './welcome-modal.svelte';
	import Stepper from '@components/ui/stepper.svelte';
	import VersionCheck from '@src/components/version-check.svelte';
	import { logger } from '@src/utils/logger.ts';

	// --- 1. STATE MANAGEMENT (Wired to Store) ---
	let { data: _data } = $props();
	// Stores
	const wizard = setupStore.wizard;
	const { load: loadStore, clear: clearStore, setupPersistence: setupPersistenceFn, validateStep, completeSetup } = setupStore;

	// --- 1. COMPONENT IMPORTS ---
	let showDbPassword = $state(false);
	let initialDataSnapshot = $state('');
	let currentLanguageTag = $state(getLocale());

	// Asynchronously probe local Redis only when reaching Step 2 (System Config).
	// Guard: use highestStepReached >= 1 (not dbTestPassed) because clearDbTestError() resets
	// dbTestPassed on every Next click — it's always false by the time we reach step 2.
	// highestStepReached >= 1 means the user legitimately advanced past step 0 (DB accepted).
	$effect(() => {
		if (wizard.currentStep === 2 && wizard.highestStepReached >= 1 && !wizard.redisAvailable) {
			setupStore.probeRedis();
		}
	});

	// --- 4. LIFECYCLE HOOKS ---
	onMount(() => {
		// --- Fresh Start Logic ---
		// We clear the store on first entry to the setup wizard in a new session
		// to ensure a clean slate, but allow data persistence across refreshes.
		const isSetupActive = sessionStorage.getItem('sveltycms_setup_active');
		if (!isSetupActive) {
			logger.info('[Setup] Fresh start detected. Clearing previous data.');
			clearStore();
			sessionStorage.setItem('sveltycms_setup_active', 'true');
		} else {
			logger.info('[Setup] Existing session detected. Loading saved data.');
			loadStore();
		}

		initialDataSnapshot = JSON.stringify(wizard);
		setupPersistenceFn();

		const welcomeShown = sessionStorage.getItem('sveltycms_welcome_modal_shown');
		if (!welcomeShown) {
			requestAnimationFrame(() => {
				setTimeout(() => {
					showWelcomeModal();
					sessionStorage.setItem('sveltycms_welcome_modal_shown', 'true');
				}, 100);
			});
		}

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges() && !wizard.isSubmitting) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		// Clean up the URL if it has the "from" parameter
		if (window.location.search.includes('from=')) {
			const url = new URL(window.location.href);
			url.searchParams.delete('from');
			window.history.replaceState({}, '', url.pathname);
		}

		// ✨ SMART SETUP TRANSITION
		// Listen for the custom HMR event from Vite when setup is complete
		if (import.meta.hot) {
			import.meta.hot.on('svelty:setup-complete', (data) => {
				logger.info('[Setup] HMR Signal: Setup Complete!', data);
				wizard.isSubmitting = true; // Show loading state
				wizard.successMessage = 'System Initialized! Transitioning to CMS...';

				// Force a smooth transition after a short delay to let the server stabilize
				setTimeout(() => {
					window.location.href = '/';
				}, 1500);
			});
		}

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	function showWelcomeModal() {
		modalState.trigger(WelcomeModal);
	}

	// --- 5. DERIVED STATE (Page-Specific) ---
	const hasUnsavedChanges = $derived(() => {
		if (!initialDataSnapshot) {
			return false;
		}
		return JSON.stringify(wizard) !== initialDataSnapshot;
	});
	const systemLanguages = $derived.by(() => {
		return [...availableLocales].sort((a: string, b: string) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')));
	});
	const isFullUri = $derived(() => {
		return wizard.dbConfig.host.includes('mongodb://') || wizard.dbConfig.host.includes('mongodb+srv://');
	});

	// STEPPER CONFIG
	const steps = $derived([
		{ label: setup_step_database(), shortDesc: setup_step_database_desc() },
		{ label: setup_step_admin(), shortDesc: setup_step_admin_desc() },
		{ label: setup_step_system(), shortDesc: setup_step_system_desc() },
		{ label: setup_step_email(), shortDesc: setup_step_email_desc() },
		{ label: setup_step_complete(), shortDesc: setup_step_complete_desc() }
	]);
	const totalSteps = $derived(steps.length);
	const legendItems = [
		{ key: 'completed', label: setup_legend_completed(), content: '✓' },
		{ key: 'current', label: setup_legend_current(), content: '●' },
		{ key: 'pending', label: setup_legend_pending(), content: '•' }
	];

	// --- 6. CORE LOGIC & API CALLS (Now delegated to store) ---
	let dbConfigComponent: {
		installDatabaseDriver: (type: string) => Promise<void>;
	} | null = $state(null);

	async function focusStepContent() {
		await tick();
		const stepContent = document.getElementById('step-content');
		if (stepContent) {
			// preventScroll: step transitions must not trigger a smooth-scroll
			// chase (async Redis detection / expandable CDN settings can change
			// the step height right after focus → visible layout reflow).
			stepContent.focus({ preventScroll: true });
		}
	}

	async function selectSetupStep(index: number) {
		if (setupStore.stepClickable[index] || index === wizard.currentStep) {
			wizard.currentStep = index;
			await focusStepContent();
		}
	}

	async function nextStep() {
		if (!setupStore.canProceed) {
			if (wizard.currentStep === 2 && wizard.systemSettings.useRedis && !setupStore.wizard.redisTestPassed) {
				import('@src/stores/toast.svelte.ts').then(({ toast }) => {
					toast.error('Please test your Redis connection before proceeding.');
				});
			}
			return;
		}
		if (wizard.currentStep === 0) {
			if (dbConfigComponent && typeof dbConfigComponent.installDatabaseDriver === 'function') {
				await dbConfigComponent.installDatabaseDriver(wizard.dbConfig.type);
			}
			// Seeding is now triggered automatically by the store when the test passes.
			// If it's already in progress or done, we just move to the next step.
		}
		if ((wizard.currentStep === 1 || wizard.currentStep === 2) && !validateStep(wizard.currentStep, true)) {
			return;
		}
		if (wizard.currentStep < totalSteps - 1) {
			wizard.currentStep++;
			if (wizard.currentStep > wizard.highestStepReached) {
				wizard.highestStepReached = wizard.currentStep;
			}
			await focusStepContent();
		}
		setupStore.clearDbTestError();
	}

	async function prevStep() {
		if (wizard.currentStep > 0) {
			wizard.currentStep--;
			wizard.errorMessage = '';
			await focusStepContent();
		}
	}

	async function handleCompleteSetup() {
		logger.info('[SetupPage] 🏁 handleCompleteSetup triggered');
		try {
			const success = await completeSetup((redirectPath: string) => {
				logger.info('[SetupPage] ✅ Setup successful, redirecting to:', redirectPath);
				initialDataSnapshot = JSON.stringify(wizard);
				window.location.href = redirectPath;
			});
			logger.info('[SetupPage] completeSetup result:', success);
			if (success) {
				initialDataSnapshot = JSON.stringify(wizard);
			}
		} catch (err) {
			logger.error('[SetupPage] ❌ handleCompleteSetup failed:', err);
		}
	}

	// --- 7. UI HANDLERS ---
	function selectLanguage(lang: string) {
		app.systemLanguage = lang as import('@src/paraglide/runtime').Locale;
		currentLanguageTag = lang as typeof currentLanguageTag;
	}
</script>

<svelte:head><title>SveltyCMS Setup</title></svelte:head>

<div class="flex h-dvh min-h-0 flex-col overflow-hidden bg-(--admin-bg-page) transition-colors">
	<!-- Top Navigation Bar -->
	<header class="z-30 shrink-0 border-b border-(--admin-border-default) bg-(--admin-bg-card)">
		<div class="px-4 py-0">
			<SetupHeader
				siteName={wizard.systemSettings.siteName}
				{systemLanguages}
				{currentLanguageTag}
				onselectLanguage={selectLanguage}
			/>
		</div>
	</header>

	<div class="flex min-h-0 flex-1 overflow-hidden">
		<!-- Left Sidebar: shared Stepper + legend (desktop) -->
		<aside class="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-e border-(--admin-border-default) bg-(--admin-bg-sidebar) lg:flex xl:w-72">
			<div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4">
				<div class="min-h-0 flex-1 overflow-x-hidden pe-1">
					<Stepper
						{steps}
						currentStep={wizard.currentStep}
						completedSteps={setupStore.stepCompleted}
						stepClickable={setupStore.stepClickable}
						orientation="vertical"
						variant="setup"
						onStepClick={selectSetupStep}
					/>
				</div>
				<div class="mt-auto shrink-0 border-t border-surface-500/30 pt-6 dark:border-surface-500/40">
					<h4 class="mb-4 w-full text-center text-sm font-semibold tracking-tight text-slate-700 dark:text-slate-200">
						Legend
					</h4>
					<div class="flex items-end justify-between gap-4">
						<ul class="space-y-2 text-xs">
							{#each legendItems as item (item.key)}
								<li class="grid grid-cols-[1.4rem_auto] items-center gap-x-3">
									<div
										class="flex h-5 w-5 items-center justify-center rounded-full font-semibold leading-none
										{item.key === 'completed'
											? ' bg-tertiary-500 dark:bg-primary-500 text-white'
											: item.key === 'current'
												? 'bg-error-500 text-white shadow-sm'
												: 'bg-slate-200 text-slate-600 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600'}"
									>
										<span class="text-[0.65rem]">{item.content}</span>
									</div>
									<span class="text-slate-600 dark:text-slate-400">{item.label}</span>
								</li>
							{/each}
						</ul>
						<div class="flex shrink-0 items-center"><VersionCheck /></div>
					</div>
				</div>
			</div>
		</aside>

		<!-- Main: absolute footer so Redis / multi-tenant expand cannot reflow navigation -->
		<main class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-500/10 dark:bg-surface-800">
			<!-- Mobile Stepper (shared UI Stepper) -->
			<div class="z-10 shrink-0 border-b border-(--admin-border-default) bg-(--admin-bg-card) p-4 lg:hidden">
				<Stepper
					{steps}
					currentStep={wizard.currentStep}
					completedSteps={setupStore.stepCompleted}
					stepClickable={setupStore.stepClickable}
					orientation="horizontal"
					variant="setup"
					mobileTruncate={true}
					onStepClick={selectSetupStep}
				/>
			</div>

			<!-- Scrollable step content; pb reserves space for absolute footer (nav row + optional seeding bar) -->
			<div
				class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth p-2 pb-32 [overflow-anchor:none] [scroll-padding-bottom:8rem]"
				id="step-content"
				tabindex="-1"
			>
				<div class="mx-auto max-w-8xl">
					<div class="mb-4">
						<SetupCardHeader
							currentStep={wizard.currentStep}
							{steps}
							onreset={() => {
								showConfirm({
									title: 'Reset Setup Data',
									body: 'Are you sure you want to clear all setup data? This cannot be undone.',
									onConfirm: () => clearStore()
								});
							}}
						/>
					</div>

				{#key wizard.currentStep}
					<div
						class="rounded-xl border border-(--admin-border-default) bg-(--admin-bg-card) p-6 shadow-sm"
						in:adminPage={{ duration: 200, rise: 6 }}
					>
						{#if wizard.currentStep === 0}
							<DatabaseConfig
								bind:dbConfig={wizard.dbConfig}
								validationErrors={wizard.validationErrors}
								isLoading={wizard.isLoading}
								bind:showDbPassword
								toggleDbPassword={() => (showDbPassword = !showDbPassword)}
								testDatabaseConnection={setupStore.testDatabaseConnection}
								dbConfigChangedSinceTest={setupStore.dbConfigChangedSinceTest}
								clearDbTestError={() => {
									wizard.lastDbTestResult = null;
									wizard.errorMessage = '';
								}}
								bind:this={dbConfigComponent}
							/>
						{:else if wizard.currentStep === 1}
							<AdminConfig
								bind:adminUser={wizard.adminUser}
								validationErrors={wizard.validationErrors}
								passwordRequirements={setupStore.passwordRequirements}
								checkPasswordRequirements={() => {
									/* now handled by derived rune */
								}}
								onnext={nextStep}
							/>
						{:else if wizard.currentStep === 2}
							<SystemConfig
								bind:systemSettings={wizard.systemSettings}
								redisAvailable={wizard.redisAvailable}
								validationErrors={wizard.validationErrors}
							/>
						{:else if wizard.currentStep === 3}
							<EmailConfig />
						{:else if wizard.currentStep === 4}
							<ReviewConfig
								dbConfig={wizard.dbConfig}
								adminUser={wizard.adminUser}
								systemSettings={wizard.systemSettings}
								emailSettings={wizard.emailSettings}
							/>
						{/if}

						{#if (wizard.successMessage || wizard.errorMessage) && wizard.lastDbTestResult && !setupStore.dbConfigChangedSinceTest}
							<div
								class="mt-6 flex flex-col rounded border-s-4 p-0 text-sm overflow-hidden"
								class:border-primary-500={!!wizard.successMessage}
								class:border-error-500={!!wizard.errorMessage}
								aria-live="polite"
								aria-atomic="true"
							>
								<div
									class="flex items-center gap-2 px-4 py-3 {wizard.successMessage ? 'bg-primary-500/10' : ''} {wizard.errorMessage ? 'bg-error-500/10' : ''}"
									class:text-success-600={!!wizard.successMessage}
									class:text-error-600={!!wizard.errorMessage}
								>
									<svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										{#if wizard.successMessage}
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										{:else}
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										{/if}
									</svg>
									<div class="flex-1">
										{#if wizard.errorMessage}
											<span class="font-bold">Connection Failed</span>{#if wizard.showDbDetails}: <span class="font-normal">{wizard.errorMessage}</span>{/if}
										{:else}
											{wizard.successMessage}
										{/if}
									</div>
									<div class="flex gap-2">
										<Button variant="outline"
											type="button"
											onclick={() => (wizard.showDbDetails = !wizard.showDbDetails)}
										 size="sm" class="flex items-center gap-1">
											<iconify-icon icon={wizard.showDbDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="h-4 w-4"></iconify-icon>
											<span class="hidden sm:inline">{wizard.showDbDetails ? setup_db_test_details_hide() : setup_db_test_details_show()}</span>
										</Button>
										<Button variant="ghost"
											type="button"
											aria-label="Close message"
											onclick={setupStore.clearDbTestError}
											rounded
										 size="sm" class="p-0! min-w-0 h-7 w-7 hover:bg-black/5 dark:hover:bg-white/5">
											<iconify-icon icon="mdi:close" class="h-4 w-4"></iconify-icon>
										</Button>
									</div>
								</div>
								{#if wizard.showDbDetails && wizard.lastDbTestResult}
									<div class="border-t border-surface-500/30 bg-secondary-500/50 text-xs dark:border-surface-500/40 dark:bg-surface-900/50">
										<div class="grid grid-cols-2 gap-x-4 gap-y-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
											<div class="flex flex-col">
												<span class="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">{setup_db_test_latency()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-bold">{wizard.lastDbTestResult.latencyMs ?? '—'} ms</span>
											</div>
											<div class="flex flex-col">
												<span class="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">{setup_db_test_engine()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-bold">{wizard.dbConfig.type}</span>
											</div>
											<div class="flex flex-col">
												<span class="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">{label_host()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-bold truncate" title={wizard.dbConfig.host}>{wizard.dbConfig.host}</span>
											</div>
											{#if !isFullUri}
												<div class="flex flex-col">
													<span class="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">{label_port()}:</span>
													<span class="text-tertiary-500 dark:text-primary-500 font-bold">{wizard.dbConfig.port}</span>
												</div>
											{/if}
											<div class="flex flex-col">
												<span class="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">{label_database()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-bold truncate" title={wizard.dbConfig.name}>{wizard.dbConfig.name}</span>
											</div>
											{#if wizard.dbConfig.user}
												<div class="flex flex-col">
													<span class="font-semibold text-slate-500 uppercase text-[10px] tracking-wider">{label_user?.() || setup_db_test_user()}:</span>
													<span class="text-tertiary-500 dark:text-primary-500 font-bold truncate" title={wizard.dbConfig.user}>{wizard.dbConfig.user}</span>
												</div>
											{/if}
										</div>
										{#if !wizard.lastDbTestResult.success && wizard.lastDbTestResult.hint}
											<div class="border-t border-surface-500/30 p-4 dark:border-surface-500/40 bg-warning-500/30 dark:bg-warning-900/10">
												<div class="flex items-center gap-2 font-bold text-warning-600 dark:text-warning-400 mb-2">
													<iconify-icon icon="mdi:lightbulb-outline" class="text-lg"></iconify-icon>
													<span class="uppercase tracking-widest text-[10px]">Troubleshooting Suggestions</span>
												</div>
												<div class="space-y-2">
													{#each wizard.lastDbTestResult.hint.split('\n') as step (step)}
														<div class="flex gap-2 text-slate-700 dark:text-slate-300">
															<span class="shrink-0 text-warning-500">•</span>
															<span>{step.replace(/^\d+\.\s*/, '')}</span>
														</div>
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
						</div>
					{/key}
					</div>
				</div>

				<!-- Fixed Navigation Footer — absolute so expand/collapse (Redis, multi-tenant) cannot shift it -->
			<footer
				class="absolute inset-x-0 bottom-0 z-20 border-t border-(--admin-border-default)/50 bg-(--admin-bg-card) shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
			>
				<div class="mx-auto max-w-6xl">
					<SetupNavigation
						currentStep={wizard.currentStep}
						{totalSteps}
						canProceed={setupStore.canProceed}
						isLoading={wizard.isLoading || wizard.isSubmitting}
						isSeeding={wizard.isSeeding}
						seedingProgress={wizard.seedingProgress}
						onprev={prevStep}
						onnext={nextStep}
						oncomplete={handleCompleteSetup}
					/>
				</div>
			</footer>
		</main>
	</div>
</div>

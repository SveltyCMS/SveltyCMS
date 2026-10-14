<!--
@file src/routes/setup/+page.svelte
@component
**Professional multi-step setup wizard for SveltyCMS**
-->
<script lang="ts">
	// Stores

	// Native UI Components v4
	// NOTE: <DialogManager /> is mounted once in the ROOT layout (src/routes/+layout.svelte).
	// It renders from the shared global `modalState`, so mounting a second instance here made
	// every setup-wizard modal render twice, pixel-aligned — the top copy swallowed the click
	// and the lower copy was inert. Do not re-add it. See dialog-manager.svelte for the guard.
	// ParaglideJS
	import {
		setup_legend,
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
		setup_step_project,
		setup_step_project_desc,
		setup_step_system,
		setup_step_system_desc
	} from '@src/paraglide/messages';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { systemLanguage } from '@src/stores/locale-store.svelte';
	import {
		applySystemLanguage,
		isCompiledSystemLocale,
		mergeSystemLanguages
	} from '@utils/system-locale';
	import { setupStore } from '@src/stores/setup-store.svelte.ts';
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
	import ProjectConfig from './project-config.svelte';
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
	import { dbConfigForHint, isPresetId } from './market';
	import { readSetupHints } from './setup.remote';

	// --- 1. STATE MANAGEMENT (Wired to Store) ---
	let { data: _data } = $props();
	// Stores
	const wizard = setupStore.wizard;
	const {
		load: loadStore,
		clear: clearStore,
		setupPersistence: setupPersistenceFn,
		validateStep,
		completeSetup
	} = setupStore;

	// --- 1. COMPONENT IMPORTS ---
	let showDbPassword = $state(false);
	let initialDataSnapshot = $state('');
	let currentLanguageTag = $state(getLocale());

	// Asynchronously probe local Redis only when reaching Step 2 (System Config).
	// Guard: use highestStepReached >= 1 (not dbTestPassed) because clearDbTestError() resets
	// dbTestPassed on every Next click — it's always false by the time we reach step 2.
	// highestStepReached >= 1 means the user legitimately advanced past step 0 (DB accepted).
	$effect(() => {
		if (wizard.currentStep === 0 && !wizard.redisAvailable) {
			setupStore.probeRedis();
		}
	});

	// --- 4. LIFECYCLE HOOKS ---
	// Svelte 5 requires onMount cleanup to be returned synchronously, so the async
	// setup work runs in an IIFE and the listener detach is registered up front.
	onMount(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges() && !wizard.isSubmitting) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		void (async () => {
			// --- Fresh Start Logic ---
			// We clear the store on first entry to the setup wizard in a new session
			// to ensure a clean slate, but allow data persistence across refreshes.
			const isSetupActive = sessionStorage.getItem('sveltycms_setup_active');
			if (!isSetupActive) {
				logger.info('[Setup] Fresh start detected. Clearing previous data.');
				clearStore();
				sessionStorage.setItem('sveltycms_setup_active', 'true');
				await applyScaffoldHints();
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
		})();

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	async function applyScaffoldHints() {
		try {
			const hints = await readSetupHints({});
			if (isPresetId(hints.template)) {
				wizard.systemSettings.preset = hints.template;
			}
			const db = dbConfigForHint(hints.db);
			if (db) {
				wizard.dbConfig.type = db.type;
				wizard.dbConfig.host = db.host;
				wizard.dbConfig.port = db.port;
				wizard.dbConfig.name = db.name;
			}
		} catch (err) {
			logger.debug('[Setup] Scaffold hints were not applied', err);
		}
	}

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
		return mergeSystemLanguages(wizard.systemSettings.systemLanguages, availableLocales).sort(
			(a: string, b: string) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))
		);
	});

	// STEPPER CONFIG
	const steps = $derived([
		{ label: setup_step_database(), shortDesc: setup_step_database_desc() },
		{ label: setup_step_admin(), shortDesc: setup_step_admin_desc() },
		{ label: setup_step_project(), shortDesc: setup_step_project_desc() },
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
			if (
				wizard.currentStep === 0 &&
				wizard.systemSettings.useRedis &&
				!setupStore.wizard.redisTestPassed
			) {
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
		if (
			(wizard.currentStep === 1 || wizard.currentStep === 3) &&
			!validateStep(wizard.currentStep, true)
		) {
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
		// Both the locale store and the header tag are typed to the compiled paraglide
		// locales, so only adopt a tag that exists there; the document-level application
		// still runs for any tag (`applySystemLanguage` falls back to "en" itself).
		if (isCompiledSystemLocale(lang)) {
			systemLanguage.set(lang);
			currentLanguageTag = lang;
		}
		applySystemLanguage(lang);
	}
</script>

<svelte:head><title>SveltyCMS Setup</title></svelte:head>

<div class="flex h-dvh min-h-0 flex-col overflow-clip bg-(--admin-bg-page) transition-colors">
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

	<div class="flex min-h-0 flex-1 overflow-clip">
		<!-- Left Sidebar: shared Stepper + legend (desktop) -->
		<aside
			class="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-e border-(--admin-border-default) bg-(--admin-bg-card) lg:flex xl:w-72"
		>
			<div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden py-2">
				<div
					class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-color:color-mix(in_srgb,var(--admin-text-muted)_45%,transparent)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--admin-border-default)"
				>
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
				<div class="shrink-0 border-t border-(--admin-border-default) pt-3 p-4">
					<h4 class="mb-4 w-full text-center text-sm font-semibold">
						{setup_legend()}
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
												: 'bg-(--admin-border-subtle) text-(--admin-text-muted) ring-1 ring-(--admin-border-default)'}"
									>
										<span class="text-[0.65rem]">{item.content}</span>
									</div>
									<span class="text-(--admin-text-muted)">{item.label}</span>
								</li>
							{/each}
						</ul>
						<div class="flex shrink-0 items-center"><VersionCheck /></div>
					</div>
				</div>
			</div>
		</aside>

		<!-- Main: in-flow footer (shrink-0) below the single scroll container —
			 Redis / multi-tenant expand scrolls inside step-content and cannot reflow
			 the navigation. overflow-clip (not hidden) so browser focus-scrolling
			 can never drag the footer. -->
		<main class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-clip bg-(--admin-bg-page)">
			<!-- Mobile Stepper (shared UI Stepper) -->
			<div
				class="z-10 shrink-0 border-b border-(--admin-border-default) bg-(--admin-bg-card) p-4 lg:hidden"
			>
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

			<!-- Scrollable step content; the footer is a normal flex sibling below,
				 so content growth (Redis / demo-mode expand) scrolls here internally
				 and can never shift or cover the navigation -->
			<div
				class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth p-2 pb-6 [overflow-anchor:none]"
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
							class="rounded border border-(--admin-border-default) bg-(--admin-bg-card) p-6 shadow-sm"
							in:adminPage={{ duration: 200, rise: 6 }}
						>
							{#if wizard.currentStep === 0}
								<DatabaseConfig
									bind:dbConfig={wizard.dbConfig}
									bind:systemSettings={wizard.systemSettings}
									redisAvailable={wizard.redisAvailable}
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
								<ProjectConfig bind:systemSettings={wizard.systemSettings} />
							{:else if wizard.currentStep === 3}
								<SystemConfig
									bind:systemSettings={wizard.systemSettings}
									validationErrors={wizard.validationErrors}
								/>
							{:else if wizard.currentStep === 4}
								<EmailConfig />
							{:else if wizard.currentStep === 5}
								<ReviewConfig
									dbConfig={wizard.dbConfig}
									adminUser={wizard.adminUser}
									systemSettings={wizard.systemSettings}
									emailSettings={wizard.emailSettings}
								/>
							{/if}
						</div>
					{/key}
				</div>
			</div>

			<!-- Navigation Footer — in-flow flex child (shrink-0). The step content
					 above is the only scroll container, so expand/collapse (Redis,
					 multi-tenant) can never reflow or reposition the navigation.
					 An absolute footer here was dragged by <main>'s focus-scroll
					 (overflow:hidden still scrolls programmatically) — that was the
					 “navigation jumps in height” bug. -->
			<footer
				class="z-20 shrink-0 border-t border-(--admin-border-default)/50 bg-(--admin-bg-card) shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
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

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
		setup_other_tab_body,
		setup_other_tab_takeover,
		setup_other_tab_title,
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
	import { addCollection } from 'iconify-icon';
	import { registerOfflineIcons } from '@components/system/icons/offline-icons';
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
	import Stepper, { STEPPER_SETUP_CURRENT_MARKER } from '@components/ui/stepper.svelte';
	import Button from '@components/ui/button.svelte';
	import type { PageData } from './$types';
	import VersionCheck from '@src/components/version-check.svelte';
	import { logger } from '@src/utils/logger.ts';
	import { dbConfigForHint, isPresetId } from '@src/services/setup/market';
	import { readSetupHints } from './setup.remote';

	// The wizard renders before any admin data exists, so its own icons are bundled
	// instead of fetched from api.iconify.design (SV-031). Registered here rather
	// than in the root layout so the ~20 KB icon set stays out of the entry chunk
	// (the root-layout budget is 25 KB). Names outside this set still resolve
	// through the default provider.
	if (typeof window !== 'undefined') registerOfflineIcons(addCollection);

	// --- 1. STATE MANAGEMENT (Wired to Store) ---
	// `origin` comes from the server load; the intersection keeps editors happy
	// even before `svelte-kit sync` regenerates PageData.
	let { data }: { data: PageData & { origin?: string } } = $props();
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
	// --- Cross-tab wizard ownership (SV-032) ---
	// The wizard state lives in localStorage, so a per-tab `sessionStorage` flag cannot
	// tell "a second tab" from "a brand-new session": a second tab looked fresh and
	// cleared the state the first tab was still editing. A localStorage heartbeat names
	// the tab that actually drives the wizard; a beat older than the stale window means
	// no live tab owns it.
	const WIZARD_LOCK_KEY = 'sveltycms_setup_heartbeat';
	const WIZARD_LOCK_STALE_MS = 30_000;
	const WIZARD_LOCK_BEAT_MS = 10_000;
	/** Prefix of the persisted wizard keys (see src/stores/setup-store.svelte.ts). */
	const WIZARD_STORAGE_PREFIX = 'setupWizard:';

	/** CSPRNG tab identity — assigned in `onMount`, never rendered. */
	let wizardTabId = '';
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let lockWatchTimer: ReturnType<typeof setInterval> | undefined;
	let otherTabOwnsWizard = $state(false);

	function readWizardLock(): { tabId: string; ts: number } | null {
		try {
			const raw = localStorage.getItem(WIZARD_LOCK_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as { tabId?: unknown; ts?: unknown };
			if (typeof parsed.tabId !== 'string' || typeof parsed.ts !== 'number') return null;
			return { tabId: parsed.tabId, ts: parsed.ts };
		} catch {
			// catch-allow: an unreadable lock is treated as free and rewritten on claim
			return null;
		}
	}

	function isWizardLockStale(lock: { ts: number } | null): boolean {
		return !lock || Date.now() - lock.ts > WIZARD_LOCK_STALE_MS;
	}

	/** Saved wizard state (any persisted key) without importing the store's private map. */
	function hasPersistedWizardState(): boolean {
		try {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith(WIZARD_STORAGE_PREFIX)) return true;
			}
		} catch {
			// catch-allow: blocked storage means there is nothing to resume
		}
		return false;
	}

	function writeWizardHeartbeat() {
		try {
			localStorage.setItem(WIZARD_LOCK_KEY, JSON.stringify({ tabId: wizardTabId, ts: Date.now() }));
		} catch {
			// catch-allow: the heartbeat is best-effort — the wizard works without it
		}
	}

	function releaseWizardLock() {
		if (readWizardLock()?.tabId !== wizardTabId) return; // another tab took over — leave its beat
		try {
			localStorage.removeItem(WIZARD_LOCK_KEY);
		} catch {
			// catch-allow: nothing to release when storage is unavailable
		}
	}

	function maybeShowWelcomeModal() {
		const welcomeShown = sessionStorage.getItem('sveltycms_welcome_modal_shown');
		if (welcomeShown) return;
		requestAnimationFrame(() => {
			setTimeout(() => {
				showWelcomeModal();
				sessionStorage.setItem('sveltycms_welcome_modal_shown', 'true');
			}, 100);
		});
	}

	/** Take over the wizard: resume saved state, or start fresh when nothing is saved. */
	async function claimWizard() {
		if (lockWatchTimer) {
			clearInterval(lockWatchTimer);
			lockWatchTimer = undefined;
		}
		otherTabOwnsWizard = false;
		writeWizardHeartbeat();
		heartbeatTimer ??= setInterval(writeWizardHeartbeat, WIZARD_LOCK_BEAT_MS);

		if (hasPersistedWizardState()) {
			logger.info('[Setup] Resuming the wizard state saved by this browser.');
			loadStore();
		} else {
			logger.info('[Setup] Fresh start detected. Clearing previous data.');
			clearStore();
			await applyScaffoldHints();
		}

		// Prefer the request origin over the legacy localhost default so the
		// production URL review matches the host the operator actually uses.
		setupStore.seedHostProdFromOrigin(data?.origin);

		initialDataSnapshot = JSON.stringify(wizard);
		setupPersistenceFn();
		maybeShowWelcomeModal();
	}

	/** While blocked, poll the owner's beat and take over once it goes stale. */
	function watchWizardLock() {
		lockWatchTimer ??= setInterval(() => {
			if (isWizardLockStale(readWizardLock())) void claimWizard();
		}, WIZARD_LOCK_BEAT_MS);
	}

	// Svelte 5 requires onMount cleanup to be returned synchronously, so the async
	// setup work runs in an IIFE and the listener detach is registered up front.
	onMount(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges() && !wizard.isSubmitting) {
				e.preventDefault();
			}
		};
		// Reload/close: drop our own beat so the next load does not mistake a dying
		// tab for a live wizard owner (the whole point of the stale window).
		const handlePageHide = () => releaseWizardLock();
		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('pagehide', handlePageHide);

		void (async () => {
			wizardTabId = globalThis.crypto.randomUUID();

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

			// --- Ownership gate (SV-032) ---
			const lock = readWizardLock();
			if (lock && lock.tabId !== wizardTabId && !isWizardLockStale(lock)) {
				// Never touch the shared state from here — the owning tab would lose it.
				logger.info('[Setup] Wizard is already open in another tab — waiting.');
				otherTabOwnsWizard = true;
				watchWizardLock();
				return;
			}

			await claimWizard();
		})();

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('pagehide', handlePageHide);
			if (heartbeatTimer) clearInterval(heartbeatTimer);
			if (lockWatchTimer) clearInterval(lockWatchTimer);
			releaseWizardLock();
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

	/**
	 * Stepper completion flags. The store marks the optional Email step as done as
	 * soon as Review is reached (`highestStepReached > 4`); an untouched optional
	 * step must stay pending (SV-017), so it only counts once the operator actually
	 * configured it — a successful SMTP test or a host they entered.
	 */
	const stepperCompleted = $derived.by<boolean[]>(() => {
		const completed = [...setupStore.stepCompleted];
		const emailTouched =
			wizard.emailSettings.smtpConfigured || wizard.emailSettings.host.trim() !== '';
		completed[4] = completed[4] && emailTouched;
		return completed;
	});

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

	/**
	 * Reset the single persistent scroll container (#step-content) on every step
	 * change so the step heading is visible (SV-019). Focus deliberately uses
	 * `preventScroll`, and nothing else reset `scrollTop`. `instant` overrides the
	 * container's `scroll-smooth`, which would otherwise glide past the heading.
	 */
	async function resetStepScroll(stepIndex: number) {
		await tick();
		document.getElementById('step-content')?.scrollTo({ top: 0, behavior: 'instant' });
		logger.debug('[Setup] Step content scrolled to the top', { stepIndex });
	}

	$effect(() => {
		// Dependency: the step index — reset the scroll for every navigation.
		void resetStepScroll(wizard.currentStep);
	});

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
			// The connection test is read-only: materialize the database (file/schema),
			// write config/private.ts and seed system data only on this explicit Next.
			// `seedDatabase` returns as soon as the server queues the background work;
			// `completeSetup` waits for it before finalizing.
			await setupStore.seedDatabase();
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
		// A UI-language switch is not a configuration change: the DB probe result and its
		// gate must survive it (SV-018). Snapshot the probe state, apply the locale, then
		// restore, so nothing a locale re-render does can leave "next disabled but banner
		// still green".
		const probe = {
			dbTestPassed: wizard.dbTestPassed,
			successMessage: wizard.successMessage,
			errorMessage: wizard.errorMessage,
			lastDbTestResult: wizard.lastDbTestResult
		};

		// Both the locale store and the header tag are typed to the compiled paraglide
		// locales, so only adopt a tag that exists there; the document-level application
		// still runs for any tag (`applySystemLanguage` falls back to "en" itself).
		if (isCompiledSystemLocale(lang)) {
			systemLanguage.set(lang);
			currentLanguageTag = lang;
		}
		applySystemLanguage(lang);

		void tick().then(() => {
			wizard.dbTestPassed = probe.dbTestPassed;
			wizard.successMessage = probe.successMessage;
			wizard.errorMessage = probe.errorMessage;
			wizard.lastDbTestResult = probe.lastDbTestResult;
		});
	}
</script>

<svelte:head><title>SveltyCMS Setup</title></svelte:head>

<div
	class="flex h-dvh min-h-0 flex-col overflow-clip bg-(--admin-bg-page) transition-colors"
	inert={otherTabOwnsWizard}
>
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
						completedSteps={stepperCompleted}
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
												? ` ${STEPPER_SETUP_CURRENT_MARKER}`
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
					completedSteps={stepperCompleted}
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

<!-- Wizard owned by another tab (SV-032): the shell above is `inert`, so this is a
     blocking state with one deliberate way out instead of wiping shared state. -->
{#if otherTabOwnsWizard}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-surface-500/20 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="setup-other-tab-title"
		aria-describedby="setup-other-tab-body"
	>
		<div
			class="w-full max-w-md rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card) p-6 shadow-xl"
		>
			<h2 id="setup-other-tab-title" class="text-lg font-semibold text-(--admin-text-body)">
				{setup_other_tab_title()}
			</h2>
			<p id="setup-other-tab-body" class="mt-2 text-sm text-(--admin-text-muted)">
				{setup_other_tab_body()}
			</p>
			<div class="mt-4 flex justify-end">
				<Button variant="primary" autofocus onclick={() => void claimWizard()}>
					{setup_other_tab_takeover()}
				</Button>
			</div>
		</div>
	</div>
{/if}

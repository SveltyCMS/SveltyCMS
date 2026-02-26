<!--
@file src/routes/setup/+page.svelte
@component
**Professional multi-step setup wizard for SveltyCMS**
-->
<script lang="ts">
	// Stores

	// Skeleton v4
	import DialogManager from '@src/components/system/dialog-manager.svelte';
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
	import { modalState } from '@utils/modal-state.svelte';
	// Utils
	import { showConfirm } from '@utils/modal-utils';
	// Using iconify-icon web component
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import AdminConfig from './admin-config.svelte';
	import DatabaseConfig from './database-config.svelte';
	import EmailConfig from './email-config.svelte';
	import ReviewConfig from './review-config.svelte';
	import SetupCardHeader from './setup-card-header.svelte';
	import SetupHeader from './setup-header.svelte';
	import SetupNavigation from './setup-navigation.svelte';
	import SetupStepper from './setup-stepper.svelte';
	import SystemConfig from './system-config.svelte';
	// Step Content Components
	import WelcomeModal from './welcome-modal.svelte';

	// --- 1. STATE MANAGEMENT (Wired to Store) ---
	let { data } = $props();
	const wizard = setupStore.wizard;
	const { load: loadStore, clear: clearStore, setupPersistence: setupPersistenceFn, validateStep, seedDatabase, completeSetup } = setupStore;

	// --- 1. COMPONENT IMPORTS ---
	let showDbPassword = $state(false);
	let showAdminPassword = $state(false);
	let showConfirmPassword = $state(false);
	let initialDataSnapshot = $state('');
	let currentLanguageTag = $state(getLocale());

	// --- 4. LIFECYCLE HOOKS ---
	onMount(() => {
		loadStore();
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
			stepContent.focus();
		}
	}

	async function nextStep() {
		if (!setupStore.canProceed) {
			return;
		}
		if (wizard.currentStep === 0) {
			if (dbConfigComponent && typeof dbConfigComponent.installDatabaseDriver === 'function') {
				await dbConfigComponent.installDatabaseDriver(wizard.dbConfig.type);
			}
			await seedDatabase();
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
		console.log('[SetupPage] Complete Setup button clicked');
		const success = await completeSetup((redirectPath: string) => {
			console.log('[SetupPage] Setup successful, redirecting to:', redirectPath);
			initialDataSnapshot = JSON.stringify(wizard);
			goto(redirectPath);
		});
		if (success) {
			initialDataSnapshot = JSON.stringify(wizard);
		}
	}

	// --- 7. UI HANDLERS ---
	function selectLanguage(lang: string) {
		app.systemLanguage = lang as import('@src/paraglide/runtime').Locale;
		currentLanguageTag = lang as typeof currentLanguageTag;
	}
</script>

<svelte:head><title>SveltyCMS Setup</title></svelte:head>

<div class="bg-surface-50-900 min-h-screen w-full transition-colors">
	<DialogManager />

	<div class="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8" role="main" aria-label="SveltyCMS Setup Wizard">
		<SetupHeader siteName={wizard.systemSettings.siteName} {systemLanguages} {currentLanguageTag} onselectLanguage={selectLanguage} />

		<div class="flex flex-col gap-4 lg:flex-row lg:gap-6">
			<div role="region" aria-label="Progress navigation">
				<SetupStepper
					{steps}
					currentStep={wizard.currentStep}
					stepCompleted={setupStore.stepCompleted}
					stepClickable={setupStore.stepClickable}
					{legendItems}
					onselectStep={async (e: number) => {
						wizard.currentStep = e;
						await focusStepContent();
					}}
				/>
			</div>

			<div
				class="flex flex-1 flex-col w-full min-w-0 rounded-xl border border-surface-200 bg-white shadow-xl dark:text-surface-50 dark:bg-surface-800"
			>
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

				<div class="p-4 sm:p-6 lg:p-8" role="region" aria-label="Current step content" id="step-content" tabindex="-1">
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
							errorMessage={wizard.errorMessage}
							successMessage={wizard.successMessage}
							bind:this={dbConfigComponent}
						/>
					{:else if wizard.currentStep === 1}
						<AdminConfig
							bind:adminUser={wizard.adminUser}
							validationErrors={wizard.validationErrors}
							passwordRequirements={setupStore.passwordRequirements}
							bind:showAdminPassword
							bind:showConfirmPassword
							toggleAdminPassword={() => (showAdminPassword = !showAdminPassword)}
							toggleConfirmPassword={() => (showConfirmPassword = !showConfirmPassword)}
							checkPasswordRequirements={() => {
								/* now handled by derived rune */
							}}
						/>
					{:else if wizard.currentStep === 2}
						<SystemConfig
							bind:systemSettings={wizard.systemSettings}
							bind:redisAvailable={data.redisAvailable}
							validationErrors={wizard.validationErrors}
						/>
					{:else if wizard.currentStep === 3}
						<EmailConfig />
					{:else if wizard.currentStep === 4}
						<ReviewConfig dbConfig={wizard.dbConfig} adminUser={wizard.adminUser} systemSettings={wizard.systemSettings} />
					{/if}

					{#if (wizard.successMessage || wizard.errorMessage) && wizard.lastDbTestResult}
						<div
							class="mt-4 flex flex-col rounded-md border-l-4 p-0 text-sm"
							class:border-primary-400={!!wizard.successMessage}
							class:border-error-400={!!wizard.errorMessage}
							aria-live="polite"
							aria-atomic="true"
						>
							<div
								class="flex items-center gap-2 px-3.5 py-3"
								class:bg-primary-50={!!wizard.successMessage}
								class:text-emerald-800={!!wizard.successMessage}
								class:bg-red-50={!!wizard.errorMessage}
								class:text-red-700={!!wizard.errorMessage}
							>
								<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									{#if wizard.successMessage}
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									{:else}
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									{/if}
								</svg>
								<div class="flex-1">{wizard.successMessage || wizard.errorMessage}</div>
								<button
									type="button"
									class="btn-sm preset-outlined rounded flex shrink-0 items-center gap-1"
									onclick={() => (wizard.showDbDetails = !wizard.showDbDetails)}
								>
									<iconify-icon icon={wizard.showDbDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="h-4 w-4"></iconify-icon>
									<span class="hidden sm:inline">{wizard.showDbDetails ? setup_db_test_details_hide() : setup_db_test_details_show()}</span>
								</button>
								<button
									type="button"
									class="btn-icon btn-sm h-6 w-6 shrink-0 rounded hover:bg-surface-200/60 dark:hover:bg-surface-600/60"
									aria-label="Close message"
									onclick={setupStore.clearDbTestError}
								>
									<iconify-icon icon="mdi:close" class="h-4 w-4"></iconify-icon>
								</button>
							</div>
							{#if wizard.showDbDetails && wizard.lastDbTestResult}
								<div class="border-t border-surface-200 bg-secondary-50 text-xs dark:border-surface-600 dark:bg-surface-700">
									<div class="grid grid-cols-2 gap-x-4 gap-y-2 p-3 sm:grid-cols-6">
										<div class="sm:col-span-1 flex items-center gap-1 whitespace-nowrap">
											<span class="font-semibold">{setup_db_test_latency()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.lastDbTestResult.latencyMs ?? '—'} ms</span>
										</div>
										<div class="sm:col-span-1 flex items-center gap-1 whitespace-nowrap">
											<span class="font-semibold">{setup_db_test_engine()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.dbConfig.type}</span>
										</div>
										<div class="sm:col-span-1 flex items-center gap-1 whitespace-nowrap">
											<span class="font-semibold">{label_host()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.dbConfig.host}</span>
										</div>
										{#if !isFullUri}
											<div class="sm:col-span-1 flex items-center gap-1 whitespace-nowrap">
												<span class="font-semibold">{label_port()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.dbConfig.port}</span>
											</div>
										{/if}
										<div class="sm:col-span-1 flex items-center gap-1 whitespace-nowrap">
											<span class="font-semibold">{label_database()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.dbConfig.name}</span>
										</div>
										{#if wizard.dbConfig.user}
											<div class="sm:col-span-1 flex items-center gap-1 whitespace-nowrap">
												<span class="font-semibold">{label_user?.() || setup_db_test_user()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.dbConfig.user}</span>
											</div>
										{/if}
										{#if wizard.lastDbTestResult.classification}
											<div class="sm:col-span-2 flex items-center gap-1 whitespace-nowrap">
												<span class="font-semibold">Code:</span>
												<span class="text-tertiary-500 dark:text-primary-500 font-semibold">{wizard.lastDbTestResult.classification}</span>
											</div>
										{/if}
									</div>
									{#if !wizard.lastDbTestResult.success}
										<div class="border-t border-surface-200 p-3 dark:border-surface-600">
											{#if wizard.lastDbTestResult.userFriendly}
												<div class="mb-2 font-semibold text-red-700">Error:</div>
												<div class="mb-3 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-error-900/20 dark:text-white">
													{wizard.lastDbTestResult.userFriendly}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>
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
		</div>
	</div>
</div>

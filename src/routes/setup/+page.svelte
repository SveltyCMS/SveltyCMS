<!--
@file src/routes/setup/+page.svelte
@component
**Professional multi-step setup wizard for SveltyCMS**

### Props
- `wizard`
- `loadStore`
- `clearStore`
- `setupPersistenceFn`
- `validateStep`
- `seedDatabase`
- `completeSetup`

### Features
- Multi-step setup wizard
- Database configuration
- Admin user configuration
- System configuration
- Email configuration
- Review configuration
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Stores
	import { setupStore } from '@stores/setupStore.svelte';
	import { systemLanguage } from '@stores/store.svelte';

	// Child Layout Components
	import SetupHeader from './SetupHeader.svelte';
	import SetupStepper from './SetupStepper.svelte';
	import SetupCardHeader from './SetupCardHeader.svelte';
	import SetupNavigation from './SetupNavigation.svelte';

	// Step Content Components
	import WelcomeModal from './WelcomeModal.svelte';
	import DatabaseConfig from './DatabaseConfig.svelte';
	import AdminConfig from './AdminConfig.svelte';
	import SystemConfig from './SystemConfig.svelte';
	import EmailConfig from './EmailConfig.svelte';
	import ReviewConfig from './ReviewConfig.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';

	// Utils
	import { getLanguageName } from '@utils/languageUtils';
	import { locales as availableLocales } from '@src/paraglide/runtime';

	// --- 1. STATE MANAGEMENT (Wired to Store) ---
	const wizard = setupStore.wizard; // Get direct rune access
	const { load: loadStore, clear: clearStore, setupPersistence: setupPersistenceFn, validateStep, seedDatabase, completeSetup } = setupStore;

	// --- 1. COMPONENT IMPORTS ---
	let showDbPassword = $state(false);
	let showAdminPassword = $state(false);
	let showConfirmPassword = $state(false);
	let initialDataSnapshot = $state('');
	let isLangOpen = $state(false);
	let langSearch = $state('');
	let currentLanguageTag = $state(getLocale());

	// --- 4. LIFECYCLE HOOKS	// Modal
	import { modalState } from '@utils/modalState.svelte';

	onMount(() => {
		console.log('Setup Page Mounted');
		loadStore();
		initialDataSnapshot = JSON.stringify(wizard);
		document.addEventListener('click', outsideLang);
		setupPersistenceFn();

		requestAnimationFrame(() => {
			setTimeout(() => {
				if (!sessionStorage.getItem('sveltycms_welcome_modal_shown')) {
					showWelcomeModal();
					sessionStorage.setItem('sveltycms_welcome_modal_shown', 'true');
				}
			}, 100);
		});

		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges() && !wizard.isSubmitting) {
				e.preventDefault();
				e.returnValue = '';
				return '';
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			document.removeEventListener('click', outsideLang);
		};
	});

	onDestroy(() => {
		document.removeEventListener('click', outsideLang);
	});

	// Modal
	function showWelcomeModal() {
		modalState.trigger(WelcomeModal, {}, (result) => {
			if (result) {
				console.log('Welcome modal confirmed');
			}
		});
	}

	// --- 5. DERIVED STATE (Page-Specific) ---
	const hasUnsavedChanges = $derived(() => {
		if (!initialDataSnapshot) return false;
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
		{ label: m.setup_step_database(), shortDesc: m.setup_step_database_desc() },
		{ label: m.setup_step_admin(), shortDesc: m.setup_step_admin_desc() },
		{ label: m.setup_step_system(), shortDesc: m.setup_step_system_desc() },
		{
			label: m.setup_step_email ? m.setup_step_email() : 'Email (Optional)',
			shortDesc: m.setup_step_email_desc ? m.setup_step_email_desc() : 'Configure SMTP'
		},
		{ label: m.setup_step_complete(), shortDesc: m.setup_step_complete_desc() }
	]);
	const totalSteps = $derived(steps.length);
	const legendItems = [
		{ key: 'completed', label: m.setup_legend_completed(), content: '✓' },
		{ key: 'current', label: m.setup_legend_current(), content: '●' },
		{ key: 'pending', label: m.setup_legend_pending(), content: '•' }
	];

	// --- 6. CORE LOGIC & API CALLS (Now delegated to store) ---
	// svelte-ignore non_reactive_update
	let dbConfigComponent: any = null; // Still needed to call installDatabaseDriver

	async function nextStep() {
		if (!setupStore.canProceed) return;
		if (wizard.currentStep === 0) {
			// Call install driver on the component instance (if it exists)
			if (dbConfigComponent && typeof (dbConfigComponent as any).installDatabaseDriver === 'function') {
				await (dbConfigComponent as any).installDatabaseDriver(wizard.dbConfig.type);
			}
			// Seed the database via the store
			await seedDatabase();
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
		// Clear local page errors
		setupStore.clearDbTestError();
	}

	function prevStep() {
		if (wizard.currentStep > 0) {
			wizard.currentStep--;
			wizard.errorMessage = '';
		}
	}

	async function handleCompleteSetup() {
		const success = await completeSetup((redirectPath: string) => {
			// This callback handles the redirect after store is cleared
			initialDataSnapshot = JSON.stringify(wizard); // Prevent unsaved changes warning
			goto(redirectPath);
		});
		if (success) {
			initialDataSnapshot = JSON.stringify(wizard); // Also update snapshot immediately
		}
	}

	// --- 7. UI HANDLERS ---
	function selectLanguage(event: CustomEvent) {
		const lang = event.detail;
		systemLanguage.set(lang as typeof systemLanguage.value);
		currentLanguageTag = lang as typeof currentLanguageTag;
		isLangOpen = false;
		langSearch = '';
	}

	function outsideLang(e: MouseEvent) {
		const t = e.target as HTMLElement;
		if (!t.closest('.language-selector')) {
			isLangOpen = false;
			langSearch = '';
		}
	}
</script>

<svelte:head>
	<title>SveltyCMS Setup</title>
	<style>
		:global(.setup-page .toast-container) {
			position: fixed !important;
			bottom: 1.5rem !important;
			right: 1.5rem !important;
			left: auto !important;
			top: auto !important;
			transform: none !important;
			z-index: 9999 !important;
		}
		:global(.setup-page .toast) {
			transform: none !important;
			animation: none !important;
		}
	</style>
</svelte:head>

<div class="bg-surface-50 dark:bg-surface-900 min-h-screen w-full transition-colors">
	<div class="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
		<!-- ✅ NEW: Component for Header -->
		<SetupHeader
			siteName={wizard.systemSettings.siteName}
			{systemLanguages}
			{currentLanguageTag}
			bind:isLangOpen
			bind:langSearch
			onselectLanguage={selectLanguage}
			ontoggleLang={() => (isLangOpen = !isLangOpen)}
		/>

		<!-- Main Content with Left Side Steps -->
		<div class="flex flex-col gap-4 lg:flex-row lg:gap-6">
			<!-- ✅ NEW: Component for Stepper -->
			<SetupStepper
				{steps}
				currentStep={wizard.currentStep}
				stepCompleted={setupStore.stepCompleted}
				stepClickable={setupStore.stepClickable}
				{legendItems}
				onselectStep={(e: number) => (wizard.currentStep = e)}
			/>

			<!-- Main Card (Right Side) -->
			<div
				class="flex flex-1 flex-col rounded-xl border border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-800 dark:shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)]"
			>
				<!-- ✅ NEW: Component for Card Header -->
				<SetupCardHeader
					currentStep={wizard.currentStep}
					{steps}
					onreset={() => {
						if (typeof window !== 'undefined' && !confirm('Clear all setup data?')) return;
						clearStore();
						sessionStorage.removeItem('sveltycms_welcome_modal_shown');
						window.location.reload();
					}}
				/>

				<!-- Card Content -->
				<div class="p-4 sm:p-6 lg:p-8">
					{#if wizard.currentStep === 0}
						<DatabaseConfig
							bind:dbConfig={wizard.dbConfig}
							validationErrors={wizard.validationErrors}
							isLoading={wizard.isLoading}
							bind:showDbPassword
							toggleDbPassword={() => (showDbPassword = !showDbPassword)}
							testDatabaseConnection={setupStore.testDatabaseConnection}
							dbConfigChangedSinceTest={setupStore.dbConfigChangedSinceTest}
							clearDbTestError={setupStore.clearDbTestError}
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
						<SystemConfig bind:systemSettings={wizard.systemSettings} validationErrors={wizard.validationErrors} />
					{:else if wizard.currentStep === 3}
						<EmailConfig />
					{:else if wizard.currentStep === 4}
						<ReviewConfig dbConfig={wizard.dbConfig} adminUser={wizard.adminUser} systemSettings={wizard.systemSettings} />
					{/if}

					<!-- ✅ Status Messages (Now reads from store) -->
					{#if (wizard.successMessage || wizard.errorMessage) && wizard.lastDbTestResult}
						<div
							class="mt-4 flex flex-col rounded-md border-l-4 p-0 text-sm"
							class:border-primary-400={!!wizard.successMessage}
							class:border-error-400={!!wizard.errorMessage}
						>
							<div
								class="flex items-center gap-2 px-3.5 py-3"
								class:bg-primary-50={!!wizard.successMessage}
								class:text-green-800={!!wizard.successMessage}
								class:bg-red-50={!!wizard.errorMessage}
								class:text-error-600={!!wizard.errorMessage}
							>
								<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									{#if wizard.successMessage}
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
									{:else}
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									{/if}
								</svg>
								<div class="flex-1">{wizard.successMessage || wizard.errorMessage}</div>
								<button type="button" class="btn-sm flex shrink-0 items-center gap-1" onclick={() => (wizard.showDbDetails = !wizard.showDbDetails)}>
									<iconify-icon icon={wizard.showDbDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="h-4 w-4"></iconify-icon>
									<span class="hidden sm:inline">{wizard.showDbDetails ? m.setup_db_test_details_hide() : m.setup_db_test_details_show()}</span>
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
								<div class="border-t border-surface-200 bg-surface-50 text-xs dark:border-surface-600 dark:bg-surface-700">
									<div class="grid grid-cols-2 gap-x-4 gap-y-2 p-3 sm:grid-cols-6">
										<div class="sm:col-span-1">
											<span class="font-semibold">{m.setup_db_test_latency()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500">{wizard.lastDbTestResult.latencyMs ?? '—'} ms</span>
										</div>
										<div class="sm:col-span-1">
											<span class="font-semibold">{m.setup_db_test_engine()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500">{wizard.dbConfig.type}</span>
										</div>
										<div class="sm:col-span-1">
											<span class="font-semibold">{m.label_host()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500">{wizard.dbConfig.host}</span>
										</div>
										{#if !isFullUri}
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.label_port()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500">{wizard.dbConfig.port}</span>
											</div>
										{/if}
										<div class="sm:col-span-1">
											<span class="font-semibold">{m.label_database()}:</span>
											<span class="text-tertiary-500 dark:text-primary-500">{wizard.dbConfig.name}</span>
										</div>
										{#if wizard.dbConfig.user}
											<div class="sm:col-span-1">
												<span class="font-semibold">{m.label_user?.() || m.setup_db_test_user()}:</span>
												<span class="text-tertiary-500 dark:text-primary-500">{wizard.dbConfig.user}</span>
											</div>
										{/if}
										{#if wizard.lastDbTestResult.classification}
											<div class="sm:col-span-2">
												<span class="font-semibold">Code:</span>
												<span class="text-tertiary-500 dark:text-primary-500">{wizard.lastDbTestResult.classification}</span>
											</div>
										{/if}
									</div>
									{#if !wizard.lastDbTestResult.success}
										<div class="border-t border-surface-200 p-3 dark:border-surface-600">
											{#if wizard.lastDbTestResult.userFriendly}
												<div class="mb-2 font-semibold text-error-600">Error:</div>
												<div class="mb-3 rounded bg-red-50 p-2 text-sm text-error-700 dark:bg-error-900/20 dark:text-white">
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
				<!-- ✅ NEW: Component for Navigation (wired to store state) -->
				<SetupNavigation
					currentStep={wizard.currentStep}
					{totalSteps}
					canProceed={setupStore.canProceed}
					isLoading={wizard.isLoading || wizard.isSubmitting}
					onprev={prevStep}
					onnext={nextStep}
					oncomplete={handleCompleteSetup}
				/>
			</div>
		</div>
	</div>
</div>

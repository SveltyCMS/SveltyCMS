<!--
@file apps/cms/src/routes/config/collectionbuilder/[action]/[...contentPath]/widget/[widgetAction]/+page.svelte
@component Full-page widget configuration with stepper navigation
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// Stores
	import { collections, setTargetWidget } from '@cms/stores/collectionStore.svelte';
	import { widgets } from '@cms/stores/widgetStore.svelte';
	import { asAny, getGuiFields } from '@shared/utils/utils';

	// Components
	import PageTitle from '@cms/components/PageTitle.svelte';
	import HorizontalStepper from '../HorizontalStepper.svelte';
	import Default from '../../tabs/CollectionWidget/tabsFields/Default.svelte';
	import Permission from '../../tabs/CollectionWidget/tabsFields/Permission.svelte';
	import Specific from '../../tabs/CollectionWidget/tabsFields/Specific.svelte';

	// ParaglideJS
	import * as m from '$lib/paraglide/messages.js';

	// Route params
	const action = $derived(page.params.action); // create or edit collection
	const contentPath = $derived(page.params.contentPath);
	const widgetAction = $derived(page.params.widgetAction); // create or edit widget

	// State
	let currentStep = $state(0);
	let stepCompleted = $state([false, false, false]);
	let stepClickable = $state([true, false, false]);

	// Widget data
	const widgetKey = $derived((collections.targetWidget?.widget as any)?.key || '');
	const availableWidgets = $derived(widgets.widgetFunctions || {});
	const guiSchema = $derived((availableWidgets[widgetKey]?.GuiSchema || {}) as Record<string, { widget: any }>);

	// Check if there are specific options
	const standardProperties = ['label', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'];
	const specificOptions = $derived(guiSchema ? Object.keys(guiSchema).filter((prop) => !standardProperties.includes(prop)) : []);

	// Steps configuration
	const baseSteps = [
		{ label: 'Default', shortDesc: 'Label, name, icon, settings', icon: 'mdi:form-textbox' },
		{ label: 'Permissions', shortDesc: 'Role-based access control', icon: 'mdi:security-lock' }
	];

	const steps = $derived(
		specificOptions.length > 0 ? [...baseSteps, { label: 'Specific', shortDesc: 'Widget-specific options', icon: 'ph:star-fill' }] : baseSteps
	);

	// Page title
	const pageTitle = $derived(widgetAction === 'create' ? 'Add Widget Field' : 'Edit Widget Field');
	const highlightedPart = $derived(widgetKey || 'Widget');

	// Navigation
	function goBack() {
		goto(`/config/collectionbuilder/${action}/${contentPath}`);
	}

	function nextStep() {
		if (currentStep < steps.length - 1) {
			stepCompleted[currentStep] = true;
			stepClickable[currentStep + 1] = true;
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function handleStepSelect(stepIndex: number) {
		currentStep = stepIndex;
	}

	async function handleSave() {
		// Mark all steps as complete
		stepCompleted = stepCompleted.map(() => true);

		// Get the configured widget from the store
		const configuredWidget = collections.targetWidget;

		// Navigate back and pass the data
		// The CollectionWidget component will need to pick up this data
		goto(`/config/collectionbuilder/${action}/${contentPath}?tab=1&widgetSaved=true`);
	}

	onMount(() => {
		// If no target widget is set, redirect back
		if (!collections.targetWidget) {
			goBack();
		}
	});
</script>

<svelte:head>
	<title>{pageTitle} | SveltyCMS</title>
</svelte:head>

<div class="container mx-auto p-4 lg:p-8">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<PageTitle name={pageTitle} highlight={highlightedPart} icon="mdi:form-select" />
		<button onclick={goBack} type="button" class="preset-outlined-secondary-500 btn gap-2">
			<iconify-icon icon="mdi:arrow-left" width="20"></iconify-icon>
			<span class="hidden sm:inline">{m.button_cancel()}</span>
		</button>
	</div>

	<!-- Stepper at top -->
	<HorizontalStepper {steps} {currentStep} {stepCompleted} {stepClickable} onselectStep={handleStepSelect} />

	<!-- Main content -->
	<div class="rounded-xl border border-surface-200 bg-white p-6 shadow-xl dark:border-surface-600 dark:bg-surface-800">
		<!-- Step content -->
		<div class="flex-1">
			<div class="rounded-xl border border-surface-200 bg-white p-6 shadow-xl dark:border-surface-600 dark:bg-surface-800">
				<!-- Step 1: Default -->
				{#if currentStep === 0}
					<div class="space-y-6">
						<h2 class="text-xl font-bold text-tertiary-500 dark:text-primary-500">
							<iconify-icon icon="mdi:form-textbox" width="24" class="inline-block mr-2"></iconify-icon>
							Default Configuration
						</h2>
						<p class="text-surface-600 dark:text-surface-300">Configure the basic properties for your widget field.</p>
						<div class="border-t border-surface-200 dark:border-surface-600 pt-6">
							<Default guiSchema={guiSchema as any} />
						</div>
					</div>
				{/if}

				<!-- Step 2: Permissions -->
				{#if currentStep === 1}
					<div class="space-y-6">
						<h2 class="text-xl font-bold text-tertiary-500 dark:text-primary-500">
							<iconify-icon icon="mdi:security-lock" width="24" class="inline-block mr-2"></iconify-icon>
							Permissions
						</h2>
						<p class="text-surface-600 dark:text-surface-300">Set role-based permissions for this field.</p>
						<div class="border-t border-surface-200 dark:border-surface-600 pt-6">
							<Permission />
						</div>
					</div>
				{/if}

				<!-- Step 3: Specific (if applicable) -->
				{#if currentStep === 2 && specificOptions.length > 0}
					<div class="space-y-6">
						<h2 class="text-xl font-bold text-tertiary-500 dark:text-primary-500">
							<iconify-icon icon="ph:star-fill" width="24" class="inline-block mr-2"></iconify-icon>
							Widget-Specific Options
						</h2>
						<p class="text-surface-600 dark:text-surface-300">Configure options specific to this widget type.</p>
						<div class="border-t border-surface-200 dark:border-surface-600 pt-6">
							<Specific />
						</div>
					</div>
				{/if}

				<!-- Navigation buttons -->
				<div class="mt-8 flex items-center justify-between border-t border-surface-200 dark:border-surface-600 pt-6">
					<button
						onclick={prevStep}
						type="button"
						disabled={currentStep === 0}
						class="btn preset-outlined-secondary-500 gap-2 {currentStep === 0 ? 'opacity-50 cursor-not-allowed' : ''}"
					>
						<iconify-icon icon="mdi:arrow-left" width="20"></iconify-icon>
						{m.button_previous()}
					</button>

					{#if currentStep < steps.length - 1}
						<button onclick={nextStep} type="button" class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 gap-2">
							{m.button_next()}
							<iconify-icon icon="mdi:arrow-right" width="20"></iconify-icon>
						</button>
					{:else}
						<button onclick={handleSave} type="button" class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 gap-2">
							<iconify-icon icon="mdi:check" width="20"></iconify-icon>
							{m.button_save()}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

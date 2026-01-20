<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/+page.svelte
@component  
**This component sets up and displays the collection page.**

It provides a user-friendly interface for creating, editing, and deleting collections.

### Props
- `data`: An object containing:
- `collection`: The collection schema data (if editing an existing collection).
- `contentLanguage`: The current content language setting.
- `user`: The authenticated user information.

### Features
- Dynamically sets the page title based on whether the user is creating a new collection or editing an existing one.
- Loads collection data when editing, and initializes state accordingly.
- Provides tabs for editing collection forms and widget fields.
-->

<script lang="ts">
	import { logger } from '@shared/utils/logger';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	import { obj2formData } from '@shared/utils/utils';

	// Stores
	import { page } from '$app/state';
	import { collection, setCollection } from '@cms/stores/collectionStore.svelte';
	import { setRouteContext } from '@cms/stores/UIStore.svelte';

	// ParaglideJS
	import * as m from '$paraglide/messages.js';

	// Components
	import CollectionForm from './tabs/CollectionForm.svelte';
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import PageTitle from '@cms/components/PageTitle.svelte';
	import HorizontalStepper from './widget/HorizontalStepper.svelte';

	// Skeleton
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '@shared/stores/store.svelte';
	import { showConfirm } from '@shared/utils/modalUtils';
	import { widgetStoreActions } from '@cms/stores/widgetStore.svelte';

	// Tooltip styling
	const TOOLTIP_CLASS =
		'card rounded-md border border-surface-300/50 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-2 py-1 text-xs shadow-lg text-black dark:text-white';

	// Stepper state
	let currentStep = $state(0);
	const steps = [
		{ label: 'Edit Collection', shortDesc: 'Basic settings & Details', icon: 'ic:baseline-edit' },
		{ label: 'Widget Fields', shortDesc: 'Manage content fields', icon: 'mdi:widgets-outline' }
	];
	// Track step completion - step 0 is complete if we have a name (simplified)
	let stepCompleted = $derived([!!collection.value?.name, (collection.value?.fields?.length ?? 0) > 0]);
	// Steps are clickable if previous step is complete or it's the current step
	let stepClickable = $derived([
		true, // Step 0 always clickable
		!!collection.value?.name // Step 1 clickable if name exists
	]);

	function handleStepSelect(index: number) {
		currentStep = index;
	}

	function handleNextStep() {
		if (currentStep < steps.length - 1) {
			currentStep++;
		}
	}

	function handlePrevStep() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	import type { User } from '@shared/database/auth/types';
	import type { FieldInstance, Schema } from '@cms-types';

	// Extract the collection name from the URL
	let collectionPath = $state(page.params.contentPath);
	const action = $state(page.params.action);

	interface Props {
		data: {
			collection?: Schema;
			contentLanguage: string;
			user: User;
		};
	}

	const { data }: Props = $props();

	let originalName = $state('');
	onMount(() => {
		if (action === 'edit') {
			loadCollection();
			// Initialize widgets
			widgetStoreActions.initializeWidgets();
		} else {
			// Initialize with name from URL if provided (e.g. /new/admin)
			if (collectionPath) {
				setCollection({ name: collectionPath } as any);
				originalName = collectionPath;
			} else {
				setCollection(null);
				originalName = '';
			}
			widgetStoreActions.initializeWidgets();
		}

		// Check for widgetSaved or tab param to restore state
		const isWidgetSaved = page.url.searchParams.get('widgetSaved') === 'true';
		const tabParam = page.url.searchParams.get('tab');

		if (isWidgetSaved || tabParam === '1') {
			currentStep = 1;
			// If returning from save, clean up the URL
			if (isWidgetSaved) {
				const url = new URL(page.url);
				url.searchParams.delete('widgetSaved');
				goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
			}
		}

		// Set route context
		setRouteContext({ isCollectionBuilder: true });
		return () => setRouteContext({ isCollectionBuilder: false });
	});

	function loadCollection() {
		if (data.collection) {
			setCollection(data.collection);
			originalName = String(data.collection.name || '');
		} else {
			logger.error('Collection data not found for editing.');
			// Optionally, redirect or show a proper error message
		}
	}

	// Default widget data (tab1)
	// Unwrap the `collection` store value for TS and template usage
	const collectionValue = $derived(collection.value);

	// Page title
	let pageTitle = $state('');
	let highlightedPart = $state('');

	// Effect to update page title based on action and collection name
	$effect.root(() => {
		// Set the base page title according to the action
		if (action === 'edit') {
			pageTitle = `Edit ${collectionPath} Collection`;
		} else if (collectionPath) {
			pageTitle = `Create ${collectionPath} Collection`;
		} else {
			pageTitle = 'Create new Collection';
		}

		// Ensure the highlighted part (e.g., contentTypes) is unique in the title
		highlightedPart = collectionPath || 'new';

		// Avoid repeating the contentTypes if it's already included in the string
		if (pageTitle.includes(highlightedPart)) {
			pageTitle = pageTitle.replace(new RegExp(`\\b${highlightedPart}\\b`, 'g'), highlightedPart);
		}
	});

	function handlePageTitleUpdate(title: string) {
		highlightedPart = title;
		collectionPath = title;
		if (action === 'edit') {
			pageTitle = `Edit ${highlightedPart} Collection`;
		} else {
			pageTitle = `Create ${highlightedPart} Collection`;
		}
	}

	// Import validation store
	import { validationStore } from '@shared/stores/store.svelte';

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		const currentCollection = collection.value;
		const currentName = String(currentCollection?.name || '');

		// Check validation errors before submission
		if (validationStore.errors && Object.keys(validationStore.errors).length > 0) {
			toaster.error({ description: 'Please fix validation errors before saving' });
			return;
		}

		// Prepare form data
		const data =
			action == 'edit'
				? obj2formData({
						originalName: originalName,
						name: currentName,
						icon: currentCollection?.icon,
						status: currentCollection?.status,
						slug: currentCollection?.slug,
						description: currentCollection?.description,
						permissions: currentCollection?.permissions,
						fields: currentCollection?.fields
					})
				: obj2formData({
						name: currentName,
						icon: currentCollection?.icon,
						status: currentCollection?.status,
						slug: currentCollection?.slug,
						description: currentCollection?.description,
						permissions: currentCollection?.permissions,
						fields: currentCollection?.fields
					});

		// Send the form data to the server
		const resp = await axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});

		if (resp.data.status === 200) {
			toaster.success({ description: "Collection Saved. You're all set to build your content." });
			if (originalName && originalName !== currentName && currentName) {
				const newPath = page.url.pathname.replace(originalName, currentName);
				goto(newPath);
			}
		}
	}

	function handleCollectionDelete() {
		const currentCollection = collection.value;

		showConfirm({
			title: 'Please Confirm',
			body: 'Are you sure you wish to delete this collection?',
			onConfirm: async () => {
				// Send the form data to the server
				await axios.post(`?/deleteCollections`, obj2formData({ contentTypes: String(currentCollection?.name || '') }), {
					headers: {
						'Content-Type': 'multipart/form-data'
					}
				});

				// Notify via global toast helper
				toaster.error({ description: 'Collection Deleted.' });
				goto(`/collection`);
			},
			onCancel: () => {
				// User cancelled, do not delete
				logger.debug('User cancelled deletion.');
			}
		});
	}
</script>

<!-- Page Title -->
<div class="my-2 flex items-center justify-between gap-2">
	<PageTitle name={pageTitle} highlight={highlightedPart} icon="ic:baseline-build" />

	<!-- Back Button with Tooltip -->
	<Tooltip positioning={{ placement: 'left' }}>
		<Tooltip.Trigger>
			<button onclick={() => history.back()} type="button" aria-label="Back" class="preset-outlined-primary-500 btn-icon rounded-full">
				<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
			</button>
		</Tooltip.Trigger>
		<Portal>
			<Tooltip.Positioner>
				<Tooltip.Content class={TOOLTIP_CLASS}>Go Back</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip>
</div>

<div class="wrapper">
	<!-- Top Actions (Delete) -->
	{#if action == 'edit'}
		<div class="flex justify-end gap-3 mb-4">
			<!-- Delete Button with Tooltip -->
			<Tooltip positioning={{ placement: 'top' }}>
				<Tooltip.Trigger>
					<button type="button" onclick={handleCollectionDelete} class="preset-filled-error-500 btn btn-sm">
						<iconify-icon icon="mdi:delete" width="18" class="mr-1"></iconify-icon>
						{m.button_delete()}
					</button>
				</Tooltip.Trigger>
				<Portal>
					<Tooltip.Positioner>
						<Tooltip.Content class={TOOLTIP_CLASS}>Delete this collection permanently</Tooltip.Content>
					</Tooltip.Positioner>
				</Portal>
			</Tooltip>
		</div>
	{/if}

	<p class="mb-2 hidden text-center text-tertiary-500 dark:text-primary-500 sm:block">
		{m.collection_helptext()}
	</p>
	<!-- Required Text  -->
	<div class="mb-2 text-center text-xs text-error-500" data-testid="required-indicator">* {m.collection_required()}</div>

	<!-- Step Content -->
	<div class="mt-6">
		{#if currentStep === 0}
			<div class="card p-4 shadow-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
				<CollectionForm data={collectionValue} {handlePageTitleUpdate} />

				<!-- Step 0 Actions -->
				<div class="flex justify-end mt-4">
					<button onclick={handleNextStep} class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500" disabled={!collectionValue?.name}>
						Next: Widget Fields
						<iconify-icon icon="mdi:arrow-right" width="20" class="ml-2"></iconify-icon>
					</button>
				</div>
			</div>
		{:else if currentStep === 1}
			<div class="card p-4 shadow-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/50">
				<!-- CollectionWidget handles its own layout, but we need to hide its buttons or adapt them -->
				<CollectionWidget fields={collectionValue?.fields as FieldInstance[] | undefined} {handleCollectionSave} />

				<!-- Step 1 Actions are partly inside CollectionWidget, we might need to adjust CollectionWidget to accept slots or props for actions 
				     For now, CollectionWidget has "Previous" and "Save". We should update CollectionWidget to use our navigation.
				-->
			</div>
		{/if}
	</div>
</div>

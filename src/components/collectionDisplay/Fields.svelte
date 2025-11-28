<!--
@file src/components/collectionDisplay/Fields.svelte
@component
**Fields is a \"dumb\" component that renders collection fields for data entry and provides revision history.**

@example
<Fields {fields} {revisions} contentLanguage="en" />

### Props
- `fields` - The array of field objects from the collection schema.
- `revisions` - An array of revision metadata for the current entry.
- `contentLanguage` - The current content language for editing multilingual field data.

### Features
- Renders appropriate widgets for each field in the schema.
- Binds form data to the `collectionValue` store.
- Displays revision history and allows comparing/reverting to previous versions.
- Does not perform any data fetching; all data is received as props.

### Dual-Language Architecture
- **GUI (systemLanguage)**: All UI text uses ParaglideJS (compile-time) for interface labels, buttons, messages
- **Data (contentLanguage)**: Content data uses dynamic contentLanguage passed to widgets for translated fields
- **Database-Agnostic**: Widgets handle data format (MongoDB: nested objects, SQL: relation tables via IDBAdapter)
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { getFieldName } from '@utils/utils';
	import { logger } from '@utils/logger';

	// Auth & Page data
	import { page } from '$app/state';
	const user = $derived(page.data?.user);
	const tenantId = $derived(page.data?.tenantId);

	// Stores
	import { collection, collectionValue, setCollectionValue } from '@src/stores/collectionStore.svelte';
	import { translationProgress, contentLanguage, dataChangeStore } from '@stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import type { Locale } from '@src/paraglide/runtime';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { CodeBlock, Tab, TabGroup, clipboard } from '@skeletonlabs/skeleton';
	import { showConfirm } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';

	import { widgetFunctions as widgetFunctionsStore } from '@stores/widgetStore.svelte';
	import TokenPicker from '@components/TokenPicker.svelte';
	import { activeInputStore } from '@src/stores/activeInputStore.svelte';
	import { validateTokenSyntax, containsTokens } from '@src/services/token/tokenUtils';

	// Eager load all widget components for immediate use in Fields
	const modules: Record = import.meta.glob('/src/widgets/**/*.svelte', {
		eager: true
	});

	let widgetFunctions = $state({});
	$effect(() => {
		const unsubscribe = widgetFunctionsStore.subscribe((value) => {
			widgetFunctions = value;
		});
		return unsubscribe;
	});

	// --- 1. RECEIVE DATA AS PROPS ---
	import type { FieldsProps } from './types';

	const {
		fields,
		revisions = []
		// contentLanguage prop received but not directly used - widgets access contentLanguage store
	}: FieldsProps = $props(); // Passed for documentation, widgets use store directly

	// --- 2. SIMPLIFIED STATE ---
	let localTabSet = $state(0);
	let apiUrl = $state('');

	// This is form state, not fetched data, so it remains.
	let currentCollectionValue = $state({});

	// Revisions State (now simpler)
	let selectedRevisionId = $state('');

	// Track the last entry ID to detect when switching entries
	let lastEntryId = $state(undefined);

	// Track current content language for reactivity
	let currentContentLanguage = $state(contentLanguage.value as Locale);

	// React to contentLanguage store changes and update local state
	// This ensures widgets remount with the correct language
	$effect(() => {
		const newLang = contentLanguage.value as Locale;
		if (currentContentLanguage !== newLang) {
			logger.debug('Language changed:', currentContentLanguage, '→', newLang);
			logger.debug('Current collectionValue keys:', Object.keys(currentCollectionValue));
			// Update immediately to trigger {#key} block
			currentContentLanguage = newLang;
			logger.debug('Updated currentContentLanguage to:', currentContentLanguage);
		}
	});

	// --- 3. DERIVED STATE FROM PROPS ---
	const selectedRevision = $derived(revisions.find((r: any) => r._id === selectedRevisionId) || null);

	// --- 4. SIMPLIFIED LOGIC ---
	const derivedFields = $derived(fields || []);

	// Get translation progress
	const currentTranslationProgress = $derived(translationProgress.value);

	// Track changes to translation progress for debugging
	$effect(() => {
		logger.debug('Translation progress updated:', {
			showProgress: translationProgress.value?.show,
			languages: Object.keys(translationProgress.value || {}).filter((k) => k !== 'show')
		});
	});

	// Get available languages
	const availableLanguages = $derived.by(() => {
		// Wait for publicEnv to be initialized
		const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (!languages || !Array.isArray(languages)) {
			return ['en'] as Locale[];
		}
		return languages as Locale[];
	});

	// Helper to get field translation percentage across all languages
	function getFieldTranslationPercentage(field: any): number {
		if (!field.translated) return 100; // Not a translatable field

		const fieldName = `${collection.value?.name}.${getFieldName(field)}`;
		const allLangs = availableLanguages; // Use the new derived state

		// Avoid division by zero if no languages are configured
		if (allLangs.length === 0) return 100;

		let translatedCount = 0;

		// Count how many languages have this field translated
		for (const lang of allLangs) {
			const langProgress = currentTranslationProgress?.[lang as Locale];
			if (langProgress && langProgress.translated.has(fieldName)) {
				translatedCount++;
			}
		}

		// Calculate the overall percentage for this field
		return Math.round((translatedCount / allLangs.length) * 100);
	}

	// Helper to get text color based on translation status
	function getTranslationTextColor(percentage: number): string {
		if (percentage === 100) return 'text-tertiary-500 dark:text-primary-500';
		return 'text-error-500';
	}

	function ensureFieldProperties(field: any) {
		if (!field) return null;
		return {
			...field,
			db_fieldName: field.db_fieldName || getFieldName(field, true),
			widget: field.widget || { Name: field.type || 'Input' },
			permissions: field.permissions || {}
		};
	}

	const filteredFields = $derived(
		derivedFields
			.map(ensureFieldProperties)
			.filter(Boolean)
			.filter((field: any) => {
				if (!field.permissions || page.data?.isAdmin || !user?.role) return true;
				const rolePermissions = field.permissions[user.role];
				return !rolePermissions || rolePermissions.read !== false;
			})
	);

	// Sync local form state with global store
	// When collectionValue changes (new entry loaded), update local state
	// When local state changes (user editing), update global state
	$effect(() => {
		const global = collectionValue.value as Record | undefined;
		const globalId = (global as any)?._id;

		// When a new entry is loaded (different ID), pull from global -> local
		if (globalId && globalId !== lastEntryId) {
			logger.debug('Loading entry data:', globalId);
			currentCollectionValue = { ...global } as any;
			lastEntryId = globalId;
			// Set initial snapshot for change tracking
			dataChangeStore.setInitialSnapshot(global as Record);
			return;
		}

		// If creating new entry (no ID), initialize with global state
		if (!globalId && !lastEntryId && global && Object.keys(global).length > 0) {
			logger.debug('Initializing new entry');
			currentCollectionValue = { ...global } as any;
			// Set initial snapshot for change tracking
			dataChangeStore.setInitialSnapshot(global as Record);
			return;
		}

		// Otherwise, push local changes to global (user is editing)
		// Use untrack to read currentCollectionValue without creating a dependency loop
		const local = untrack(() => currentCollectionValue) as Record | undefined;
		if (local && Object.keys(local).length > 0) {
			const currentDataStr = JSON.stringify(local);
			const globalDataStr = JSON.stringify(global ?? {});
			if (currentDataStr !== globalDataStr) {
				logger.debug('Pushing local changes to global store');
				untrack(() => setCollectionValue({ ...local }));
				// Track changes for save button state
				dataChangeStore.compareWithCurrent(local as Record);
			}
		}
	});

	// Separate effect to detect changes in currentCollectionValue and sync to store
	// This is needed because the widget bind:value updates currentCollectionValue
	let lastLocalValueStr = $state('');
	$effect(() => {
		// React to currentCollectionValue changes (from widget inputs)
		const localStr = JSON.stringify(currentCollectionValue);

		// Skip if this is the initial load or empty
		if (!currentCollectionValue || Object.keys(currentCollectionValue).length === 0) {
			return;
		}

		// Only update if value actually changed
		if (localStr !== lastLocalValueStr) {
			logger.debug('currentCollectionValue changed, syncing to store');
			lastLocalValueStr = localStr;

			// Update the global store (using untrack to avoid creating dependency)
			const global = untrack(() => collectionValue.value);
			const globalStr = JSON.stringify(global ?? {});

			if (localStr !== globalStr) {
				untrack(() => setCollectionValue({ ...currentCollectionValue }));
				// Track changes for save button state
				dataChangeStore.compareWithCurrent(currentCollectionValue as Record);
			}
		}
	});

	// --- 5. REFACTORED REVISION LOGIC ---
	function handleRevert() {
		if (!selectedRevision?.data) return;
		showConfirm({
			title: 'Confirm Revert',
			body: 'Are you sure you want to revert to this version? Any unsaved changes will be lost.',
			confirmText: 'Revert',
			onConfirm: () => {
				const revertData = { ...selectedRevision.data, _id: (collectionValue as any).value?._id };
				setCollectionValue(revertData);
				currentCollectionValue = revertData; // also update local state
				showToast('Content reverted. Please save your changes.', 'info');
				localTabSet = 0;
			}
		});
	}

	$effect(() => {
		if ((collectionValue as any).value?._id) {
			apiUrl = `${location.origin}/api/collection/${collection.value?._id}/${(collectionValue as any).value._id}`;
		}
	});
</script>

<TabGroup
	justify={collection.value?.revision === true ? 'justify-between md:justify-around' : 'justify-center '}
	rounded="rounded-tl-container-token rounded-tr-container-token"
	flex="flex-1 items-center"
	active="border-b border-tertiary-500 dark:border-primary-500 variant-soft-secondary"
	hover="hover:variant-soft-secondary"
	bind:group={localTabSet}
>
	<Tab bind:group={localTabSet} name="edit" value={0}>
		<div class="flex items-center gap-2">
			<iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			{m.button_edit()}
		</div>
	</Tab>

	{#if collection.value?.revision}
		<Tab bind:group={localTabSet} name="revisions" value={1}>
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:history" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				{m.applayout_version()} <span class="variant-filled-secondary badge">{revisions.length}</span>
			</div>
		</Tab>
	{/if}

	{#if collection.value?.livePreview}
		<Tab bind:group={localTabSet} name="preview" value={2}>
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:eye-outline" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				{m.Fields_preview()}
			</div>
		</Tab>
	{/if}

	{#if user?.isAdmin}
		<Tab bind:group={localTabSet} name="api" value={3}>
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:api" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				API
			</div>
		</Tab>
	{/if}

	<svelte:fragment slot="panel">
		<TokenPicker />
		{#if localTabSet === 0}
			<!-- Edit Tab -->
			<div class="flex flex-col gap-4 p-4">
				<div class="mb-2 text-center text-xs text-error-500">{m.form_required()}</div>
				<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
					<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
						{#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
							{#if rawField.widget}
								{@const field = ensureFieldProperties(rawField)}
								{@const fieldValue = currentCollectionValue[getFieldName(field, false)]}
								<div
									class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
									style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
								>
									<div class="flex items-center justify-between gap-2 px-[5px] text-start">
										<!-- Field label -->
										<div class="flex items-center gap-2">
											<p class="inline-block font-semibold capitalize">
												{field.label || field.db_fieldName}
												{#if field.required}<span class="text-error-500">*</span>{/if}
											</p>
										</div>
										<div class="flex items-center gap-2">
											<!-- Translation status -->
											{#if field.translated}
												{@const percentage = getFieldTranslationPercentage(field)}
												{@const textColor = getTranslationTextColor(percentage)}
												<div class="flex items-center gap-1 text-xs">
													<iconify-icon icon="bi:translate" width="16"></iconify-icon>
													<span class="font-medium text-tertiary-500 dark:text-primary-500">{currentContentLanguage.toUpperCase()}</span>
													<span class="font-medium {textColor}">({percentage}%)</span>
												</div>
											{/if}

											<!-- Token Status & Validation -->
											{#if typeof fieldValue === 'string' && containsTokens(fieldValue)}
												{@const validation = validateTokenSyntax(fieldValue)}
												<div class="flex items-center gap-1" title={validation.valid ? 'Contains Tokens' : validation.errors.join('\n')}>
													{#if validation.valid}
														<iconify-icon icon="mdi:code-braces" width="14" class="text-primary-500"></iconify-icon>
													{:else}
														<iconify-icon icon="mdi:alert-circle" width="14" class="text-error-500"></iconify-icon>
													{/if}
												</div>
											{/if}

											<!-- Token Trigger -->
											<button
												type="button"
												class="variant-ghost-surface btn-icon btn-icon-sm h-6 w-6"
												title="Insert Token"
												onclick={() => {
													const fieldName = getFieldName(field, false);
													const input = document.getElementById(fieldName);
													if (input) {
														activeInputStore.set({
															element: input as HTMLInputElement,
															field: {
																name: field.db_fieldName,
																label: field.label,
																collection: collection.value?.name
															}
														});
													} else {
														showToast('Could not find input element for this field', 'warning');
													}
												}}
											>
												<iconify-icon icon="mdi:code-braces" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
											</button>

											<!-- Icon for field type -->
											{#if field.icon}
												<iconify-icon icon={field.icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
											{/if}
										</div>
									</div>

									{#if field.widget}
										{@const widgetName = field.widget.Name}
										{@const widgetPath =
											widgetFunctions[widgetName]?.componentPath ||
											widgetFunctions[widgetName.charAt(0).toLowerCase() + widgetName.slice(1)]?.componentPath ||
											widgetFunctions[widgetName.toLowerCase()]?.componentPath}
										{@const WidgetComponent = widgetPath && widgetPath in modules ? modules[widgetPath]?.default : null}

										{#if WidgetComponent}
											{@const fieldName = getFieldName(field, false)}
											{#key currentContentLanguage}
												<!-- Widget remounts when currentContentLanguage changes -->
												<!-- Widgets read contentLanguage from store, not props -->
												<WidgetComponent {field} WidgetData={{}} bind:value={currentCollectionValue[fieldName]} {tenantId} />
											{/key}
										{:else}
											<p class="text-error-500">{m.Fields_no_widgets_found({ name: widgetName })}</p>
										{/if}
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			</div>
		{:else if localTabSet === 1}
			<div class="p-4">
				{#if revisions.length === 0}
					<p class="p-4 text-center text-surface-500">No revision history found for this entry.</p>
				{:else}
					<div class="mb-4 flex items-center justify-between gap-4">
						<select class="select flex-grow" bind:value={selectedRevisionId}>
							<option value="" disabled>-- Select a revision to compare --</option>
							{#each revisions as revision (revision._id)}
								<option value={revision._id}>
									{new Date(revision.revision_at).toLocaleString()} by {revision.revision_by.substring(0, 8)}...
								</option>
							{/each}
						</select>
						<button class="variant-filled-primary btn" onclick={handleRevert} disabled={!selectedRevision?.data}>
							<iconify-icon icon="mdi:restore" class="mr-1"></iconify-icon> Revert
						</button>
					</div>

					<div class="rounded-lg border p-4 dark:border-surface-700">
						<h3 class="mb-3 text-lg font-bold">Changes from Selected Revision</h3>
						{#if selectedRevision}
							{@const diffObject = selectedRevision?.diff || null}
							{#if diffObject && Object.keys(diffObject).length > 0}
								<div class="space-y-3 font-mono text-sm">
									{#each Object.entries(diffObject) as [key, change]}
										{@const ch = change as any}
										<div>
											<strong class="font-bold text-surface-600 dark:text-surface-300">{key}:</strong>
											{#if ch.status === 'modified'}
												<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2">
													<span class="text-error-700 dark:text-error-300">- {JSON.stringify(ch.old)}</span>
												</div>
												<div class="mt-1 rounded border border-success-500/30 bg-success-500/10 p-2">
													<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(ch.new)}</span>
												</div>
											{:else if ch.status === 'added'}
												<div class="mt-1 rounded border border-success-500/30 bg-success-500/10 p-2">
													<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(ch.value)}</span>
												</div>
											{:else if ch.status === 'deleted'}
												<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2">
													<span class="text-error-700 dark:text-error-300">- {JSON.stringify(ch.value)}</span>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{:else if selectedRevisionId}
								<p class="text-center text-surface-500">No differences found.</p>
							{:else}
								<p class="text-center text-surface-500">Select a revision to see what's changed.</p>
							{/if}
						{:else}
							<p class="text-center text-surface-500">Select a revision to see what's changed.</p>
						{/if}
					</div>
				{/if}
			</div>
		{:else if localTabSet === 2}
			{@const hostProd = publicEnv?.HOST_PROD || 'https://localhost:5173'}
			{@const entryId = (collectionValue as any).value?._id || 'draft'}
			{@const previewUrl = `${hostProd}?preview=${entryId}`}
			<div class="flex h-[600px] flex-col p-4">
				<div class="mb-4 flex items-center justify-between gap-4">
					<div class="flex flex-1 items-center gap-2">
						<iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<input type="text" class="input flex-grow text-sm" readonly value={previewUrl} />
						<button class="variant-ghost-surface btn btn-sm" use:clipboard={previewUrl} aria-label="Copy preview URL">
							<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
						</button>
					</div>
					<a href={previewUrl} target="_blank" rel="noopener noreferrer" class="variant-filled-primary btn btn-sm">
						<iconify-icon icon="mdi:open-in-new" width="16" class="mr-1"></iconify-icon>
						Open
					</a>
				</div>

				<div class="flex-1 overflow-hidden rounded-lg border border-surface-300 dark:border-surface-700">
					<iframe src={previewUrl} title="Live Preview" class="h-full w-full" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
					></iframe>
				</div>

				<div class="mt-2 text-center text-xs text-surface-500">
					Preview URL: {hostProd}?preview={entryId}
				</div>
			</div>
		{:else if localTabSet === 3}
			<div class="space-y-4 p-4">
				<div class="flex items-center gap-2">
					<input type="text" class="input flex-grow" readonly value={apiUrl} />
					<button class="variant-ghost-surface btn" use:clipboard={apiUrl}>Copy</button>
				</div>
				<CodeBlock language="json" code={JSON.stringify((collectionValue as any).value, null, 2)} />
			</div>
		{/if}
	</svelte:fragment>
</TabGroup>

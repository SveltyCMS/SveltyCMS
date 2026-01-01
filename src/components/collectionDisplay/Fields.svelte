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
	import { translationProgress, contentLanguage, dataChangeStore, validationStore } from '@stores/store.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import type { Locale } from '@src/paraglide/runtime';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	// import { CodeBlock, Tab, TabGroup, clipboard } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '@stores/store.svelte';
	import { showConfirm } from '@utils/modalState.svelte';

	import { widgetFunctions as widgetFunctionsStore } from '@stores/widgetStore.svelte';

	// --- PERFORMANCE FIX: DYNAMIC WIDGET IMPORTS ---
	// Lazy-load widgets for code-splitting (eager: false is default)
	// Returns loader functions instead of eager-loaded components
	const modules: Record<string, () => Promise<{ default: any }>> = import.meta.glob('/src/widgets/**/*.svelte') as Record<
		string,
		() => Promise<{ default: any }>
	>;

	// Import async widget loader component
	import WidgetLoader from './WidgetLoader.svelte';
	import { activeInputStore } from '@stores/activeInputStore.svelte';

	// Token Picker
	// Token Picker

	function openTokenPicker(field: any, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		// Fallback: Try to find the input by ID (using db_fieldName as ID)
		const id = field.db_fieldName;
		const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
		if (el) {
			el.focus();
			activeInputStore.set({ element: el, field }); // Explicitly open picker on button click
		} else {
			console.warn('Could not find input for field', field);
		}
	}
	// --- END PERFORMANCE FIX ---

	let widgetFunctions = $state<Record<string, any>>({});
	$effect(() => {
		const unsubscribe = widgetFunctionsStore.subscribe((value) => {
			widgetFunctions = value;
		});
		return unsubscribe;
	});

	// --- 1. RECEIVE DATA AS PROPS ---
	let {
		fields,
		revisions = []
		// contentLanguage prop received but not directly used - widgets access contentLanguage store
	} = $props<{
		fields?: NonNullable<(typeof collection)['value']>['fields'];
		revisions?: any[];
		contentLanguage?: string; // Passed for documentation, widgets use store directly
	}>();

	// --- 2. SIMPLIFIED STATE ---
	let localTabSet = $state('0');
	let apiUrl = $state('');

	// This is form state, not fetched data, so it remains.
	let currentCollectionValue = $state<Record<string, any>>({});

	// Revisions State (now simpler)
	let selectedRevisionId = $state('');

	// Track the last entry ID to detect when switching entries
	let lastEntryId = $state<string | undefined>(undefined);

	// Track current content language for reactivity
	let currentContentLanguage = $state<Locale>(contentLanguage.value as Locale);

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
	let selectedRevision = $derived(revisions.find((r: any) => r._id === selectedRevisionId) || null);

	// --- 4. SIMPLIFIED LOGIC ---
	let derivedFields = $derived(fields || []);

	// Get translation progress
	let currentTranslationProgress = $derived(translationProgress.value);

	// Track changes to translation progress for debugging
	$effect(() => {
		logger.debug('Translation progress updated:', {
			showProgress: translationProgress.value?.show,
			languages: Object.keys(translationProgress.value || {}).filter((k) => k !== 'show')
		});
	});

	// Get available languages
	let availableLanguages = $derived.by<Locale[]>(() => {
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

	let filteredFields = $derived(
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
		const global = collectionValue.value as Record<string, unknown> | undefined;
		const globalId = (global as any)?._id;

		// When a new entry is loaded (different ID), pull from global -> local
		if (globalId && globalId !== lastEntryId) {
			logger.debug('Loading entry data:', globalId);
			currentCollectionValue = { ...global } as any;
			lastEntryId = globalId;
			// Set initial snapshot for change tracking
			dataChangeStore.setInitialSnapshot(global as Record<string, any>);
			return;
		}

		// If creating new entry (no ID), initialize with global state
		if (!globalId && !lastEntryId && global && Object.keys(global).length > 0) {
			logger.debug('Initializing new entry');
			currentCollectionValue = { ...global } as any;
			// Set initial snapshot for change tracking
			dataChangeStore.setInitialSnapshot(global as Record<string, any>);
			return;
		}

		// Otherwise, push local changes to global (user is editing)
		// Use untrack to read currentCollectionValue without creating a dependency loop
		const local = untrack(() => currentCollectionValue) as Record<string, unknown> | undefined;
		if (local && Object.keys(local).length > 0) {
			const currentDataStr = JSON.stringify(local);
			const globalDataStr = JSON.stringify(global ?? {});
			if (currentDataStr !== globalDataStr) {
				logger.debug('Pushing local changes to global store');
				untrack(() => setCollectionValue({ ...local }));
				// Track changes for save button state
				dataChangeStore.compareWithCurrent(local as Record<string, any>);
			}
		}
	});

	// Separate effect to detect changes in currentCollectionValue and sync to store
	// This is needed because the widget bind:value updates currentCollectionValue
	let lastLocalValueStr = $state<string>('');
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
				dataChangeStore.compareWithCurrent(currentCollectionValue as Record<string, any>);
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
				toaster.info({ description: 'Content reverted. Please save your changes.' });
				localTabSet = '0';
			}
		});
	}

	// --- 6. VALIDATION LOGIC ---
	// Reactively validate fields whenever values change
	$effect(() => {
		const values = currentCollectionValue; // React to value changes

		// Iterate over fields to validate them
		filteredFields.forEach((field: any) => {
			if (field.required) {
				const fieldName = getFieldName(field, false);
				const value = values[fieldName];

				// Check for empty values
				// Handle various types: string, array, null, undefined
				const isEmpty =
					value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);

				if (isEmpty) {
					// Only set error if it's not already set to avoid loop (though store handles this)
					if (!validationStore.hasError(fieldName)) {
						validationStore.setError(fieldName, `${field.label || fieldName} is required`);
					}
				} else {
					if (validationStore.hasError(fieldName)) {
						validationStore.clearError(fieldName);
					}
				}
			}
		});
	});

	$effect(() => {
		if ((collectionValue as any).value?._id) {
			apiUrl = `${location.origin}/api/collection/${collection.value?._id}/${(collectionValue as any).value._id}`;
		}
	});
</script>

<Tabs value={localTabSet} onValueChange={(e) => (localTabSet = e.value)} class="flex flex-1 flex-col items-center">
	<Tabs.List
		class="flex justify-between md:justify-around rounded-tl-container rounded-tr-container border-b border-tertiary-500 dark:border-primary-500 w-full"
	>
		<Tabs.Trigger value="0" class="flex-1">
			<div class="flex items-center justify-center gap-2 py-2">
				<iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				{m.button_edit()}
			</div>
		</Tabs.Trigger>

		{#if collection.value?.revision}
			<Tabs.Trigger value="1" class="flex-1">
				<div class="flex items-center justify-center gap-2 py-2">
					<iconify-icon icon="mdi:history" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					{m.applayout_version()} <span class="preset-filled-secondary-500 badge">{revisions.length}</span>
				</div>
			</Tabs.Trigger>
		{/if}

		{#if collection.value?.livePreview}
			<Tabs.Trigger value="2" class="flex-1">
				<div class="flex items-center justify-center gap-2 py-2">
					<iconify-icon icon="mdi:eye-outline" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					{m.Fields_preview()}
				</div>
			</Tabs.Trigger>
		{/if}

		{#if user?.isAdmin}
			<Tabs.Trigger value="3" class="flex-1">
				<div class="flex items-center justify-center gap-2 py-2">
					<iconify-icon icon="mdi:api" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					API
				</div>
			</Tabs.Trigger>
		{/if}
	</Tabs.List>

	<Tabs.Content value="0" class="w-full">
		<div class="mb-2 text-center text-xs text-error-500">{m.form_required()}</div>
		<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
			<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
				{#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
					{#if rawField.widget}
						{@const field = ensureFieldProperties(rawField)}
						<div
							class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:w-full!'}"
							style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
						>
							<div class="flex items-center justify-between gap-2 px-[5px] text-start field-label">
								<!-- Field label -->
								<div class="flex items-center gap-2">
									<p class="inline-block font-semibold capitalize">
										{field.label || field.db_fieldName}
										{#if field.required}<span class="text-error-500">*</span>{/if}
									</p>
								</div>
								<div class="flex items-center gap-2">
									<button
										type="button"
										onclick={(e) => openTokenPicker(field, e)}
										class=""
										title="Insert Token"
										aria-label="Insert token into {field.label}"
									>
										<iconify-icon icon="mdi:code-braces" width="16" class="font-bold text-tertiary-500 dark:text-primary-500"></iconify-icon>
									</button>
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
									<!-- Icon for field type -->
									{#if field.icon}
										<iconify-icon icon={field.icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
									{/if}
								</div>
							</div>

							{#if field.widget}
								{@const widgetName = field.widget.Name}

								<!-- --- PERFORMANCE FIX: ROBUST WIDGET FINDER --- -->
								{@const loadedWidget = (() => {
									// 1. Try exact path from widget store (fastest)
									const storePath = widgetFunctions[widgetName]?.componentPath;
									if (storePath && storePath in modules) return modules[storePath];

									// 2. Try casing variations from store
									const camelPath = widgetFunctions[widgetName.charAt(0).toLowerCase() + widgetName.slice(1)]?.componentPath;
									if (camelPath && camelPath in modules) return modules[camelPath];

									const lowerPath = widgetFunctions[widgetName.toLowerCase()]?.componentPath;
									if (lowerPath && lowerPath in modules) return modules[lowerPath];

									// 3. Robust Search in modules (fallback)
									const normalized = widgetName.toLowerCase();
									for (const path in modules) {
										const lowerPath = path.toLowerCase();
										const parts = lowerPath.split('/');
										const fileName = parts.pop();
										const folderName = parts.pop();

										// A. Match 3-Pillar Structure: /WidgetName/Input.svelte
										// IMPORTANT: Enforce folder name matches widget name to avoid matching other widgets' Input.svelte
										if (folderName === normalized && fileName === 'input.svelte') return modules[path];

										// B. Match 3-Pillar Index: /WidgetName/index.svelte
										if (folderName === normalized && fileName === 'index.svelte') return modules[path];

										// C. Match Single File: /WidgetName.svelte
										// EXCEPTION: Do not loosely match "Input.svelte" as it causes collisions with standard 3-pillar components
										if (fileName === `${normalized}.svelte` && normalized !== 'input') return modules[path];
									}
									return null;
								})()}

								{#if loadedWidget}
									{@const fieldName = getFieldName(field, false)}
									{#key currentContentLanguage}
										<!-- Widget remounts when currentContentLanguage changes -->
										<WidgetLoader loader={loadedWidget} {field} WidgetData={{}} bind:value={currentCollectionValue[fieldName]} {tenantId} />
									{/key}
								{:else}
									<p class="text-error-500">{m.Fields_no_widgets_found({ name: widgetName })}</p>
								{/if}
								<!-- --- END PERFORMANCE FIX --- -->
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</Tabs.Content>
	<Tabs.Content value="1" class="w-full">
		<div class="p-4">
			{#if revisions.length === 0}
				<p class="p-4 text-center text-surface-500">No revision history found for this entry.</p>
			{:else}
				<div class="mb-4 flex items-center justify-between gap-4">
					<select class="select grow" bind:value={selectedRevisionId}>
						<option value="" disabled>-- Select a revision to compare --</option>
						{#each revisions as revision (revision._id)}
							<option value={revision._id}>
								{new Date(revision.revision_at).toLocaleString()} by {revision.revision_by.substring(0, 8)}...
							</option>
						{/each}
					</select>
					<button class="preset-filled-primary-500 btn" onclick={handleRevert} disabled={!selectedRevision?.data}>
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
	</Tabs.Content>
	<Tabs.Content value="2" class="w-full">
		{@const hostProd = publicEnv?.HOST_PROD || 'https://localhost:5173'}
		{@const entryId = (collectionValue as any).value?._id || 'draft'}
		{@const previewUrl = `${hostProd}?preview=${entryId}`}
		<div class="flex h-[600px] flex-col p-4">
			<div class="mb-4 flex items-center justify-between gap-4">
				<div class="flex flex-1 items-center gap-2">
					<iconify-icon icon="mdi:open-in-new" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<input type="text" class="input grow text-sm" readonly value={previewUrl} />
					<button
						class="preset-ghost-surface-500 btn btn-sm"
						onclick={() => {
							navigator.clipboard.writeText(previewUrl);
							toaster.success({ description: 'Preview URL Copied' });
						}}
						aria-label="Copy preview URL"
					>
						<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
					</button>
				</div>
				<a href={previewUrl} target="_blank" rel="noopener noreferrer" class="preset-filled-primary-500 btn btn-sm">
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
	</Tabs.Content>
	<Tabs.Content value="3" class="w-full">
		<div class="space-y-4 p-4">
			<div class="flex items-center gap-2">
				<input type="text" class="input grow" readonly value={apiUrl} />
				<button
					class="preset-ghost-surface-500 btn"
					onclick={() => {
						navigator.clipboard.writeText(apiUrl);
						toaster.success({ description: 'API URL Copied' });
					}}>Copy</button
				>
			</div>
			<div class="card p-4 overflow-x-auto bg-surface-800 text-white font-mono text-sm max-h-[500px]">
				<pre>{JSON.stringify((collectionValue as any).value, null, 2)}</pre>
			</div>
		</div>
	</Tabs.Content>
</Tabs>

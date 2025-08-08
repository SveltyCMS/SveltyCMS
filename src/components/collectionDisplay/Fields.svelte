<!--
@file src/components/collectionDisplay/Fields.svelte
@component
**Fields component that renders collection fields for data entry and provides revision history.**

@example
<Fields />

### Props
- `fields` {NonNullable<typeof collection.value>['fields']} - Collection fields
- `ariaInvalid` {boolean} - Aria-invalid attribute for accessibility
- `ariaDescribedby` {string} - Aria-describedby attribute for accessibility

### Features
- Dynamic field rendering based on collection schema
- Tab-based interface for different views (Edit, Revision, Live Preview, API)
- Real-time translation progress updates
- Permission-based field filtering
- Integration with various widget types
-->

<script lang="ts">
	import { untrack } from 'svelte';
	import { getFieldName } from '@utils/utils';
	import { getRevisions, getRevisionDiff } from '@utils/apiClient'; // Improved API client

	// Auth & Page data

	import { page } from '$app/state';
	const user = $derived(page.data?.user);
	const tenantId = $derived(page.data?.tenantId); // Get tenantId for multi-tenancy
	const collectionName = $derived(page.params?.collection);

	// Stores
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress } from '@stores/store.svelte';

	// Config
	import { publicEnv } from '@root/config/public';
	import type { Locale } from '@src/paraglide/runtime';

	// Content processing
	import { processModule } from '@src/content/utils';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { CodeBlock, Tab, TabGroup, clipboard, getToastStore, getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Components
	import Loading from '@components/Loading.svelte';
	import { widgetFunctions, ensureWidgetsInitialized } from '@src/widgets';
	import { onMount } from 'svelte'; // Dynamic import of all widget components using Vite's glob import

	// Dynamic import of all widget components using Vite's glob import
	const modules: Record<string, { default: any }> = import.meta.glob('/src/widgets/**/*.svelte', {
		eager: true
	});

	// Initialize widgets on mount
	onMount(async () => {
		await ensureWidgetsInitialized();
	}); // Props
	let { fields = undefined } = $props<{
		fields?: NonNullable<typeof collection.value>['fields'];
	}>();

	// Component State
	let apiUrl = $state('');
	let isLoading = $state(true);
	let localTabSet = $state(0);
	// Revisions State
	let revisionsMeta = $state<any[]>([]);
	let isRevisionsLoading = $state(false);
	let selectedRevisionId = $state('');
	let selectedRevisionData = $state<Record<string, any> | null>(null);
	let isRevisionDetailLoading = $state(false);
	let diffObject = $state<Record<string, any> | null>(null);
	// Processed collection with evaluated fields (fixes the missing fields issue)

	let processedCollection = $state<any>(null);
	let fieldsFromModule = $state<any[]>([]);
	// Process collection module to get actual fields

	$effect(() => {
		if (collection.value && (collection.value as any)?.module && !processedCollection) {
			untrack(async () => {
				try {
					const processed = await processModule((collection.value as any).module);
					if (processed?.schema?.fields) {
						processedCollection = processed.schema;
						fieldsFromModule = processed.schema.fields;
					}
				} catch (error) {
					console.error('Failed to process collection module:', error);
				}
			});
		}
	});
	// Derived state for fields - combines all possible field sources

	let derivedFields = $derived(fields || fieldsFromModule || collection.value?.fields || []);
	// Persistent form data that survives tab switches (from old working code)

	let formDataSnapshot = $state<Record<string, any>>({});
	let isFormDataInitialized = $state(false);
	// Use a single local state for form data, initialized from the global store

	let currentCollectionValue = $state<Record<string, any>>({});
	// Reactive function to get default collection value

	let defaultCollectionValue = $derived.by(() => {
		const tempCollectionValue: Record<string, any> = collectionValue?.value ? { ...collectionValue.value } : {};
		for (const field of derivedFields) {
			const safeField = ensureFieldProperties(field);
			const fieldName = getFieldName(safeField, false);
			if (!Object.prototype.hasOwnProperty.call(tempCollectionValue, fieldName)) {
				// Initialize with proper default value based on field type
				tempCollectionValue[fieldName] = field.translated ? {} : '';
			}
		}
		return tempCollectionValue;
	});
	// Ensure fields have required properties

	function ensureFieldProperties(field: any) {
		if (!field) return null;
		return {
			...field,
			db_fieldName: field.db_fieldName || getFieldName(field, true),
			widget: field.widget || { Name: field.type || 'Input' },
			permissions: field.permissions || {}
		};
	}
	// Filter fields based on user permissions

	let filteredFields = $derived(
		derivedFields
			.map(ensureFieldProperties)
			.filter(Boolean)
			.filter((field: any) => {
				// Always show fields if no permissions are set or user is admin
				if (!field.permissions) return true;
				if (page.data?.isAdmin) return true; // Check specific role permissions

				const userRole = user?.role;
				if (!userRole) return true; // Show all fields if no role defined

				const rolePermissions = field.permissions[userRole];
				return !rolePermissions || rolePermissions.read !== false;
			})
	); // Update translation progress when data changes

	$effect(() => {
		const currentCollectionValue = collectionValue.value;
		const fields = collection.value?.fields;

		if (!fields || !currentCollectionValue) return;

		// This is the logic from the deleted `updateTranslationProgress` function,
		// now correctly placed within a component's effect.
		const progress = { ...translationProgress.value }; // Create a mutable copy
		let hasUpdates = false;

		for (const field of fields) {
			if (field.translated) {
				const fieldName = `${collection.value.name}.${getFieldName(field)}`;
				const dbFieldName = getFieldName(field, false);
				const fieldValue = currentCollectionValue[dbFieldName];

				for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES as Locale[]) {
					if (!progress[lang]) continue;
					const langValue = fieldValue?.[lang];
					const isTranslated =
						langValue !== null && langValue !== undefined && (typeof langValue === 'string' ? langValue.trim() !== '' : Boolean(langValue));

					const wasTranslated = progress[lang]!.translated.has(fieldName);

					if (isTranslated && !wasTranslated) {
						progress[lang]!.translated.add(fieldName);
						hasUpdates = true;
					} else if (!isTranslated && wasTranslated) {
						progress[lang]!.translated.delete(fieldName);
						hasUpdates = true;
					}
				}
			}
		}

		if (hasUpdates) {
			// Correctly update the rune by assigning to its .value
			translationProgress.value = progress;
		}
	});

	// Update the main collection value store when form data changes (debounced)
	let updateTimeout: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (isFormDataInitialized && localTabSet === 0 && currentCollectionValue && Object.keys(currentCollectionValue).length > 0) {
			if (updateTimeout) clearTimeout(updateTimeout);
			updateTimeout = setTimeout(() => {
				collectionValue.update((current) => ({
					...current,
					...currentCollectionValue
				}));
			}, 300);
		}
	});

	// --- Revision Logic ---

	async function fetchRevisionsMeta() {
		if (!collection.value?._id || !collectionValue.value?._id) return;
		isRevisionsLoading = true;
		try {
			const collectionId = String(collection.value._id);
			const entryId = String(collectionValue.value._id);
			const result = await getRevisions(collectionId, entryId, { metaOnly: true });
			if (result.success) {
				revisionsMeta = result.data || [];
			} else {
				toastStore.trigger({ message: `Error: ${result.error}`, background: 'variant-filled-error' });
			}
		} finally {
			isRevisionsLoading = false;
		}
	}

	async function fetchAndCompareRevision(revisionId: string) {
		if (!revisionId || !collection.value?._id || !collectionValue.value?._id) return;
		isRevisionDetailLoading = true;
		diffObject = null;
		selectedRevisionData = null;
		try {
			const collectionId = String(collection.value._id);
			const entryId = String(collectionValue.value._id);
			const result = await getRevisionDiff({
				collectionId: collectionId,
				entryId: entryId,
				revisionId: revisionId,
				currentData: collectionValue.value
			});

			if (result.success && result.data) {
				diffObject = result.data.diff;
				selectedRevisionData = result.data.revisionData;
			} else {
				throw new Error(result.error || 'Failed to fetch revision diff.');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			toastStore.trigger({ message: `Error loading revision diff: ${errorMessage}`, background: 'variant-filled-error' });
		} finally {
			isRevisionDetailLoading = false;
		}
	}

	function handleRevert() {
		if (!selectedRevisionData) return;

		const modal: ModalSettings = {
			type: 'confirm',
			title: 'Confirm Revert',
			body: 'Are you sure you want to revert to this version? Any unsaved changes will be lost.',
			response: (confirmed: boolean) => {
				if (confirmed) {
					const revertData = { ...selectedRevisionData, _id: collectionValue.value._id };
					collectionValue.set(revertData);
					toastStore.trigger({ message: 'Content reverted. Please save your changes.', background: 'variant-filled-success' });
					localTabSet = 0;
				}
			},
			buttonTextConfirm: 'Revert'
		};
		modalStore.trigger(modal);
	}

	// --- Effects ---
	$effect(() => {
		isLoading = false;
	});

	// Initialize form data when the entry changes or fields become available
	$effect(() => {
		if (!isFormDataInitialized && collectionValue.value && derivedFields.length > 0) {
			formDataSnapshot = { ...collectionValue.value };
			// Ensure all fields have proper initial values
			const initialValue = { ...defaultCollectionValue };
			// Double-check that all derived fields have values
			for (const field of derivedFields) {
				const safeField = ensureFieldProperties(field);
				const fieldName = getFieldName(safeField, false);
				if (initialValue[fieldName] === undefined) {
					initialValue[fieldName] = field.translated ? {} : '';
				}
			}
			currentCollectionValue = initialValue;
			isFormDataInitialized = true;
		}
	}); // Form data persistence across tab switches

	// Form data persistence across tab switches (from old working code)
	$effect(() => {
		if (isFormDataInitialized && localTabSet === 0 && currentCollectionValue) {
			// Only sync when on edit tab to avoid unnecessary updates
			formDataSnapshot = { ...untrack(() => formDataSnapshot), ...currentCollectionValue };
		} else if (localTabSet !== 0 && isFormDataInitialized && Object.keys(formDataSnapshot).length > 0) {
			// Merge snapshot data back into currentCollectionValue when returning to edit tab
			const updatedValue = { ...currentCollectionValue };
			for (const field of derivedFields) {
				const safeField = ensureFieldProperties(field);
				const fieldName = getFieldName(safeField, false);
				if (Object.prototype.hasOwnProperty.call(formDataSnapshot, fieldName)) {
					updatedValue[fieldName] = formDataSnapshot[fieldName];
				}
			}
			currentCollectionValue = updatedValue;
		}
	});

	// Initialize local state from global store when it changes
	$effect(() => {
		const globalData = collectionValue.value;
		if (globalData && Object.keys(globalData).length > 0 && isFormDataInitialized) {
			currentCollectionValue = { ...globalData };
		}
	});

	$effect(() => {
		if (collectionValue.value?._id) {
			apiUrl = `${location.origin}/api/collection/${collection.value?._id}/${collectionValue.value._id}`;
		}
	});

	$effect(() => {
		if (localTabSet === 1 && revisionsMeta.length === 0) {
			fetchRevisionsMeta();
		}
	});

	$effect(() => {
		if (selectedRevisionId) {
			fetchAndCompareRevision(selectedRevisionId);
		} else {
			diffObject = null;
			selectedRevisionData = null;
		}
	});
</script>

{#if isLoading}
	<Loading />
{:else}
	<TabGroup
		justify="{collection.value?.revision === true ? 'justify-between md:justify-around' : 'justify-center '} items-center"
		rounded="rounded-tl-container-token rounded-tr-container-token"
		flex="flex-1 items-center"
		active="border-b border-tertiary-500 dark:border-primary-500 variant-soft-secondary"
		hover="hover:variant-soft-secondary"
		bind:group={localTabSet}
	>
		<Tab bind:group={localTabSet} name="edit" value={0}>
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				{m.fields_edit()}
			</div>
		</Tab>

		{#if collection.value?.revision}
			<Tab bind:group={localTabSet} name="revisions" value={1}>
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:history" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					{m.applayout_version()} <span class="variant-filled-secondary badge">{revisionsMeta.length}</span>
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
			{#if localTabSet === 0}
				<div class="mb-2 text-center text-xs text-error-500">{m.fields_required()}</div>
				<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
					{#if isFormDataInitialized}
						<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
							{#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
								{#if rawField.widget}
									{@const field = ensureFieldProperties(rawField)}
									<div
										class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
										style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
									>
										<!-- Widget label -->
										<div class="flex justify-between px-[5px] text-start">
											<p class="inline-block font-semibold capitalize">
												{field.label || field.db_fieldName}
												{#if field.required}<span class="text-error-500">*</span>{/if}
											</p>

											<div class="flex gap-2">
												{#if field.translated}
													<div class="flex items-center gap-1 px-2">
														<iconify-icon icon="bi:translate" color="dark" width="18" class="text-sm"></iconify-icon>
														<div class="text-xs font-normal text-error-500">
															{contentLanguage.value?.toUpperCase() ?? 'EN'}
														</div>
														<!-- Display translation progress -->
														<div class="text-xs font-normal">
															({Math.round(
																translationProgress.value[contentLanguage.value]?.translated.has(
																	`${String(collection.value?.name)}.${getFieldName(field)}`
																)
																	? 100
																	: 0
															)}%)
														</div>
													</div>
												{/if}

												{#if field.icon}
													<iconify-icon icon={field.icon} color="dark" width="22"></iconify-icon>
												{/if}
											</div>
										</div>

										<!-- Widget Input -->
										{#if field.widget}
											{@const widgetName = field.widget.Name}
											{@const widgetPath = widgetFunctions().get(widgetName)?.componentPath}
											{@const WidgetComponent = widgetPath && widgetPath in modules ? modules[widgetPath]?.default : null}

											{#if WidgetComponent}
												{@const fieldName = getFieldName(field, false)}
												<WidgetComponent {field} WidgetData={{}} bind:value={currentCollectionValue[fieldName]} {tenantId} />
											{:else}
												<p class="text-error-500">{m.Fields_no_widgets_found({ name: widgetName })}</p>
											{/if}
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						<div class="flex justify-center p-4">
							<Loading />
						</div>
					{/if}
				</div>
			{:else if localTabSet === 1}
				<div class="p-4">
					{#if isRevisionsLoading}
						<div class="flex justify-center p-4"><Loading /></div>
					{:else if revisionsMeta.length === 0}
						<p class="p-4 text-center text-surface-500">No revision history found for this entry.</p>
					{:else}
						<div class="mb-4 flex items-center justify-between gap-4">
							<select class="select flex-grow" bind:value={selectedRevisionId}>
								<option value="" disabled>-- Select a revision to compare --</option>
								{#each revisionsMeta as revision (revision._id)}
									<option value={revision._id}>
										{new Date(revision.revision_at).toLocaleString()} by {revision.revision_by.substring(0, 8)}...
									</option>
								{/each}
							</select>
							<button class="variant-filled-primary btn" onclick={handleRevert} disabled={!selectedRevisionData || isRevisionDetailLoading}>
								<iconify-icon icon="mdi:restore" class="mr-1"></iconify-icon> Revert
							</button>
						</div>

						<div class="rounded-lg border p-4 dark:border-surface-700">
							<h3 class="mb-3 text-lg font-bold">Changes from Selected Revision</h3>
							{#if isRevisionDetailLoading}
								<div class="flex h-48 items-center justify-center"><Loading /></div>
							{:else if diffObject && Object.keys(diffObject).length > 0}
								<div class="space-y-3 font-mono text-sm">
									{#each Object.entries(diffObject) as [key, change]}
										<div>
											<strong class="font-bold text-surface-600 dark:text-surface-300">{key}:</strong>
											{#if change.status === 'modified'}
												<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2">
													<span class="text-error-700 dark:text-error-300">- {JSON.stringify(change.old)}</span>
												</div>
												<div class="mt-1 rounded border border-success-500/30 bg-success-500/10 p-2">
													<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(change.new)}</span>
												</div>
											{:else if change.status === 'added'}
												<div class="mt-1 rounded border border-success-500/30 bg-success-500/10 p-2">
													<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(change.value)}</span>
												</div>
											{:else if change.status === 'deleted'}
												<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2">
													<span class="text-error-700 dark:text-error-300">- {JSON.stringify(change.value)}</span>
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
						</div>
					{/if}
				</div>
			{:else if localTabSet === 2}
				<div class="p-4">Live Preview for {collectionName} coming soon!</div>
			{:else if localTabSet === 3}
				<div class="space-y-4 p-4">
					<div class="flex items-center gap-2">
						<input type="text" class="input flex-grow" readonly value={apiUrl} />
						<button class="variant-ghost-surface btn" use:clipboard={apiUrl}>Copy</button>
					</div>
					<CodeBlock language="json" code={JSON.stringify(collectionValue.value, null, 2)} />
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>
{/if}

<!--
@file src/components/Fields.svelte
@component
**Fields component that renders collection fields to enter/edit & display data per language revision management, live preview, and API data display**

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
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { getFieldName, updateTranslationProgress } from '@utils/utils';
	// Auth
	import { page } from '$app/state';
	const user = page.data.user;

	// Stores
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { CodeBlock, Tab, TabGroup, clipboard, getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Components
	import Loading from '@components/Loading.svelte';
	import { widgetFunctions } from '@src/widgets';
	import { untrack } from 'svelte';

	// Props
	interface Props {
		fields?: NonNullable<typeof collection.value>['fields'] | undefined;
		root?: boolean;
		fieldsData?: Record<string, any>;
		customData?: Record<string, any>;
		value?: any;
		ariaInvalid?: boolean;
		ariaDescribedby?: string;
	}

	let { fields = undefined }: Props = $props();

	// Local state - use consistent naming with localTabSet
	let apiUrl = $state('');
	let isLoading = $state(true);
	let localTabSet = $state(0);
	let tabValue = $state(0);

	// --- REVISIONS STATE ---
	let revisionsMeta = $state<any[]>([]); // Stores only metadata (_id, date, user)
	let isRevisionsLoading = $state(false); // For the initial list loading
	let selectedRevisionId = $state(''); // The ID of the revision selected in the dropdown
	let selectedRevisionData = $state<Record<string, any> | null>(null); // The FULL data of the selected revision
	let isRevisionDetailLoading = $state(false); // For loading the full data of a single revision
	let diffObject = $state<Record<string, any> | null>(null); // Holds the structured diff from the server

	// Derived state
	let derivedFields = $derived.by(() => {
		return fields || (collection.value?.fields ?? []);
	});

	// Persistent form data that survives tab switches
	let formDataSnapshot = $state<Record<string, any>>({});
	let isFormDataInitialized = $state(false);

	function getDefaultCollectionValue(fields: any[]) {
		const tempCollectionValue: Record<string, any> = collectionValue?.value ? { ...collectionValue.value } : {};
		for (const field of fields) {
			const fieldName = getFieldName(field, false);
			if (!Object.prototype.hasOwnProperty.call(tempCollectionValue, fieldName)) {
				tempCollectionValue[fieldName] = {};
			}
		}
		return tempCollectionValue;
	}

	let currentCollectionValue = $state(getDefaultCollectionValue(fields || (collection.value?.fields ?? [])));
	// Initialize form data snapshot on first load or when collection changes
	$effect.root(() => {
		if (!isFormDataInitialized && collectionValue.value) {
			formDataSnapshot = { ...collectionValue.value };
			currentCollectionValue = getDefaultCollectionValue(derivedFields);
			isFormDataInitialized = true;
		}
	});

	$effect(() => {
		if (isFormDataInitialized && localTabSet === 0) {
			// Only sync when on edit tab to avoid unnecessary updates
			formDataSnapshot = { ...untrack(() => formDataSnapshot), ...currentCollectionValue };
		} else if (localTabSet === 0 && isFormDataInitialized && Object.keys(formDataSnapshot).length > 0) {
			// Merge snapshot data back into currentCollectionValue when returning to edit tab
			for (const field of derivedFields) {
				const fieldName = getFieldName(field, false);
				if (Object.prototype.hasOwnProperty.call(formDataSnapshot, fieldName)) {
					currentCollectionValue[fieldName] = formDataSnapshot[fieldName];
				}
			}
		}
	});

	// Get the collection name from the URL
	const collectionName = page.params.contentTypes;

	// Get the live preview content
	function getLivePreviewContent() {
		return `<div>Live Preview Content for Collection: <span class="font-bold text-tertiary-500 dark:text-primary-500">${collectionName}</span></div>`;
	}

	// Ensure fields have required properties
	function ensureFieldProperties(field: any) {
		if (!field) return null;

		// Create a new object with all required properties
		return {
			...field,
			db_fieldName: field.db_fieldName || getFieldName(field, true),
			widget: field.widget || { Name: field.type || 'Input' },
			permissions: field.permissions || {}
		};
	}

	// Filter and process fields
	let filteredFields = $derived(
		derivedFields
			.map(ensureFieldProperties)
			.filter(Boolean)
			.filter((field) => !field.permissions || !field.permissions[user.role] || field.permissions[user.role].read)
	);

	// Update the main collection value store when form data changes (debounced)
	let updateTimeout: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (isFormDataInitialized && localTabSet === 0) {
			if (updateTimeout) clearTimeout(updateTimeout);
			updateTimeout = setTimeout(() => {
				collectionValue.update((current) => ({
					...current,
					...currentCollectionValue
				}));
			}, 300);
		}
	});

	// Direct sync effect to ensure collectionValue is always in sync with currentCollectionValue
	$effect(() => {
		if (isFormDataInitialized) {
			collectionValue.set(currentCollectionValue);
		}
	});

	$effect(() => {
		currentCollectionValue;
		if (!collection.value?.fields) return;
		for (const field of collection.value?.fields) {
			updateTranslationProgress(currentCollectionValue, field);
		}
	});
	// Dynamic import of widget components
	const modules: Record<string, { default: any }> = import.meta.glob('@widgets/**/*.svelte', {
		eager: true
	});

	// Lifecycle
	$effect(() => {
		isLoading = false;
	});

	$effect(() => {
		if (!collectionValue.value?._id) return;
		apiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/collection/${String(collection.value?._id)}/${collectionValue.value._id}`;
	});

	// REVISIONS LOGIC
	async function fetchRevisionsMeta() {
		if (!collection.value?._id || !collectionValue.value?._id) return;
		isRevisionsLoading = true;
		try {
			const formData = new FormData();
			formData.append('method', 'REVISIONS');
			if (collection.value && collection.value._id) {
				formData.append('collectionId', collection.value._id);
			}
			formData.append('entryId', String(collectionValue.value._id));
			formData.append('metaOnly', 'true');

			const response = await fetch('/api/query', {
				method: 'POST',
				body: formData,
				credentials: 'include'
			});
			if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

			const result = await response.json();
			if (result.success) {
				revisionsMeta = result.data || [];
			} else {
				throw new Error(result.error || 'Failed to fetch revision metadata.');
			}
		} catch (error) {
			toastStore.trigger({
				message: `Error fetching revisions: ${error instanceof Error ? error.message : String(error)}`,
				background: 'variant-filled-error'
			});
			revisionsMeta = [];
		} finally {
			isRevisionsLoading = false;
		}
	}

	async function fetchRevisionDiff(revisionId: string) {
		if (!revisionId) return;
		isRevisionDetailLoading = true;
		diffObject = null;
		try {
			const formData = new FormData();
			formData.append('method', 'REVISIONS');
			formData.append('collectionId', collection.value?._id || '');
			formData.append('entryId', String(collectionValue.value._id));
			formData.append('revisionId', revisionId);
			formData.append('currentData', JSON.stringify(formDataSnapshot));

			const response = await fetch('/api/query', { method: 'POST', body: formData });
			if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

			const result = await response.json();
			if (result.success) {
				diffObject = result.data;
				// To enable revert, we also need the full original data
				const fullRevisionResponse = await fetch('/api/query', {
					method: 'POST',
					body: (() => {
						const fd = new FormData();
						fd.append('method', 'REVISIONS');
						if (collection.value && collection.value._id) {
							fd.append('collectionId', collection.value._id);
						}
						fd.append('entryId', String(collectionValue.value._id));
						fd.append('revisionId', revisionId);
						return fd;
					})()
				});
				const fullResult = await fullRevisionResponse.json();
				if (fullResult.success) {
					selectedRevisionData = fullResult.data;
				}
			} else {
				throw new Error(result.error || 'Failed to fetch revision diff.');
			}
		} catch (error) {
			toastStore.trigger({
				message: `Error loading revision diff: ${error instanceof Error ? error.message : 'Unknown error'}`,
				background: 'variant-filled-error'
			});
		} finally {
			isRevisionDetailLoading = false;
		}
	}

	$effect(() => {
		if (localTabSet === 1 && revisionsMeta.length === 0) {
			fetchRevisionsMeta();
		}
	});

	$effect(() => {
		if (selectedRevisionId) {
			fetchRevisionDiff(selectedRevisionId);
		} else {
			diffObject = null;
		}
	});

	async function handleRevert() {
		if (!selectedRevisionData) {
			toastStore.trigger({ message: 'Could not get revision data to revert. Please try again.', background: 'variant-filled-warning' });
			return;
		}

		try {
			const formData = new FormData();
			formData.append('method', 'PATCH');
			formData.append('collectionId', collection.value?._id || '');
			const revertData = { ...selectedRevisionData, _id: collectionValue.value._id };
			formData.append('data', JSON.stringify(revertData));

			const response = await fetch('/api/query', { method: 'POST', body: formData });
			if (!response.ok) throw new Error('Failed to revert on the server.');

			const result = await response.json();
			if (result.success) {
				collectionValue.set(revertData);
				formDataSnapshot = { ...revertData };
				toastStore.trigger({ message: 'Revert successful!', background: 'variant-filled-success' });
				localTabSet = 0;
			} else {
				throw new Error(result.error || 'Failed to revert.');
			}
		} catch (error) {
			toastStore.trigger({ message: `Revert failed: ${error instanceof Error ? error.message : String(error)}`, background: 'variant-filled-error' });
		}
	}

	function getTabHeaderVisibility() {
		return user.roles !== 'admin' && !collection.value?.revision;
	}
</script>

{#if isLoading}
	<div class="flex h-lvh items-center justify-center lg:justify-start">
		<Loading />
	</div>
{:else}
	<TabGroup
		justify="{collection.value?.revision === true ? 'justify-between md:justify-around' : 'justify-center '} items-center"
		rounded="rounded-tl-container-token rounded-tr-container-token"
		flex="flex-1 items-center"
		active="border-b border-tertiary-500 dark:border-primary-500 variant-soft-secondary"
		hover="hover:variant-soft-secondary"
		regionList={getTabHeaderVisibility() ? 'hidden' : ''}
		value={tabValue}
	>
		<!-- Tab headers -->
		<Tab bind:group={localTabSet} name="tab1" value={0}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="mdi:pen" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
				<p>{m.fields_edit()}</p>
			</div>
		</Tab>

		{#if collection.value?.revision === true}
			<Tab bind:group={localTabSet} name="tab2" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>
						{m.applayout_version()}
						<span class="variant-outline-tertiary badge rounded-full dark:variant-outline-primary">{revisionsMeta.length}</span>
					</p>
				</div>
			</Tab>
		{/if}

		<!-- Other tabs... -->
		{#if collection.value?.livePreview === true}
			<Tab bind:group={localTabSet} name="tab3" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:eye-outline" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>{m.Fields_preview()} Experimental</p>
				</div>
			</Tab>
		{/if}

		{#if user.roles === 'admin'}
			<Tab bind:group={localTabSet} name="tab4" value={3}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ant-design:api-outlined" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>API</p>
				</div>
			</Tab>
		{/if}

		<!-- Tab Panels -->
		<svelte:fragment slot="panel">
			{#if localTabSet === 0}
				<!-- EDIT TAB -->
				<div class="mb-2 text-center text-xs text-error-500">{m.fields_required()}</div>
				<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
					<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
						{#each filteredFields as field (field.db_fieldName || field.id || field.label || field.name)}
							{#if field.widget}
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
													<iconify-icon icon="bi:translate" color="dark" width="18" class="text-sm"> </iconify-icon>
													<div class="text-xs font-normal text-error-500">
														{contentLanguage.value?.toUpperCase() ?? 'EN'}
													</div>
													<!-- Display translation progress -->
													<div class="text-xs font-normal">
														({Math.round(
															translationProgress()[contentLanguage.value]?.translated.has(`${String(collection.value?.name)}.${getFieldName(field)}`)
																? 100
																: 0
														)}%)
													</div>
												</div>
											{/if}

											{#if field.icon}
												<iconify-icon icon={field.icon} color="dark" width="22"> </iconify-icon>
											{/if}
										</div>
									</div>

									<!-- Widget Input -->
									{#if field.widget}
										{@const widgetName = field.widget.Name}
										{@const widgetPath = widgetFunctions().get(widgetName)?.componentPath}
										{@const WidgetComponent = widgetPath && widgetPath in modules ? modules[widgetPath]?.default : null}
										{#if WidgetComponent}
											<WidgetComponent
												{field}
												WidgetData={{}}
												bind:value={
													() => currentCollectionValue[getFieldName(field, false)],
													(v) => {
														const fieldName = getFieldName(field, false);
														// Update currentCollectionValue directly - the $effect will handle persistence
														currentCollectionValue = {
															...currentCollectionValue,
															[fieldName]: v
														};
													}
												}
											/>
										{:else}
											<p>{m.Fields_no_widgets_found({ name: widgetName })}</p>
										{/if}
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{:else if localTabSet === 1}
				<!-- Revision tab content -->
				<div class="p-4">
					{#if isRevisionsLoading}
						<div class="flex justify-center p-4"><Loading /></div>
					{:else if revisionsMeta.length === 0}
						<p class="p-4 text-center">No revision history found for this entry.</p>
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
								Revert to this Version
							</button>
						</div>

						<!-- Diff Render -->
						<div class="rounded-lg border p-4">
							<h3 class="mb-2 text-lg font-bold">Changes from Selected Revision to Current Version</h3>
							{#if isRevisionDetailLoading}
								<div class="flex h-48 items-center justify-center"><Loading /></div>
							{:else if diffObject && Object.keys(diffObject).length > 0}
								<div class="space-y-2 font-mono text-sm">
									{#each Object.entries(diffObject) as [key, change]}
										<div>
											<strong class="font-bold">{key}:</strong>
											{#if change.status === 'modified'}
												<div class="rounded bg-error-500/20 p-2">
													<span class="text-error-700 dark:text-error-300">- {JSON.stringify(change.old)}</span>
												</div>
												<div class="mt-1 rounded bg-success-500/20 p-2">
													<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(change.new)}</span>
												</div>
											{:else if change.status === 'added'}
												<div class="rounded bg-success-500/20 p-2">
													<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(change.value)}</span>
												</div>
											{:else if change.status === 'deleted'}
												<div class="rounded bg-error-500/20 p-2">
													<span class="text-error-700 dark:text-error-300">- {JSON.stringify(change.value)}</span>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{:else if selectedRevisionId}
								<p class="text-center text-surface-500">No differences found between the selected revision and the current version.</p>
							{:else}
								<p class="text-center text-surface-500">Select a revision to see what changed.</p>
							{/if}
						</div>
					{/if}
				</div>
			{:else if localTabSet === 2}
				<!-- LIVE PREVIEW TAB -->
				<div class="p-4">{@html getLivePreviewContent()}</div>
			{:else if localTabSet === 3}
				<!-- API TAB -->
				<div class="space-y-4 p-4">
					<div class="flex items-center gap-2">
						<span class="font-bold">API URL:</span>
						<input type="text" class="input flex-grow" readonly value={apiUrl} />
						<button class="variant-ghost-surface btn" use:clipboard={apiUrl}>Copy</button>
					</div>
					<CodeBlock language="json" code={JSON.stringify(collectionValue.value, null, 2)} />
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>
{/if}

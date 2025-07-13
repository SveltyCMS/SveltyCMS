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

	// Local state
	let apiUrl = $state('');
	let isLoading = $state(true);
	let localTabSet = $state(0);
	let tabValue = $state(0);

	// --- REVISIONS STATE ---
	let revisionsMeta = $state<any[]>([]);
	let isRevisionsLoading = $state(false);
	let selectedRevisionId = $state('');
	let diffObject = $state<Record<string, any> | null>(null);
	let isDiffLoading = $state(false);

	// Derived state
	let derivedFields = $derived.by(() => fields || collection.value?.fields || []);

	// Persistent form data that survives tab switches
	let formDataSnapshot = $state<Record<string, any>>({});
	let isFormDataInitialized = $state(false);

	function getDefaultCollectionValue(fields: any[]) {
		const temp = collectionValue?.value ? { ...collectionValue.value } : {};
		for (const field of fields) {
			const fieldName = getFieldName(field, false);
			if (!Object.prototype.hasOwnProperty.call(temp, fieldName)) {
				temp[fieldName] = {};
			}
		}
		return temp;
	}

	// Use $derived to ensure this value reacts to changes in derivedFields
	let currentCollectionValue = $derived(getDefaultCollectionValue(derivedFields));

	// Initialize form data snapshot on first load or when collection changes
	$effect(() => {
		if (collectionValue.value && !isFormDataInitialized) {
			formDataSnapshot = { ...collectionValue.value };
			isFormDataInitialized = true;
		}
	});

	// Sync data between tabs
	$effect(() => {
		if (localTabSet === 0) {
			// When switching TO the edit tab, restore the snapshot
			currentCollectionValue = { ...formDataSnapshot };
		} else {
			// When switching AWAY from the edit tab, save a snapshot
			formDataSnapshot = { ...untrack(() => currentCollectionValue) };
		}
	});

	// Update the main collectionValue store when form data changes
	$effect(() => {
		if (isFormDataInitialized) {
			collectionValue.set(currentCollectionValue);
		}
	});

	// Update translation progress
	$effect(() => {
		currentCollectionValue; // track changes
		if (!collection.value?.fields) return;
		for (const field of collection.value.fields) {
			updateTranslationProgress(currentCollectionValue, field);
		}
	});

	// Dynamic import of widget components
	const modules: Record<string, { default: any }> = import.meta.glob('@widgets/**/*.svelte', { eager: true });

	// Lifecycle
	$effect(() => {
		isLoading = false;
	});

	$effect(() => {
		if (!collectionValue.value?._id) return;
		apiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/collection/${String(collection.value?._id)}/${collectionValue.value._id}`;
	});

	// --- REVISIONS LOGIC ---

	async function fetchRevisionsMeta() {
		const entryId = collectionValue.value?._id;
		if (!collection.value?._id || !entryId) return;

		isRevisionsLoading = true;
		try {
			const formData = new FormData();
			formData.append('method', 'REVISIONS');
			formData.append('collectionId', collection.value._id);
			formData.append('entryId', String(entryId));
			formData.append('metaOnly', 'true');

			const response = await fetch('/api/query', { method: 'POST', body: formData });
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
		} finally {
			isRevisionsLoading = false;
		}
	}

	async function fetchRevisionDiff(revisionId: string) {
		const entryId = collectionValue.value?._id;
		if (!revisionId || !collection.value?._id || !entryId) return;

		isDiffLoading = true;
		diffObject = null;
		try {
			const formData = new FormData();
			formData.append('method', 'REVISIONS');
			formData.append('collectionId', collection.value._id);
			formData.append('entryId', String(entryId));
			formData.append('revisionId', revisionId);
			formData.append('diffOnly', 'true'); // Ask for the diff

			const response = await fetch('/api/query', { method: 'POST', body: formData });
			if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
			const result = await response.json();
			if (result.success) {
				diffObject = result.data;
			} else {
				throw new Error(result.error || 'Failed to fetch revision diff.');
			}
		} catch (error) {
			toastStore.trigger({
				message: `Error loading revision diff: ${error instanceof Error ? error.message : 'Unknown error'}`,
				background: 'variant-filled-error'
			});
		} finally {
			isDiffLoading = false;
		}
	}

	$effect(() => {
		if (localTabSet === 1) {
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
		const revisionId = selectedRevisionId;
		const entryId = collectionValue.value?._id;
		if (!revisionId || !collection.value?._id || !entryId) {
			toastStore.trigger({ message: 'Cannot revert: missing required IDs.', background: 'variant-filled-warning' });
			return;
		}

		try {
			// 1. Fetch the full data for the revision
			const formData = new FormData();
			formData.append('method', 'REVISIONS');
			formData.append('collectionId', collection.value._id);
			formData.append('entryId', String(entryId));
			formData.append('revisionId', revisionId);

			const response = await fetch('/api/query', { method: 'POST', body: formData });
			if (!response.ok) throw new Error('Could not fetch revision data.');
			const result = await response.json();
			if (!result.success) throw new Error(result.error || 'Failed to fetch revision data.');
			const revisionDataToRevert = result.data;

			// 2. Update the current entry with the revision data
			const updateFormData = new FormData();
			updateFormData.append('method', 'PATCH');
			updateFormData.append('collectionId', collection.value._id);
			const revertData = { ...revisionDataToRevert, _id: entryId };
			updateFormData.append('data', JSON.stringify(revertData));
			updateFormData.append('id', String(entryId));

			const updateResponse = await fetch('/api/query', { method: 'POST', body: updateFormData });
			if (!updateResponse.ok) throw new Error('Failed to save reverted data.');
			const updateResult = await updateResponse.json();

			if (updateResult.success) {
				collectionValue.set(revertData);
				formDataSnapshot = { ...revertData };
				toastStore.trigger({ message: 'Revert successful!', background: 'variant-filled-success' });
				localTabSet = 0;
			} else {
				throw new Error(updateResult.error || 'Failed to save reverted data.');
			}
		} catch (error) {
			toastStore.trigger({
				message: `Revert failed: ${error instanceof Error ? error.message : String(error)}`,
				background: 'variant-filled-error'
			});
		}
	}

	// Filter and process fields
	let filteredFields = $derived(
		derivedFields
			.map((field) => ({
				...field,
				db_fieldName: (field as any).db_fieldName || getFieldName(field, true),
				widget: (field as any).widget || { Name: (field as any).type || 'Input' },
				permissions: (field as any).permissions || {}
			}))
			.filter((field) => !(field as any).permissions[user.role] || (field as any).permissions[user.role].read)
	);

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
		class="items-center {collection.value?.revision === true ? 'justify-between md:justify-around' : 'justify-center'}"
		rounded="rounded-tl-container-token rounded-tr-container-token"
		flex="flex-1"
		active="border-b border-tertiary-500 dark:border-primary-500 variant-soft-secondary"
		hover="hover:variant-soft-secondary"
		regionList={getTabHeaderVisibility() ? 'hidden' : ''}
		bind:value={tabValue}
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
						{#each filteredFields as field (field.db_fieldName || (field as any).id || (field as any).label || (field as any).name)}
							{#if field.widget}
								<div
									class="mx-auto text-center {!(field as any)?.width ? 'w-full ' : 'max-md:!w-full'}"
									style={'min-width:min(300px,100%);' +
										((field as any).width ? `width:calc(${Math.floor(100 / (field as any)?.width)}% - 0.5rem)` : '')}
								>
									<!-- Widget label -->
									<div class="flex justify-between px-[5px] text-start">
										<p class="inline-block font-semibold capitalize">
											{(field as any).label || field.db_fieldName}
											{#if (field as any).required}<span class="text-error-500">*</span>{/if}
										</p>

										<div class="flex gap-2">
											{#if (field as any).translated}
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

											{#if (field as any).icon}
												<iconify-icon icon={(field as any).icon} color="dark" width="22"> </iconify-icon>
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
										{new Date(revision.revision_at).toLocaleString()} by {revision.revision_by?.substring(0, 8) ?? 'N/A'}...
									</option>
								{/each}
							</select>
							<button class="variant-filled-primary btn" onclick={handleRevert} disabled={!selectedRevisionId || isDiffLoading}>
								Revert to this Version
							</button>
						</div>

						<!-- Diff Render -->
						<div class="rounded-lg border p-4">
							<h3 class="mb-2 text-lg font-bold">Changes from Selected Revision to Current Version</h3>
							{#if isDiffLoading}
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
				<div class="p-4">
					{@html `<div>Live Preview Content for Collection: <span class="font-bold text-tertiary-500 dark:text-primary-500">${
						collection.value?.name
					}</span></div>`}
				</div>
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

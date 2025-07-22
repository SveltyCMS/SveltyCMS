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
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { getFieldName, updateTranslationProgress, debounce } from '@utils/utils';
	import { getRevisions, getRevisionDiff } from '@utils/apiClient'; // Improved API client

	// Auth & Page data
	import { page } from '$app/stores';
	const user = $derived(page.data.user);
	const collectionName = $derived(page.params.contentTypes);

	// Stores
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { contentLanguage, translationProgress } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { CodeBlock, Tab, TabGroup, clipboard, getToastStore, getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Components
	import Loading from '@components/Loading.svelte';
	import { widgetFunctions } from '@src/widgets';

	// Props
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

	// Derived state for fields
	let derivedFields = $derived(fields || collection.value?.fields || []);

	// Use a single local state for form data, initialized from the global store
	let currentCollectionValue = $state({ ...collectionValue.value });

	// Debounced effect to update the global store as the user types
	const debouncedUpdateCollectionValue = debounce((value) => {
		collectionValue.set(value);
	}, 300);

	$effect(() => {
		// This runs whenever currentCollectionValue changes, but the update is debounced
		debouncedUpdateCollectionValue(currentCollectionValue);
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
			.filter((field) => !field.permissions || !field.permissions[user.role] || field.permissions[user.role].read)
	);

	// Update translation progress when data changes
	$effect(() => {
		if (!collection.value?.fields) return;
		for (const field of collection.value.fields) {
			updateTranslationProgress(currentCollectionValue, field);
		}
	});

	// --- Revision Logic ---

	async function fetchRevisionsMeta() {
		if (!collection.value?._id || !collectionValue.value?._id) return;
		isRevisionsLoading = true;
		try {
			const result = await getRevisions(collection.value._id, collectionValue.value._id, { metaOnly: true });
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
			const result = await getRevisionDiff({
				collectionId: collection.value._id,
				entryId: collectionValue.value._id,
				revisionId: revisionId,
				currentData: currentCollectionValue
			});

			if (result.success) {
				diffObject = result.data.diff;
				selectedRevisionData = result.data.revisionData;
			} else {
				throw new Error(result.error || 'Failed to fetch revision diff.');
			}
		} catch (error) {
			toastStore.trigger({ message: `Error loading revision diff: ${error.message}`, background: 'variant-filled-error' });
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
					currentCollectionValue = revertData;
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
		justify="justify-between"
		class="md:justify-around"
		active="border-b-2 border-primary-500 text-primary-500"
		hover="hover:variant-soft-surface"
		bind:value={localTabSet}
	>
		<Tab name="edit" value={0}>
			<div class="flex items-center gap-2"><iconify-icon icon="mdi:pen" width="20"></iconify-icon> {m.fields_edit()}</div>
		</Tab>

		{#if collection.value?.revision}
			<Tab name="revisions" value={1}>
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:history" width="20"></iconify-icon>
					{m.applayout_version()}
					<span class="variant-filled-secondary badge">{revisionsMeta.length}</span>
				</div>
			</Tab>
		{/if}

		{#if collection.value?.livePreview}
			<Tab name="preview" value={2}>
				<div class="flex items-center gap-2"><iconify-icon icon="mdi:eye-outline" width="20"></iconify-icon> {m.Fields_preview()}</div>
			</Tab>
		{/if}

		{#if user.isAdmin}
			<Tab name="api" value={3}>
				<div class="flex items-center gap-2"><iconify-icon icon="mdi:api" width="20"></iconify-icon> API</div>
			</Tab>
		{/if}

		<svelte:fragment slot="panel">
			{#if localTabSet === 0}
				<div class="mb-2 text-center text-xs text-surface-500">{m.fields_required()}</div>
				<div class="rounded-md border bg-white p-4 drop-shadow-lg dark:border-surface-700 dark:bg-surface-800">
					<div class="flex flex-wrap items-start justify-center gap-4">
						{#each filteredFields as field (field.db_fieldName || field.name)}
							{@const WidgetComponent = widgetFunctions().get(field.widget.Name)?.component}
							<div class="flex-grow" style:min-width="min(300px, 100%)" style:width={field.width ? `calc(${field.width}% - 1rem)` : '100%'}>
								<div class="mb-1 flex items-center justify-between px-1">
									<p class="font-semibold capitalize">
										{field.label || field.name}
										{#if field.required}<span class="text-error-500">*</span>{/if}
									</p>
									<div class="flex items-center gap-2">
										{#if field.translated}
											<div class="variant-soft-tertiary badge-icon gap-1 text-xs">
												<iconify-icon icon="bi:translate" width="14"></iconify-icon>
												{contentLanguage.value?.toUpperCase() ?? 'EN'}
											</div>
										{/if}
										{#if field.icon}
											<iconify-icon icon={field.icon} width="18" class="text-surface-500"></iconify-icon>
										{/if}
									</div>
								</div>

								{#if WidgetComponent}
									<WidgetComponent {field} bind:value={currentCollectionValue[getFieldName(field, false)]} />
								{:else}
									<p class="text-error-500">Widget '{field.widget.Name}' not found.</p>
								{/if}
							</div>
						{/each}
					</div>
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

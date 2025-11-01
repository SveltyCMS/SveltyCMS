<!--
@file src/components/collectionDisplay/Fields.svelte
@component
**Fields is a \"dumb\" component that renders collection fields for data entry and provides revision history.**

@example
<Fields {fields} {revisions} />

### Props
- `fields` - The array of field objects from the collection schema.
- `revisions` - An array of revision metadata for the current entry.

### Features
- Renders appropriate widgets for each field in the schema.
- Binds form data to the `collectionValue` store.
- Displays revision history and allows comparing/reverting to previous versions.
- Does not perform any data fetching; all data is received as props.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getFieldName } from '@utils/utils';

	// Auth & Page data
	import { page } from '$app/state';
	const user = $derived(page.data?.user);
	const tenantId = $derived(page.data?.tenantId);

	// Stores
	import { collection, collectionValue, setCollectionValue } from '@src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { CodeBlock, Tab, TabGroup, clipboard } from '@skeletonlabs/skeleton';
	import { showConfirm } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';

	// Components
	import Loading from '@components/Loading.svelte';
	import { widgetStoreActions, widgetFunctions as widgetFunctionsStore } from '@stores/widgetStore.svelte';

	// Eager load all widget components for immediate use in Fields
	const modules: Record<string, { default: any }> = import.meta.glob('/src/widgets/**/*.svelte', {
		eager: true
	});

	let widgetFunctions = $state<Record<string, any>>({});
	$effect(() => {
		widgetFunctionsStore.subscribe((value) => {
			widgetFunctions = value;
		})();
	});

	// --- 1. RECEIVE DATA AS PROPS ---
	let { fields, revisions = [] } = $props<{
		fields?: NonNullable<(typeof collection)['value']>['fields'];
		revisions?: any[];
	}>();

	// --- 2. SIMPLIFIED STATE ---
	let localTabSet = $state(0);
	let apiUrl = $state('');
	let widgetsReady = $state(false);

	// This is form state, not fetched data, so it remains.
	let currentCollectionValue = $state({ ...collectionValue.value });

	// Revisions State (now simpler)
	let selectedRevisionId = $state('');

	// --- 3. DERIVED STATE FROM PROPS ---
	let selectedRevision = $derived(revisions.find((r: any) => r._id === selectedRevisionId) || null);
	let diffObject = $derived(selectedRevision?.diff || null);

	onMount(async () => {
		try {
			await widgetStoreActions.initializeWidgets(tenantId);
			widgetsReady = true;
		} catch (error) {
			console.error('[Fields] Failed to initialize widgets:', error);
			widgetsReady = true; // unblock UI
		}
	});

	// --- 4. SIMPLIFIED LOGIC ---
	let derivedFields = $derived(fields || []);

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

	// Sync local form state with global store, but don't clobber local edits
	// 1) If the entry switched (different _id), pull from global -> local
	// 2) Otherwise, push local -> global on change
	$effect(() => {
		const global = collectionValue.value as Record<string, unknown> | undefined;
		const local = currentCollectionValue as Record<string, unknown> | undefined;

		const globalId = (global as any)?._id;
		const localId = (local as any)?._id;

		// If switching to a different entry or global was externally updated, copy down
		if (global && globalId && globalId !== localId) {
			currentCollectionValue = { ...global } as any;
			return;
		}

		// Otherwise, keep global in sync with local edits
		const currentDataStr = JSON.stringify(local ?? {});
		const globalDataStr = JSON.stringify(global ?? {});
		if (currentDataStr !== globalDataStr) {
			setCollectionValue({ ...(global ?? {}), ...(local ?? {}) });
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
		{#if localTabSet === 0}
			<div class="mb-2 text-center text-xs text-error-500">{m.form_required()}</div>
			<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
				{#if !widgetsReady}
					<div class="flex h-48 items-center justify-center">
						<Loading />
						<p class="ml-2 text-surface-500">Loading widgets...</p>
					</div>
				{:else}
					<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
						{#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
							{#if rawField.widget}
								{@const field = ensureFieldProperties(rawField)}
								<div
									class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
									style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
								>
									<div class="flex justify-between px-[5px] text-start">
										<p class="inline-block font-semibold capitalize">
											{field.label || field.db_fieldName}
											{#if field.required}<span class="text-error-500">*</span>{/if}
										</p>
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
											<WidgetComponent {field} WidgetData={{}} bind:value={currentCollectionValue[fieldName]} {tenantId} />
										{:else}
											<p class="text-error-500">{m.Fields_no_widgets_found({ name: widgetName })}</p>
										{/if}
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
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
					</div>
				{/if}
			</div>
		{:else if localTabSet === 2}
			<div class="p-4">Live Preview coming soon!</div>
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

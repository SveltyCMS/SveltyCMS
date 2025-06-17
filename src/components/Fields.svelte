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
	import { getFieldName } from '@utils/utils';

	// Auth
	import { page } from '$app/state';
	const user = page.data.user;

	// Stores
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { TabGroup, Tab, CodeBlock, clipboard } from '@skeletonlabs/skeleton';

	// Components
	import { widgetFunctions } from '@src/widgets';
	import Loading from '@components/Loading.svelte';
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

	// Derived state
	let derivedFields = $derived.by(() => {
		return fields || (collection.value?.fields ?? []);
	});

	// Persistent form data that survives tab switches
	let formDataSnapshot = $state<Record<string, any>>({});
	let isFormDataInitialized = $state(false);

	function getDefaultCollectionValue(fields: any[]) {
		const tempCollectionValue: Record<string, any> = collectionValue?.value ? collectionValue.value : {};

		for (const field of fields) {
			tempCollectionValue[getFieldName(field, false)] = collectionValue?.value ? (collectionValue.value[getFieldName(field, false)] ?? {}) : {};
		}
		return tempCollectionValue;
	}

	let defaultCollectionValue = getDefaultCollectionValue(fields || (collection.value?.fields ?? []));
	let currentCollectionValue = $state(defaultCollectionValue);

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
				if (fieldName in formDataSnapshot) {
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
			.filter((field) => {
				// Filter based on user permissions
				return field && (!field.permissions || !field.permissions[user.role] || field.permissions[user.role].read);
			})
	);

	// Restore form data when returning to edit tab (tab 0)
	$effect(() => {});

	// Update the main collection value store when form data changes (debounced)
	let updateTimeout: number | null = null;
	$effect(() => {
		if (isFormDataInitialized && localTabSet === 0) {
			if (updateTimeout) clearTimeout(updateTimeout);
			updateTimeout = setTimeout(() => {
				collectionValue.update((current) => ({
					...current,
					...currentCollectionValue
				}));
			}, 300) as unknown as number; // Debounce updates to avoid excessive reactivity
		}
	});

	$effect(() => {
		collectionValue.set(currentCollectionValue);
	});

	// Dynamic import of widget components
	const modules: Record<string, { default: any }> = import.meta.glob('@widgets/**/*.svelte', {
		eager: true
	});

	// Lifecycle
	$effect(() => {
		isLoading = false;
		console.log(fields);
	});

	// Reactive statements
	$effect(() => {
		if (!collectionValue.value) return;
		const id = collectionValue.value._id;
		const currentApiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/collection/${String(collection.value?._id)}/${id}`;
		if (apiUrl !== currentApiUrl) {
			apiUrl = currentApiUrl;
		}
	});

	// Functions and helpers
	function handleRevert() {
		// Implement revert logic
		console.warn('Revert function not implemented');
	}

	function getTabHeaderVisibility() {
		return user.roles !== 'admin' && !collection.value?.revision;
	}
</script>

{#if isLoading}
	<div class="flex h-lvh items-center justify-between lg:justify-start">
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
						<span class="variant-outline-tertiary badge rounded-full dark:variant-outline-primary">1</span>
					</p>
				</div>
			</Tab>
		{/if}

		<!-- TODO: Should not show if livePreview is false -->
		{#if collection.value?.livePreview === true}
			<Tab bind:group={localTabSet} name="tab3" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:eye-outline" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>{m.Fields_preview()} Experimetal</p>
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
																? 1
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
				<div class="mb-2 flex items-center justify-between gap-2">
					<p class="text-center text-tertiary-500 dark:text-primary-500">
						{m.fields_revision_compare()}
					</p>
					<button class="variant-outline-tertiary btn dark:variant-ghost-primary" onclick={handleRevert}>{m.fields_revision_revert()}</button>
				</div>
				<select class="select mb-2">
					<option value="1">{m.fields_revision_most_recent()}</option>
					<option value="2">February 19th 2024, 4:00 PM</option>
				</select>

				<div class="flex justify-between dark:text-white">
					<!-- Current version -->
					<div class="w-full text-center">
						<p class="mb-4 sm:mb-0">{m.fields_revision_current_version()}</p>
						<CodeBlock
							color="text-white dark:text-primary-500"
							language="JSON"
							rounded="rounded-container-token"
							lineNumbers={true}
							text="text-xs text-left w-full"
							buttonLabel=""
							code={JSON.stringify(formDataSnapshot, null, 2)}
						/>
					</div>
					<div
						class="ml-1 min-h-[1em] w-px self-stretch bg-gradient-to-tr from-transparent via-neutral-500 to-transparent opacity-20 dark:opacity-100"
					></div>
					<!-- Revision version -->
					<div class="ml-1 w-full text-left">
						<p class="text-center text-tertiary-500">February 19th 2024, 4:00 PM</p>
						<CodeBlock
							color="text-white dark:text-primary-500"
							language="JSON"
							lineNumbers={true}
							text="text-xs text-left text-white dark:text-tertiary-500"
							buttonLabel=""
							code={JSON.stringify(collectionValue.value, null, 2)}
						/>
					</div>
				</div>
			{:else if localTabSet === 2 && collection.value?.livePreview === true}
				<!-- Live Preview tab content -->
				<div class="wrapper">
					<h2 class="mb-4 text-center text-xl font-bold text-tertiary-500 dark:text-primary-500">Live Preview Experimetal</h2>
					<div class="card variant-glass-secondary mb-4 p-1 sm:p-4">
						{@html getLivePreviewContent()}
					</div>
				</div>
			{:else if localTabSet === 3}
				<!-- API Json tab content -->
				{#if collectionValue.value == null}
					<div class="variant-ghost-error mb-4 py-2 text-center font-bold">
						{m.fields_api_nodata()}
					</div>
				{:else}
					<div class="wrapper relative z-0 mb-4 flex w-full items-center justify-start gap-1">
						<p class="flex items-center">
							<span class="mr-1">API URL:</span>
							<iconify-icon icon="ph:copy" use:clipboard={apiUrl} class="pb-6 text-tertiary-500 dark:text-primary-500"> </iconify-icon>
						</p>
						<button class="btn text-wrap text-left" onclick={() => window.open(apiUrl, '_blank')} title={apiUrl}>
							<span class="text-wrap text-tertiary-500 dark:text-primary-500">{apiUrl}</span>
						</button>
					</div>

					<CodeBlock
						color="text-white dark:text-primary-500"
						language="JSON"
						lineNumbers={true}
						text="text-xs w-full"
						buttonLabel="Copy"
						code={JSON.stringify(collectionValue.value, null, 2)}
					/>
				{/if}
			{/if}
		</svelte:fragment>
	</TabGroup>
{/if}

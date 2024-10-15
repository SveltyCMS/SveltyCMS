<!--
@file src/components/Fields.svelte
@description: This component renders form fields for a collection, handles field editing,
revision management, live preview, and API data display. 

Key features:
- Dynamic field rendering based on collection schema
- Tab-based interface for different views (Edit, Revision, Live Preview, API)
- Real-time translation progress updates
- Permission-based field filtering
- Integration with various widget types
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { onMount, afterUpdate } from 'svelte';
	import { asAny, getFieldName, pascalToCamelCase } from '@utils/utils';

	// Auth
	import { page } from '$app/stores';
	import type { RolePermissions } from '@src/auth/types';
	const user = $page.data.user;

	// Stores
	import { contentLanguage, tabSet, validationStore } from '@stores/store';
	import { collection, collectionValue, mode } from '@stores/collectionStore';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { TabGroup, Tab, CodeBlock, clipboard } from '@skeletonlabs/skeleton';

	// Props
	export let fields: typeof $collection.fields | undefined = undefined;
	export let root = true; // if Fields is not part of any widget.
	export let fieldsData: Record<string, any> = {};
	export let customData: Record<string, any> = {};

	// Local state
	let apiUrl = '';
	let translationProgress: Record<string, number> = {};
	let isLoading = true;

	// Dynamic import of widget components
	const modules = import.meta.glob('@components/widgets/*/*.svelte');

	// Lifecycle
	onMount(async () => {
		await loadTranslationProgress();
		isLoading = false;
	});

	afterUpdate(() => {
		if (root) $collectionValue = fieldsData;
	});

	// Reactive statements
	$: if ($collectionValue) {
		const id = $collectionValue._id;
		// Convert $collection.name to a string if it's a symbol
		apiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/${String($collection.name)}/${id}`;
	}

	// Functions and helpers
	async function loadTranslationProgress() {
		translationProgress = {};
		fields?.forEach((field) => {
			if ((field as any).translated) {
				// Type assertion
				translationProgress[getFieldName(field)] = Math.random(); // Simulated progress
			}
		});
	}

	function handleRevert() {
		// Implement revert logic
		console.warn('Revert function not implemented');
	}

	function getTabHeaderVisibility() {
		return user.roles !== 'admin' && !$collection.revision;
	}

	function filterFieldsByPermission(fields: any[], userRole: string) {
		return fields.filter((f) => {
			const permissions = f.permissions as RolePermissions | undefined;
			return permissions?.[userRole]?.read !== false;
		});
	}

	function getLivePreviewContent() {
		// Ensure $collection.name is a string
		return `<div>Live Preview Content for ${String($collection.name)}</div>`;
	}

	$: filteredFields = filterFieldsByPermission(fields || $collection.fields, user.role);
</script>

{#if isLoading}
	<div class="loading">Loading fields...</div>
{:else}
	<TabGroup
		justify="{$collection.revision === true ? 'justify-between md:justify-around' : 'justify-center '} items-center"
		rounded="rounded-tl-container-token rounded-tr-container-token"
		flex="flex-1 items-center"
		active="border-b border-tertiary-500 dark:border-primary-500 variant-soft-secondary"
		hover="hover:variant-soft-secondary"
		regionList={getTabHeaderVisibility() ? 'hidden' : ''}
	>
		<!-- Tab headers -->
		<Tab bind:group={$tabSet} name="tab1" value={0}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="mdi:pen" width="24" class="text-tertiary-500 dark:text-primary-500" />
				<p>{m.fields_edit()}</p>
			</div>
		</Tab>

		{#if $collection.revision === true}
			<Tab bind:group={$tabSet} name="tab2" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-tertiary-500 dark:text-primary-500" />
					<p>Ver. <span class="variant-outline-tertiary badge rounded-full dark:variant-outline-primary">1</span></p>
				</div>
			</Tab>
		{/if}

		{#if $collection.livePreview === true}
			<Tab bind:group={$tabSet} name="tab3" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:eye-outline" width="24" class="text-tertiary-500 dark:text-primary-500" />
					<p>Preview</p>
				</div>
			</Tab>
		{/if}

		{#if user.roles === 'admin'}
			<Tab bind:group={$tabSet} name="tab4" value={3}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ant-design:api-outlined" width="24" class="text-tertiary-500 dark:text-primary-500" />
					<p>API</p>
				</div>
			</Tab>
		{/if}

		<!-- Tab Panels -->
		<svelte:fragment slot="panel">
			{#if $tabSet === 0}
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
													<iconify-icon icon="bi:translate" color="dark" width="18" class="text-sm" />
													<div class="text-xs font-normal text-error-500">
														{$contentLanguage?.toUpperCase() ?? 'EN'}
													</div>
													<!-- Display translation progress -->
													<div class="text-xs font-normal">
														({Math.round((translationProgress[getFieldName(field)] ?? 0) * 100)}%)
													</div>
												</div>
											{/if}

											{#if field.icon}
												<iconify-icon icon={field.icon} color="dark" width="22" />
											{/if}
										</div>
									</div>

									<!-- Widget Input -->
									{#await modules[`/src/components/widgets/${pascalToCamelCase(field.widget.Name)}/${field.widget.Name}.svelte`]() then widget}
										<svelte:component
											this={asAny(widget).default}
											field={asAny(field)}
											bind:WidgetData={fieldsData[getFieldName(field)]}
											value={customData[getFieldName(field)]}
											{...$$props}
										/>

										<!-- Display validation error below the widget if any -->
										{#if $validationStore[getFieldName(field)]}
											<p class="text-center text-sm text-error-500">{$validationStore[getFieldName(field)]}</p>
										{/if}
									{/await}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{:else if $tabSet === 1}
				<!-- Revision tab content -->
				<div class="mb-2 flex items-center justify-between gap-2">
					<p class="text-center text-tertiary-500 dark:text-primary-500">{m.fields_revision_compare()}</p>
					<button class="variant-outline-tertiary btn dark:variant-ghost-primary" on:click={handleRevert}>{m.fields_revision_revert()}</button>
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
							code={JSON.stringify($collectionValue, null, 2)}
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
							code={JSON.stringify($collectionValue, null, 2)}
						/>
					</div>
				</div>
			{:else if $tabSet === 2 && $collection.livePreview === true}
				<!-- Live Preview tab content -->
				<div class="wrapper">
					<h2 class="mb-4 text-center text-xl font-bold text-tertiary-500 dark:text-primary-500">Live Preview</h2>
					<div class="card variant-glass-secondary mb-4 p-1 sm:p-4">
						{@html getLivePreviewContent()}
					</div>
				</div>
			{:else if $tabSet === 3}
				<!-- API Json tab content -->
				{#if $collectionValue == null}
					<div class="variant-ghost-error mb-4 py-2 text-center font-bold">{m.fields_api_nodata()}</div>
				{:else}
					<div class="wrapper relative z-0 mb-4 flex w-full items-center justify-start gap-1">
						<p class="flex items-center">
							<span class="mr-1">API URL:</span>
							<iconify-icon icon="ph:copy" use:clipboard={apiUrl} class="pb-6 text-tertiary-500 dark:text-primary-500" />
						</p>
						<button class="btn text-wrap text-left" on:click={() => window.open(apiUrl, '_blank')} title={apiUrl}>
							<span class="text-wrap text-tertiary-500 dark:text-primary-500">{apiUrl}</span>
						</button>
					</div>

					<CodeBlock
						color="text-white dark:text-primary-500"
						language="JSON"
						lineNumbers={true}
						text="text-xs w-full"
						buttonLabel="Copy"
						code={JSON.stringify($collectionValue, null, 2)}
					/>
				{/if}
			{/if}
		</svelte:fragment>
	</TabGroup>
{/if}

<!--
@file src/components/collection-display/fields.svelte
@component
**Fields is a core component that renders collection fields for data entry and provides revision history.**

### Features:
- **Widget Rendering**: Automatically loads and renders appropriate widgets for each field.
- **Reactivity**: Binds form data to the `collectionValue` store with real-time sync.
- **Revision History**: Displays entry revisions with compare and revert functionality.
- **Validation**: Performs field-level validation based on schema constraints.
- **Translation Aware**: Manages multilingual data input through widget-integrated language context.

### Props
- `fields` (Array): The array of field instances from the collection schema.
- `revisions` (Array): Historical snapshot data for the current entry.
- `contentLanguage` (String): The language for data entry (GUI remains in systemLanguage).

### Keyboard Shortcuts
- `Alt + S`: Save currently edited entry (if focused)
-->
<script lang="ts">
	import { logger } from '@utils/logger';
	import { getFieldName } from '@utils/utils';
	import { untrack } from 'svelte';

	import { page } from '$app/state';

	const user = $derived(page.data?.user);
	const tenantId = $derived(page.data?.tenantId);

	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { applayout_version, button_edit, Fields_no_widgets_found, form_required } from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { collection, collectionValue, setCollectionValue } from '@src/stores/collection-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { contentLanguage, dataChangeStore, translationProgress, validationStore } from '@src/stores/store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { widgetFunctions as widgetFunctionsStore, widgets } from '@src/stores/widget-store.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import WidgetLoader from './widget-loader.svelte';
	import RevisionDiffModal from './revision-diff-modal.svelte';

	let isDiffModalOpen = $state(false);

	const modules: Record<string, () => Promise<{ default: any }>> = import.meta.glob('../../widgets/**/*.svelte') as Record<
		string,
		() => Promise<{ default: any }>
	>;

	import { slotRegistry } from '@src/plugins/slot-registry';
	import { activeInputStore } from '@src/stores/active-input-store.svelte';

	function openTokenPicker(field: any, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		const id = field.db_fieldName;
		const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;

		if (el) {
			el.focus();
			activeInputStore.set({ element: el, field });
		} else {
			console.warn('Could not find input for field', field);
		}
	}

	let widgetFunctions = $state<Record<string, any>>({});
	$effect(() => {
		const unsubscribe = widgetFunctionsStore.subscribe((value) => {
			widgetFunctions = value;
		});
		return unsubscribe;
	});

	let {
		fields,
		revisions = []
	}: {
		fields?: NonNullable<(typeof collection)['value']>['fields'];
		revisions?: any[];
		contentLanguage?: string;
	} = $props();

	let localTabSet = $state('0');
	let apiUrl = $state('');

	let currentCollectionValue = $state<Record<string, any>>({});
	let selectedRevisionId = $state('');
	let lastEntryId = $state<string | undefined>(undefined);
	let currentContentLanguage = $state<Locale>(contentLanguage.value as Locale);

	$effect(() => {
		const newLang = contentLanguage.value as Locale;
		if (currentContentLanguage !== newLang) {
			logger.debug('Language changed:', currentContentLanguage, '→', newLang);
			logger.debug('Current collectionValue keys:', Object.keys(currentCollectionValue));
			currentContentLanguage = newLang;
			logger.debug('Updated currentContentLanguage to:', currentContentLanguage);
		}
	});

	let selectedRevision = $derived(Array.isArray(revisions) ? revisions.find((r: any) => r._id === selectedRevisionId) || null : null);
	let derivedFields = $derived(fields || []);
	let currentTranslationProgress = $derived(translationProgress.value);

	$effect(() => {
		logger.debug('Translation progress updated:', {
			showProgress: translationProgress.value?.show,
			languages: Object.keys(translationProgress.value || {}).filter((k) => k !== 'show')
		});
	});

	let availableLanguages = $derived.by<Locale[]>(() => {
		const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
		if (!(languages && Array.isArray(languages))) {
			return ['en'] as Locale[];
		}
		return languages as Locale[];
	});

	function getFieldTranslationPercentage(field: any): number {
		if (!field.translated) {
			return 100;
		}

		const fieldName = `${collection.value?.name}.${getFieldName(field)}`;
		const allLangs = availableLanguages;

		if (allLangs.length === 0) {
			return 100;
		}

		let translatedCount = 0;

		for (const lang of allLangs) {
			const langProgress = currentTranslationProgress?.[lang as Locale];
			if (langProgress?.translated.has(fieldName)) {
				translatedCount++;
			}
		}

		return Math.round((translatedCount / allLangs.length) * 100);
	}

	function getTranslationTextColor(percentage: number): string {
		if (percentage === 100) {
			return 'text-tertiary-500 dark:text-primary-500';
		}
		return 'text-error-500';
	}

	function ensureFieldProperties(field: any) {
		if (!field) {
			return null;
		}
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
				if (!field.permissions || page.data?.isAdmin || !user?.role) {
					return true;
				}
				const rolePermissions = field.permissions[user.role];
				return !rolePermissions || rolePermissions.read !== false;
			})
	);

	$effect(() => {
		const global = collectionValue.value as Record<string, unknown> | undefined;
		const globalId = (global as any)?._id;

		if (globalId && globalId !== lastEntryId) {
			logger.debug('Loading entry data:', globalId);
			currentCollectionValue = { ...global } as any;
			lastEntryId = globalId;
			dataChangeStore.setInitialSnapshot(global as Record<string, any>);
			return;
		}

		if (!(globalId || lastEntryId) && global && Object.keys(global).length > 0) {
			logger.debug('Initializing new entry');
			currentCollectionValue = { ...global } as any;
			dataChangeStore.setInitialSnapshot(global as Record<string, any>);
			return;
		}

		const local = untrack(() => currentCollectionValue) as Record<string, unknown> | undefined;
		if (local && Object.keys(local).length > 0) {
			const currentDataStr = JSON.stringify(local);
			const globalDataStr = JSON.stringify(global ?? {});
			if (currentDataStr !== globalDataStr) {
				logger.debug('Pushing local changes to global store');
				untrack(() => setCollectionValue({ ...local }));
				dataChangeStore.compareWithCurrent(local as Record<string, any>);
			}
		}
	});

	let lastLocalValueStr = $state<string>('');
	$effect(() => {
		const localStr = JSON.stringify(currentCollectionValue);

		if (!currentCollectionValue || Object.keys(currentCollectionValue).length === 0) {
			return;
		}

		if (localStr !== lastLocalValueStr) {
			logger.debug('currentCollectionValue changed, syncing to store');
			lastLocalValueStr = localStr;

			const global = untrack(() => collectionValue.value);
			const globalStr = JSON.stringify(global ?? {});

			if (localStr !== globalStr) {
				untrack(() => setCollectionValue({ ...currentCollectionValue }));
				dataChangeStore.compareWithCurrent(currentCollectionValue as Record<string, any>);
			}
		}
	});

	function handleRevert() {
		if (!selectedRevision?.data) {
			return;
		}
		showConfirm({
			title: 'Confirm Revert',
			body: 'Are you sure you want to revert to this version? Any unsaved changes will be lost.',
			confirmText: 'Revert',
			onConfirm: () => {
				const revertData = {
					...selectedRevision.data,
					_id: (collectionValue as any).value?._id
				};
				setCollectionValue(revertData);
				currentCollectionValue = revertData;
				toast.info('Content reverted. Please save your changes.');
				localTabSet = '0';
			}
		});
	}

	$effect(() => {
		const values = currentCollectionValue;

		filteredFields.forEach((field: any) => {
			if (field.required) {
				const fieldName = getFieldName(field, false);
				const value = values[fieldName];

				const isEmpty =
					value === null ||
					value === undefined ||
					(typeof value === 'string' && value.trim() === '') ||
					(Array.isArray(value) && value.length === 0);

				if (isEmpty) {
					if (!validationStore.hasError(fieldName)) {
						validationStore.setError(fieldName, `${field.label || fieldName} is required`);
					}
				} else if (validationStore.hasError(fieldName)) {
					validationStore.clearError(fieldName);
				}
			}
		});
	});

	$effect(() => {
		if ((collectionValue as any).value?._id) {
			apiUrl = `${location.origin}/api/collection/${collection.value?._id}/${(collectionValue as any).value._id}`;
		}
	});

	const entryEditSlots = $derived(
		slotRegistry.getSlots('entry_edit').filter(
			(slot) =>
				!slot.condition ||
				slot.condition({
					collection: collection.value,
					entry: (collectionValue as any).value
				})
		)
	);

	function tabButtonClass(value: string) {
		return `flex-1 ${localTabSet === value ? 'bg-surface-100 dark:bg-surface-800' : ''}`;
	}
</script>

<h1 class="sr-only">
	{collection.value?.name ? `Edit ${collection.value.name} Entry` : 'Edit Entry'}
</h1>

{#if !widgets.isLoaded}
	<div class="flex h-64 flex-col items-center justify-center gap-4">
		<div class="h-12 w-12 animate-spin rounded-full border-4 border-surface-200 border-t-primary-500"></div>
		<p class="text-surface-500 animate-pulse">Initializing widgets...</p>
	</div>
{:else}
	<div class="flex flex-1 flex-col items-center">
		<div
			class="flex w-full justify-between rounded-tl-container rounded-tr-container border-b border-tertiary-500 dark:border-primary-500 md:justify-around"
			role="tablist"
			aria-label="Entry editor tabs"
		>
			<button
				type="button"
				role="tab"
				aria-selected={localTabSet === '0'}
				class={tabButtonClass('0')}
				onclick={() => (localTabSet = '0')}
			>
				<div class="flex items-center justify-center gap-2 py-2">
					<iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					{button_edit()}
				</div>
			</button>

			{#if collection.value?.revision}
				<button
					type="button"
					role="tab"
					aria-selected={localTabSet === '1'}
					class={tabButtonClass('1')}
					onclick={() => (localTabSet = '1')}
				>
					<div class="flex items-center justify-center gap-2 py-2">
						<iconify-icon icon="mdi:history" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{applayout_version()}
						<span class="preset-filled-secondary-500 badge">{revisions.length}</span>
					</div>
				</button>
			{/if}

			{#if user?.isAdmin}
				<button
					type="button"
					role="tab"
					aria-selected={localTabSet === '3'}
					class={tabButtonClass('3')}
					onclick={() => (localTabSet = '3')}
				>
					<div class="flex items-center justify-center gap-2 py-2">
						<iconify-icon icon="mdi:api" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						API
					</div>
				</button>
			{/if}

			{#each entryEditSlots as slot (slot.id)}
				<button
					type="button"
					role="tab"
					aria-selected={localTabSet === slot.id}
					class={tabButtonClass(slot.id)}
					onclick={() => (localTabSet = slot.id)}
				>
					<div class="flex items-center justify-center gap-2 py-2">
						{#if slot.props?.icon}
							<iconify-icon icon={slot.props.icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{:else}
							<iconify-icon icon="mdi:puzzle-outline" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{/if}
						{slot.props?.label || slot.id}
					</div>
				</button>
			{/each}
		</div>

		{#if localTabSet === '0'}
			<div class="w-full" role="tabpanel">
				<div class="mb-2 text-center text-xs text-error-500">
					{form_required()}
				</div>
				<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
					<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
						{#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
							{#if rawField.widget}
								{@const field = ensureFieldProperties(rawField)}
								<div
									class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:w-full!'}"
									style={'min-width:min(300px,100%);' +
										(field.width ? `width:calc(${(field.width / 12) * 100}% - 0.5rem)` : '')}
								>
									<div class="field-label flex items-center justify-between gap-2 px-1.25 text-start">
										<div class="flex items-center gap-2">
											<p class="inline-block font-semibold capitalize">
												{field.label || field.db_fieldName}
												{#if field.required}
													<span class="text-error-500">*</span>
												{/if}
											</p>
											{#if field.helper}
												<SystemTooltip title={field.helper} positioning={{ placement: 'top' }}>
													<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
												</SystemTooltip>
											{/if}
										</div>
										<div class="flex items-center gap-2">
											<SystemTooltip title="Insert Token">
												<button type="button" onclick={(e) => openTokenPicker(field, e)} class="" aria-label="Insert token into {field.label}">
													<iconify-icon icon="mdi:code-braces" width="16" class="font-bold text-tertiary-500 dark:text-primary-500"></iconify-icon>
												</button>
											</SystemTooltip>

											{#if field.translated}
												{@const percentage = getFieldTranslationPercentage(field)}
												{@const textColor = getTranslationTextColor(percentage)}
												<div class="flex items-center gap-1 text-xs">
													<iconify-icon icon="bi:translate" width="16"></iconify-icon>
													<span class="font-medium text-tertiary-500 dark:text-primary-500">{currentContentLanguage.toUpperCase()}</span>
													<span class="font-medium {textColor}">({percentage}%)</span>
												</div>
											{/if}

											{#if field.icon}
												<iconify-icon icon={field.icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
											{/if}
										</div>
									</div>

									{#if field.widget}
										{@const widgetName = field.widget.Name}
										{@const loadedWidget = (() => {
											const storePath = widgetFunctions[widgetName]?.componentPath;
											if (storePath && storePath in modules) return modules[storePath];

											const camelPath = widgetFunctions[widgetName.charAt(0).toLowerCase() + widgetName.slice(1)]?.componentPath;
											if (camelPath && camelPath in modules) return modules[camelPath];

											const lowerPath = widgetFunctions[widgetName.toLowerCase()]?.componentPath;
											if (lowerPath && lowerPath in modules) return modules[lowerPath];

											const normalized = widgetName.toLowerCase();
											const kebabMatch = normalized.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
											const flatMatch = normalized.replace(/-/g, '');

											for (const path in modules) {
												const lowerPath = path.toLowerCase();
												const parts = lowerPath.split('/');
												const fileName = parts.pop();
												const folderName = parts.pop();

												const isFolderMatch =
													folderName === normalized ||
													folderName === kebabMatch ||
													folderName === flatMatch ||
													folderName?.replace(/-/g, '') === flatMatch;

												if (isFolderMatch && fileName === 'input.svelte') return modules[path];
												if (isFolderMatch && fileName === 'index.svelte') return modules[path];

												if (fileName === `${normalized}.svelte` && normalized !== 'input') return modules[path];
												if (fileName === `${kebabMatch}.svelte` && kebabMatch !== 'input') return modules[path];
											}
											return null;
										})()}

										{#if loadedWidget}
											{@const fieldName = getFieldName(field, false)}
											{#key currentContentLanguage}
												<WidgetLoader
													loader={loadedWidget}
													{field}
													WidgetData={{}}
													bind:value={currentCollectionValue[fieldName]}
													{tenantId}
													collectionName={collection.value?.name}
												/>
											{/key}
										{:else}
											<p class="text-error-500">
												{Fields_no_widgets_found({ name: widgetName })}
											</p>
										{/if}
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			</div>
		{/if}

		{#if localTabSet === '1'}
			<div class="w-full" role="tabpanel">
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
								<iconify-icon icon="mdi:restore" class="mr-1"></iconify-icon>
								{applayout_version()}
							</button>
							<button class="preset-tonal-primary btn" onclick={() => (isDiffModalOpen = true)} disabled={!selectedRevision?.data}>
								<iconify-icon icon="mdi:compare" class="mr-1"></iconify-icon>
								Compare
							</button>
						</div>

						{#if isDiffModalOpen && selectedRevision}
							<div
								class="fixed inset-0 z-1000 flex items-center justify-center bg-surface-900/60 p-4 backdrop-blur-sm"
								onclick={() => (isDiffModalOpen = false)}
								onkeydown={(e) => e.key === 'Escape' && (isDiffModalOpen = false)}
								role="button"
								tabindex="-1"
							>
								<div onclick={(e) => e.stopPropagation()} role="presentation">
									<RevisionDiffModal
										oldData={selectedRevision.data}
										newData={currentCollectionValue}
										fields={derivedFields as any}
										oldLabel="Revision ({new Date(selectedRevision.revision_at).toLocaleDateString()})"
										newLabel="Current Content"
										close={() => (isDiffModalOpen = false)}
									/>
								</div>
							</div>
						{/if}

						<div class="rounded-lg border p-4 dark:text-surface-50">
							<h3 class="mb-3 text-lg font-bold">Quick Preview</h3>

							{#if selectedRevision}
								{@const diffObject = selectedRevision?.diff || null}
								{#if diffObject && Object.keys(diffObject).length > 0}
									<div class="space-y-3 font-mono text-sm">
										{#each Object.entries(diffObject) as [key, change] (key)}
											{@const ch = change as any}
											<div>
												<strong class="font-bold text-surface-600 dark:text-surface-300">{key}:</strong>
												{#if ch.status === 'modified'}
													<div class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2">
														<span class="text-error-700 dark:text-error-300">- {JSON.stringify(ch.old)}</span>
													</div>
													<div class="mt-1 rounded border border-success-500/30 bg-primary-500/10 p-2">
														<span class="text-success-700 dark:text-success-300">+ {JSON.stringify(ch.new)}</span>
													</div>
												{:else if ch.status === 'added'}
													<div class="mt-1 rounded border border-success-500/30 bg-primary-500/10 p-2">
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
			</div>
		{/if}

		{#if localTabSet === '3'}
			<div class="w-full" role="tabpanel">
				<div class="space-y-4 p-4">
					<div class="flex items-center gap-2">
						<input type="text" class="input grow" readonly value={apiUrl} />
						<button
							class="preset-outline-surface-500 btn"
							onclick={() => {
								navigator.clipboard.writeText(apiUrl);
								toast.success('API URL Copied');
							}}
						>
							Copy
						</button>
					</div>
					<div class="card max-h-125 overflow-x-auto bg-surface-800 p-4 font-mono text-sm text-white">
						<pre>{JSON.stringify((collectionValue as any).value, null, 2)}</pre>
					</div>
				</div>
			</div>
		{/if}

		{#each entryEditSlots as slot (slot.id)}
			{#if localTabSet === slot.id}
				<div class="w-full" role="tabpanel">
					{#await slot.component()}
						<div class="flex h-40 items-center justify-center">
							<div class="h-10 w-10 animate-spin rounded-full border-4 border-surface-200 border-t-primary-500"></div>
						</div>
					{:then Component}
						{#if Component.default}
							<Component.default
								{collection}
								{currentCollectionValue}
								{user}
								{tenantId}
								contentLanguage={currentContentLanguage}
								{...slot.props}
							/>
						{:else}
							<Component
								{collection}
								{currentCollectionValue}
								{user}
								{tenantId}
								contentLanguage={currentContentLanguage}
								{...slot.props}
							/>
						{/if}
					{:catch error}
						<div class="p-4">
							<div class="rounded border border-error-500/50 bg-error-50 p-4 text-error-600 dark:bg-error-900/10 dark:text-error-400">
								<h3 class="mb-2 font-bold">Plugin Error ({slot.id})</h3>
								<p>{error.message}</p>
							</div>
						</div>
					{/await}
				</div>
			{/if}
		{/each}
	</div>
{/if}
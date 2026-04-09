<!--
@file src/components/collection-display/fields.svelte
@component
**Fields is a core component that renders collection fields for data entry and provides revision history.**

### Features:
- **Widget Rendering**: Automatically loads and renders appropriate widgets for each field.
- **Reactivity**: Binds form data to the `collectionValue` store with real-time sync.
- **Revision History**: Displays entry revisions with compare and revert functionality.
- **Validation**: Performs field-level validation based on schema constraints.
- **Collaboration**: Real-time multi-user editing with Yjs and Presence indicators.

### Props
- `fields` (Array): The array of field instances from the collection schema.
- `revisions` (Array): Historical snapshot data for the current entry.
- `contentLanguage` (String): The language for data entry.
-->
<script lang="ts">
import { getFieldName } from "@utils/utils";
import { untrack } from "svelte";

// Auth & Page data
import { page } from "$app/state";

const user = $derived(page.data?.user);
const tenantId = $derived(page.data?.tenantId);

import { Tabs } from "@skeletonlabs/skeleton-svelte";
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import {
	applayout_version,
	button_edit,
	Fields_no_widgets_found,
	form_required,
} from "@src/paraglide/messages";
import type { Locale } from "@src/paraglide/runtime";
// Types
import {
	collection,
	collectionValue,
	setCollectionValue,
} from "@src/stores/collection-store.svelte";
import { useContent } from "@src/content";
import { publicEnv } from "@src/stores/global-settings.svelte";
import {
	contentLanguage,
	dataChangeStore,
	translationProgress,
	validationStore,
} from "@src/stores/store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
import { showConfirm } from "@utils/modal-utils";
import WidgetLoader from "./widget-loader.svelte";

// Collaboration
import { collaborationService } from "@src/services/collaboration/collaboration-service.svelte";
import { activeInputStore } from "@src/stores/active-input-store.svelte";
import { slotRegistry } from "@src/plugins/slot-registry";

// Content Context
const contentContext = useContent();

// --- 1. RECEIVE DATA AS PROPS ---
let {
	fields,
	revisions = [],
} = $props<{
	fields?: NonNullable<(typeof collection)["value"]>["fields"];
	revisions?: any[];
	contentLanguage?: string;
}>();

// --- COLLABORATION INIT ---
$effect(() => {
	if (collection.value) {
		collaborationService.init(collection.value, (collectionValue as any).value);
	}
	return () => collaborationService.destroy();
});

// Sync local changes to Yjs if collaborative
$effect(() => {
	if (collaborationService.isCollaborative) {
		const val = currentCollectionValue;
		Object.keys(val).forEach(key => {
			collaborationService.updateField(key, val[key]);
		});
	}
});

// --- STATE ---
let localTabSet = $state("0");
let apiUrl = $state("");
let currentCollectionValue = $state<Record<string, any>>({});
let selectedRevisionId = $state("");
let lastEntryId = $state<string | undefined>(undefined);
let currentContentLanguage = $state<Locale>(contentLanguage.value as Locale);

// --- REFRESH DATA ON LANG CHANGE ---
$effect(() => {
	const newLang = contentLanguage.value as Locale;
	if (currentContentLanguage !== newLang) {
		currentContentLanguage = newLang;
	}
});

// --- DERIVED ---
let selectedRevision = $derived(
	Array.isArray(revisions)
		? revisions.find((r: any) => r._id === selectedRevisionId) || null
		: null,
);

let derivedFields = $derived(fields || []);
let currentTranslationProgress = $derived(translationProgress.value);

let availableLanguages = $derived.by<Locale[]>(() => {
	const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
	return (Array.isArray(languages) ? languages : ["en"]) as Locale[];
});

function getFieldTranslationPercentage(field: any): number {
	if (!field.translated) return 100;
	const fieldName = `${collection.value?.name}.${getFieldName(field)}`;
	const allLangs = availableLanguages;
	if (allLangs.length === 0) return 100;
	let translatedCount = 0;
	for (const lang of allLangs) {
		const langProgress = currentTranslationProgress?.[lang as Locale];
		if (langProgress?.translated.has(fieldName)) translatedCount++;
	}
	return Math.round((translatedCount / allLangs.length) * 100);
}

function getTranslationTextColor(percentage: number): string {
	return percentage === 100 ? "text-tertiary-500 dark:text-primary-500" : "text-error-500";
}

function ensureFieldProperties(field: any) {
	if (!field) return null;
	return {
		...field,
		db_fieldName: field.db_fieldName || getFieldName(field, true),
		widget: field.widget || { Name: field.type || "Input" },
		permissions: field.permissions || {},
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
		}),
);

// --- SYNC DATA ---
$effect(() => {
	const global = collectionValue.value as Record<string, unknown> | undefined;
	const globalId = (global as any)?._id;

	if (globalId && globalId !== lastEntryId) {
		currentCollectionValue = { ...global } as any;
		lastEntryId = globalId;
		dataChangeStore.setInitialSnapshot(global as Record<string, any>);
		return;
	}

	if (!(globalId || lastEntryId) && global && Object.keys(global).length > 0) {
		currentCollectionValue = { ...global } as any;
		dataChangeStore.setInitialSnapshot(global as Record<string, any>);
		return;
	}

	const local = untrack(() => currentCollectionValue) as Record<string, unknown> | undefined;
	if (local && Object.keys(local).length > 0) {
		if (JSON.stringify(local) !== JSON.stringify(global ?? {})) {
			untrack(() => setCollectionValue({ ...local }));
			dataChangeStore.compareWithCurrent(local as Record<string, any>);
		}
	}
});

// --- REVISION ---
function handleRevert() {
	if (!selectedRevision?.data) return;
	showConfirm({
		title: "Confirm Revert",
		body: "Are you sure you want to revert to this version? Any unsaved changes will be lost.",
		confirmText: "Revert",
		onConfirm: () => {
			const revertData = { ...selectedRevision.data, _id: (collectionValue as any).value?._id };
			setCollectionValue(revertData);
			currentCollectionValue = revertData;
			toast.info("Content reverted. Please save your changes.");
			localTabSet = "0";
		},
	});
}

// --- VALIDATION ---
$effect(() => {
	const values = currentCollectionValue;
	filteredFields.forEach((field: any) => {
		if (field.required) {
			const fieldName = getFieldName(field, false);
			const value = values[fieldName];
			const isEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
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

// --- TOKEN PICKER ---
function openTokenPicker(field: any, e: MouseEvent) {
	e.preventDefault();
	e.stopPropagation();
	const id = field.db_fieldName;
	const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
	if (el) {
		el.focus();
		activeInputStore.set({ element: el, field });
	}
}

// --- PLUGIN SLOTS ---
const entryEditSlots = $derived(slotRegistry.getSlots("entry_edit"));

// --- VISUAL EDITING HANDLER ---
$effect(() => {
	const handleFocusField = (e: any) => {
		const fieldName = e.detail?.fieldName;
		if (!fieldName) return;
		localTabSet = "0";
		setTimeout(() => {
			const el = document.getElementById(fieldName) || document.querySelector(`[data-field-name="${fieldName}"]`);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
				el.classList.add("svelty-highlight-pulse");
				setTimeout(() => el.classList.remove("svelty-highlight-pulse"), 2000);
				if (el instanceof HTMLElement) el.focus();
			}
		}, 100);
	};
	document.addEventListener("svelty:focus-field", handleFocusField);
	return () => document.removeEventListener("svelty:focus-field", handleFocusField);
});
</script>

{#snippet PresenceBar()}
	{#if collaborationService.isCollaborative && collaborationService.activeUsers.length > 0}
		<div class="flex items-center gap-2 px-4 py-2 bg-surface-100/50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700 w-full overflow-x-auto">
			<div class="flex items-center gap-1.5 mr-4">
				<div class="h-2 w-2 rounded-full {collaborationService.isConnected ? 'bg-success-500' : 'bg-error-500'}"></div>
				<span class="text-xs font-medium uppercase tracking-wider text-surface-500">Live</span>
			</div>
			<div class="flex -space-x-2">
				{#each collaborationService.activeUsers as user (user.clientId)}
					<SystemTooltip title={user.name}>
						<div 
							class="h-8 w-8 rounded-full border-2 border-white dark:border-surface-900 flex items-center justify-center text-xs font-bold text-white shadow-sm transition-transform hover:z-10 hover:scale-110"
							style="background-color: {user.color}"
						>
							{#if user.avatar}
								<img src={user.avatar} alt={user.name} class="h-full w-full rounded-full object-cover" />
							{:else}
								{user.name.charAt(0).toUpperCase()}
							{/if}
						</div>
					</SystemTooltip>
				{/each}
			</div>
			{#if collaborationService.activeUsers.length > 1}
				<span class="text-xs text-surface-500 ml-2">{collaborationService.activeUsers.length} editors</span>
			{/if}
		</div>
	{/if}
{/snippet}

<style>
	:global(.svelty-highlight-pulse) {
		outline: 3px solid #ff3e00 !important;
		outline-offset: 4px;
		border-radius: 4px;
		transition: outline 0.2s ease-in-out;
		animation: pulse-bg 1s ease-in-out 2;
	}
	@keyframes pulse-bg {
		0% { background-color: transparent; }
		50% { background-color: rgba(255, 62, 0, 0.1); }
		100% { background-color: transparent; }
	}
</style>

<h1 class="sr-only">{collection.value?.name ? `Edit ${collection.value.name} Entry` : 'Edit Entry'}</h1>

{#if !contentContext.isReady}
	<div class="flex h-64 flex-col items-center justify-center gap-4">
		<div class="h-12 w-12 animate-spin rounded-full border-4 border-surface-200 border-t-primary-500"></div>
		<p class="text-surface-500 animate-pulse">Initializing content system...</p>
	</div>
{:else}
	<Tabs value={localTabSet} onValueChange={(e) => (localTabSet = e.value)} class="flex flex-1 flex-col items-center">
		<Tabs.List class="flex justify-between md:justify-around rounded-tl-container rounded-tr-container border-b border-tertiary-500 dark:border-primary-500 w-full">
			<Tabs.Trigger value="0" class="flex-1">
				<div class="flex items-center justify-center gap-2 py-2">
					<iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					{button_edit()}
				</div>
			</Tabs.Trigger>
			{#if collection.value?.revision}
				<Tabs.Trigger value="1" class="flex-1">
					<div class="flex items-center justify-center gap-2 py-2">
						<iconify-icon icon="mdi:history" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{applayout_version()} <span class="preset-filled-secondary-500 badge">{revisions.length}</span>
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
			{#each entryEditSlots as slot (slot.id)}
				{#if slot.id !== 'live_preview' || collection.value?.livePreview}
					<Tabs.Trigger value={slot.id} class="flex-1">
						<div class="flex items-center justify-center gap-2 py-2">
							<iconify-icon icon={slot.props?.icon || "mdi:puzzle-outline"} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{slot.props?.label || slot.id}
						</div>
					</Tabs.Trigger>
				{/if}
			{/each}
			<Tabs.Indicator />
		</Tabs.List>

		<Tabs.Content value="0" class="w-full">
			{@render PresenceBar()}
			<div class="mb-2 text-center text-xs text-error-500">{form_required()}</div>
			<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
				<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
					{#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
						{#if rawField.widget}
							{@const field = ensureFieldProperties(rawField)}
							{@const fieldName = getFieldName(field, false)}
							{@const remoteUser = collaborationService.activeUsers.find(u => u.activeField === fieldName)}
							<div
								class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:w-full!'} transition-all duration-300 rounded-lg p-1 {remoteUser ? 'ring-2 ring-offset-2 ring-dashed' : ''}"
								style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${(field.width / 12) * 100}% - 0.5rem)` : '') + (remoteUser ? ` --tw-ring-color: ${remoteUser.color};` : '')}
								onfocusin={() => collaborationService.setFieldFocus(fieldName)}
								onfocusout={() => collaborationService.setFieldFocus(null)}
							>
								<div class="flex items-center justify-between gap-2 px-1.25 text-start field-label">
									<div class="flex items-center gap-2">
										<p class="inline-block font-semibold capitalize">
											{field.label || field.db_fieldName}
											{#if field.required}<span class="text-error-500">*</span>{/if}
										</p>
										{#if field.helper}
											<SystemTooltip title={field.helper} positioning={{ placement: 'top' }}>
												<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
											</SystemTooltip>
										{/if}
										{#if remoteUser}
											<span class="text-[10px] px-1.5 py-0.5 rounded-full text-white animate-pulse" style="background-color: {remoteUser.color}">{remoteUser.name}</span>
										{/if}
									</div>
									<div class="flex items-center gap-2">
										<button type="button" onclick={(e) => openTokenPicker(field, e)} aria-label="Insert token">
											<iconify-icon icon="mdi:code-braces" width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										</button>
										{#if field.translated}
											{@const percentage = getFieldTranslationPercentage(field)}
											<div class="flex items-center gap-1 text-xs">
												<iconify-icon icon="bi:translate" width="16"></iconify-icon>
												<span class="font-medium {getTranslationTextColor(percentage)}">{currentContentLanguage.toUpperCase()} ({percentage}%)</span>
											</div>
										{/if}
										{#if field.icon}<iconify-icon icon={field.icon} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>{/if}
									</div>
								</div>

								{#if field.widget?.inputComponent}
									{#key currentContentLanguage}
										<WidgetLoader
											loader={field.widget.inputComponent}
											{field}
											WidgetData={{}}
											bind:value={currentCollectionValue[fieldName]}
											tenantId={tenantId || contentContext.tenantId}
											collectionName={collection.value?.name}
										/>
									{/key}
								{:else}
									<p class="text-error-500">{Fields_no_widgets_found({ name: field.widget?.Name || 'Unknown' })}</p>
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
					<p class="p-4 text-center text-surface-500">No revision history found.</p>
				{:else}
					<div class="mb-4 flex items-center justify-between gap-4">
						<select class="select grow" bind:value={selectedRevisionId}>
							<option value="" disabled>-- Select a revision --</option>
							{#each revisions as revision (revision._id)}
								<option value={revision._id}>{new Date(revision.revision_at).toLocaleString()} by {revision.revision_by.substring(0, 8)}</option>
							{/each}
						</select>
						<button class="preset-filled-primary-500 btn" onclick={handleRevert} disabled={!selectedRevision?.data}>Revert</button>
					</div>
					{#if selectedRevision}
						<div class="rounded-lg border p-4 dark:text-surface-50">
							<h3 class="mb-3 text-lg font-bold">Changes</h3>
							{#each Object.entries(selectedRevision.diff || {}) as [key, change] (key)}
								{@const ch = change as any}
								<div class="mb-2">
									<strong>{key}:</strong>
									{#if ch.status === 'modified'}
										<div class="text-error-500">- {JSON.stringify(ch.old)}</div>
										<div class="text-success-500">+ {JSON.stringify(ch.new)}</div>
									{:else}
										<div class="text-primary-500">{JSON.stringify(ch.value || ch.new)}</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</Tabs.Content>
		<Tabs.Content value="3" class="w-full p-4">
			<div class="flex gap-2 mb-4">
				<input type="text" class="input grow" readonly value={apiUrl} />
				<button class="btn preset-outline-surface-500" onclick={() => { navigator.clipboard.writeText(apiUrl); toast.success('Copied'); }}>Copy</button>
			</div>
			<pre class="card p-4 bg-surface-800 text-white overflow-auto max-h-96">{JSON.stringify(collectionValue.value, null, 2)}</pre>
		</Tabs.Content>
		{#each entryEditSlots as slot (slot.id)}
			{#if slot.id !== 'live_preview' || collection.value?.livePreview}
				<Tabs.Content value={slot.id} class="w-full">
					{#await slot.component()}
						<div class="flex h-40 items-center justify-center"><div class="h-10 w-10 animate-spin rounded-full border-4 border-t-primary-500"></div></div>
					{:then Component}
						{@const C = Component.default || Component}
						<C {collection} {currentCollectionValue} {user} tenantId={tenantId || contentContext.tenantId} contentLanguage={currentContentLanguage} active={localTabSet === slot.id} {...slot.props} />
					{:catch error}
						<div class="p-4 text-error-500">Error loading {slot.id}: {error.message}</div>
					{/await}
				</Tabs.Content>
			{/if}
		{/each}
	</Tabs>
{/if}

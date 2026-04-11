<!-- 
@files src/routes/(app)/config/collectionbuilder/BuzzForm/FieldInspector.svelte
@component
**Field Inspector**

### Props
- `onDelete` {Function} - Callback function to handle field deletion
- `onDuplicate` {Function} - Callback function to handle field duplication
- `onUpdate` {Function} - Callback function to handle field updates
- `onSelectField` {Function} - Callback function to handle field selection

### Features:
- Basic Field Configuration
- Field Permissions
- Field Specific Settings

-->

<script lang="ts">
import { Tabs } from "@skeletonlabs/skeleton-svelte";
import InputSwitch from "@src/components/system/builder/input-switch.svelte";
import { collections } from "@src/stores/collection-store.svelte";
import { widgets } from "@src/stores/widget-store.svelte.ts";
import { asAny } from "@utils/utils";
import type { Component } from "svelte";
import Permission from "../[action]/[...contentPath]/tabs/collection-widget/tabs-fields/permission.svelte";
import Specific from "../[action]/[...contentPath]/tabs/collection-widget/tabs-fields/specific.svelte";

interface Props {
	onDelete: () => void;
	onDuplicate: () => void;
}
const { onDelete, onDuplicate }: Props = $props();

let activeTab = $state("general");

const target = $derived(collections.targetWidget) as any;
const widgetKey = $derived(
	target?.widget?.key || target?.widget?.Name?.toLowerCase() || "",
);
const availableWidgets = $derived(widgets.widgetFunctions || {});
const guiSchema = $derived(
	(asAny<any>(availableWidgets)[widgetKey]?.GuiSchema || {}) as Record<
		string,
		{ widget: Component<any> }
	>,
);

const allProperties = $derived(Object.keys(guiSchema || {}));
const standardProperties = [
	"label",
	"db_fieldName",
	"required",
	"translated",
	"icon",
	"helper",
	"width",
];
const displayProperties = $derived([...standardProperties]);
const specificProperties = $derived(
	allProperties.filter(
		(prop) => !standardProperties.includes(prop) && prop !== "permissions",
	),
);

function defaultValue(property: string) {
	if (property === "required" || property === "translated") {
		return false;
	}
	return (target.widget as any)?.Name;
}

function handleUpdate(detail: { value: any }, property: string) {
	const current = collections.targetWidget;
	current[property] = detail.value;
	collections.setTargetWidget(current);
}
</script>

<div class="flex h-full flex-col border-l border-surface-200-800 bg-surface-50-950 w-80">
	{#if !target || !target.widget}
		<div class="flex h-full flex-col items-center justify-center p-8 text-center text-surface-500">
			<iconify-icon icon="mdi:form-select" width="48" class="mb-4 opacity-20"></iconify-icon>
			<p class="text-sm font-medium">No field selected</p>
			<p class="mt-1 text-xs opacity-60">Select a field on the canvas to configure its properties</p>
		</div>
	{:else}
		<!-- Header -->
		<div class="border-b border-surface-200-800 bg-surface-100/50 dark:bg-surface-800/30 p-4">
			<div class="flex items-center gap-3">
				<div class="relative">
					<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white shadow-lg ring-2 ring-primary-500/20">
						<iconify-icon icon={target.icon || 'mdi:widgets'} width="28"></iconify-icon>
					</div>
					<div class="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-tertiary-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-surface-900">
						{target.id}
					</div>
				</div>
				<div class="flex-1 overflow-hidden">
					<h3 class="truncate text-lg font-bold tracking-tight text-surface-900 dark:text-white">{target.label || 'Field'}</h3>
					<div class="flex items-center gap-1.5">
						<span class="rounded-full bg-surface-200 dark:bg-surface-700 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-surface-600 dark:text-surface-400">
							{target.widget?.key || target.widget?.Name}
						</span>
					</div>
				</div>
				<div class="flex flex-col gap-1">
					<button onclick={onDuplicate} class="btn-icon btn-icon-sm preset-ghost-tertiary-500 hover:preset-filled-tertiary-500 transition-all" title="Duplicate Field">
						<iconify-icon icon="mdi:content-copy" width={18}></iconify-icon>
					</button>
					<button onclick={onDelete} class="btn-icon btn-icon-sm preset-ghost-error-500 hover:preset-filled-error-500 transition-all" title="Delete Field">
						<iconify-icon icon="mdi:trash-can" width={18}></iconify-icon>
					</button>
				</div>
			</div>
		</div>

		<!-- Quick Info Strip -->
		<div class="flex items-center justify-between border-b border-surface-200-800 bg-surface-50 dark:bg-surface-900 px-4 py-2 text-[10px] font-mono text-surface-500">
			<span class="truncate max-w-[150px]">{target.db_fieldName || 'no_name'}</span>
			<div class="flex gap-2">
				{#if target.required}<span class="text-error-500">Required</span>{/if}
				{#if target.translated}<span class="text-primary-500">i18n</span>{/if}
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex-1 overflow-hidden flex flex-col">
			<Tabs value={activeTab} onValueChange={(e: { value: string }) => (activeTab = e.value)} class="flex flex-col h-full">
				<Tabs.List class="flex border-b border-surface-200-800 px-2 justify-between bg-surface-100/30 dark:bg-surface-800/20">
					<Tabs.Trigger value="general" class="flex-1 px-1 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 border-transparent data-[state=active]:border-primary-500 data-[state=active]:text-primary-500 transition-all">
						Basic
					</Tabs.Trigger>
					<Tabs.Trigger value="specific" class="flex-1 px-1 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 border-transparent data-[state=active]:border-primary-500 data-[state=active]:text-primary-500 transition-all" disabled={specificProperties.length === 0}>
						Settings
					</Tabs.Trigger>
					<Tabs.Trigger value="auth" class="flex-1 px-1 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 border-transparent data-[state=active]:border-primary-500 data-[state=active]:text-primary-500 transition-all">
						Auth
					</Tabs.Trigger>
				</Tabs.List>

				<div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
					<Tabs.Content value="general">
						<div class="space-y-6">
							{#each displayProperties as property (property)}
								{#if guiSchema[property]}
									<div class="space-y-1">
										<InputSwitch
											value={target[property] ?? defaultValue(property)}
											icon={target[property] as string}
											widget={asAny(guiSchema[property]?.widget)}
											key={property}
											onupdate={(e: { value: any }) => handleUpdate(e, property)}
										/>
									</div>
								{/if}
							{/each}
						</div>
					</Tabs.Content>

					<Tabs.Content value="specific"><Specific /></Tabs.Content>

					<Tabs.Content value="auth"><Permission roles={[]} /></Tabs.Content>
				</div>
			</Tabs>
		</div>
	{/if}
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(var(--color-surface-500), 0.2);
		border-radius: 2px;
	}
</style>

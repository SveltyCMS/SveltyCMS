<!-- 
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/widget-editor.svelte
@component Widget Editor Component with Stepper
 -->
<script lang="ts">
import { registerHotkey } from "@src/utils/hotkeys";
import { onMount } from "svelte";
import Stepper from "@src/components/system/stepper.svelte";
import * as m from "@src/paraglide/messages";
import {
	button_cancel,
	button_delete,
	button_next,
	button_previous,
	button_save,
} from "@src/paraglide/messages";
import { collections } from "@src/stores/collection-store.svelte";
import { widgets } from "@src/stores/widget-store.svelte.ts";
import type { Component } from "svelte";
import Default from "./tabs-fields/default.svelte";
import Permission from "./tabs-fields/permission.svelte";
import Specific from "./tabs-fields/specific.svelte";

interface Props {
	onCancel: () => void;
	onSave: (data: any) => void;
	widgetData: any;
}

const { widgetData, onSave, onCancel }: Props = $props();

// Stepper State
let currentStep = $state(0);

const target = $derived(collections.targetWidget as any);
const widgetKey = $derived(
	target?.widget?.key || (target?.widget?.Name?.toLowerCase() as string),
);
const availableWidgets = $derived(widgets.widgetFunctions || {});
const guiSchema = $derived(
	((availableWidgets[widgetKey] as any)?.GuiSchema || {}) as Record<
		string,
		{ widget: Component<any> }
	>,
);

const options = $derived(guiSchema ? Object.keys(guiSchema) : []);
const specificOptions = $derived(
	options.filter(
		(prop) =>
			![
				"label",
				"display",
				"db_fieldName",
				"required",
				"translated",
				"icon",
				"helper",
				"width",
				"permissions",
			].includes(prop),
	),
);

const steps = $derived([
	{ label: "General", shortDesc: "Basic Settings" },
	{ label: "Permissions", shortDesc: "Role Access" },
	...(specificOptions.length > 0
		? [{ label: "Specific", shortDesc: "Widget Options" }]
		: []),
]);

onMount(() => {
	if (widgetData) {
		collections.setTargetWidget(JSON.parse(JSON.stringify(widgetData)));
	}

	// Standardized Hotkeys
	registerHotkey(
		"mod+s",
		() => onSave(collections.targetWidget),
		"Save Widget",
	);
	registerHotkey("mod+enter", handleNext, "Next Step / Finish");
	registerHotkey("escape", handleBack, "Back / Cancel", false);
	registerHotkey("delete", handleDelete, "Delete Widget");
});

function handleNext() {
	if (currentStep < steps.length - 1) {
		currentStep++;
	} else {
		onSave(collections.targetWidget);
	}
}

function handleBack() {
	if (currentStep > 0) {
		currentStep--;
	} else {
		onCancel();
	}
}

function handleDelete() {
	const confirmMsg =
		(m as any).widget_delete_confirm ||
		"Are you sure you want to delete this widget?";
	if (confirm(confirmMsg)) {
		if (collections.active) {
			const newFields = (collections.active.fields as any[]).filter(
				(f: any) => f.id !== widgetData.id,
			);
			collections.active.fields = newFields;
		}
		onCancel();
	}
}
</script>

<div class="flex h-full w-full gap-6">
	<Stepper {steps} bind:currentStep stepCompleted={steps.map((_, i) => i < currentStep)} stepClickable={steps.map((_, i) => i <= currentStep + 1)}>
		{#snippet header()}
			<h3 class="text-lg font-bold">Steps</h3>
		{/snippet}
	</Stepper>

	<div class="flex flex-1 flex-col rounded-xl border border-surface-200 bg-white shadow-sm dark:text-surface-50 dark:bg-surface-800 overflow-hidden">
		<div class="border-b border-surface-200 p-6">
			<h2 class="text-2xl font-bold">{(m as any).widget_configuration_title || 'Widget Configuration'}</h2>
			<p class="text-surface-500">
				Configuring <span class="font-bold text-primary-500">{target?.label || 'New Field'}</span>
				<span class="text-xs opacity-70">({target?.widget?.Name || 'Unknown'})</span>
			</p>
		</div>

		<div class="flex-1 overflow-y-auto p-6">
			{#if currentStep === 0}
				<div class="animate-fade-in">
					<h3 class="mb-4 text-lg font-bold">General Settings</h3>
					<Default {guiSchema} />
				</div>
			{:else if currentStep === 1}
				<div class="animate-fade-in">
					<h3 class="mb-4 text-lg font-bold">Permissions</h3>
					<Permission />
				</div>
			{:else if currentStep === 2}
				<div class="animate-fade-in">
					<h3 class="mb-4 text-lg font-bold">Specific Options</h3>
					<Specific />
				</div>
			{/if}
		</div>

		<div class="flex items-center justify-between border-t border-surface-200 p-4">
			<button type="button" onclick={handleDelete} class="preset-outlined-error-500 btn">
				<iconify-icon icon="mdi:delete" width={24}></iconify-icon>
				<span>{button_delete()}</span>
			</button>

			<div class="flex gap-2">
				<button type="button" onclick={handleBack} class="preset-outlined-secondary-500 btn">
					{currentStep === 0 ? button_cancel() : button_previous()}
				</button>
				<button type="button" onclick={handleNext} class="preset-filled-primary-500 btn">
					{currentStep === steps.length - 1 ? button_save() : button_next()}
				</button>
			</div>
		</div>
	</div>
</div>

<!--
@file src/components/system/builder/add-widget.svelte
@description Add widget component for the system builder
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import PageTitle from '@src/components/page-title.svelte';
	import InputSwitch from '@src/components/system/builder/input-switch.svelte';
	import Dropdown from '@components/ui/dropdown.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import type { WidgetFactory } from '@src/widgets/types';

	import type { AddWidgetProps } from './types';

	let {
		fields = $bindable([]),
		addField = $bindable(false),
		editField = $bindable(false),
		selected_widget = $bindable(null),
		field = $bindable({
			label: '',
			db_fieldName: '',
			translated: false,
			required: false,
			widget: {
				key: null as string | null,
				GuiFields: {} as Record<string, any>
			}
		})
	}: AddWidgetProps = $props();

	const widget_keys = $derived(Object.keys(widgets.widgetFunctions));
	let guiSchema = $state<WidgetFactory['GuiSchema'] | undefined>(undefined);

	$effect(() => {
		if (selected_widget) {
			const widgetFn = widgets.widgetFunctions[selected_widget];
			guiSchema = (widgetFn as WidgetFactory)?.GuiSchema;
		}
	});

	function handleSave() {
		if (!selected_widget) {
			return;
		}
		field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
		field.label = String(field.widget.GuiFields.label || '');
		fields = [...fields, field as any];
		addField = false;
	}

	function handleCancel() {
		addField = false;
	}

	function handleWidgetCancel() {
		selected_widget = null;
	}
</script>

<div class="fixed -top-16 inset-s-0 flex h-screen w-full flex-col overflow-auto bg-white dark:bg-surface-900">
	<div class="mb-3 flex items-center justify-between text-surface-900 dark:text-white">
		<PageTitle name="Add a Widget" icon="material-symbols:ink-pen" />
		<Button variant="outline" type="button" onclick={handleCancel} aria-label="Cancel" class="p-0! min-w-0 me-2">
			<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
		</Button>
	</div>

	{#if !selected_widget && !editField}
		<div class="flex items-center justify-center">
			<Button variant="ghost" onclick={handleCancel} aria-label="Cancel" class="mb-5 ml-auto me-10">X</Button>
			<Dropdown options={widget_keys.map(k => ({ label: k, value: k }))} value={selected_widget}>
				{#snippet trigger()}
					<Button variant="outline">Select Widget</Button>
				{/snippet}
			</Dropdown>
		</div>
	{:else}
		<div class="flex-col items-center justify-center overflow-auto">
			<p class="text-wxl mb-3 text-center">Define your <span class="text-tertiary-500 dark:text-primary-500">{selected_widget}</span></p>
			<div class="w-100 mx-2 mb-2 flex justify-between gap-2">
				<Button variant="tertiary" onclick={handleSave} class="dark:">Save {selected_widget} Widget</Button>
				<Button variant="outline" onclick={handleWidgetCancel} class="dark:">Cancel</Button>
			</div>

			{#if guiSchema}
				{#each Object.entries(guiSchema) as [property, value] (property)}
					<InputSwitch
						value={field.widget.GuiFields[property]}
						widget={(value as any).widget}
						key={property}
						onupdate={(e: { value: any }) => (field.widget.GuiFields[property] = e.value)}
					/>
				{/each}
			{/if}
		</div>
	{/if}
</div>

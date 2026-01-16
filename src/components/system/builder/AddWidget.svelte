<!-- 
@file src/components/system/builder/AddWidget.svelte
@description Add widget component for the system builder
-->

<script lang="ts">
	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import DropDown from '@components/system/dropDown/DropDown.svelte';
	import { widgetFunctions } from '@stores/widgetStore.svelte';
	import type { WidgetFunction } from '@src/widgets/types';
	import InputSwitch from './InputSwitch.svelte';

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
			widget: { key: null as string | null, GuiFields: {} as Record<string, any> }
		})
	}: AddWidgetProps = $props();

	const widget_keys = Object.keys($widgetFunctions);
	let guiSchema = $state<WidgetFunction['GuiSchema'] | undefined>(undefined);

	$effect(() => {
		if (selected_widget) {
			const widgetFn = $widgetFunctions[selected_widget];
			guiSchema = widgetFn?.GuiSchema as WidgetFunction['GuiSchema'];
		}
	});

	function handleSave() {
		if (!selected_widget) return;
		field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
		field.label = field.widget.GuiFields.label;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

<div class="fixed -top-16 left-0 flex h-screen w-full flex-col overflow-auto bg-white dark:bg-surface-900">
	<div class="mb-3 flex items-center justify-between text-surface-900 dark:text-white">
		<PageTitle name="Add a Widget" icon="material-symbols:ink-pen" iconColor="text-tertiary-500 dark:text-primary-500" />
		<button type="button" onclick={handleCancel} aria-label="Cancel" class="preset-ghost-secondary-500 btn-icon mr-2">
			<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
		</button>
	</div>

	{#if !selected_widget && !editField}
		<div class="flex items-center justify-center">
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="mb-[20px] ml-auto mr-[40px]">X</button>
			<DropDown items={widget_keys} selected={selected_widget} label="Select Widget" />
		</div>
	{:else}
		<div class="flex-col items-center justify-center overflow-auto">
			<p class="text-wxl mb-3 text-center">
				Define your <span class="text-tertiary-500 dark:text-primary-500">{selected_widget}</span>
			</p>
			<div class="w-100 mx-2 mb-2 flex justify-between gap-2">
				<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" onclick={handleSave}>
					Save {selected_widget} Widget
				</button>
				<button class="preset-filled-secondary-500 btn dark:preset-ghost-secondary-500" onclick={handleWidgetCancel}>Cancel</button>
			</div>

			{#if guiSchema}
				{#each Object.entries(guiSchema) as [property, value] (property)}
					<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
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

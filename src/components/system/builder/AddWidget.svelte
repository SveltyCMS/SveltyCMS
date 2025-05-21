<!-- 
@files src/components/system/builder/AddWidget.svelte
@description - Add Widget component
-->

<script lang="ts">
	import { asAny } from '@utils/utils';

	// Components
	import widgets from '@widgets';
	import DropDown from '@components/system/dropDown/DropDown.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import InputSwitch from './InputSwitch.svelte';

	let {
		fields = $bindable([]),
		addField = $bindable(false),
		editField = $bindable(false),
		selected_widget = $bindable<keyof typeof widgets | null>(null),
		field = $bindable({
			label: '',
			widget: { key: null as keyof typeof widgets | null, GuiFields: {} }
		})
	} = $props();

	const widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let guiSchema = $state<(typeof widgets)[typeof widget_keys]['GuiSchema'] | undefined>(undefined);

	$effect(() => {
		if (selected_widget) {
			guiSchema = widgets[selected_widget]?.GuiSchema;
		}
	});

	function handleSave() {
		if (!selected_widget) return;
		field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
		field.label = asAny(field.widget.GuiFields).label;
		fields = [...fields, field];
		addField = false;
		console.log(fields);
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
		<button type="button" onclick={handleCancel} aria-label="Cancel" class="variant-ghost-secondary btn-icon mr-2">
			<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
		</button>
	</div>

	{#if !selected_widget && !editField}
		<div class="flex items-center justify-center">
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="mb-[20px] ml-auto mr-[40px]">X</button>
			<DropDown items={widget_keys} bindselected={selected_widget} label="Select Widget" />
		</div>
	{:else}
		<div class="flex-col items-center justify-center overflow-auto">
			<p class="text-wxl mb-3 text-center">
				Define your <span class="text-tertiary-500 dark:text-primary-500">{selected_widget}</span>
			</p>
			<div class="w-100 mx-2 mb-2 flex justify-between gap-2">
				<button class="variant-filled-tertiary btn dark:variant-filled-primary" onclick={handleSave}>
					Save {selected_widget} Widget
				</button>
				<button class="variant-filled-secondary btn dark:variant-ghost-secondary" onclick={handleWidgetCancel}>Cancel</button>
			</div>

			{#if guiSchema}
				{#each Object.entries(guiSchema) as [property, value]}
					<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
				{/each}
			{/if}
		</div>
	{/if}
</div>

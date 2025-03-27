<!-- 
@files src/components/system/builder/AddWidget.svelte
@description - Add Widget component
-->

<script lang="ts">
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
		field = $bindable({ label: '', widget: { key: null as keyof typeof widgets | null, GuiFields: {} } })
	} = $props();

	const widget_keys = Object.keys(widgets);
	let guiSchema = $state<any>(undefined);

	$effect(() => {
		if (selected_widget) {
			guiSchema = (widgets[selected_widget] as any)?.constructor?.GuiSchema;
		}
	});

	function handleSave() {
		if (!selected_widget) return;
		field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
		field.label = (field.widget.GuiFields as { label: string }).label;
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

<div class="dark:bg-surface-900 fixed -top-16 left-0 flex h-screen w-full flex-col overflow-auto bg-white">
	<div class="text-surface-900 mb-3 flex items-center justify-between dark:text-white">
		<PageTitle name="Add a Widget" icon="material-symbols:ink-pen" iconColor="text-tertiary-500 dark:text-primary-500" />
		<button type="button" onclick={handleCancel} aria-label="Cancel" class="preset-tonal-secondary border-secondary-500 btn-icon mr-2 border">
			<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
		</button>
	</div>

	{#if !selected_widget && !editField}
		<div class="flex items-center justify-center">
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="mr-[40px] mb-[20px] ml-auto">X</button>
			<DropDown items={widget_keys} selected={selected_widget} label="Select Widget" />
		</div>
	{:else}
		<div class="flex-col items-center justify-center overflow-auto">
			<p class="text-wxl mb-3 text-center">Define your <span class="text-tertiary-500 dark:text-primary-500">{selected_widget}</span></p>
			<div class="mx-2 mb-2 flex w-100 justify-between gap-2">
				<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" onclick={handleSave}>
					Save {selected_widget} Widget
				</button>
				<button class="preset-filled-secondary-500 btn dark:preset-tonal-secondary border-secondary-500 border" onclick={handleWidgetCancel}
					>Cancel</button
				>
			</div>

			{#if guiSchema}
				{#each Object.entries(guiSchema) as [property, value]}
					<InputSwitch bind:value={field.widget.GuiFields[property]} widget={(value as { widget: unknown }).widget} key={property} />
				{/each}
			{/if}
		</div>
	{/if}
</div>

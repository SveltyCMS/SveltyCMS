<script lang="ts">
	import DropDown from '@components/system/dropDown/DropDown.svelte';
	import widgets from '@components/widgets';
	import InputSwitch from './InputSwitch.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import { asAny } from '@utils/utils';

	export let fields: Array<any> = [];
	export let addField: boolean = false;

	let selected_widget: keyof typeof widgets | null = null;
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	$: if (selected_widget) {
		guiSchema = widgets[selected_widget]?.GuiSchema;
	}

	let field = { label: '', widget: { key: selected_widget as unknown as keyof typeof widgets, GuiFields: {} } };
</script>

<div class="fixed -top-16 left-0 flex h-screen w-full flex-col overflow-auto bg-white dark:bg-surface-900">
	<div class="mb-3 flex items-center justify-between text-surface-900 dark:text-white">
		<PageTitle name="Add a Widget" icon="material-symbols:ink-pen" iconColor="text-tertiary-500 dark:text-primary-500" />
		<button class="variant-ghost-secondary btn-icon mr-2" on:click={() => (addField = false)}
			><iconify-icon icon="material-symbols:close" width="24" /></button
		>
	</div>

	{#if !selected_widget}
		test
		<div class="flex items-center justify-center">
			<DropDown items={widget_keys} bind:selected={selected_widget} label="Select Widget" />
		</div>
	{:else}
		<div class=" flex-col items-center justify-center overflow-auto">
			<p class="text-wxl mb-3 text-center">Define your <span class="text-tertiary-500 dark:text-primary-500">{selected_widget}</span></p>
			<div class="w-100 mx-2 mb-2 flex justify-between gap-2">
				<button
					class="variant-filled-tertiary btn dark:variant-filled-primary"
					on:click={() => {
						if (!selected_widget) return;
						field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
						field.label = asAny(field.widget.GuiFields).label;
						fields.push(field);
						fields = fields;
						addField = false;
						console.log(fields);
					}}>Save {selected_widget} Widget</button
				>
				<button class="variant-filled-secondary btn dark:variant-ghost-secondary" on:click={() => (selected_widget = null)}>Cancel</button>
			</div>

			{#each Object.entries(guiSchema) as [property, value]}
				<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
			{/each}
		</div>
	{/if}
</div>

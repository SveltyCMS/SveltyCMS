<script lang="ts">
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';
	import widgets from '@src/components/widgets';
	import InputSwitch from './InputSwitch.svelte';
	import { asAny } from '@src/utils/utils';
	import PageTitle from '@src/components/PageTitle.svelte';
	import { toggleLeftSidebar } from '@src/stores/store';

	export let fields: Array<any> = [];
	export let addField: Boolean = false;

	let selected_widget: keyof typeof widgets | null = null;
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	$: if (selected_widget) {
		guiSchema = widgets[selected_widget]?.GuiSchema;
	}
	let field = { widget: { key: selected_widget as unknown as keyof typeof widgets, GuiFields: {} } };
</script>

<div
	class="fixed left-0 top-0 flex h-screen flex-col overflow-auto bg-white dark:bg-surface-900 {$toggleLeftSidebar === 'full'
		? 'w-[220px]'
		: 'w-full'}"
>
	<div class="mb-3 flex items-center justify-between">
		<PageTitle name="Add a Widget" icon="material-symbols:ink-pen" iconColor="text-primary-500" />
		<button class="variant-ghost-secondary btn-icon mr-2" on:click={() => (addField = false)}
			><iconify-icon icon="material-symbols:close" width="24" /></button
		>
	</div>
	{#if !selected_widget}
		<div class="flex items-center justify-center">
			<DropDown items={widget_keys} bind:selected={selected_widget} label="Select Widget" />
		</div>
	{:else}
		<div class=" flex-col items-center justify-center overflow-auto">
			<p class="text-wxl mb-3 text-center">Define your <span class="text-primary-500">{selected_widget}</span></p>
			<div class="w-100 mx-2 mb-2 flex justify-between gap-2">
				<button
					class="variant-filled-primary btn"
					on:click={() => {
						if (!selected_widget) return;
						field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
						fields.push(field);
						fields = fields;
						addField = false;
						console.log(fields);
					}}>Save {selected_widget} Widget</button
				>
				<button class="variant-ghost-secondary btn" on:click={() => (selected_widget = null)}>Cancel</button>
			</div>

			{#each Object.entries(guiSchema) as [property, value]}
				<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
			{/each}
		</div>
	{/if}
</div>

<script lang="ts">
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';
	import widgets from '@src/components/widgets';
	import InputSwitch from './InputSwitch.svelte';
	import { asAny } from '@src/utils/utils';
	export let fields: Array<any> = [];
	export let addField: Boolean = false;
	let selected_widget: keyof typeof widgets | null = null;
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;

	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	$: if (selected_widget) {
		guiSchema = widgets[selected_widget].GuiSchema;
	}
	let field = { widget: { key: selected_widget as unknown as keyof typeof widgets, GuiFields: {} } };
</script>

{#if !selected_widget}
	<div class="properties">
		<DropDown items={widget_keys} bind:selected={selected_widget} label="Select Widget" />
	</div>
{:else}
	<div class="properties">
		<button class="btn" on:click={() => (selected_widget = null)}>close</button>

		{#each Object.entries(guiSchema) as [property, value]}
			<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
		{/each}
		<button class="btn" 
			on:click={() => {
				if (!selected_widget) return;
				field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
				fields.push(field);
				fields = fields;
				addField = false;
				console.log(fields);
			}}>Finish Widget</button
		>
	</div>
{/if}

<style>
	.properties {
		position: fixed;
		flex-direction: column;
		display: flex;
		justify-content: center;
		align-items: center;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background-color: #242728;
		overflow: auto;
		z-index: 111;
	}
</style>
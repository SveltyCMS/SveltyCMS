<script lang="ts">
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';
	import widgets from '@src/components/widgets';
	import InputSwitch from './InputSwitch.svelte';

	export let fields: Array<any> = [];
	export let addField: Boolean = false;

	let selected_widget: keyof typeof widgets | null = null;
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;

	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	$: if (selected_widget) {
		guiSchema = widgets[selected_widget].GuiSchema;
	}
	let field = { widget: { key: selected_widget as unknown as keyof typeof widgets } };
</script>

{#if !selected_widget}
	<div class="properties">
		<DropDown items={widget_keys} bind:selected={selected_widget} label="Select Widget" />
	</div>
{:else}
	<div class="properties">
		<button class="btn text-primary-500" on:click={() => (selected_widget = null)}>Close</button>

		{#each Object.entries(guiSchema) as [property, value]}
			<InputSwitch bind:value={field[property]} widget={value.widget} key={property} />
		{/each}
		<button
			class="btn"
			on:click={() => {
				if (!selected_widget) return;
				field.widget = { key: selected_widget };
				fields.push(field);
				fields = fields;
				addField = false;
				console.log(fields);
			}}>Finish Widget</button
		>
	</div>
{/if}

<style lang="postcss">
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

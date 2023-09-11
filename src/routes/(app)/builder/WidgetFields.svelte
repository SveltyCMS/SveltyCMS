<script lang="ts">
	import widgets from '@src/components/widgets';
	import InputSwitch from './InputSwitch.svelte';

	export let fields: Array<any> = [];

	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;

	let inputValue = '';
	let currentFieldKey: keyof typeof widgets | null = null;
	let currentField: any;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];

	$: if (currentFieldKey) {
		guiSchema = widgets[currentFieldKey].GuiSchema;
	}
</script>

<div class="variant-filled btn-group-vertical">
	<!-- list of widgets fields -->
	{#each fields as field}
		<button
			on:click={() => {
				currentFieldKey = field.widget.key;
				currentField = field;
			}}
		>
			{field.widget.key}
		</button>
	{/each}
</div>

{#if currentField}
	<div class="container">
		{#each Object.entries(guiSchema) as [property, value]}
			<InputSwitch bind:value={currentField[property]} widget={value.widget} key={property} />
		{/each}
		<!-- close Button -->
		<button class="variant-filled-tertiary btn float-right" on:click={() => (currentField = null)}>Close</button>
	</div>
{/if}

<style>
	.container {
		margin-bottom: 20px;
		padding: 20px 2px;
		background-color: #333637;

		border-radius: 12px;
		min-width: 300px;
	}
</style>

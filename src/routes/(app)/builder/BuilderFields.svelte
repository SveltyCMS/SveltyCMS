<script lang="ts">
	import widgets from '@src/components/widgets';
	import InputSwitch from './InputSwitch.svelte';

	export let fields: Array<any> = [];

	let inputValue = '';
	let currentFieldKey: keyof typeof widgets = 'Text';
	let currentField: any;
	let guiSchema = widgets[currentFieldKey].GuiSchema;
</script>

<div class="container">
	{#each fields as field}
		<button
			on:click={() => {
				currentFieldKey = field.widget.key;
				currentField = field;
			}}
			class="field"
		>
			{field.widget.key}
		</button>
	{/each}
</div>

<div>
	{#if currentField}
		{#each Object.entries(guiSchema) as property}
			<InputSwitch value={currentField[property[0]]} type={property[1].type} key={property[0]} />
		{/each}
	{/if}
</div>

<style lang="postcss">
	.container {
		margin-bottom: 20px;
		padding: 20px 2px;
		background-color: #333637;
		box-shadow: 4px 7px 20px 1px #ffffff69;
		border-radius: 12px;
		min-width: 300px;
	}
	p.field {
		text-align: center;
		color: black;
		padding: 10px;
		background-color: #3df8ff;
		margin-bottom: 4px;
		font-size: 20px;
		border-radius: 10px;
		cursor: pointer;
	}
	p.field:hover {
		background-color: #4fdc4f;
	}
</style>

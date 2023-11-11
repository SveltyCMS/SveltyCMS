<script lang="ts">
	import widgets from '@src/components/widgets';
	import InputSwitch from './InputSwitch.svelte';
	import { asAny } from '@src/utils/utils';

	export let fields: Array<any> = [];

	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let currentFieldKey: keyof typeof widgets | null = null;
	let currentField: any;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	$: if (currentFieldKey) {
		guiSchema = widgets[currentFieldKey]?.GuiSchema;
	}
	let destruct = (node: HTMLDivElement) => {
		node.remove();
	};
</script>

<div class="min-w-[300px]">
	<!-- list of widget names -->
	{#each fields as field}
		<button
			type="button"
			on:click={() => {
				currentFieldKey = field.widget.key;
				currentField = field;
			}}
			class="variant-ghost-tertiary btn w-full"
		>
			{field.widget.key}
		</button>
		<div use:destruct>
			{#each Object.entries(widgets[field.widget.key].GuiSchema) as [property, value]}
				<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
			{/each}
		</div>
	{/each}
</div>

{#if currentField}
	<div class="fixed left-0 top-0 mr-5 flex h-screen w-screen flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900">
		<div>
			<!-- TODO: Assign Save Button -->
			<button class="variant-filled-primary btn" on:click={() => (currentField = null)}>Save not working</button>
			<!-- <button
					class="variant-filled-primary btn"
					on:click={() => {
						if (!selected_widget) return;
						field.widget = { key: selected_widget, GuiFields: field.widget.GuiFields };
						fields.push(field);
						fields = fields;
						addField = false;
						console.log(fields);
					}}>Save {selected_widget} Widget</button
				> -->
			<button class="variant-ghost-secondary btn" on:click={() => (currentField = null)}>Cancel</button>
		</div>
		{#each Object.entries(guiSchema) as [property, value]}
			<InputSwitch bind:value={currentField.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
		{/each}
	</div>
{/if}

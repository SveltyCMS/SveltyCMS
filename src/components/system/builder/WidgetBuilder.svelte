<!--	
@file src/components/system/builder/WidgetBuilder.svelte
@component
**Widget builder component is used to add a new widget to the collection**

@example
<WidgetBuilder bind:fields={fields} bind:addField={addField} />

### Props
- `fields` {array} - Array of widgets
- `addField` {boolean} - Boolean to toggle the add widget form

### Features
- Adds a new widget to the collection
- Edits a widget in the collection
-->

<script lang="ts">
	import AddWidget from './AddWidget.svelte';
	import WidgetFields from './WidgetFields.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	let {
		addField = $bindable(false),
		fields = $bindable([]),
		onFieldsChange
	}: {
		addField?: boolean;
		fields?: any[];
		onFieldsChange?: (fields: any[]) => void;
	} = $props();

	function toggleAddField() {
		addField = true;
	}

	function updateFields(newFields: any[]) {
		fields = newFields;
		onFieldsChange?.(newFields);
	}
</script>

<div class="flex flex-col">
	{#if addField}
		<AddWidget bind:fields bind:addField />
	{:else}
		<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 mt-1 mb-4" onclick={toggleAddField}>
			{m.WidgetBuilder_AddColectionField()}
		</button>
		<WidgetFields {fields} onFieldsUpdate={updateFields} />
	{/if}
</div>

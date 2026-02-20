<!--
@file src/components/system/builder/widget-builder.svelte
@component
**Widget builder component**

### Features
- Add fields
- Edit fields
- Delete fields

### Props
- addField: Boolean to add fields
- fields: Array of widget fields
- onFieldsChange: Function to update fields

### Events
- onFieldsChange: Function to update fields

### Stores
- uiStateManager: Store for UI state

### Components
- AddWidget: Component for adding widgets
-->
<script lang="ts">
	import type { FieldInstance } from '@content/types';
	import type { WidgetBuilderProps } from './types';
	import AddWidget from './add-widget.svelte';
	import WidgetFields from './widget-fields.svelte';
	import { WidgetBuilder_AddColectionField } from '@src/paraglide/messages';

	// Props
	let { addField = $bindable(false), fields = $bindable([]), onFieldsChange }: WidgetBuilderProps = $props();

	function toggleAddField() {
		addField = true;
	}

	function updateFields(newFields: FieldInstance[]) {
		fields = newFields;
		onFieldsChange?.(newFields);
	}
</script>

<div class="flex flex-col">
	{#if addField}
		<AddWidget bind:fields bind:addField />
	{:else}
		<button class="preset-filled-tertiary-500 btn mb-4 mt-1 dark:preset-filled-primary-500" onclick={toggleAddField}>
			{WidgetBuilder_AddColectionField()}
		</button>
		<WidgetFields {fields} onFieldsUpdate={updateFields} />
	{/if}
</div>

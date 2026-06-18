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
	import Button from '@components/ui/button.svelte';
	import type { FieldInstance } from '@content/types';
	import { WidgetBuilder_AddColectionField } from '@src/paraglide/messages';
	import AddWidget from './add-widget.svelte';
	import type { WidgetBuilderProps } from './types';
	import WidgetFields from './widget-fields.svelte';

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
		<Button variant="tertiary" onclick={toggleAddField} class="mb-4 mt-1 dark:">
			{WidgetBuilder_AddColectionField()}
		</Button>
		<WidgetFields {fields} onFieldsUpdate={updateFields} />
	{/if}
</div>

<!--
@file src/components/system/builder/WidgetBuilder.svelte
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
	import AddWidget from './AddWidget.svelte';
	import WidgetFields from './WidgetFields.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import type { FieldInstance } from '@content/types';

	import type { WidgetBuilderProps } from './types';

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
			{m.WidgetBuilder_AddColectionField()}
		</button>
		<WidgetFields {fields} onFieldsUpdate={updateFields} />
	{/if}
</div>

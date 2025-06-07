<!--
@file src/components/system/builder/WidgetBuilder.svelte
@description - Widget builder component
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
		<button class="variant-filled-tertiary btn mb-4 mt-1 dark:variant-filled-primary" onclick={toggleAddField}>
			{m.WidgetBuilder_AddColectionField()}
		</button>
		<WidgetFields {fields} onFieldsUpdate={updateFields} />
	{/if}
</div>

<!--
@file src/components/system/builder/WidgetBuilder.svelte
@description - Widget builder component
-->
<script lang="ts">
	import AddWidget from './AddWidget.svelte';
	import WidgetFields from './WidgetFields.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import type { FieldInstance } from '@content/types';

	// Props
	let {
		addField = $bindable(false),
		fields = $bindable([]),
		onFieldsChange
	}: {
		addField?: boolean;
		fields?: FieldInstance[];
		onFieldsChange?: (fields: FieldInstance[]) => void;
	} = $props();

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
		<button class="bg-tertiary-500 text-white btn mb-4 mt-1 dark:bg-primary-500 text-white" onclick={toggleAddField}>
			{m.WidgetBuilder_AddColectionField()}
		</button>
		<WidgetFields {fields} onFieldsUpdate={updateFields} />
	{/if}
</div>

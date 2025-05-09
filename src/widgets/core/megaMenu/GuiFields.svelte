<!--
@file src/widgets/core/megaMenu/GuiFields.svelte
@component - GUI fields component for mega menu

@example
<GuiFields bind:value={value} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	// Components
	import WidgetBuilder from '@components/system/builder/WidgetBuilder.svelte';

	// Props
	let value = $state<Array<Array<any>>>([]);

	function addLevel() {
		value = [...value, []];
	}

	function updateLevel(index: number, newLevel: Array<any>) {
		value[index] = newLevel;
		value = [...value]; // Trigger reactivity
	}
</script>

<div class="box-border flex w-[99%] flex-col items-center overflow-auto border p-2">
	<p>Menu Fields</p>

	<button class="variant-filled-tertiary btn mb-4 mt-1 dark:variant-filled-primary" onclick={addLevel}>Add Level</button>

	{#each value as level, index}
		<div class="m-3 border border-dashed border-white p-3 text-center">
			<p>level {index + 1}</p>
			<WidgetBuilder fields={level} onFieldsChange={(newFields) => updateLevel(index, newFields)} />
		</div>
	{/each}
</div>

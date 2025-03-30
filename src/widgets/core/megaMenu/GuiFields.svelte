<!--
@file src/widgets/core/megaMenu/GuiFields.svelte
@component - GUI fields component for mega menu
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

	<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 mt-1 mb-4" onclick={addLevel}>Add Level</button>

	{#each value as level, index}
		<div class="m-3 border border-dashed border-white p-3 text-center">
			<p>level {index + 1}</p>
			<WidgetBuilder fields={level} onFieldsChange={(newFields) => updateLevel(index, newFields)} />
		</div>
	{/each}
</div>

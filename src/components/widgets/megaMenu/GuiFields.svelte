<!--
@file src/components/widgets/megaMenu/GuiFields.svelte
@description GUI component for building menu fields in a mega menu structure. 
             Allows adding multiple levels of menu items and configuring their fields.
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

	<button onclick={addLevel} class="variant-filled-primary btn">Add Level</button>

	{#each value as level, index}
		<div class="m-3 border border-dashed border-white p-3 text-center">
			<p>level {index + 1}</p>
			<WidgetBuilder fields={level} />
		</div>
	{/each}
</div>

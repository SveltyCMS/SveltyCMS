<!-- History.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let canUndo = false;
	export let canRedo = false;

	const dispatch = createEventDispatcher();

	function undo() {
		dispatch('undo');
	}

	function redo() {
		dispatch('redo');
	}
</script>

<div>
	<button on:click={undo} disabled={!canUndo}>Undo</button>
	<button on:click={redo} disabled={!canRedo}>Redo</button>
</div>

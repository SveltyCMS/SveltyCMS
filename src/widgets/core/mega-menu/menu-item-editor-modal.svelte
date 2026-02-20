<script lang="ts">
	import { modalState } from '@utils/modal-state.svelte';
	import type { MenuEditContext } from './types';

	let { meta }: { meta: MenuEditContext } = $props();

	function onSave() {
		// identifying the item to save
		// This is a placeholder
		modalState.close();
		if (meta.onSave) {
			meta.onSave(meta.item._fields);
		}
	}

	function onCancel() {
		modalState.close();
		if (meta.onCancel) {
			meta.onCancel();
		}
	}
</script>

<div class="card p-4 w-modal shadow-xl space-y-4">
	<header class="text-2xl font-bold">Edit Menu Item</header>
	<p>Menu Item Editor Placeholder</p>
	<div class="flex justify-end gap-2">
		<button class="btn preset-outlined-surface-500" onclick={onCancel}>Cancel</button>
		<button class="btn preset-filled-primary-500" onclick={onSave}>Save</button>
	</div>
</div>

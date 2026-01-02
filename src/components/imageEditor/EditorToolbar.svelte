<!--
@file: src/components/imageEditor/EditorToolbar.svelte
@component
The new single, intelligent bottom toolbar for the image editor.
It dynamically renders controls based on the active tool.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);
</script>

<div class="border-t border-surface-300 bg-surface-100 p-2 shadow-lg dark:border-surface-700 dark:bg-surface-800">
	<div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
		<!-- Tool-Specific Controls (Dynamic) -->
		<div class="flex h-full flex-1 items-center gap-3">
			{#if toolbarControls?.component}
				{@const Component = toolbarControls.component}
				{#if Component}
					<Component {...toolbarControls.props} />
				{/if}
			{/if}
		</div>
	</div>

	<!-- Validation Error Banner -->
	{#if imageEditorStore.state.error}
		<div
			class="absolute bottom-full left-0 right-0 flex items-center justify-center bg-error-500 py-1 text-xs font-medium text-white"
			transition:fade={{ duration: 200 }}
		>
			<iconify-icon icon="mdi:alert-circle" width="14" class="mr-1"></iconify-icon>
			{imageEditorStore.state.error}
		</div>
	{/if}
</div>

<style>
	:global(.dark) .border-t {
		border-color: rgb(var(--color-surface-700) / 1);
	}
</style>

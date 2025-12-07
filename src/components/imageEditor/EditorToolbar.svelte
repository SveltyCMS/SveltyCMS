<!--
@file: src/components/imageEditor/EditorToolbar.svelte
@component
The new single, intelligent bottom toolbar for the image editor.
It dynamically renders controls based on the active tool.
-->
<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';
	import type Editor from './Editor.svelte';

	let { editorComponent }: { editorComponent: Editor | undefined } = $props();

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
</div>

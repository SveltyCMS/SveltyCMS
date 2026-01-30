<!--
@file: src/components/imageEditor/EditorToolbar.svelte
@component
The new single, intelligent bottom toolbar for the image editor.
It dynamically renders controls based on the active tool.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte.ts';

	/* Restore Tool Icons Logic */
	import { editorWidgets } from './widgets/registry';
	const activeState = $derived(imageEditorStore.state.activeState);
	const hasImage = $derived(!!imageEditorStore.state.imageNode);
	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);
</script>

<div class="flex flex-col border-t border-surface-300 bg-surface-100 shadow-lg dark:text-surface-50 dark:bg-surface-800">
	<!-- Sub-toolbar (Tool Controls) - Stacks ON TOP of icons -->
	{#if toolbarControls?.component}
		{@const Component = toolbarControls.component}
		<div class="border-b border-surface-200 p-2 dark:border-surface-700">
			<div class="mx-auto flex h-10 max-w-7xl items-center justify-center">
				<Component {...toolbarControls.props} />
			</div>
		</div>
	{/if}

	<!-- Main Toolbar (Tool Icons) -->
	<div class="no-scrollbar flex w-full items-center justify-center gap-1 overflow-x-auto p-2" role="toolbar" aria-label="Editor tools">
		{#each editorWidgets as widget}
			<button
				class="tool-button shrink-0 flex flex-col items-center justify-center gap-1 transition-all min-w-16 rounded p-1"
				class:text-primary-500={activeState === widget.key}
				class:opacity-50={!hasImage}
				onclick={() => hasImage && imageEditorStore.switchTool(widget.key)}
				disabled={!hasImage}
				aria-label={widget.title}
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
					class:bg-primary-500={activeState === widget.key}
					class:text-white={activeState === widget.key}
					class:bg-surface-200={activeState !== widget.key}
					class:dark:bg-surface-700={activeState !== widget.key}
				>
					<iconify-icon icon={widget.icon} width="20"></iconify-icon>
				</div>
				<span class="text-[10px] font-medium whitespace-nowrap">{widget.title}</span>
			</button>
		{/each}
	</div>

	<!-- Validation Error Banner -->
	{#if imageEditorStore.state.error}
		<div
			class="absolute bottom-full left-0 right-0 flex items-center justify-center bg-error-500 py-1 text-xs font-medium text-white"
			transition:fade={{ duration: 200 }}
		>
			<iconify-icon icon="mdi:alert-circle" width={14} class="mr-1"></iconify-icon>
			{imageEditorStore.state.error}
		</div>
	{/if}
</div>

<style>
	:global(.dark) .border-t {
		border-color: rgb(var(--color-surface-700) / 1);
	}
</style>

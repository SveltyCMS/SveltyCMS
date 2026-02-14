<!--
@file: src/components/imageEditor/EditorToolbar.svelte
@component
The new single, intelligent bottom toolbar for the image editor.
It dynamically renders controls based on the active tool.
-->
<script lang="ts">
	import { slide, fade } from 'svelte/transition';
	import { imageEditorStore } from '@stores/imageEditorStore.svelte.ts';

	let {
		onsave,
		oncancel,
		isSaving
	}: {
		onsave: () => void;
		oncancel: () => void;
		isSaving: boolean;
	} = $props();

	/* Restore Tool Icons Logic */
	import { editorWidgets } from './widgets/registry';
	const activeState = $derived(imageEditorStore.state.activeState);
	const hasImage = $derived(!!imageEditorStore.state.imageElement);
	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);

	const canUndo = $derived(imageEditorStore.canUndoState);
	const canRedo = $derived(imageEditorStore.canRedoState);

	// Get active widget title
	const activeWidget = $derived(editorWidgets.find((w) => w.key === activeState));
</script>

<div
	class="fixed bottom-0 left-0 right-0 z-40 flex flex-col bg-surface-900 border-t border-surface-700 shadow-2xl"
	role="toolbar"
	aria-label="Editor properties"
>
	<!-- Drawer: Tool Controls (Slides up from within the dock) -->
	{#if toolbarControls?.component}
		{@const Component = toolbarControls.component}
		<div class="flex flex-col border-b border-surface-700 bg-surface-800/50 backdrop-blur-md" transition:slide={{ axis: 'y', duration: 250 }}>
			<!-- Optional: Tool Title Header in Drawer -->
			{#if activeWidget}
				<div class="flex items-center justify-between px-4 py-2 border-b border-surface-700/50">
					<span class="text-xs font-bold uppercase tracking-wider text-surface-400">{activeWidget.title}</span>
					<div class="flex gap-2">
						<!-- Inline Undo/Redo for precision editing -->
						<button
							class="text-surface-400 hover:text-white disabled:opacity-30"
							onclick={() => imageEditorStore.handleUndo()}
							disabled={!canUndo}
							aria-label="Undo"
						>
							<iconify-icon icon="mdi:undo" width="16"></iconify-icon>
						</button>
						<button
							class="text-surface-400 hover:text-white disabled:opacity-30"
							onclick={() => imageEditorStore.handleRedo()}
							disabled={!canRedo}
							aria-label="Redo"
						>
							<iconify-icon icon="mdi:redo" width="16"></iconify-icon>
						</button>
					</div>
				</div>
			{/if}

			<!-- Controls Container -->
			<div class="flex items-center justify-center p-3 sm:p-4 overflow-x-auto">
				<Component {...toolbarControls.props} />
			</div>
		</div>
	{/if}

	<!-- Main Dock: Navigation & Actions -->
	<div class="flex h-16 items-center justify-between px-2 sm:px-4">
		<!-- Left: Cancel -->
		<button
			class="flex flex-col items-center justify-center rounded-lg px-2 py-1 text-surface-400 transition-colors hover:text-white hover:bg-surface-800"
			onclick={oncancel}
			title="Cancel"
		>
			<iconify-icon icon="mdi:close" width="24"></iconify-icon>
			<span class="text-[10px] font-medium mt-0.5 max-sm:hidden">Cancel</span>
		</button>

		<!-- Center: Tool Strip (Scrollable) -->
		<div class="no-scrollbar mx-2 flex flex-1 items-center justify-center gap-1 overflow-x-auto sm:gap-2">
			{#if hasImage}
				{#each editorWidgets as widget (widget.key)}
					<button
						class="group relative flex flex-col items-center justify-center gap-1 rounded-xl p-2 transition-all duration-200"
						class:text-primary-400={activeState === widget.key}
						class:text-surface-400={activeState !== widget.key}
						onclick={() => imageEditorStore.switchTool(widget.key)}
						aria-label={widget.title}
						aria-pressed={activeState === widget.key}
						title={widget.title}
					>
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 {activeState === widget.key
								? 'bg-primary-500/20 text-primary-400'
								: 'group-hover:bg-surface-800'}"
						>
							<iconify-icon icon={widget.icon} width="20"></iconify-icon>
						</div>
						<span class="text-[10px] font-medium whitespace-nowrap {activeState === widget.key ? 'text-primary-400' : ''}">{widget.title}</span>

						{#if activeState === widget.key}
							<div class="absolute -bottom-1 h-1 w-1 rounded-full bg-primary-500"></div>
						{/if}
					</button>
				{/each}
			{:else}
				<span class="text-sm text-surface-500">No image loaded</span>
			{/if}
		</div>

		<!-- Right: Save -->
		<button
			class="flex flex-col items-center justify-center rounded-lg px-2 py-1 text-primary-400 transition-colors hover:text-primary-300 hover:bg-primary-500/10 min-w-[50px]"
			onclick={onsave}
			disabled={isSaving}
			title="Done"
		>
			{#if isSaving}
				<iconify-icon icon="mdi:loading" width="24" class="animate-spin"></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:check" width="24"></iconify-icon>
			{/if}
			<span class="text-[10px] font-medium mt-0.5 max-sm:hidden">Done</span>
		</button>
	</div>

	<!-- System Bar Spacer (for mobile gestures) -->
	<div class="h-[env(safe-area-inset-bottom)] w-full bg-surface-900"></div>

	<!-- Validation Error Toast -->
	{#if imageEditorStore.state.error}
		<div
			class="absolute bottom-full left-1/2 mb-4 flex -translate-x-1/2 items-center justify-center rounded-full bg-error-500/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
			transition:fade={{ duration: 200 }}
		>
			<iconify-icon icon="mdi:alert-circle" width={16} class="mr-2"></iconify-icon>
			{imageEditorStore.state.error}
		</div>
	{/if}
</div>

<style>
	:global(.dark) .border-t {
		border-color: rgb(var(--color-surface-700) / 1);
	}
</style>

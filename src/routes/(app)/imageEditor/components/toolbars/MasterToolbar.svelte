<!--
@file src/routes/(app)/imageEditor/components/toolbars/MasterToolbar.svelte
@component
**Master toolbar that tools register their controls into**
Single unified toolbar that dynamically renders tool-specific controls.
Tools provide their control components which get rendered here.

#### Props
- `embedded` (optional): Boolean for static vs fixed positioning

### Features:
- Dynamically rendered tool-specific controls in center
- Clean, focused interface for widget controls
-->

<script lang="ts">
	import { imageEditorStore } from '@stores/imageEditorStore.svelte';

	const { embedded = false } = $props<{
		embedded?: boolean;
	}>();

	// Get active tool controls from store
	const toolbarControls = $derived(imageEditorStore.state.toolbarControls);
</script>

<div class="master-toolbar" class:fixed={!embedded} class:static={embedded}>
	<div class="toolbar-inner">
		<!-- Center: Tool-specific controls (dynamically rendered) - Full width -->
		<div class="tool-controls">
			{#if toolbarControls}
				{@const ToolComponent = toolbarControls.component}
				<ToolComponent {...toolbarControls.props} />
			{:else}
				<span class="hint">Select a tool from the left sidebar to begin editing</span>
			{/if}
		</div>
	</div>
</div>

<style lang="postcss">
	@reference "../../../../../app.postcss";
	
	.master-toolbar {
		@apply bottom-0 left-0 right-0 z-50 border-t backdrop-blur-md;
		background-color: rgb(var(--color-surface-50) / 0.95);
		border-color: rgb(var(--color-surface-300) / 1);
	}

	:global(.dark) .master-toolbar {
		background-color: rgb(var(--color-surface-800) / 0.95);
		border-color: rgb(var(--color-surface-700) / 1);
	}

	.toolbar-inner {
		@apply mx-auto flex max-w-7xl items-center justify-center gap-4 px-4 py-2;
	}

	.tool-controls {
		@apply flex w-full items-center justify-center gap-3;
	}

	.hint {
		@apply text-sm text-surface-500 dark:text-surface-400;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.toolbar-inner {
			@apply px-2 py-2;
		}

		.hint {
			@apply hidden;
		}
	}
</style>

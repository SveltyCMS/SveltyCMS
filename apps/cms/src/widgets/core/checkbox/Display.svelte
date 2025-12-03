<script lang="ts">
	import type { CheckboxWidgetData } from './';

	let { value }: { value: CheckboxWidgetData } = $props();
</script>

<div class="flex h-full w-full items-center justify-center">
	{#if value}
		<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" class="text-success-500" aria-label="Checked">
			<path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"></path>
		</svg>
	{:else}
		<span class="select-none text-surface-400" aria-label="Unchecked">−</span>
	{/if}
</div>

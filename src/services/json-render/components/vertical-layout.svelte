<script lang="ts">
	import type { ComponentRenderProps } from 'json-render-svelte';

	let { children }: ComponentRenderProps = $props();
</script>

<div class="flex flex-col gap-4 w-full">
	{#if children}
		{@render children()}
	{/if}
</div>

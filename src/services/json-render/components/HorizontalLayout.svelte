<script lang="ts">
	import type { ComponentRenderProps } from 'json-render-svelte';

	let { children }: ComponentRenderProps = $props();
</script>

<div class="flex flex-row gap-4 w-full flex-wrap">
	{#if children}
		{@render children()}
	{/if}
</div>

<!--
@file src/services/json-render/components/vertical-layout.svelte
@component
@description Vertical flex container for AI-generated dashboard specs.
### Features
- Vertical stack layout with consistent spacing
-->
<script lang="ts">
	import type { ComponentRenderProps } from '../catalog';

	let { children }: ComponentRenderProps = $props();
</script>

<div class="flex flex-col gap-4 w-full">
	{#if children}
		{@render children()}
	{/if}
</div>

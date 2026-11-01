<!--
@file src/services/json-render/components/horizontal-layout.svelte
@component
@description Horizontal flex container for AI-generated dashboard specs.
### Features
- Responsive flex-row wrapping layout
-->
<script lang="ts">
	import type { ComponentRenderProps } from '../catalog';

	let { children }: ComponentRenderProps = $props();
</script>

<div class="flex flex-row gap-4 w-full flex-wrap">
	{#if children}
		{@render children()}
	{/if}
</div>

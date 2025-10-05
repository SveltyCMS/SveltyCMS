<!--
@file src/widgets/core/richText/LazyRichTextInput.svelte
@component
**Lazy-Loaded RichText Input Component**

Dynamically loads the heavy TipTap editor only when needed, reducing initial bundle size.

@example
<LazyRichTextInput bind:value={richTextData} field={fieldDefinition} />

### Features
- **Lazy Loading**: TipTap editor loads only when component mounts
- **Loading State**: Shows skeleton loader during async import
- **Bundle Optimization**: Reduces initial chunk size by ~150-200KB
- **Transparent API**: Same props as RichTextInput component
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import type { FieldType } from './';
	import type { RichTextData } from './types';

	let { field, value, error }: { field: FieldType; value: Record<string, RichTextData> | null | undefined; error?: string | null } = $props();

	let RichTextInput: any = $state(null);
	let loading = $state(true);

	onMount(async () => {
		// Dynamically import the heavy TipTap component
		const module = await import('./Input.svelte');
		RichTextInput = module.default;
		loading = false;
	});
</script>

{#if loading}
	<!-- Loading skeleton while TipTap editor loads -->
	<div class="richtext-skeleton animate-pulse">
		<div class="mb-2 h-10 rounded bg-surface-300 dark:bg-surface-700"></div>
		<div class="mb-2 h-12 rounded bg-surface-300 dark:bg-surface-700"></div>
		<div class="h-64 rounded bg-surface-300 dark:bg-surface-700"></div>
	</div>
{:else if RichTextInput}
	<!-- Render the actual RichText component once loaded -->
	<!-- In Svelte 5 runes mode, components are dynamic by default -->
	<RichTextInput {field} bind:value {error} />
{/if}

<style>
	.richtext-skeleton {
		padding: 1rem;
		border: 1px solid rgb(var(--color-surface-400));
		border-radius: 0.5rem;
	}
</style>

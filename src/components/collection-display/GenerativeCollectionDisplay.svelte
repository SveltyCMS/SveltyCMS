<!--
@file src/components/collection-display/GenerativeCollectionDisplay.svelte
@component
**AI-Native Generative Collection Display**

This component renders a collection's data using a dynamic JSON specification powered by json-render-svelte.
It allows for completely AI-generated, interactive layouts that leverage existing widgets.
-->

<script lang="ts">
	import { Renderer, JSONUIProvider, type Spec } from 'json-render-svelte';
	import { sveltyRegistry } from '@src/services/json-render/catalog';
	import type { CollectionEntry, Schema } from '@src/content/types';

	interface Props {
		schema: Schema;
		entries: CollectionEntry[];
		context?: Record<string, unknown>;
	}

	let { schema, entries, context = {} }: Props = $props();

	// The spec identifies how to render the data
	// If the schema doesn't have a displaySpec, we fallback to a default list (or handled by parent)
	const displaySpec = $derived(
		(schema.displaySpec as unknown as Spec) || {
			root: 'root',
			elements: {
				root: {
					type: 'EntryList',
					props: { entries }
				}
			}
		}
	);

	// Merged context for the renderer
	const initialState = $derived({
		...context,
		entries,
		schema
	});
</script>

<div class="generative-display-container w-full h-full p-4">
	{#if schema.displaySpec}
		<JSONUIProvider {initialState}>
			<Renderer registry={sveltyRegistry} spec={displaySpec} />
		</JSONUIProvider>
	{:else}
		<!-- Default standard fallback if no AI spec is provided -->
		<div class="p-4 text-surface-500 italic text-center">Use AI to generate a custom display for this collection.</div>
	{/if}
</div>

<style>
	.generative-display-container {
		/* Premium transitions for AI-rendered content */
		animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

<!--
@file src/widgets/core/slug/display.svelte
@component
**Slug Widget Display** — compact URL-path preview for collection lists.

@props
- `field`: Field instance (translation flag)
- `value`: Slug string or locale record
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import type { FieldType } from './';

	const { field, value }: { field: FieldType; value: string | Record<string, unknown> | null | undefined } =
		$props();

	const lang = $derived(
		field?.translated
			? app.contentLanguage.toLowerCase()
			: ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase()
	);

	const displayText = $derived.by(() => {
		if (typeof value === 'string' && value.trim() && value.trim() !== '-' && value.trim() !== '–') return value.trim();
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const rec = value as Record<string, unknown>;
			const hit = rec[lang] ?? rec[Object.keys(rec)[0] ?? ''];
			if (typeof hit === 'string' && hit.trim() && hit.trim() !== '-') return hit.trim();
		}
		return '';
	});
</script>

{#if displayText}
	<span
		class="inline-block max-w-full min-w-0 truncate whitespace-nowrap font-mono text-xs leading-5"
		style="color: var(--admin-text-body)"
		title={`/${displayText}`}
	>/{displayText}</span>
{:else}
	<span style="color: var(--admin-text-muted)">—</span>
{/if}

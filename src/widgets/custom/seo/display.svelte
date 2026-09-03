<!--
@file src/widgets/custom/Seo/Display.svelte
@component
**SEO Widget Display Component**

Displays SEO data as compact preview with focus keyword and accessibility tooltips.
Part of the Three Pillars Architecture for widget system.

@example
<SeoDisplay value={{ focusKeyword: "svelte cms", title: "Page Title", description: "Meta description" }} />
Renders: SEO icon + "Keyword: svelte cms" with hover tooltip showing full meta data 

### Props
- `value: SeoData | null | undefined` - SEO metadata object with title, description, and focus keyword

### Features
- **Compact Preview**: Focus keyword display with SEO icon for quick identification
- **Rich Tooltips**: Hover tooltips showing full title and description metadata
- **Iconify Integration**: Professional SEO icon from Tabler icon set
- **Null Handling**: Graceful fallback to "–" for missing information
- **Performance Optimized**: Efficient text derivation with `$derived.by()`
- **Accessibility**: Descriptive tooltips for screen readers and assistive technology
- **PostCSS Styling**: Modern CSS with flexbox layout and responsive design
- **Visual Hierarchy**: Consistent icon and text alignment for list contexts
-->

<script lang="ts">
	import { app } from '@src/stores/store.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { unwrapSeoPayload } from './seo-serp';

	const { value }: { value: unknown } = $props();

	const payload = $derived(unwrapSeoPayload(value, app.contentLanguage || 'en'));
	const hasSeoPreview = $derived(
		Boolean(
			payload &&
				(String(payload.focusKeyword ?? '').trim() ||
					String(payload.title ?? '').trim() ||
					String(payload.description ?? '').trim())
		)
	);
	const displayText = $derived(payload?.focusKeyword ? `Keyword: ${payload.focusKeyword}` : 'SEO');
</script>

{#if hasSeoPreview && payload}
	<SystemTooltip title="Title: {payload.title} | Description: {payload.description}">
		<div class="inline-flex items-center gap-0.5 text-surface-600 dark:text-surface-100">
			<iconify-icon icon="tabler:seo" width="24" style="flex-shrink: 0"></iconify-icon>
			<span>{displayText}</span>
		</div>
	</SystemTooltip>
{:else}
	<span>–</span>
{/if}

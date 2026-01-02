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
- **Null Handling**: Graceful fallback to "No SEO data" for missing information
- **Performance Optimized**: Efficient text derivation with `$derived.by()`
- **Accessibility**: Descriptive tooltips for screen readers and assistive technology
- **PostCSS Styling**: Modern CSS with flexbox layout and responsive design
- **Visual Hierarchy**: Consistent icon and text alignment for list contexts
-->

<script lang="ts">
	import type { SeoData } from './types';

	const { value }: { value: SeoData | null | undefined } = $props();

	// Note: The score is not stored with the data, so we can't display it here.
	// A more advanced implementation might store the score, or we can just show the keyword.
	const displayText = $derived.by(() => {
		if (!value?.focusKeyword) return 'No SEO data';
		return `Keyword: ${value.focusKeyword}`;
	});
</script>

{#if value}
	<div class="seo-display" title="Title: {value.title} | Description: {value.description}">
		<iconify-icon icon="tabler:seo" class="icon"></iconify-icon>
		<span>{displayText}</span>
	</div>
{:else}
	<span>–</span>
{/if}

<style>
	.seo-display {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #555;
	}
	.icon {
		flex-shrink: 0;
	}
</style>

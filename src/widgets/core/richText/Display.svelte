<!--
@file src/widgets/core/richText/Display.svelte
@component
**RichText Widget Display Component**

Renders sanitized HTML content with optional titles in a prose-styled container.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<RichTextDisplay value={{ title: "Article", content: "<p>Rich <strong>text</strong> content</p>" }} />
Renders: Title heading + sanitized HTML in prose container

### Props
- `value: RichTextData | null | undefined` - Rich text object with title and HTML content

### Features
- **HTML Rendering**: Direct HTML rendering without sanitization
- **Prose Styling**: Semantic typography with proper line-height and spacing
- **Title Support**: Optional heading display with structured hierarchy
- **Null Handling**: Graceful fallback to "–" for empty content
- **Content Display**: Renders HTML content directly (assumes pre-sanitized input)
-->

<script lang="ts">
	import type { RichTextData } from './types';

	let { value }: { value: RichTextData | null | undefined } = $props();

	let sanitizedHtml = $state('');

	// When the value changes, set the HTML content.
	$effect(() => {
		if (value?.content) {
			sanitizedHtml = value.content;
		} else {
			sanitizedHtml = '';
		}
	});
</script>

{#if sanitizedHtml}
	{#if value?.title}
		<h2>{value.title}</h2>
	{/if}
	<div class="prose">
		{@html sanitizedHtml}
	</div>
{:else}
	<span>–</span>
{/if}

<style>
	/* Basic styles for a prose container */
	.prose {
		line-height: 1.6;
	}
	.prose :global(h1) {
		font-weight: 600;
		margin-bottom: 0.5em;
	}
	.prose :global(h2) {
		font-weight: 600;
		margin-bottom: 0.5em;
	}
	.prose :global(h3) {
		font-weight: 600;
		margin-bottom: 0.5em;
	}
	.prose :global(p) {
		margin-bottom: 1em;
	}
</style>

<!--
@file src/widgets/core/richText/Display.svelte
@component
**RichText Widget Display Component**

Renders sanitized HTML content with optional titles in a prose-styled container.
Part of the Three Pillars Architecture for widget system.

@example
<RichTextDisplay value={{ title: "Article", content: "<p>Rich <strong>text</strong> content</p>" }} />
Renders: Title heading + XSS-protected HTML in prose container

### Props
- `value: RichTextData | null | undefined` - Rich text object with title and HTML content

### Features
- **XSS Protection**: Sanitized HTML rendering via Sanitize component
- **Prose Styling**: Semantic typography with proper line-height and spacing
- **Title Support**: Optional heading display with structured hierarchy
- **Null Handling**: Graceful fallback to "–" for empty content
- **Content Display**: Renders HTML content with DOMPurify sanitization
-->

<script lang="ts">
	import type { RichTextData } from './types';
	import Sanitize from '@utils/Sanitize.svelte';

	let { value }: { value: RichTextData | null | undefined } = $props();
</script>

{#if value?.content}
	{#if value.title}
		<h2>{value.title}</h2>
	{/if}
	<Sanitize html={value.content} profile="rich-text" class="prose" />
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

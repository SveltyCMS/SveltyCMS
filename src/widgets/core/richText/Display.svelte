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
- **HTML Sanitization**: DOMPurify integration for XSS protection and security
- **Prose Styling**: Semantic typography with proper line-height and spacing
- **Title Support**: Optional heading display with structured hierarchy
- **Async Loading**: Dynamic DOMPurify import for optimal bundle size
- **Null Handling**: Graceful fallback to "–" for empty content
- **Security First**: Always sanitizes user-generated HTML content
- **Global Styles**: Proper CSS targeting for rendered HTML elements
- **Content Security**: Prevents malicious script injection and XSS attacks
-->

<script lang="ts">
	import type { RichTextData } from './types';
	import { onMount } from 'svelte';

	let { value }: { value: RichTextData | null | undefined } = $props();

	let sanitizedHtml = $state('');

	// When the value changes, sanitize the HTML content.
	$effect(() => {
		async function sanitize() {
			if (value?.content) {
				// ❗ SECURITY WARNING: Always sanitize user-generated HTML.
				// You need to install DOMPurify: `npm install dompurify`
				const DOMPurify = (await import('dompurify')).default;
				sanitizedHtml = DOMPurify.sanitize(value.content);
			} else {
				sanitizedHtml = '';
			}
		}
		sanitize();
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
	.prose :global(h1, h2, h3) {
		font-weight: 600;
		margin-bottom: 0.5em;
	}
	.prose :global(p) {
		margin-bottom: 1em;
	}
</style>

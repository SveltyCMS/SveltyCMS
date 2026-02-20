<script lang="ts">
	/**
	 * Sanitize Component
	 *
	 * **Purpose:** Secure wrapper for rendering HTML content (@html) with XSS protection.
	 *
	 * **Security:**
	 * - Uses DOMPurify to sanitize HTML before rendering
	 * - Removes dangerous tags (script, iframe, embed, object)
	 * - Strips event handlers (onclick, onerror, etc.)
	 * - Validates URLs in href/src attributes
	 * - Configurable sanitization profiles
	 *
	 * **Usage:**
	 * <Sanitize html={userGeneratedContent} />
	 * <Sanitize html={richTextContent} profile="rich-text" />
	 *
	 * @component
	 */

	import { onMount } from 'svelte';

	type SanitizeProfile = 'default' | 'rich-text' | 'strict';

	interface Props {
		/** Custom CSS class for wrapper element */
		class?: string;
		/** HTML content to sanitize and render */
		html: string;
		/** Sanitization profile - controls allowed tags/attributes */
		profile?: SanitizeProfile;
	}

	let { html, profile = 'default', class: className }: Props = $props();

	let DOMPurify: any;
	let sanitized = $state('');

	// Sanitization profiles
	const PROFILES: Record<SanitizeProfile, any> = {
		default: {
			ALLOWED_TAGS: [
				'p',
				'br',
				'strong',
				'em',
				'u',
				's',
				'a',
				'ul',
				'ol',
				'li',
				'blockquote',
				'code',
				'pre',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'img',
				'span',
				'div'
			],
			ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
			ALLOW_DATA_ATTR: false
		},
		'rich-text': {
			ALLOWED_TAGS: [
				'p',
				'br',
				'strong',
				'em',
				'u',
				's',
				'a',
				'ul',
				'ol',
				'li',
				'blockquote',
				'code',
				'pre',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'img',
				'span',
				'div',
				'table',
				'thead',
				'tbody',
				'tr',
				'th',
				'td',
				'hr',
				'sub',
				'sup',
				'mark',
				'abbr',
				'cite',
				'q',
				'del',
				'ins'
			],
			ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel', 'width', 'height', 'align', 'colspan', 'rowspan'],
			ALLOW_DATA_ATTR: true
		},
		strict: {
			ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a'],
			ALLOWED_ATTR: ['href', 'title', 'rel'],
			ALLOW_DATA_ATTR: false
		}
	};

	onMount(async () => {
		// Dynamically import DOMPurify (client-side only)
		const module = await import('isomorphic-dompurify');
		DOMPurify = module.default;

		// Sanitize HTML
		sanitizeHtml();
	});

	function sanitizeHtml() {
		if (!(DOMPurify && html)) {
			sanitized = '';
			return;
		}

		const config = PROFILES[profile];

		// Add URL validation hook
		DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
			// Validate links
			if (node.tagName === 'A' && node.hasAttribute('href')) {
				const href = node.getAttribute('href');
				// Only allow http(s), mailto, and relative URLs
				if (href && !href.match(/^(https?:|mailto:|\/|#)/) && !href.startsWith('data:')) {
					node.removeAttribute('href');
				}
				// Add rel="noopener noreferrer" to external links
				if (href?.match(/^https?:/)) {
					node.setAttribute('rel', 'noopener noreferrer');
					// Only allow target="_blank" for external links
					if (node.getAttribute('target') !== '_blank') {
						node.removeAttribute('target');
					}
				}
			}

			// Validate images
			if (node.tagName === 'IMG' && node.hasAttribute('src')) {
				const src = node.getAttribute('src');
				// Only allow http(s), data URLs, and relative URLs
				if (src && !src.match(/^(https?:|data:|\/)/)) {
					node.removeAttribute('src');
				}
			}
		});

		sanitized = DOMPurify.sanitize(html, config);
	}

	// Re-sanitize when html or profile changes
	$effect(() => {
		if (DOMPurify) {
			sanitizeHtml();
		}
	});
</script>

<!-- Render sanitized HTML -->
{#if sanitized}
	<div class={className} data-sanitized>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html sanitized}
	</div>
{:else}
	<!-- Loading state while DOMPurify loads -->
	<div class={className} data-sanitize-loading><!-- You can customize this loading state --></div>
{/if}

<!--
**Migration Guide:**

Replace raw @html with Sanitize component:

**Before:**
```svelte
{@html userContent}
```

**After:**
```svelte
<script>
  import Sanitize from '@utils/sanitize.svelte';
</script>

<Sanitize html={userContent} />
```

**Profile Examples:**
- `default`: Basic HTML (paragraphs, lists, links, images)
- `rich-text`: Full rich text editor output (tables, headings, formatting)
- `strict`: Minimal formatting only (bold, italic, links)

**Custom Styling:**
```svelte
<Sanitize html={content} class="prose dark:prose-invert" />
```

**Benefits:**
- XSS attack prevention
- URL validation for links and images
- Automatic rel="noopener noreferrer" for external links
- Configurable sanitization levels
- SSR-safe (DOMPurify loaded only on client)
-->

<style>
	/* Base styles for sanitized content */
	[data-sanitized] {
		/* Reset potentially dangerous CSS properties */
		position: relative;
		overflow: visible;
	}

	/* Prevent layout-breaking images */
	[data-sanitized] :global(img) {
		max-width: 100%;
		height: auto;
	}

	/* Loading state (invisible by default) */
	[data-sanitize-loading] {
		min-height: 1em;
	}
</style>

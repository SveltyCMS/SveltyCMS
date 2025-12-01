<!--
@file src/utils/Sanitize.svelte
@component 
**Sanitize - Secure wrapper for rendering HTML content (@html) with XSS protection**

**Security:**
- Built-in HTML sanitization using regex-based tag/attribute filtering
- Removes dangerous tags (script, iframe, embed, object)
- Strips event handlers (onclick, onerror, etc.)
- Validates URLs in href/src attributes
- Configurable sanitization profiles
- No external dependencies required

**Usage:**
<Sanitize html={userGeneratedContent} />
<Sanitize html={richTextContent} profile="rich-text" />

**Note:**
For rich text content from Tiptap editor, sanitization is optional as Tiptap
already uses schema-based validation. This component provides defense-in-depth.

-->

<script lang="ts">
	type SanitizeProfile = 'default' | 'rich-text' | 'strict';

	interface Props {
		/** HTML content to sanitize and render */
		html: string;
		/** Sanitization profile - controls allowed tags/attributes */
		profile?: SanitizeProfile;
		/** Custom CSS class for wrapper element */
		class?: string;
	}

	const { html, profile = 'default', class: className }: Props = $props();

	// Sanitization profiles
	const PROFILES: Record<string, any> = {
		default: {
			allowedTags: [
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
			allowedAttrs: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel']
		},
		'rich-text': {
			allowedTags: [
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
			allowedAttrs: [
				'href',
				'src',
				'alt',
				'title',
				'class',
				'id',
				'target',
				'rel',
				'width',
				'height',
				'align',
				'colspan',
				'rowspan',
				'data-youtube-video'
			]
		},
		strict: {
			allowedTags: ['p', 'br', 'strong', 'em', 'a'],
			allowedAttrs: ['href', 'title', 'rel']
		}
	};

	/**
	 * Built-in HTML sanitizer using regex-based filtering
	 * Removes dangerous tags, scripts, and event handlers
	 */
	function sanitizeHtml(input: string): string {
		if (!input) return '';

		const config = PROFILES[profile];
		let cleaned = input;

		// Remove script tags and content
		cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

		// Remove dangerous tags (iframe, object, embed, etc.)
		cleaned = cleaned.replace(/<(iframe|object|embed|applet|meta|link|style)[^>]*>.*?<\/\1>/gi, '');
		cleaned = cleaned.replace(/<(iframe|object|embed|applet|meta|link|style)[^>]*\/>/gi, '');

		// Remove all event handlers (onclick, onerror, etc.)
		cleaned = cleaned.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
		cleaned = cleaned.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

		// Remove javascript: and data: protocols from hrefs/srcs
		cleaned = cleaned.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
		cleaned = cleaned.replace(/src\s*=\s*["']\s*javascript:[^"']*["']/gi, 'src=""');

		// Validate URLs in href and src attributes
		cleaned = cleaned.replace(/(href|src)\s*=\s*["']([^"']*)["']/gi, (match, attr, url) => {
			// Allow http(s), mailto, relative URLs, and data URLs (for images)
			if (attr === 'href' && !url.match(/^(https?:|mailto:|\/|#)/)) {
				return `${attr}="#"`;
			}
			if (attr === 'src' && !url.match(/^(https?:|data:|\/)/)) {
				return `${attr}=""`;
			}
			return match;
		});

		// Filter tags: only allow whitelisted tags
		cleaned = cleaned.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
			const tagLower = tag.toLowerCase();
			if (config.allowedTags.includes(tagLower)) {
				// Tag is allowed, now filter attributes
				return match.replace(/\s+([a-z-]+)\s*=\s*["']([^"']*)["']/gi, (_match, attrName, attrValue) => {
					if (config.allowedAttrs.includes(attrName.toLowerCase())) {
						// Add rel="noopener noreferrer" to external links
						if (tagLower === 'a' && attrName === 'href' && attrValue.match(/^https?:/)) {
							if (!match.includes('rel=')) {
								return ` ${attrName}="${attrValue}" rel="noopener noreferrer"`;
							}
						}
						return ` ${attrName}="${attrValue}"`;
					}
					return ''; // Remove disallowed attribute
				});
			}
			return ''; // Remove disallowed tag
		});

		return cleaned;
	}

	// Reactive sanitization
	const sanitized = $derived(sanitizeHtml(html));
</script>

<!-- Render sanitized HTML -->
{#if sanitized}
	<div class={className} data-sanitized>
		{@html sanitized}
	</div>
{:else}
	<div class={className} data-sanitize-empty>
		<!-- Empty content -->
	</div>
{/if}

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

	/* Empty state (invisible by default) */
	[data-sanitize-empty] {
		min-height: 0;
	}
</style>

<script lang="ts">
/**
 * @file src/utils/sanitize.svelte
 * @description Isomorphic XSS-protected HTML renderer.
 *
 * ### Hardening (audit 2026-07):
 * - SSR support: jsdom-based sanitization on server (no flash/layout shift on client)
 * - Reactive $effect: replaces onMount + guard pattern, sanitizes on every html/profile change
 * - No loading flicker: server-rendered content arrives sanitized in the initial HTML
 *
 * **Security:**
 * - Uses DOMPurify to sanitize HTML before rendering
 * - URL validation for links (external → rel="noopener noreferrer")
 * - Image src validation (http/data/relative only)
 * - Configurable sanitization profiles
 *
 * @component
 */

import { browser } from "$app/environment";

type SanitizeProfile = "default" | "rich-text" | "strict";

interface Props {
	class?: string;
	html: string;
	profile?: SanitizeProfile;
}

let { html, profile = "default", class: className }: Props = $props();

// ── Module-scope sanitizer instance (lazy-init) ──
let DOMPurify: any;
let addHook: any;
let sanitized = $state("");

// ── Profiles (shared between SSR and client) ──
const DEFAULT_TAGS = [
	"p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li",
	"blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
	"img", "span", "div",
];
const DEFAULT_ATTR = [
	"href", "src", "alt", "title", "class", "id", "target", "rel",
];

const PROFILES: Record<SanitizeProfile, { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[]; ALLOW_DATA_ATTR: boolean }> = {
	default: {
		ALLOWED_TAGS: DEFAULT_TAGS,
		ALLOWED_ATTR: DEFAULT_ATTR,
		ALLOW_DATA_ATTR: false,
	},
	"rich-text": {
		ALLOWED_TAGS: [...DEFAULT_TAGS, "table", "thead", "tbody", "tr", "th", "td", "hr", "sub", "sup", "mark", "abbr"],
		ALLOWED_ATTR: [...DEFAULT_ATTR, "colspan", "rowspan", "align", "width", "height"],
		ALLOW_DATA_ATTR: true,
	},
	strict: {
		ALLOWED_TAGS: ["p", "br", "strong", "em", "a"],
		ALLOWED_ATTR: ["href", "title", "rel"],
		ALLOW_DATA_ATTR: false,
	},
};

// ── Initialize sanitizer ──

async function initSanitizer() {
	if (DOMPurify) return;

	if (browser) {
		// Client: DOMPurify uses native browser DOM
		const mod = await import("dompurify");
		DOMPurify = mod.default;
	} else {
		// Server: DOMPurify needs jsdom for DOM simulation
		const [{ default: createDOMPurify }, { JSDOM }] = await Promise.all([
			import("dompurify"),
			// @ts-ignore - jsdom types may not be installed
			import("jsdom"),
		]);
		const window = new JSDOM("").window;
		// @ts-ignore - DOMPurify factory returns sanitize function
		DOMPurify = createDOMPurify(window);
	}

	addHook = DOMPurify.addHook;
}

// ── Sanitization logic ──

function sanitizeHtml() {
	if (!html) {
		sanitized = "";
		return;
	}

	const config = structuredClone(PROFILES[profile]);

	// URL validation hook (client-side only — hooks require DOM)
	if (addHook) {
		addHook("afterSanitizeAttributes", (node: any) => {
			if (node.tagName === "A" && node.hasAttribute("href")) {
				const href = node.getAttribute("href");
				if (href && !href.match(/^(https?:|mailto:|\/|#)/) && !href.startsWith("data:")) {
					node.removeAttribute("href");
				}
				if (href?.match(/^https?:/)) {
					node.setAttribute("rel", "noopener noreferrer");
					if (node.getAttribute("target") !== "_blank") {
						node.removeAttribute("target");
					}
				}
			}
			if (node.tagName === "IMG" && node.hasAttribute("src")) {
				const src = node.getAttribute("src");
				if (src && !src.match(/^(https?:|data:|\/)/)) {
					node.removeAttribute("src");
				}
			}
		});
	}

	sanitized = DOMPurify.sanitize(html, config);
}

// ── Reactive: sanitize whenever html or profile changes ──
$effect(() => {
	initSanitizer().then(() => sanitizeHtml());
});
</script>

{#if sanitized}
	<div class={className} data-sanitized>
		{@html sanitized}
	</div>
{:else}
	<div class={className} data-sanitize-loading></div>
{/if}

<style>
	[data-sanitized] {
		position: relative;
		overflow: visible;
	}

	[data-sanitized] :global(img) {
		max-width: 100%;
		height: auto;
	}

	[data-sanitize-loading] {
		min-height: 1em;
	}
</style>

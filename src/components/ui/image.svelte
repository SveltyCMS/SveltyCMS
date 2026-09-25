<!--
@file src/components/ui/image.svelte
@component
**Responsive image component with automatic srcset generation from uploaded variants.**

Consumes the thumbnails/variants generated during upload (via `saveResized`) and renders
an optimal `<img>` for every device. Variant URLs are resolved through `mediaDisplayUrl()`,
so installs that serve media from a separate origin (`MEDIASERVER_URL`) stay correct.
`src` remains the asset URL — it is only the no-srcset fallback, browsers use `srcset`.

### Props
- `asset` (MediaImage | { url?; thumbnails?; alt?; metadata? } | undefined | null): Media record or URL object
- `src` (string): Direct URL fallback (used when asset is not provided)
- `preset` ('thumbnail' | 'card' | 'default' | 'hero'): Width ladder selecting which variants to include in srcset
- `sizes` (string): Responsive sizes attribute (default: '100vw')
- `priority` (boolean): When true, sets loading="eager" + fetchpriority="high"
- `class` (string): Additional CSS classes forwarded to the <img>
- Plus all standard HTML <img> attributes via $$restProps

### Features:
- srcset generation from asset thumbnails/variants (media-server/CDN aware)
- Explicit `sizes` per surface so the browser picks the smallest sufficient variant
- loading="lazy" by default, "eager" when priority
- fetchpriority="high" when priority
- decoding="async"
- Intrinsic width/height for CLS prevention
- Alt text from asset metadata if not provided
- Dev warning when meaningful image has no alt
- Forwards all native <img> attributes
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	/**
	 * @file src/components/ui/image.svelte
	 * @description Responsive image component with automatic srcset generation from uploaded variants.
	 */

	import { browser, dev } from '$app/env';
	import type { ThumbnailSet } from '@src/utils/media/media-models';
	import { mediaDisplayUrl } from '@utils/media/media-utils';

	/* -------------------------------------------------------------------------- */
	/*  Preset width ladder — maps preset names to thumbnail keys                 */
	/* -------------------------------------------------------------------------- */

	const PRESET_KEYS: Record<string, string[]> = {
		thumbnail: ['thumbnail'],
		card: ['thumbnail', 'sm', 'md'],
		default: ['sm', 'md', 'lg'],
		hero: ['md', 'lg']
	};

	/* -------------------------------------------------------------------------- */
	/*  Layout-aware sizes preset ladder                                          */
	/* -------------------------------------------------------------------------- */

	const LAYOUT_SIZES: Record<string, string> = {
		full: '100vw',
		half: '(min-width: 768px) 50vw, 100vw',
		third: '(min-width: 1024px) 33.3vw, (min-width: 640px) 50vw, 100vw',
		quarter: '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw'
	};

	/* -------------------------------------------------------------------------- */
	/*  Asset shape — accepts MediaImage from the CMS or a plain object           */
	/* -------------------------------------------------------------------------- */

	interface AssetShape {
		url?: string | null;
		_id?: string | null;
		id?: string | null;
		thumbnails?: ThumbnailSet | null;
		placeholder?: string | null;
		alt?: string | null;
		description?: string | null;
		metadata?: {
			width?: number | null;
			height?: number | null;
			placeholder?: string | null;
			altText?: string | null;
			description?: string | null;
		} | null;
	}

	/* -------------------------------------------------------------------------- */
	/*  Props                                                                     */
	/* -------------------------------------------------------------------------- */

	type $$Props = import('svelte/elements').HTMLImgAttributes & {
		/** Media record (from CMS `mediaUrl()` or API response) with variant metadata */
		asset?: AssetShape | undefined | null;
		/** Direct URL fallback when asset is not provided */
		src?: string;
		/** Preset width ladder: selects which thumbnail keys to include in srcset */
		preset?: 'thumbnail' | 'card' | 'default' | 'hero';
		/** Layout preset automatically calculating optimal responsive sizes attribute */
		layout?: 'full' | 'half' | 'third' | 'quarter';
		/** Low-quality image placeholder (LQIP base64 data-URL or blurhash) */
		placeholder?: string;
		/** Responsive sizes attribute (default: '100vw') */
		sizes?: string;
		/** When true, loading="eager" + fetchpriority="high" */
		priority?: boolean;
		/** Additional CSS classes */
		class?: string;
		/** Alt text (overrides asset.alt / asset.metadata.altText) */
		alt?: string;
	};

	let {
		asset,
		src: directSrc,
		preset = 'default',
		layout,
		placeholder: placeholderProp,
		sizes = '100vw',
		priority = false,
		class: className,
		alt: altProp,
		...restProps
	}: $$Props = $props();

	/* -------------------------------------------------------------------------- */
	/*  Derived values                                                             */
	/* -------------------------------------------------------------------------- */

	/** Resolve the fallback source URL — asset.url or directSrc */
	const src = $derived<string>((asset?.url || directSrc || '') as string);

	/** Resolve responsive sizes attribute from layout or explicit sizes prop */
	const resolvedSizes = $derived<string>(layout ? (LAYOUT_SIZES[layout] ?? sizes) : sizes);

	/** Resolve placeholder data-URI for zero-CLS blur */
	const placeholder = $derived<string | undefined>(
		placeholderProp ?? asset?.placeholder ?? asset?.metadata?.placeholder ?? undefined
	);

	/** Resolve alt text: prop > asset.alt > asset.metadata.altText > asset.description > '' */
	const alt = $derived<string>(
		altProp ??
			(asset?.alt as string | undefined) ??
			(asset?.metadata?.altText as string | undefined) ??
			(asset?.description as string | undefined) ??
			(asset?.metadata?.description as string | undefined) ??
			''
	);

	/** Determine if this image should be considered decorative (empty alt) */
	const decorative = $derived<boolean>(alt === '');

	/** Resolve intrinsic dimensions from metadata for CLS prevention */
	const imgWidth = $derived<number | undefined>(
		(asset?.metadata?.width as number | undefined) ?? undefined
	);
	const imgHeight = $derived<number | undefined>(
		(asset?.metadata?.height as number | undefined) ?? undefined
	);

	/** Build srcset from available asset thumbnails filtered by the selected preset */
	const srcset = $derived.by<string>(() => {
		const thumbnails = asset?.thumbnails;
		if (!thumbnails) return '';

		const keys = PRESET_KEYS[preset] ?? PRESET_KEYS.default;

		return keys
			.map((key) => {
				const variant = thumbnails[key];
				if (!variant?.url) return null;
				// Resolve through `mediaDisplayUrl` so a configured media server/CDN
				// (`MEDIASERVER_URL`) is not bypassed; returns the raw URL unchanged when
				// no rewrite applies. The single-variant item is deliberate: a missing key
				// must be omitted, not substituted with a different size's URL.
				const url = mediaDisplayUrl({ thumbnails: { [key]: variant } }, key);
				return url ? `${url} ${variant.width}w` : null;
			})
			.filter(Boolean)
			.join(',\n');
	});

	/** Loading strategy */
	const loading = $derived<'eager' | 'lazy'>(priority ? 'eager' : 'lazy');

	/* -------------------------------------------------------------------------- */
	/*  Dev warning for non-decorative images missing alt text                    */
	/* -------------------------------------------------------------------------- */

	$effect(() => {
		// Read reactive values inside the effect so Svelte tracks them
		const isDecorative = decorative;
		const altText = alt;
		const srcUrl = src;
		if (dev && browser && !isDecorative && !altText) {
			logger.warn(
				`[Image] Non-decorative image is missing alt text. ` +
					`Provide an \`alt\` prop or ensure the asset has \`alt\` / \`metadata.altText\` set.`,
				srcUrl ? `src: ${srcUrl}` : ''
			);
		}
	});
</script>

<img
	{src}
	{alt}
	{loading}
	sizes={resolvedSizes}
	decoding="async"
	width={imgWidth}
	height={imgHeight}
	{srcset}
	fetchpriority={priority ? 'high' : undefined}
	role={decorative ? 'presentation' : undefined}
	aria-hidden={decorative ? 'true' : undefined}
	class={className}
	style:background-image={placeholder ? `url("${placeholder}")` : undefined}
	style:background-size={placeholder ? 'cover' : undefined}
	{...restProps}
/>

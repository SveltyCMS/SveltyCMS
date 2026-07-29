<!--
@file src/components/ui/image.svelte
@component
**Responsive image component with automatic srcset generation from uploaded variants.**

Consumes the thumbnails/variants generated during upload (via `saveResized`) and renders
an optimal `<img>` for every device. WebP as primary format via srcset, JPEG/PNG fallback via src.

### Props
- `asset` (MediaImage | { url?; thumbnails?; alt?; metadata? } | undefined | null): Media record or URL object
- `src` (string): Direct URL fallback (used when asset is not provided)
- `preset` ('thumbnail' | 'card' | 'default' | 'hero'): Width ladder selecting which variants to include in srcset
- `sizes` (string): Responsive sizes attribute (default: '100vw')
- `priority` (boolean): When true, sets loading="eager" + fetchpriority="high"
- `class` (string): Additional CSS classes forwarded to the <img>
- Plus all standard HTML <img> attributes via $$restProps

### Features:
- srcset generation from asset thumbnails/variants
- WebP primary format with JPEG/PNG fallback via src
- loading="lazy" by default, "eager" when priority
- fetchpriority="high" when priority
- decoding="async"
- Intrinsic width/height for CLS prevention
- Alt text from asset metadata if not provided
- Dev warning when meaningful image has no alt
- Forwards all native <img> attributes
-->

<script lang="ts">
  /**
   * @file src/components/ui/image.svelte
   * @description Responsive image component with automatic srcset generation from uploaded variants.
   */

  import { browser, dev } from '$app/environment';
  import type { ThumbnailSet } from '@src/utils/media/media-models';

  /* -------------------------------------------------------------------------- */
  /*  Preset width ladder — maps preset names to thumbnail keys                 */
  /* -------------------------------------------------------------------------- */

  const PRESET_KEYS: Record<string, string[]> = {
    thumbnail: ['thumbnail'],
    card: ['thumbnail', 'sm', 'md'],
    default: ['sm', 'md', 'lg'],
    hero: ['md', 'lg'],
  };

  /* -------------------------------------------------------------------------- */
  /*  Asset shape — accepts MediaImage from the CMS or a plain object           */
  /* -------------------------------------------------------------------------- */

  interface AssetShape {
    url?: string | null;
    _id?: string | null;
    id?: string | null;
    thumbnails?: ThumbnailSet | null;
    alt?: string | null;
    description?: string | null;
    metadata?: {
      width?: number | null;
      height?: number | null;
      altText?: string | null;
      description?: string | null;
    } | null;
  }

  /* -------------------------------------------------------------------------- */
  /*  Props                                                                     */
  /* -------------------------------------------------------------------------- */

  type $$Props = import('svelte/elements').HTMLAttributes<HTMLImageElement> & {
    /** Media record (from CMS `mediaUrl()` or API response) with variant metadata */
    asset?: AssetShape | undefined | null;
    /** Direct URL fallback when asset is not provided */
    src?: string;
    /** Preset width ladder: selects which thumbnail keys to include in srcset */
    preset?: 'thumbnail' | 'card' | 'default' | 'hero';
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

  /** Resolve alt text: prop > asset.alt > asset.metadata.altText > asset.description > '' */
  const alt = $derived<string>(
    altProp ??
      (asset?.alt as string | undefined) ??
      (asset?.metadata?.altText as string | undefined) ??
      (asset?.description as string | undefined) ??
      (asset?.metadata?.description as string | undefined) ??
      '',
  );

  /** Determine if this image should be considered decorative (empty alt) */
  const decorative = $derived<boolean>(alt === '');

  /** Resolve intrinsic dimensions from metadata for CLS prevention */
  const imgWidth = $derived<number | undefined>(
    (asset?.metadata?.width as number | undefined) ?? undefined,
  );
  const imgHeight = $derived<number | undefined>(
    (asset?.metadata?.height as number | undefined) ?? undefined,
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
        return `${variant.url} ${variant.width}w`;
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
      console.warn(
        `[Image] Non-decorative image is missing alt text. ` +
          `Provide an \`alt\` prop or ensure the asset has \`alt\` / \`metadata.altText\` set.`,
        srcUrl ? `src: ${srcUrl}` : '',
      );
    }
  });
</script>

<img
  src={src}
  {alt}
  {loading}
  {sizes}
  decoding="async"
  width={imgWidth}
  height={imgHeight}
  srcset={srcset}
  fetchpriority={priority ? 'high' : undefined}
  role={decorative ? 'presentation' : undefined}
  aria-hidden={decorative ? 'true' : undefined}
  class={className}
  {...restProps}
/>

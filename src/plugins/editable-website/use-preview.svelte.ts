/**
 * @file src/plugins/editable-website/use-preview.svelte.ts
 * @description Svelte 5 rune-based reactive preview hook for the Editable Website plugin.
 *
 * Provides a fine-grained reactive singleton that components (both server
 * and client) can consume to determine whether the current render is
 * happening inside a Live Preview iframe. Uses Svelte 5 `$state` runes
 * so dependent UI updates automatically when preview state changes.
 *
 * ### Features:
 * - reactive preview mode detection via `$state`
 * - automatic stego marker stripping in production mode
 * - preview-aware URL/image resolution (origin rewriting)
 * - zero legacy store dependency — pure Svelte 5 runes
 *
 * @example
 *   ```svelte
 *   <script>
 *     import { usePreview } from "@plugins/editable-website/use-preview.svelte";
 *
 *     const preview = usePreview();
 *     let content = $state("Hello\u200B World");
 *   </script>
 *
 *   <p>{preview.resolveValue(content)}</p>
 *   ```
 */

import { stegaClean } from "./stega";

// ============================================================================
// Reactive Singleton State
// ============================================================================

let _isPreview = $state(false);
let _previewOrigin = $state("");
let _previewToken = $state("");

// ============================================================================
// Public Hook
// ============================================================================

/**
 * Reactive preview mode hook.
 *
 * Returns a getter/setter object backed by Svelte 5 `$state` runes.
 * Assign to `.isPreview`, `.origin`, or `.token` to update the global
 * preview state; all components reading the hook will react.
 *
 * The `resolveValue` and `resolveImage` helpers behave differently
 * depending on whether preview mode is active:
 * - **In preview**: values pass through unchanged (stego markers
 *   are preserved for click-to-edit field identification).
 * - **In production**: stego markers are stripped and image URLs
 *   are not rewritten.
 */
export function usePreview() {
  return {
    /** Whether the current page is rendered inside a Live Preview iframe. */
    get isPreview(): boolean {
      return _isPreview;
    },
    set isPreview(value: boolean) {
      _isPreview = value;
    },

    /**
     * Origin of the CMS (e.g., "https://cms.example.com").
     * Used to rewrite relative image URLs in preview mode so
     * assets resolve against the CMS rather than the previewed site.
     */
    get origin(): string {
      return _previewOrigin;
    },
    set origin(value: string) {
      _previewOrigin = value;
    },

    /** Ephemeral preview authorization token. */
    get token(): string {
      return _previewToken;
    },
    set token(value: string) {
      _previewToken = value;
    },

    // ==================================================================
    // Preview-aware Resolvers
    // ==================================================================

    /**
     * Resolve a text value for the current rendering mode.
     *
     * In preview mode, stego markers are preserved so click-to-edit
     * field identification works. In production, markers are stripped.
     *
     * @param value - The raw value (may contain stego markers).
     * @returns The mode-appropriate string.
     */
    resolveValue(value: string): string {
      if (!value) return value;
      return _isPreview ? value : stegaClean(value);
    },

    /**
     * Resolve an image URL for the current rendering mode.
     *
     * In preview mode, relative paths (starting with `/`) are rewritten
     * to point at the CMS origin so assets load correctly inside the
     * iframe. In production, the URL passes through unchanged.
     *
     * @param src - The image source URL.
     * @returns The mode-appropriate URL.
     */
    resolveImage(src: string): string {
      if (!src) return src;
      if (!_isPreview) return src;

      // Rewrite relative paths to the CMS origin in preview mode
      if (src.startsWith("/") && _previewOrigin) {
        // Avoid double-prefixing
        if (src.startsWith(_previewOrigin)) return src;
        return `${_previewOrigin}${src}`;
      }

      return src;
    },
  };
}

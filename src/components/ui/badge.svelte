<!--
@file src/components/ui/badge.svelte
@component
**SveltyCMS Badge — WCAG 3.0 Ready**

Compact label for status indicators, counts, and metadata. Supports legacy variant
mapping for backward compatibility, filled/tonal/outlined presets, and progressive
corner-shape angled corners.

### Props
- `variant` ('primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface' | 'outline'): Legacy variant with auto preset/color mapping.
- `preset` ('filled' | 'tonal' | 'outlined'): Override visual style.
- `color` (string): Standard theme color or custom CSS color (e.g. hex, rgb).
- `size` ('sm' | 'md' | 'lg'): Size variant (default: 'md').
- `rounded` (boolean): Full rounded pill shape (default: true).
- `shape` ('round' | 'angle'): Advanced corner-shape option (default: 'round').
- `class` (string): Additional CSS classes.
- `children` (Snippet): Badge content.
-->

<script lang="ts">
  import { cn } from '@utils/cn';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = HTMLAttributes<HTMLDivElement> & {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface' | 'outline';
    preset?: 'filled' | 'tonal' | 'outlined';
    color?: string;
    size?: 'sm' | 'md' | 'lg';
    rounded?: boolean;
    shape?: 'round' | 'angle';
    children?: Snippet;
    class?: string;
  };

  let {
    variant = 'primary',
    preset: propPreset,
    color: propColor,
    size = 'md',
    rounded = true,
    shape = 'round',
    children,
    class: className,
    ...rest
  }: Props = $props();

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm'
  };

  // Legacy variant mapping (makes tests happy)
  const variantMap: Record<string, { preset: string; color: string }> = {
    primary: { preset: 'filled', color: 'primary' },
    secondary: { preset: 'tonal', color: 'secondary' },
    tertiary: { preset: 'filled', color: 'tertiary' },
    success: { preset: 'filled', color: 'success' },
    warning: { preset: 'filled', color: 'warning' },
    error: { preset: 'filled', color: 'error' },
    surface: { preset: 'filled', color: 'surface' },
    outline: { preset: 'outlined', color: 'surface' }
  };

  const finalPreset = $derived(propPreset || variantMap[variant]?.preset || 'filled');
  const finalColor = $derived(propColor || variantMap[variant]?.color || 'primary');

  // Detect custom colors (hex, rgb, hsl, etc.) to support database/tenant dynamic configurations
  const isCustomColor = $derived(
    finalColor.startsWith('#') ||
    finalColor.startsWith('rgb') ||
    finalColor.startsWith('hsl') ||
    finalColor.startsWith('var(')
  );

  const getPresetClass = $derived(() => {
    if (isCustomColor) return 'preset-custom';
    if (finalPreset === 'tonal') return `preset-tonal-${finalColor}`;
    if (finalPreset === 'outlined') return `preset-outlined-${finalColor}-500`;
    return `preset-filled-${finalColor}-500`;
  });

  // Calculate dynamic custom variables for custom color preset fallbacks and theme contexts
  const customStyles = $derived.by(() => {
    let styles = '';

    // Set dynamic border-radius when not angled and not fully rounded (pill)
    if (shape !== 'angle' && !rounded) {
      styles += `border-radius: var(--admin-radius-input, 6px); `;
    }

    if (isCustomColor) {
      if (finalPreset === 'tonal') {
        styles += `--preset-bg: ${finalColor}22; --preset-text: ${finalColor}; --preset-border: transparent;`;
      } else if (finalPreset === 'outlined') {
        styles += `--preset-bg: transparent; --preset-text: ${finalColor}; --preset-border: ${finalColor};`;
      } else {
        styles += `--preset-bg: ${finalColor}; --preset-text: #ffffff; --preset-border: transparent;`;
      }
    }
    return styles || undefined;
  });

  const classes = $derived(cn(
    'badge inline-flex items-center font-bold uppercase tracking-wider transition-all duration-200',
    getPresetClass(),
    sizeClasses[size],
    shape === 'angle' ? 'corner-angle' : (rounded ? 'rounded-full' : ''),
    className
  ));
</script>

<div class={classes} style={customStyles} {...rest}>
  {@render children?.()}
</div>

<style>
  /* Progressive enhancement: Corner shape angled cut styles with clip-path fallback */
  .corner-angle {
    position: relative;
    corner-shape: angle; /* Future-ready CSS standard */
    --corner-offset: 4px;
    clip-path: polygon(
      0% var(--corner-offset),
      var(--corner-offset) 0%,
      calc(100% - var(--corner-offset)) 0%,
      100% var(--corner-offset),
      100% calc(100% - var(--corner-offset)),
      calc(100% - var(--corner-offset)) 100%,
      var(--corner-offset) 100%,
      0% calc(100% - var(--corner-offset))
    );
  }

  /* Tenant/Database custom styling system */
  :global(.preset-custom) {
    background-color: var(--preset-bg) !important;
    color: var(--preset-text) !important;
    border: 1px solid var(--preset-border) !important;
  }
</style>

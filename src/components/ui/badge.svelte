<!--
@file src/components/ui/badge.svelte
@component
**SveltyCMS Badge — WCAG 3.0 Ready**

Compact label for status indicators, counts, and metadata. Supports legacy variant
mapping for backward compatibility and filled/tonal/outlined presets.

### Props
- `variant` ('primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface' | 'outline'): Legacy variant with auto preset/color mapping.
- `preset` ('filled' | 'tonal' | 'outlined'): Override visual style.
- `size` ('sm' | 'md' | 'lg'): Size variant (default: 'md').
- `rounded` (boolean): Full rounded pill shape (default: true).
- `class` (string): Additional CSS classes.
- `children` (Snippet): Badge content.

### Features:
- backward-compatible variant mapping for test compatibility
- filled, tonal, and outlined preset variants
- three size densities with proportional padding
- full Svelte 5 runes: $props, $derived
-->

<script lang="ts">
  import { cn } from '@utils/cn';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = HTMLAttributes<HTMLDivElement> & {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface' | 'outline';
    preset?: 'filled' | 'tonal' | 'outlined';
    color?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
    size?: 'sm' | 'md' | 'lg';
    rounded?: boolean;
    children?: Snippet;
    class?: string;
  };

  let {
    variant = 'primary',
    preset: propPreset,
    color: propColor,
    size = 'md',
    rounded = true,
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

  const getPresetClass = $derived(() => {
    if (finalPreset === 'tonal') return `preset-tonal-${finalColor}`;
    if (finalPreset === 'outlined') return `preset-outlined-${finalColor}-500`;
    return `preset-filled-${finalColor}-500`;
  });

  const classes = $derived(cn(
    'badge inline-flex items-center font-bold uppercase tracking-wider transition-colors',
    getPresetClass(),
    sizeClasses[size],
    rounded ? 'rounded-full' : 'rounded-md',
    className
  ));
</script>

<div class={classes} {...rest}>
  {@render children?.()}
</div>

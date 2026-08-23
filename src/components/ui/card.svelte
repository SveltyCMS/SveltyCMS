<!--
@file src/components/ui/card.svelte
@component
**SveltyCMS Card — WCAG 3.0 Ready**

Versatile content container with header/footer snippets, preset variants, and
neutral fallback styling when no variant is specified. Supports progressive
corner-shape angled corners.

### Props
- `variant` ('primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface'): Auto-detects preset.
- `preset` ('filled' | 'tonal' | 'outlined'): Visual style override.
- `color` (string): Standard theme color or custom CSS color (e.g. hex, rgb).
- `shape` ('round' | 'angle'): Advanced corner-shape option (default: 'round').
- `header` / `footer` / `children` (Snippet): Content slots.
- `class` (string): Additional CSS classes.
-->

<script lang="ts">
  import { cn } from '@utils/cn';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getThemeContext } from './theme-context.svelte';

  type Props = HTMLAttributes<HTMLDivElement> & {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
    preset?: 'filled' | 'tonal' | 'outlined';
    color?: string;
    shape?: 'round' | 'angle';
    header?: Snippet;
    footer?: Snippet;
    children?: Snippet;
    class?: string;
  };

  let {
    variant,
    preset: propPreset,
    color: propColor,
    shape = 'round',
    header,
    footer,
    children,
    class: className,
    ...rest
  }: Props = $props();

  const finalPreset = $derived(propPreset || (variant ? 'filled' : undefined));
  const finalColor = $derived(propColor || variant || 'surface');

  const isCustomColor = $derived(
    finalColor.startsWith('#') ||
    finalColor.startsWith('rgb') ||
    finalColor.startsWith('hsl') ||
    finalColor.startsWith('var(')
  );

  const FILLED_MAP: Record<string, string> = {
    primary: 'preset-filled-primary-500',
    secondary: 'preset-filled-secondary-500',
    tertiary: 'preset-filled-tertiary-500',
    success: 'preset-filled-success-500',
    warning: 'preset-filled-warning-500',
    error: 'preset-filled-error-500',
    surface: 'preset-filled-surface-500',
  };

  const OUTLINED_MAP: Record<string, string> = {
    primary: 'preset-outlined-primary-500',
    secondary: 'preset-outlined-secondary-500',
    tertiary: 'preset-outlined-tertiary-500',
    success: 'preset-outlined-success-500',
    warning: 'preset-outlined-warning-500',
    error: 'preset-outlined-error-500',
    surface: 'preset-outlined-surface-500',
  };

  const TONAL_MAP: Record<string, string> = {
    primary: 'preset-tonal-primary',
    secondary: 'preset-tonal-secondary',
    tertiary: 'preset-tonal-tertiary',
    success: 'preset-tonal-success',
    warning: 'preset-tonal-warning',
    error: 'preset-tonal-error',
    surface: 'preset-tonal-surface',
  };

  const getPresetClass = $derived(() => {
    if (isCustomColor) return 'preset-custom';
    if (!finalPreset) return '';
    if (finalPreset === 'tonal') return TONAL_MAP[finalColor] ?? `preset-tonal-${finalColor}`;
    if (finalPreset === 'outlined') return OUTLINED_MAP[finalColor] ?? `preset-outlined-${finalColor}-500`;
    return FILLED_MAP[finalColor] ?? `preset-filled-${finalColor}-500`;
  });

  const theme = getThemeContext();

  const customStyles = $derived.by(() => {
    let styles = '';

    // Set dynamic border-radius
    if (shape !== 'angle') {
      styles += `border-radius: var(--admin-radius-card, 0.75rem); `;
    }

    // Set dynamic border-width and shadow — variant-aware via theme context
    const shadow = theme?.cardShadow ?? 'var(--admin-shadow-elevation)';
    const borderW = theme?.cardBorder ?? 'var(--admin-border-width, 1px)';
    styles += `border-width: ${borderW}; box-shadow: ${shadow}; `;

    if (shape === 'angle') {
      styles += `corner-shape: angle; --corner-offset: 12px; `;
    }

    if (isCustomColor) {
      if (finalPreset === 'tonal') {
        styles += `--preset-bg: ${finalColor}15; --preset-text: ${finalColor}; --preset-border: ${finalColor}33;`;
      } else if (finalPreset === 'outlined') {
        styles += `--preset-bg: transparent; --preset-text: ${finalColor}; --preset-border: ${finalColor};`;
      } else {
        styles += `--preset-bg: ${finalColor}; --preset-text: #ffffff; --preset-border: transparent;`;
      }
    }
    return styles || undefined;
  });

  const classes = $derived(cn(
    'card transition-all duration-200',
    getPresetClass(),
    shape === 'angle' ? 'corner-angle' : '',
    // Default neutral card when no preset/color
    !finalPreset && !isCustomColor && 'border border-surface-500/30 dark:border-surface-500/40 bg-surface-500/10 dark:bg-surface-900 text-surface-900 dark:text-surface-50 shadow-sm',
    className
  ));
</script>

<div class={classes} style={customStyles} {...rest}>
  {#if header}
    <div class="flex flex-col space-y-1.5 p-6 border-b border-surface-500/30 dark:border-surface-500/40">
      {@render header()}
    </div>
  {/if}

  {#if children}
    <div class={cn('p-6', header ? 'pt-6' : '')}>
      {@render children()}
    </div>
  {/if}

  {#if footer}
    <div class="flex items-center p-6 border-t border-surface-500/30 dark:border-surface-500/40">
      {@render footer()}
    </div>
  {/if}
</div>

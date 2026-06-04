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

  const getPresetClass = $derived(() => {
    if (isCustomColor) return 'preset-custom';
    if (!finalPreset) return '';
    if (finalPreset === 'tonal') return `preset-tonal-${finalColor}`;
    if (finalPreset === 'outlined') return `preset-outlined-${finalColor}-500`;
    return `preset-filled-${finalColor}-500`;
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
    !finalPreset && !isCustomColor && 'border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-50 shadow-sm',
    className
  ));
</script>

<div class={classes} style={customStyles} {...rest}>
  {#if header}
    <div class="flex flex-col space-y-1.5 p-6 border-b border-surface-200/20 dark:border-surface-700/20">
      {@render header()}
    </div>
  {/if}

  {#if children}
    <div class={cn('p-6', header ? 'pt-6' : '')}>
      {@render children()}
    </div>
  {/if}

  {#if footer}
    <div class="flex items-center p-6 border-t border-surface-200/20 dark:border-surface-700/20">
      {@render footer()}
    </div>
  {/if}
</div>

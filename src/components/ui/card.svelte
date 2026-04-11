<!-- 
 @src/routes/api/cms.ts src/components/ui/card.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Card Primitive
-->

<script lang="ts">
  import { cn } from '@utils/cn';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = HTMLAttributes<HTMLDivElement> & {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
    preset?: 'filled' | 'tonal' | 'outlined';
    color?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
    header?: Snippet;
    footer?: Snippet;
    children?: Snippet;
    class?: string;
  };

  let {
    variant,
    preset: propPreset,
    color: propColor,
    header,
    footer,
    children,
    class: className,
    ...rest
  }: Props = $props();

  const finalPreset = $derived(propPreset || (variant ? 'filled' : undefined));
  const finalColor = $derived(propColor || variant || 'surface');

  const getPresetClass = $derived(() => {
    if (!finalPreset) return '';
    if (finalPreset === 'tonal') return `preset-tonal-${finalColor}`;
    if (finalPreset === 'outlined') return `preset-outlined-${finalColor}-500`;
    return `preset-filled-${finalColor}-500`;
  });

  const classes = $derived(cn(
    'card',
    getPresetClass(),
    // Default neutral card when no preset/color
    !finalPreset && 'border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-50 shadow-sm',
    className
  ));
</script>

<div class={classes} {...rest}>
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

<!-- 
 @src/routes/api/cms.ts src/components/ui/button.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Button Primitive
-->

<script lang="ts">
  import { cn } from '@utils/cn';

  interface Props {
    variant?: 'primary' | 'secondary' | 'tertiary' | 'surface' | 'success' | 'warning' | 'error' | 'ghost' | 'outline';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    loading?: boolean;
    disabled?: boolean;
    rounded?: boolean;
    leadingIcon?: string;
    trailingIcon?: string;
    loadingIcon?: string;
    replaceTextOnLoading?: boolean;
    class?: string;
    // A11y
    'aria-label'?: string;
    labelledBy?: string;
    describedBy?: string;
    // Snippets
    children?: import('svelte').Snippet;
    [key: string]: any;
  }

  let {
    variant = 'surface',
    size = 'md',
    href,
    type = 'button',
    loading = false,
    disabled = false,
    rounded = false,
    leadingIcon,
    trailingIcon,
    loadingIcon = 'mdi:loading',
    replaceTextOnLoading = false,
    class: className,
    'aria-label': ariaLabel,
    labelledBy,
    describedBy,
    children,
    ...rest
  }: Props = $props();

  const element = $derived(href ? 'a' : 'button');

  const variantClass = $derived.by(() => {
    switch (variant) {
      case 'primary': return 'preset-filled-primary-500 shadow-primary-500/20';
      case 'secondary': return 'preset-filled-secondary-500 shadow-secondary-500/20';
      case 'tertiary': return 'preset-filled-tertiary-500 shadow-tertiary-500/20';
      case 'success': return 'preset-filled-success-500 shadow-success-500/20';
      case 'warning': return 'preset-filled-warning-500 shadow-warning-500/20';
      case 'error': return 'preset-filled-error-500 shadow-error-500/20';
      case 'ghost': return 'hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-700 dark:text-surface-300';
      case 'outline': return 'preset-outlined-surface-500';
      default: return 'preset-filled-surface-500';
    }
  });

  const sizeClass = $derived.by(() => {
    switch (size) {
      case 'sm': return 'h-8 px-3 text-xs gap-1.5';
      case 'lg': return 'h-12 px-6 text-lg gap-2.5';
      case 'xl': return 'h-14 px-8 text-xl gap-3';
      default: return 'h-10 px-4 text-sm gap-2';
    }
  });

  const iconSize = $derived.by(() => {
    switch (size) {
      case 'sm': return '16';
      case 'lg': return '24';
      case 'xl': return '28';
      default: return '20';
    }
  });

  const isDisabled = $derived(disabled || loading);

  const elementProps = $derived(
    element === 'a'
      ? {
          href: isDisabled ? undefined : href,
          role: 'button',
          'aria-disabled': isDisabled,
          tabindex: isDisabled ? -1 : 0
        }
      : {
          type,
          disabled: isDisabled
        }
  );
</script>

<svelte:element
  this={element}
  {...elementProps}
  {...rest}
  aria-label={ariaLabel || undefined}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  class={cn(
    'btn relative inline-flex items-center justify-center font-bold tracking-tight transition-all duration-200',
    'active:scale-[0.98] hover:brightness-110 active:brightness-95',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-surface-500 dark:focus-visible:ring-surface-300',
    variantClass,
    sizeClass,
    rounded ? 'rounded-full' : 'rounded-[2px]',
    isDisabled && 'opacity-60 cursor-not-allowed',
    className
  )}
>
  <!-- Premium gradient overlay -->
  <div class="absolute inset-0 rounded-[inherit] bg-linear-to-tr from-white/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>

  {#if loading}
    <iconify-icon icon={loadingIcon} width={iconSize} class="animate-spin"></iconify-icon>
    {#if !replaceTextOnLoading}
      {@render children?.()}
    {/if}
  {:else}
    {#if leadingIcon}
      <iconify-icon icon={leadingIcon} width={iconSize}></iconify-icon>
    {/if}

    {@render children?.()}

    {#if trailingIcon}
      <iconify-icon icon={trailingIcon} width={iconSize}></iconify-icon>
    {/if}
  {/if}
</svelte:element>

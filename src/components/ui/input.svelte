<!--
@file src/components/ui/input.svelte
@component
**SveltyCMS Input — WCAG 3.0 Ready**

Standard text input with label, error state, `aria-invalid`/`aria-describedby` linkage,
and `crypto.randomUUID()` for accessible ID generation. Supports progressive
corner-shape angled corners.

### Props
- `value` (string | number | string[]): Bindable input value.
- `label` (string): Label text above the input.
- `error` (string): Error message with red border and alert text.
- `type` (string): HTML input type (default: 'text').
- `shape` ('round' | 'angle'): Advanced corner-shape option (default: 'round').
- `focusColor` (string): Custom focus ring CSS color (e.g. hex, rgb).
- `class` / `inputClass` / `labelClass` (string): CSS classes.
- `id` (string): Custom ID (auto-generated UUID otherwise).
- `pre` (Snippet): Content rendered before the input (inside the border).
- `post` (Snippet): Content rendered after the input (inside the border).

### Features:
- WCAG 3.0 ready with `aria-invalid`, `aria-describedby`, label/ID `for` linkage
- `crypto.randomUUID()` for collision-free accessible IDs
- error message with `role="alert"` live region
- custom angled corners via clip-path fallback
- full Svelte 5 runes: $props, $bindable, $derived
- `pre`/`post` snippets for icons, buttons, or adornments inside the input boundary
-->

<script lang="ts">
  import { cn } from "@utils/cn";
  import { generateId } from '@utils/id-generator';
  import type { HTMLInputAttributes } from "svelte/elements";
  import { getThemeContext } from "./theme-context.svelte";
  import type { Snippet } from "svelte";

  // Generate a hydration-safe unique ID
  const generatedId = generateId('input');

  type Props = HTMLInputAttributes & {
    value?: string | number | string[];
    label?: string;
    labelClass?: string;
    inputClass?: string;
    error?: string;
    shape?: 'round' | 'angle';
    focusColor?: string;
    class?: string;
    inputRef?: HTMLInputElement | null;
    pre?: Snippet;
    post?: Snippet;
  };

  // Workaround for strict $props binding requirements
  let {
    value = $bindable(),
    inputRef = $bindable(),
    label,
    labelClass,
    inputClass,
    error,
    shape = 'round',
    focusColor,
    class: className,
    id = generatedId,
    type = "text",
    pre,
    post,
    ...rest
  }: Props = $props();

  let _inputRef = $state<HTMLInputElement | null>(null);

  // Forward internal ref to external bindable prop
  $effect(() => {
    if (inputRef !== _inputRef) {
      inputRef = _inputRef;
    }
  });

  const theme = getThemeContext();

  const baseInputStyles =
    "flex h-10 w-full border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-surface-600 dark:placeholder:text-surface-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";

  const errorInputStyles = "border-error-500 focus-visible:ring-error-500";

  const inputPadding = $derived.by(() => {
    let prePad = pre ? "ps-9" : "ps-3";
    let postPad = post ? "pe-9" : "pe-3";
    return `${prePad} ${postPad}`;
  });

  const customStyles = $derived.by(() => {
    let styles = '';

    // Wire custom property for input border radius
    if (shape !== 'angle') {
      styles += `border-radius: var(--admin-radius-input, 6px); `;
    }

    // Set dynamic border-width
    styles += `border-width: var(--admin-border-width, 1px); `;

    // Apply scale multiplier dynamically to heights and paddings
    const scale = theme ? theme.spacingScale : 1.0;
    if (scale !== 1.0) {
      const heightValue = 40; // Default md/cozy
      const textValue = '0.875rem';

      styles += `height: ${Math.round(heightValue * scale)}px; font-size: ${textValue}; `;
    }

    if (shape === 'angle') {
      styles += `corner-shape: angle; --corner-offset: 6px; `;
    }

    if (focusColor) {
      styles += `--focus-ring-color: ${focusColor}; `;
    }
    return styles || undefined;
  });

  const errorId = $derived(error ? `${id}-error` : undefined);

  const wrapperStyles = $derived.by(() => {
    let styles = '';
    const scale = theme ? theme.spacingScale : 1.0;
    if (scale !== 1.0) {
      styles += `height: ${Math.round(40 * scale)}px; `;
    }
    return styles || undefined;
  });
</script>

<div class="space-y-2 w-full">
  {#if label}
    <label
      for={id}
      class={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        labelClass,
      )}
    >
      {label}
    </label>
  {/if}

  <div
    class="relative flex items-center"
    style={wrapperStyles}
  >
    {#if pre}
      <div class="absolute inset-s-0 inset-y-0 flex items-center justify-center w-9 z-10 text-surface-500 dark:text-surface-400 pointer-events-none">
        {@render pre()}
      </div>
    {/if}

    <input
      bind:this={_inputRef}
      {id}
      {type}
      class={cn(
        baseInputStyles,
        error && errorInputStyles,
        shape === 'angle' ? 'corner-angle' : '',
        focusColor && 'focus-custom',
        inputPadding,
        inputClass,
        className,
      )}
      style={customStyles}
      bind:value
      aria-invalid={!!error}
      aria-describedby={errorId}
      {...rest}
    />

    {#if post}
      <div class="absolute inset-e-0 inset-y-0 flex items-center justify-center w-9 z-10 text-surface-500 dark:text-surface-400">
        {@render post()}
      </div>
    {/if}
  </div>

  {#if error}
    <p id={errorId} class="text-[0.8rem] font-medium text-error-500" role="alert">
      {error}
    </p>
  {/if}
</div>

<style>
  input[type="search"]::-webkit-search-cancel-button {
    display: none;
  }
  input[type="search"]::-webkit-search-decoration {
    display: none;
  }
</style>


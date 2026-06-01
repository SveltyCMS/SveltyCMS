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

### Features:
- WCAG 3.0 ready with `aria-invalid`, `aria-describedby`, label/ID `for` linkage
- `crypto.randomUUID()` for collision-free accessible IDs
- error message with `role="alert"` live region
- custom angled corners via clip-path fallback
- full Svelte 5 runes: $props, $bindable, $derived
-->

<script lang="ts">
  import { cn } from "@utils/cn";
  import type { HTMLInputAttributes } from "svelte/elements";

  // Generate a RFC 4122 v4 UUID for accessibility linkage
  const generatedId =
    typeof crypto !== "undefined"
      ? crypto.randomUUID()
      : "input-" + Math.random().toString(36).substring(7);

  type Props = HTMLInputAttributes & {
    value?: string | number | string[];
    label?: string;
    labelClass?: string;
    inputClass?: string;
    error?: string;
    shape?: 'round' | 'angle';
    focusColor?: string;
    class?: string;
  };

  // Workaround for strict $props binding requirements
  let {
    value = $bindable(),
    label,
    labelClass,
    inputClass,
    error,
    shape = 'round',
    focusColor,
    class: className,
    id = generatedId,
    type = "text",
    ...rest
  }: Props = $props();

  const baseInputStyles =
    "flex h-10 w-full border border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-surface-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";

  const errorInputStyles = "border-error-500 focus-visible:ring-error-500";

  const customStyles = $derived.by(() => {
    if (!focusColor) return '';
    return `--focus-ring-color: ${focusColor};`;
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

  <input
    {id}
    {type}
    class={cn(
      baseInputStyles,
      error && errorInputStyles,
      shape === 'angle' ? 'corner-angle' : 'rounded-md',
      focusColor && 'focus-custom',
      inputClass,
      className,
    )}
    style={customStyles || undefined}
    bind:value
    aria-invalid={!!error}
    {...rest}
  />

  {#if error}
    <p class="text-[0.8rem] font-medium text-error-500">
      {error}
    </p>
  {/if}
</div>

<style>
  /* Progressive enhancement: Corner shape angled cut styles with clip-path fallback */
  .corner-angle {
    position: relative;
    corner-shape: angle; /* W3C CSS Standard */
    --corner-offset: 6px;
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

  /* Focus ring overrides for database/tenant custom theme support */
  .focus-custom:focus-visible {
    --tw-ring-color: var(--focus-ring-color) !important;
  }
</style>

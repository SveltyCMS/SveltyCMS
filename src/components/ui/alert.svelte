<!--
@file src/components/ui/alert.svelte
@component
**SveltyCMS Alert — WCAG 3.0 Ready**

A context-sensitive alert banner with auto-detected variants (info/success/warning/error/surface),
icon support, and filled/tonal/outlined presets.

### Props
- `variant` ('info' | 'success' | 'warning' | 'error' | 'surface'): Auto-detects color and icon.
- `preset` ('filled' | 'tonal' | 'outlined'): Visual style (default: 'tonal').
- `icon` (string): Override the auto-detected icon.
- `title` (string): Bold heading above the message.
- `class` (string): Additional CSS classes.
- `children` (Snippet): Alert message content.

### Features:
- WCAG 3.0 ready with `role="alert"` for screen reader announcement
- Auto-mapping of variant to semantic color + icon
- Filled, tonal, and outlined preset variants
- full Svelte 5 runes: $props, $derived
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
    variant?: 'info' | 'success' | 'warning' | 'error' | 'surface';
    color?: 'primary' | 'secondary' | 'tertiary' | 'surface' | 'success' | 'warning' | 'error';
    preset?: 'filled' | 'tonal' | 'outlined';
    icon?: string;
    title?: string;
    class?: string;
    children?: import('svelte').Snippet;
}

const {
    variant,
    color: propColor,
    preset = 'tonal',
    icon: propIcon,
    title,
    class: className,
    children
}: Props = $props();

const variantMap = {
    info: { color: 'primary', icon: 'mingcute:information-line' },
    success: { color: 'success', icon: 'mingcute:check-circle-line' },
    warning: { color: 'warning', icon: 'mingcute:warning-line' },
    error: { color: 'error', icon: 'mingcute:error-line' },
    surface: { color: 'surface', icon: undefined }
} as const;

const finalColor = $derived(propColor || (variant ? variantMap[variant].color : 'surface'));
const finalIcon = $derived(propIcon || (variant ? variantMap[variant].icon : undefined));

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

const presetClass = $derived.by(() => {
    if (preset === 'filled') return FILLED_MAP[finalColor] ?? `preset-filled-${finalColor}-500`;
    if (preset === 'outlined') return OUTLINED_MAP[finalColor] ?? `preset-outlined-${finalColor}-500`;
    return TONAL_MAP[finalColor] ?? `preset-tonal-${finalColor}`;
});
</script>

<div
    class={cn(
        'flex items-start gap-4 p-4 rounded-2xl border border-transparent shadow-sm transition-all duration-200',
        presetClass,
        className
    )}
    role="alert"
>
    {#if finalIcon}
        <div class="mt-0.5 shrink-0">
            <iconify-icon icon={finalIcon} width="24"></iconify-icon>
        </div>
    {/if}

    <div class="flex-1 space-y-1">
        {#if title}
            <h4 class="font-bold leading-tight">{title}</h4>
        {/if}
        <div class="text-sm opacity-90">
            {@render children?.()}
        </div>
    </div>
</div>

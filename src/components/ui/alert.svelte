<!-- 
 @src/routes/api/cms.ts src/components/ui/alert.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Alert Primitive
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

const presetClass = $derived.by(() => {
    if (preset === 'filled') return `preset-filled-${finalColor}-500`;
    if (preset === 'outlined') return `preset-outlined-${finalColor}-500`;
    return `preset-tonal-${finalColor}`;
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

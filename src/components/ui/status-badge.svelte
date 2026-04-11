<!-- 
 @src/routes/api/cms.ts src/components/ui/status-badge.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 StatusBadge Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
    status: string | number | boolean;
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'ghost';
    class?: string;
}

let { status, variant, class: className }: Props = $props();

const label = $derived.by(() => {
    if (typeof status === 'boolean') return status ? 'Active' : 'Inactive';
    return String(status || 'Unknown').toUpperCase();
});

const calculatedVariant = $derived.by(() => {
    if (variant) return variant;
    const s = String(status).toLowerCase();
    if (['published', 'true', 'active', 'online', 'success'].includes(s)) return 'success';
    if (['draft', 'pending', 'idle', 'info'].includes(s)) return 'info';
    if (['warning', 'scheduled', 'expiring'].includes(s)) return 'warning';
    if (['error', 'failed', 'false', 'inactive', 'offline', 'deleted'].includes(s)) return 'error';
    return 'default';
});

const themeClasses = $derived.by(() => {
    switch(calculatedVariant) {
        case 'success': return 'bg-success-500/10 text-success-700 dark:text-success-400 border-success-500/20';
        case 'warning': return 'bg-warning-500/10 text-warning-700 dark:text-warning-400 border-warning-500/20';
        case 'error': return 'bg-error-500/10 text-error-700 dark:text-error-400 border-error-500/20';
        case 'info': return 'bg-primary-500/10 text-primary-700 dark:text-primary-400 border-primary-500/20';
        case 'ghost': return 'bg-transparent text-surface-500 border-surface-200 dark:border-surface-700';
        default: return 'bg-surface-500/10 text-surface-700 dark:text-surface-400 border-surface-500/20';
    }
});
</script>

<span 
    class={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider border transition-all duration-300',
        themeClasses,
        className
    )}
>
    <span class="size-1.5 rounded-full bg-current animate-pulse"></span>
    {label}
</span>

<!-- 
 @src/routes/api/cms.ts src/components/ui/table/status.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Status Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
    value: string | number;
    class?: string;
}

let { value, class: className }: Props = $props();

const config = $derived.by(() => {
    const v = String(value).toLowerCase();
    switch(v) {
        case 'publish':
        case 'published':
        case 'active':
            return { color: 'preset-tonal-success', icon: 'mingcute:check-circle-line', label: 'Published' };
        case 'draft':
            return { color: 'preset-tonal-surface', icon: 'mingcute:pencil-line', label: 'Draft' };
        case 'schedule':
        case 'scheduled':
        case 'pending':
            return { color: 'preset-tonal-tertiary', icon: 'mingcute:time-line', label: 'Scheduled' };
        case 'archive':
        case 'archived':
            return { color: 'preset-tonal-warning', icon: 'mingcute:archive-line', label: 'Archived' };
        case 'delete':
        case 'deleted':
        case 'error':
            return { color: 'preset-tonal-error', icon: 'mingcute:delete-2-line', label: 'Deleted' };
        default:
            return { color: 'preset-tonal-surface', icon: 'mingcute:dot-grid-line', label: String(value) };
    }
});
</script>

<div class={cn(
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm",
    config.color,
    className
)}>
    <iconify-icon icon={config.icon} width="14"></iconify-icon>
    <span>{config.label}</span>
</div>

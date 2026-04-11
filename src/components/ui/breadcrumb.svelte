<!-- 
 @src/routes/api/cms.ts src/components/ui/breadcrumb.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Breadcrumb Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Crumb {
	label: string;
	icon?: string;
	href?: string;
}

interface Props {
	items: Crumb[];
	separator?: string;
	class?: string;
}

let { 
	items = [], 
	separator = 'mdi:chevron-right',
	class: className 
}: Props = $props();
</script>

<nav aria-label="Breadcrumb" class={cn('flex py-3', className)}>
	<ol class="flex items-center space-x-2 text-sm">
		{#each items as item, i}
			{@const isLast = i === items.length - 1}
			<li class="flex items-center gap-2">
				{#if i > 0}
					<iconify-icon icon={separator} class="opacity-30 mx-1" width="16"></iconify-icon>
				{/if}

				{#if item.href && !isLast}
					<a 
						href={item.href}
						class="flex items-center gap-1.5 text-surface-500 hover:text-primary-500 transition-colors font-medium"
					>
						{#if item.icon}
							<iconify-icon icon={item.icon} width="16"></iconify-icon>
						{/if}
						<span>{item.label}</span>
					</a>
				{:else}
					<span 
						class={cn(
							"flex items-center gap-1.5 font-bold",
							isLast ? "text-surface-900 dark:text-white" : "text-surface-500"
						)}
						aria-current={isLast ? 'page' : undefined}
					>
						{#if item.icon}
							<iconify-icon icon={item.icon} width="16"></iconify-icon>
						{/if}
						<span>{item.label}</span>
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

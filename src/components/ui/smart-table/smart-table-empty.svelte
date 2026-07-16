<!--
@file src/components/ui/smart-table/smart-table-empty.svelte
@component
**Shared empty state for Smart Table shell (WCAG 2.2).**

### Props
- `title` (string): Primary message.
- `description` (string): Secondary help text.
- `icon` (string): Iconify icon id.
- `action` (Snippet): Optional CTA (clear filters, create, …).
-->

<script lang="ts">
	import { SMART_TABLE_STATE_BODY } from './chrome';
	import type { Snippet } from 'svelte';

	let {
		title = 'No results found',
		description = 'Try adjusting your filters or search terms.',
		icon = 'mingcute:box-line',
		action
	}: {
		title?: string;
		description?: string;
		icon?: string;
		action?: Snippet;
	} = $props();
</script>

<div class={SMART_TABLE_STATE_BODY} role="status" aria-live="polite">
	<iconify-icon {icon} width="48" class="text-surface-400 opacity-40 dark:text-surface-500" aria-hidden="true"></iconify-icon>
	<div class="space-y-1">
		<h3 class="text-base font-semibold text-surface-800 dark:text-surface-100">{title}</h3>
		{#if description}
			<p class="max-w-sm text-sm text-surface-500 dark:text-surface-400">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="mt-2">
			{@render action()}
		</div>
	{/if}
</div>

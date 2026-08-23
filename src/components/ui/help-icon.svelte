<!--
@file src/components/ui/help-icon.svelte
@component Canonical help/info icon trigger for field tooltips — wrap in a <SystemTooltip>.
@props
- `ariaLabel` (string): Accessible name (default: "Field information").
- `class` (string): Extra classes (spacing overrides).
-->
<script lang="ts">
	import Button from './button.svelte';
	import { cn } from '@utils/cn';

	let { ariaLabel = 'Field information', class: className }: { ariaLabel?: string; class?: string } = $props();
</script>

<Button
	variant="ghost"
	type="button"
	tabindex="-1"
	aria-label={ariaLabel}
	class={cn(
		'inline-flex h-auto w-auto shrink-0 items-center justify-center p-0! min-w-0 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500',
		className,
	)}
>
	<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
</Button>

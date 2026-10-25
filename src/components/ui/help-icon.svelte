<!--
@file src/components/ui/help-icon.svelte
@component Canonical help trigger for field tooltips — wrap in a <SystemTooltip>.

Renders a transparent, circular `?` button. The tooltip belongs on this icon
only; never wrap the field label (or the whole control) in <SystemTooltip>.

@props
- `ariaLabel` (string): Accessible name (default: "Field information").
- `tabindex` (number | string): Tab order for the trigger (default: `-1`, so it never adds a stop inside a wrapper that already owns focus; pass `0` when the icon is the only trigger).
- `class` (string): Extra classes (spacing overrides).
-->

<script lang="ts">
	import Button from './button.svelte';
	import { cn } from '@utils/cn';

	let {
		ariaLabel = 'Field information',
		tabindex = -1,
		class: className
	}: { ariaLabel?: string; tabindex?: number | string; class?: string } = $props();
</script>

<Button
	variant="transparent"
	type="button"
	{tabindex}
	aria-label={ariaLabel}
	rounded
	class={cn(
		'inline-flex h-auto w-auto min-w-0 shrink-0 items-center justify-center bg-transparent p-0! text-surface-400 transition-colors hover:bg-surface-500/10 hover:text-tertiary-500 dark:hover:bg-surface-500/20 dark:hover:text-primary-500',
		className
	)}
>
	<iconify-icon icon="mdi:help-circle-outline" width="15" aria-hidden="true"></iconify-icon>
</Button>

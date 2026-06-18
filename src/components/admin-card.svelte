<!--
@file src/components/admin-card.svelte
@component
**AdminCard — Theme-token card shell for admin routes**

Thin wrapper that applies `--admin-radius-card`, `--admin-border-width`, and
`--admin-shadow-elevation` from the admin theme. Use instead of raw `div.card`
with inline `style="border-radius: var(--admin-radius-card)"`.

### Props
- `class` (string): Additional CSS classes.
- `variant` / `preset`: When set, delegates to `Card` with preset styling.
- `children` (Snippet): Card body content.
- Remaining `HTMLAttributes<HTMLDivElement>` are forwarded to the root element.

### Features
- Admin theme CSS variable fallbacks on standalone div
- Optional passthrough to `Card` when `variant` or `preset` is provided
- Full Svelte 5 runes
-->

<script lang="ts">
	import Card from '@components/ui/card.svelte';
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLDivElement> & {
		class?: string;
		children?: Snippet;
		variant?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
		preset?: 'filled' | 'tonal' | 'outlined';
	};

	let {
		class: className,
		children,
		variant,
		preset,
		...rest
	}: Props = $props();

	const useCard = $derived(Boolean(variant || preset));

	const adminStyles =
		'border-radius: var(--admin-radius-card, 0.75rem); border-width: var(--admin-border-width, 1px); box-shadow: var(--admin-shadow-elevation, 0 1px 3px 0 rgb(0 0 0 / 0.1));';
</script>

{#if useCard}
	<Card {variant} {preset} class={className}>
		{#snippet children()}
			{@render children?.()}
		{/snippet}
	</Card>
{:else}
	<div class={cn('card', className)} style={adminStyles} {...rest}>
		{@render children?.()}
	</div>
{/if}
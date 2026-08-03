<!--
@file src/components/admin-card.svelte
@component
**AdminCard — Theme-token card shell for admin routes**

Thin wrapper that applies semantic surface tokens (`--admin-bg-card`, borders,
text) plus density radii and variant-aware shadow/border from AdminTheme.
Use instead of raw `div.card` with ad-hoc dark: surface classes.

### Props
- `class` (string): Additional CSS classes.
- `variant` / `preset`: When set, delegates to `Card` with preset styling.
- `children` (Snippet): Card body content.
- Remaining `HTMLAttributes<HTMLDivElement>` are forwarded to the root element.

### Features
- Semantic --admin-bg-card / border / text tokens
- Variant-aware shadow & border width via getThemeContext()
- Optional passthrough to `Card` when `variant` or `preset` is provided
- Full Svelte 5 runes
-->

<script lang="ts">
	import Card from '@components/ui/card.svelte';
	import { getThemeContext } from '@components/ui/theme-context.svelte';
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
	const theme = getThemeContext();

	/** Structural + semantic surface tokens; shadow/border follow theme variant (flat/bordered/elevated). */
	const adminStyles = $derived(
		[
			'border-radius: var(--admin-radius-card, 0.75rem)',
			`border-width: ${theme?.cardBorder ?? 'var(--admin-border-width, 1px)'}`,
			'border-style: solid',
			'border-color: var(--admin-border-default, var(--color-surface-200))',
			'background-color: var(--admin-bg-card, var(--color-surface-50))',
			'color: var(--admin-text-body, var(--color-surface-900))',
			`box-shadow: ${theme?.cardShadow ?? 'var(--admin-shadow-elevation, 0 1px 3px 0 rgb(0 0 0 / 0.1))'}`,
		].join('; '),
	);
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
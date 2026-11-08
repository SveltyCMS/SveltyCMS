<!--
@file src/components/ui/breadcrumb.svelte
@component
**SveltyCMS Breadcrumb — WCAG 3.0 Ready**

Accessible breadcrumb trail with a configurable separator, per-crumb icons,
and an `aria-current` page indicator.

### Props
- `items` (Crumb[]): Array of { label, icon?, href?, data? }. `data` is an opaque
  payload forwarded to a custom `crumb` snippet (domain fields the primitive
  does not interpret).
- `separator` (string): Iconify separator icon (default: 'mdi:chevron-right').
- `class` (string): Additional CSS classes appended to the `<nav>`.
- `navClass` (string): Replaces the default `flex py-3` classes on the `<nav>`.
- `listClass` (string): Replaces the default `flex items-center gap-2 text-sm`
  classes on the `<ol>`.
- `ariaLabel` (string): Accessible name of the `<nav>` landmark (default:
  'Breadcrumb').
- `crumb` (Snippet<[{ item, index, isLast }]>): Renders each crumb's inner
  link/span. The primitive still renders the `<li>` wrapper and separator, so
  the trail keeps its list semantics. The caller owns every attribute on the
  rendered element, including `aria-current="page"` on the last crumb; the
  primitive only writes `aria-current` in the default (snippet-less) path.

### Features:
- WCAG 3.0 ready with a labelled `<nav>` landmark and `aria-current="page"`
- default markup: per-crumb `icon` support (commonly a home icon on the first
  crumb), rendered only when an item provides one
- link vs. span rendering based on href presence and last-crumb position
- optional `crumb` snippet for interactive trails (drag-drop targets,
  selection-aware labels), with separators and list items still primitive-owned
- full Svelte 5 runes: $props, snippets
-->

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@utils/cn';

	interface Crumb {
		label: string;
		icon?: string;
		href?: string;
		/** Opaque payload for a custom `crumb` snippet; the primitive ignores it. */
		data?: Record<string, unknown>;
	}

	interface Props {
		items: Crumb[];
		separator?: string;
		class?: string;
		navClass?: string;
		listClass?: string;
		ariaLabel?: string;
		crumb?: Snippet<[{ item: Crumb; index: number; isLast: boolean }]>;
	}

	let {
		items = [],
		separator = 'mdi:chevron-right',
		class: className,
		navClass,
		listClass,
		ariaLabel = 'Breadcrumb',
		crumb
	}: Props = $props();

	/**
	 * The trailing crumb's role flips between `ancestor` and `last` when the trail
	 * grows/shrinks. Svelte keeps the DOM of an existing key when only the array
	 * length changes, so `isLast` would stay stale (two `aria-current` spans after
	 * navigating into a folder). Including the role in the key remounts exactly
	 * the crumb whose position changed.
	 */
	function crumbKey(item: Crumb, index: number, total: number): string {
		return `${item.href ?? item.label}:${index === total - 1 ? 'last' : 'ancestor'}`;
	}
</script>

<nav aria-label={ariaLabel} class={cn(navClass ?? 'flex py-3', className)}>
	<ol class={listClass ?? 'flex items-center gap-2 text-sm'}>
		{#each items as item, i (crumbKey(item, i, items.length))}
			{const isLast = i === items.length - 1}
			<li class="flex items-center gap-2">
				{#if i > 0}
					<iconify-icon icon={separator} class="opacity-30 mx-1" width="16"></iconify-icon>
				{/if}

				{#if crumb}
					{@render crumb({ item, index: i, isLast })}
				{:else if item.href && !isLast}
					<a
						href={item.href}
						class="flex items-center gap-1.5 text-surface-500 hover:text-tertiary-500 dark:text-primary-500 transition-colors font-medium"
					>
						{#if item.icon}
							<iconify-icon icon={item.icon} width="16"></iconify-icon>
						{/if}
						<span>{item.label}</span>
					</a>
				{:else}
					<span
						class={cn(
							'flex items-center gap-1.5 font-bold',
							isLast ? 'text-surface-900 dark:text-white' : 'text-surface-500'
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

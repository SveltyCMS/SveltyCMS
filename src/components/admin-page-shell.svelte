<!--
@file src/components/admin-page-shell.svelte
@component
**AdminPageShell — Mandatory enterprise page contract (Gin-inspired)**

Enforces the unified structural blueprint from style-guide-gui.mdx:
- View root shell with admin-theme-container
- PageTitle header (no inline h1)
- Standardized spacing, motion entry, and card-friendly content area

### Props
- `title` (string): Page title passed to PageTitle.
- `icon` (string): Leading icon for PageTitle.
- `description` (string): Optional subtitle.
- `showBackButton` (boolean): Show back navigation.
- `backUrl` (string): Back link target.
- `highlight` (string): Partial title highlight.
- `fullHeight` (boolean): Disable vertical scroll on shell (editor layouts).
- `spaceY` ('4' | '6' | '8'): Vertical rhythm between sections.
- `titleCompact` (boolean): Tighter PageTitle row with bottom border.
- `animate` (boolean): Apply standard page entry fade (respects reduced motion).
- `navColor` (string): Tailwind bg class for FloatingNav favorite spoke (default `bg-amber-500`).
- `children` (Snippet): Page body content.
- `actions` (Snippet): Trailing header actions for PageTitle.

### Features:
- admin-theme-container shell with --admin-* token fallbacks
- sticky PageTitle flush to top (no top padding gap)
- integrates PageTitle with actions slot
- optional adminFade entry transition
- full Svelte 5 runes
-->

	<script lang="ts">
	import PageTitle from '@components/page-title.svelte';
	import AdminZone from '@src/components/system/admin-zone.svelte';
	import type { NavFavoriteColor } from '@src/stores/floating-nav-store.svelte.ts';
	import { adminFade } from '@utils/admin-transitions';

	interface Props {
		title: string;
		icon?: string;
		description?: string;
		showBackButton?: boolean;
		backUrl?: string;
		highlight?: string;
		fullHeight?: boolean;
		spaceY?: '4' | '6' | '8';
		titleCompact?: boolean;
		titleBorderless?: boolean;
		animate?: boolean;
		/** Tailwind bg class for FloatingNav favorite spoke — NAV_FAVORITE_COLORS literal (default `bg-amber-500`). */
		navColor?: NavFavoriteColor;
		children?: import('svelte').Snippet;
		actions?: import('svelte').Snippet;
	}

	let {
		title,
		icon,
		description,
		showBackButton = false,
		backUrl = '',
		highlight = '',
		fullHeight = false,
		spaceY = '6',
		titleCompact = false,
		titleBorderless = false,
		animate = true,
		navColor,
		children,
		actions
	}: Props = $props();

	const spaceClass = $derived(`space-y-${spaceY}`);

</script>

<div
	class="admin-theme-container absolute inset-0 {fullHeight
		? 'flex flex-col overflow-hidden'
		: 'overflow-y-auto'}"
	style="background-color: var(--admin-bg-page, var(--color-surface-50)); color: var(--admin-text-body, var(--color-surface-900));"
	in:adminFade={animate ? { duration: 200 } : undefined}
>
	<PageTitle
		name={title}
		{icon}
		{description}
		{showBackButton}
		{backUrl}
		{highlight}
		compact={titleCompact}
		borderless={titleBorderless}
		{navColor}
	>
		{#if actions}
			{@render actions()}
		{/if}
	</PageTitle>

	<AdminZone zone="content-header" inline={true} />

	<div class="px-2 pb-2 pt-4 {spaceClass} {fullHeight ? 'flex min-h-0 flex-1 flex-col' : ''}">
		{@render children?.()}
	</div>

	<AdminZone zone="content-footer" inline={true} />
</div>

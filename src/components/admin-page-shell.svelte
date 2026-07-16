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
		animate?: boolean;
		children?: import('svelte').Snippet;
		actions?: import('svelte').Snippet;
	}

	let {
		title,
		icon,
		description = '',
		showBackButton = false,
		backUrl = '',
		highlight = '',
		fullHeight = false,
		spaceY = '6',
		titleCompact = false,
		animate = true,
		children,
		actions
	}: Props = $props();

	const spaceClass = $derived(
		spaceY === '4' ? 'space-y-4' : spaceY === '8' ? 'space-y-8' : 'space-y-6'
	);
	
</script>

<div
	class="admin-theme-container absolute inset-0 bg-surface-50 dark:bg-surface-950 {fullHeight
		? 'flex flex-col overflow-hidden'
		: 'overflow-y-auto'}"
	in:adminFade={animate ? { duration: 200 } : { duration: 0 }}
>
	<PageTitle
		name={title}
		{icon}
		{description}
		{showBackButton}
		{backUrl}
		{highlight}
		compact={titleCompact}
	>
		{#if actions}
			{@render actions()}
		{/if}
	</PageTitle>

	<div class="px-2 pb-2 pt-2 {spaceClass} {fullHeight ? 'flex min-h-0 flex-1 flex-col' : ''}">
		{@render children?.()}
	</div>
</div>

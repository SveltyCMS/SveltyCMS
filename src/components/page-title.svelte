<!--
@file src/components/page-title.svelte
@component
**Dynamic Page Title with Accessibility and CMS Features**

@example
<PageTitle
  name="Dashboard"
  icon="bi:bar-chart-line"
  highlight="Dash"
  iconColor="text-tertiary-500 dark:text-primary-500"
  showBackButton={true}
  backUrl="/home"
  onBackClick={(defaultBehavior) => {
    // Custom navigation logic
    defaultBehavior();
  }}
/>

#### Props - Required
- `name` {string} - Page title
- `icon` {string} - Icon name from [iconify](https://iconify.design/)

#### Props - Optional
- `highlight` {string} - Part of `name` to highlight
- `iconColor` {string} - Icon color (default: `text-tertiary-500 dark:text-primary-500`)
- `iconSize` {string} - Icon size (default: `32`; do not override per route — use AdminPageShell)
- `showBackButton` {boolean} - Show back button (default: `false`)
- `backUrl` {string} - Navigation URL for back button
- `truncate` {boolean} - Enable title truncation (default: `true`)
- `onBackClick` {function} - Custom back navigation callback
- `color` {string} - Background/text color (default: `blue`)

#### Accessibility Features:
- ARIA live region for title changes
- Keyboard navigation support
- Screen reader optimization with visually hidden full title
- Contrast validation for highlighted text
- Responsive touch targets

#### CMS Features:
- Data attributes for CMS field mapping
- Content editor hints
- Fluid typography scaling
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import { page } from '$app/state';

	type DefaultBehaviorFn = () => void;

	// Props
	interface Props {
		backUrl?: string;
		children?: import('svelte').Snippet; // For action buttons
		highlight?: string;
		icon?: string;
		iconColor?: string;
		iconSize?: string;
		name: string;
		description?: string;
		onBackClick?: (defaultBehavior: DefaultBehaviorFn) => void;
		showBackButton?: boolean;
		truncate?: boolean;
		/** Tighter title row with bottom border — for data-dense pages (e.g. media gallery). */
		compact?: boolean;
	}

	const {
		name,
		highlight = '',
		icon,
		iconColor = 'text-tertiary-500 dark:text-primary-500',
		iconSize = '32',
		showBackButton = false,
		backUrl = '',
		truncate = true,
		description = '',
		onBackClick,
		compact = false,
		children
	}: Props = $props();

	const titleParts = $derived.by(() => {
		if (highlight && name.toLowerCase().includes(highlight.toLowerCase())) {
			const regex = new RegExp(`(${highlight})`, 'gi');
			return name.split(regex);
		}
		return [name];
	});

	function handleBackClick(event: Event) {
		const defaultBehavior: DefaultBehaviorFn = () => {
			if (!backUrl) {
				event.preventDefault();
				window.history.back();
			}
			// If backUrl exists, let the link handle navigation naturally
		};

		if (onBackClick) {
			event.preventDefault();
			onBackClick(defaultBehavior);
		} else if (!backUrl) {
			// No backUrl provided, use browser history
			event.preventDefault();
			window.history.back();
		}
		// Otherwise, let the <a> tag handle navigation with preloading
	}

	// Bookmark this page as a floating-nav favorite
	const FAVORITES_KEY = 'floatingNav_favorites';
	let isFavorited = $state(false);

	$effect(() => {
		try {
			const saved = localStorage.getItem(FAVORITES_KEY);
			const existing = saved ? JSON.parse(saved) : [];
			isFavorited = existing.some((f: any) => f.path === page.url.pathname);
		} catch { /* ignore */ }
	});

	function toggleFavorite() {
		try {
			const saved = localStorage.getItem(FAVORITES_KEY);
			let favorites = saved ? JSON.parse(saved) : [];
			const pathname = page.url.pathname;
			if (isFavorited) {
				favorites = favorites.filter((f: any) => f.path !== pathname);
			} else {
				favorites.push({
					id: 'fav_' + Date.now(),
					tooltip: name,
					url: { external: false, path: pathname },
					icon: icon || 'mdi:bookmark',
					color: 'bg-amber-500',
				});
			}
			localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
			isFavorited = !isFavorited;
		} catch { /* ignore */ }
	}
</script>

<div
	class="sticky top-0 z-40 flex w-full min-w-0 items-center justify-between gap-3 bg-surface-50/95 backdrop-blur-sm dark:bg-surface-950/95
		{compact ? 'px-2 py-2.5 sm:px-3' : 'gap-4 py-1.5'}"
>
	<div class="flex min-w-0 items-center">
		{#if ui.state.leftSidebar === 'hidden'}
			<Button variant="outline"
				type="button"
				onclick={() => ui.toggle('leftSidebar', window.innerWidth >= 1024 ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
			 class="p-0! min-w-0 shrink-0">
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</Button>
		{/if}
		<div class="flex flex-col ms-2 min-w-0">
			<h1
				class="transition-max-width h1 relative flex items-center gap-1 font-bold"
				style="font-size: {compact ? 'clamp(1.125rem, 2vw + 0.75rem, 1.5rem)' : 'clamp(1.5rem, 3vw + 1rem, 2.25rem)'};"
				aria-live="polite"
				data-cms-field="pageTitle"
				data-cms-type="text"
			>
				{#if icon}
					<iconify-icon
						{icon}
						width={compact ? '22' : iconSize}
						class={`me-1 shrink-0 ${iconColor} sm:mr-2`}
						aria-hidden="true"
					></iconify-icon>
				{/if}

				<span class:block={truncate} class:overflow-hidden={truncate} class:text-ellipsis={truncate} class:whitespace-nowrap={truncate}>
					{#each titleParts as part, i (i)}
						<span class={i % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''}> {part} </span>
					{/each}
				</span>

				<span class="sr-only absolute inset-0 overflow-hidden whitespace-normal"> {name} </span>
			</h1>
			{#if description}
				<span class="mt-0.5 text-xs font-medium text-surface-500 dark:text-surface-400 {compact ? '' : 'opacity-50'}">{description}</span>
			{/if}
		</div>
	</div>

	<div class="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
		{#if children}
			{@render children()}
		{/if}

		{#if showBackButton}
			{#if backUrl}
				<SystemTooltip title="Go back" role={null} tabindex={null}>
					<a
						href={backUrl}
						aria-label="Go back"
						class="flex shrink-0 items-center justify-center rounded-full border border-surface-500 transition-colors hover:bg-surface-500/10 dark:border-surface-200
							{compact ? 'h-9 w-9' : 'h-10 w-10'}"
						data-cms-action="back"
						data-sveltekit-preload-data="hover"
						onclick={(e) => handleBackClick(e)}
					>
						<iconify-icon icon="ri:arrow-left-line" width={compact ? '20' : '24'} aria-hidden="true"></iconify-icon>
					</a>
				</SystemTooltip>
			{:else}
				<Button variant="outline"
					onclick={(e: MouseEvent) => handleBackClick(e)}
					aria-label="Go back"
					tabindex="0"
					class="flex min-w-0 shrink-0 items-center justify-center rounded-full p-0! {compact ? 'h-9 w-9' : 'h-10 w-10'}"
					data-cms-action="back"
				>
					<iconify-icon icon="ri:arrow-left-line" width={compact ? '20' : '24'} aria-hidden="true"></iconify-icon>
				</Button>
			{/if}
		{/if}

		<!-- Bookmark: add/remove this page from floating-nav favorites -->
		<SystemTooltip title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}>
			<Button
					variant="ghost"
					type="button"
					onclick={toggleFavorite}
					aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
					class="flex shrink-0 items-center justify-center rounded-full border transition-colors {compact ? 'h-9 w-9' : 'h-10 w-10'} {isFavorited ? 'border-amber-500 text-amber-500 bg-amber-500/10' : 'border-surface-300 hover:bg-surface-500/10 dark:border-surface-600'}"
				>
					<iconify-icon icon={isFavorited ? 'mdi:star' : 'mdi:star-outline'} width={compact ? '18' : '20'} aria-hidden="true"></iconify-icon>
				</Button>
		</SystemTooltip>
	</div>
</div>

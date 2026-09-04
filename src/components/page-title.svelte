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
- `navColor` {string} - Tailwind bg class for FloatingNav spoke when favorited (default: `bg-warning-500`)

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
- Floating-nav pin (star): toggles system defaults or custom favorites via `floatingNavStore` (synced with FloatingNav)
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { floatingNavStore, type NavFavoriteColor } from '@src/stores/floating-nav-store.svelte.ts';
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
		/** Remove the bottom border under the title row. */
		borderless?: boolean;
		/**
		 * Tailwind bg class for FloatingNav favorite spoke — must be a
		 * NAV_FAVORITE_COLORS literal (Tailwind JIT only emits source-scanned classes).
		 * (e.g. `bg-teal-500`). System catalog routes ignore this (use fixed catalog colors).
		 */
		navColor?: NavFavoriteColor;
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
		borderless = false,
		navColor = 'bg-warning-500',
		children
	}: Props = $props();

	const titleParts = $derived.by(() => {
		if (highlight && name.toLowerCase().includes(highlight.toLowerCase())) {
			// Escape regex metacharacters — highlight is user-supplied search input
			const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`(${escaped})`, 'gi');
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

	// Floating nav: system default toggle OR custom favorite (shared store with FloatingNav).
	// NOTE: do NOT call floatingNavStore.bindUser() here — the (app) layout already binds
	// with the authoritative data.user. PageTitle's page.data.user can be shadowed by a
	// page +page.server.ts (e.g. { user: { email } } without _id/id), which makes bindUser
	// alternate between the real id and "anonymous" and trips Svelte's
	// effect_update_depth_exceeded guard (infinite effect loop).

	const pathname = $derived(page.url.pathname);
	const isFavorited = $derived(floatingNavStore.isActive(pathname));
	const isFixedNavItem = $derived(floatingNavStore.isFixed(pathname));

	function toggleFavorite() {
		if (isFixedNavItem) return; // Home / Settings always stay on the radial
		floatingNavStore.togglePage(pathname, { name, icon, color: navColor });
	}

	const favoriteTooltip = $derived(
		isFixedNavItem
			? 'Always available in floating navigation'
			: isFavorited
				? 'Remove from floating navigation'
				: 'Pin to floating navigation'
	);
</script>

<div
	data-testid="admin-page-title"
	class="sticky top-0 z-40 flex w-full min-w-0 items-center justify-between ps-5 pe-2 pt-2 backdrop-blur-sm
		{compact || description ? 'min-h-12 gap-3 pb-2 sm:ps-6 sm:pe-3' : 'min-h-12 gap-4'}"
	style="background-color: color-mix(in srgb, var(--admin-bg-page, var(--color-surface-50)) 95%, transparent); color: var(--admin-text-body, var(--color-surface-900)); {borderless ? '' : 'border-bottom: 1px solid color-mix(in srgb, var(--admin-border-default, var(--color-surface-200)) 80%, transparent);'}"
>
	<div class="flex min-w-0 items-center">
		{#if ui.state.leftSidebar === 'hidden'}
			<Button variant="ghost"
				type="button"
				onclick={() => ui.toggle('leftSidebar', window.innerWidth >= 1024 ? 'full' : 'collapsed')}
				aria-label="Open Sidebar"
				class="h-9 w-9 shrink-0 p-0! min-w-0 hover:bg-(--admin-border-subtle)"
				style="color: var(--admin-text-body)"
			>
				<iconify-icon icon="mingcute:menu-fill" width="22" aria-hidden="true"></iconify-icon>
			</Button>
		{/if}
		<div class="flex min-w-0 flex-col justify-center">
			<div class="flex min-w-0 items-center gap-1">
				<h1
					class="transition-max-width h1 relative flex min-w-0 items-center gap-1 leading-tight font-bold"
					style="font-size: {compact ? 'clamp(1.125rem, 2vw + 0.75rem, 1.5rem)' : 'clamp(1.25rem, 2vw + 0.75rem, 1.75rem)'};"
					aria-live="polite"
					data-cms-field="pageTitle"
					data-cms-type="text"
					data-testid="page-title"
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
							<span class={i % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''}>{part}</span>
						{/each}
					</span>
				</h1>

				<!-- Floating-nav pin lives outside h1 so heading accessible name stays clean for E2E/a11y -->
				<SystemTooltip title={favoriteTooltip}>
					<button
						type="button"
						onclick={toggleFavorite}
						aria-label={favoriteTooltip}
						aria-pressed={isFavorited}
						disabled={isFixedNavItem}
						class="ms-0.5 inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 {isFavorited
							? 'text-warning-500 opacity-100'
							: 'opacity-60 hover:opacity-100 hover:text-warning-500'} {isFixedNavItem ? 'cursor-default' : ''}"
						style={isFavorited ? undefined : 'color: var(--admin-text-muted)'}
					>
						<iconify-icon icon={isFavorited ? 'mdi:star' : 'mdi:star-outline'} width={compact ? '18' : '20'} aria-hidden="true"></iconify-icon>
					</button>
				</SystemTooltip>
			</div>
			{#if description}
				<span class="mt-0.5 text-xs font-medium {compact ? '' : 'opacity-50'}" style="color: var(--admin-text-muted)">{description}</span>
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
						class="flex shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-(--admin-border-subtle)
							{compact ? 'h-9 w-9' : 'h-10 w-10'}"
						style="border-color: var(--admin-border-default); color: var(--admin-text-body)"
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
					rounded={true}
					class="flex min-w-0 shrink-0 items-center justify-center p-0! {compact ? 'h-9 w-9' : 'h-10 w-10'}"
					data-cms-action="back"
				>
					<iconify-icon icon="ri:arrow-left-line" width={compact ? '20' : '24'} aria-hidden="true"></iconify-icon>
				</Button>
			{/if}
		{/if}
	</div>
</div>

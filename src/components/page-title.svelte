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
	import {
		floatingNavStore,
		type NavFavoriteColor
	} from '@src/stores/floating-nav-store.svelte.ts';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import {
		error_goback,
		page_title_fav_fixed,
		page_title_fav_pin,
		page_title_fav_remove
	} from '@src/paraglide/messages';
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
		subtitle?: import('svelte').Snippet;
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
		subtitle,
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
			? page_title_fav_fixed()
			: isFavorited
				? page_title_fav_remove()
				: page_title_fav_pin()
	);

	/**
	 * The sidebar collapse control straddles the sidebar edge by 16px, so the
	 * first ~20px of the content column belong to its hit target on desktop.
	 * Keep the title clear of it; on mobile the sidebar is an overlay and the
	 * normal padding is enough.
	 */
	const titleStartPadding = $derived(
		ui.state.leftSidebar === 'hidden' ? 'ps-2 sm:ps-3' : 'ps-2 sm:ps-3 md:ps-10'
	);

	/** Long names wrap between the menu and back buttons and leave the star in the gap. */
	const longMobileTitle = $derived(name.trim().length > 16);
</script>

<div
	data-testid="admin-page-title"
	class="sticky top-0 z-40 flex w-full min-w-0 flex-wrap items-center justify-between max-md:grid! max-md:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] max-md:items-start {titleStartPadding} pe-2 pt-2 backdrop-blur-sm
		{compact || description || subtitle ? 'min-h-12 gap-3 pb-2 sm:pe-3' : 'min-h-12 gap-4'}"
	style="background-color: color-mix(in srgb, var(--admin-bg-page, var(--color-surface-50)) 95%, transparent); color: var(--admin-text-body, var(--color-surface-900)); {borderless
		? ''
		: 'border-bottom: 1px solid color-mix(in srgb, var(--admin-border-default, var(--color-surface-200)) 80%, transparent);'}"
>
	<div class="flex min-w-[min(100%,11rem)] flex-1 items-center max-md:contents">
		<!-- Below md the sidebar always resolves to "hidden"; render the toggle from the
		     first (SSR) paint there so the title does not jump when the store hydrates. -->
		<Button
			variant="ghost"
			type="button"
			onclick={() =>
				ui.toggle(
					'leftSidebar',
					window.innerWidth >= 768 && window.innerWidth < 1024 ? 'collapsed' : 'full'
				)}
			aria-label="Open Sidebar"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full! border border-surface-500/30 p-0! min-w-0 hover:bg-surface-500/10 max-md:mt-0.5 max-md:justify-self-start dark:border-surface-500/40 dark:hover:bg-surface-500/20 {ui
				.state.leftSidebar === 'hidden'
				? ''
				: 'md:hidden'}"
		>
			<iconify-icon icon="mingcute:menu-fill" width="20" aria-hidden="true"></iconify-icon>
		</Button>
		<div class="flex min-w-0 flex-col justify-center max-md:col-start-2 max-md:justify-self-center">
			<div class="flex min-w-0 flex-wrap items-center gap-2 max-md:justify-center sm:gap-3">
				<!-- Phone: the title row is as tall as the back button (40px) so menu, title and back line up -->
				<div class="flex min-w-0 items-center gap-1 max-md:min-h-10">
					<h1
						class="transition-max-width h1 relative flex min-w-0 items-center gap-1 leading-tight font-bold {longMobileTitle
							? 'long-mobile-title'
							: ''}"
						style="font-size: {compact
							? 'clamp(1.125rem, 2vw + 0.75rem, 1.5rem)'
							: 'clamp(1.25rem, 2vw + 0.75rem, 1.75rem)'};"
						aria-live="polite"
						data-cms-field="pageTitle"
						data-cms-type="text"
						data-testid="page-title"
					>
						{#if icon}
							<!-- Fixed box: iconify-icon has no size until its SVG loads (layout shift) -->
							<span
								class="title-icon me-1 inline-flex shrink-0 items-center justify-center sm:me-2"
								style="width: {compact ? '22' : iconSize}px; height: {compact ? '22' : iconSize}px"
							>
								<iconify-icon
									{icon}
									width={compact ? '22' : iconSize}
									class={`shrink-0 ${iconColor}`}
									aria-hidden="true"
								></iconify-icon>
							</span>
						{/if}

						<span
							class:block={truncate}
							class:overflow-hidden={truncate}
							class:text-ellipsis={truncate}
							class:whitespace-nowrap={truncate}
							class:max-md:whitespace-normal={truncate && !longMobileTitle}
						>
							{#each titleParts as part, i (i)}
								<span
									class={i % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''}
									>{part}</span
								>
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
							class="title-star ms-0.5 inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 text-warning-500 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-500 dark:focus-visible:outline-primary-500 {isFixedNavItem
								? 'cursor-default'
								: 'hover:opacity-80'}"
						>
							<iconify-icon icon="mdi:star" width={compact ? '22' : '32'} aria-hidden="true"
							></iconify-icon>
						</button>
					</SystemTooltip>
				</div>

				{#if subtitle}
					<div
						class="flex items-center ps-2 sm:ps-3 border-s border-(--admin-border-default) max-md:w-full max-md:justify-center max-md:border-s-0 max-md:ps-0"
					>
						{@render subtitle()}
					</div>
				{/if}
			</div>

			{#if description}
				<span
					class="mt-0.5 text-xs font-medium {compact ? '' : 'opacity-50'}"
					style="color: var(--admin-text-muted)">{description}</span
				>
			{/if}
		</div>
	</div>

	<div
		class="ms-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 max-md:contents sm:gap-2"
	>
		{#if children}
			<!-- Phone: keep Save and status chips off the title row so the icon and star stay lined up. -->
			<div
				class="flex shrink-0 items-center gap-1.5 max-md:col-span-3 max-md:row-start-2 max-md:justify-self-end max-md:px-2 max-md:pb-2"
			>
				{@render children()}
			</div>
		{/if}

		{#if showBackButton}
			<div class="max-md:col-start-3 max-md:row-start-1 max-md:justify-self-end">
				{#if backUrl}
					<SystemTooltip title={error_goback()} role={null} tabindex={null}>
						<a
							href={backUrl}
							aria-label={error_goback()}
							class="flex shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-(--admin-border-subtle)
							{compact ? 'h-9 w-9' : 'h-10 w-10'}"
							style="border-color: var(--admin-border-default); color: var(--admin-text-body); background-color: var(--admin-bg-card)"
							data-cms-action="back"
							data-sveltekit-preload-data="hover"
							onclick={(e) => handleBackClick(e)}
						>
							<iconify-icon
								icon="ri:arrow-left-line"
								width={compact ? '20' : '24'}
								class="rtl:rotate-180"
								aria-hidden="true"
							></iconify-icon>
						</a>
					</SystemTooltip>
				{:else}
					<button
						type="button"
						onclick={(e: MouseEvent) => handleBackClick(e)}
						aria-label={error_goback()}
						tabindex="0"
						class="flex shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-(--admin-border-subtle) {compact
							? 'h-9 w-9'
							: 'h-10 w-10'}"
						style="border-color: var(--admin-border-default); color: var(--admin-text-body); background-color: var(--admin-bg-card)"
						data-cms-action="back"
					>
						<iconify-icon
							icon="ri:arrow-left-line"
							width={compact ? '20' : '24'}
							class="rtl:rotate-180"
							aria-hidden="true"
						></iconify-icon>
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Long names stay one line. Icon and star stay 32px, same as User Profile. */
	@media (max-width: 767px) {
		h1.long-mobile-title {
			font-size: 17px !important;
		}

		h1.long-mobile-title .title-icon,
		h1.long-mobile-title .title-icon iconify-icon {
			width: 32px !important;
			height: 32px !important;
		}
	}
</style>

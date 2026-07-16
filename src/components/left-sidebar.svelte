<!--
@file src/components/left-sidebar.svelte

@component
**LeftSidebar — context-aware primary navigation**

Route-driven sidebar content (no dual collapsible section headers):
- Default / collections → collection tree only
- Media gallery → virtual folders + back to collections
- System settings → SettingsMenu

@example
<LeftSidebar />

### Features:
- Context-switched collections tree vs media folders
- Pinned items (when any)
- User / theme / language / sign-out footer
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	// Native UI Components
	import Dropdown from "@components/ui/dropdown.svelte";
	import Collections from '@src/components/collections.svelte';
	import SettingsMenu from '@src/components/settings-menu.svelte';
	import MediaFolders from '@src/components/media-folders.svelte';
	import SiteName from '@src/components/site-name.svelte';
	// Components
	import SveltyCMSLogo from '@src/components/system/icons/svelty-cms-logo.svelte';
	// System Components
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import ThemeToggle from '@src/components/theme-toggle.svelte';
	import VersionCheck from '@src/components/version-check.svelte';
	import type { ContentNode } from '@src/content/types';
	// Paraglide Messages
	import {
		applayout_signout,
		applayout_systemconfiguration,
		applayout_systemlanguage,
		applayout_userprofile,
	} from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { goto, invalidateAll } from '$app/navigation';
	// Stores
	import { contentStructure } from '@src/stores/collection-store.svelte';
	import { ui, toggleUIElement } from '@src/stores/ui-store.svelte';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app, systemLanguage } from '@src/stores/store.svelte';
	import { themeStore } from '@src/stores/theme-store.svelte';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { getLanguageName } from '@utils/language-utils';
	import { logger } from '@utils/logger';
	import Avatar from '@components/ui/avatar.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { scale } from 'svelte/transition';
	import { getThemeContext } from '@components/ui/theme-context.svelte';

	// Constants
	const MOBILE_BREAKPOINT = 768;
	const LANGUAGE_DROPDOWN_THRESHOLD = 5;
	const AVATAR_CACHE_BUSTER = Date.now();

	// Types
	type AvailableLanguage = string;
	type SidebarState = 'full' | 'collapsed' | 'hidden';

	// Reactive user data
	const user = $derived(page.data.user);
	const currentPath = $derived(page.url.pathname);
	const collections: ContentNode[] = $derived(contentStructure.value || []);
	let searchQuery = $state('');

	// Route context: exclusive modes — never show both trees at once
	const isMediaGalleryRoute = $derived(currentPath.includes('/mediagallery'));

	// Collapsible: pinned section only
	let isPinnedOpen = $state(true);

	// Derived values
	const isSidebarFull = $derived(ui.state.leftSidebar === 'full');

	// Theme-aware: should collections render in this sidebar?
	const themeCtx = getThemeContext();
	const collectionsPosition = $derived(
		themeCtx?.features?.layoutRegions?.collections ?? 'left'
	);
	const showCollectionsHere = $derived(
		collectionsPosition === 'left' || collectionsPosition === 'both'
	);

	const firstCollectionPath = $derived.by(() => {
		if (collections?.[0]) {
			const node = collections[0] as any;
			const pathValue = node.path || `/collection/${node._id}`;
			return `/${getLocale()}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
		}
		return '/collections';
	});

	const availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	const showLanguageDropdown = $derived(availableLanguages.length > LANGUAGE_DROPDOWN_THRESHOLD);

	let languageTag = $state<Locale>(getLocale() as Locale);

	// Keep languageTag in sync when the Paraglide locale changes externally
	$effect(() => {
		languageTag = getLocale() as Locale;
	});

	const filteredLanguages = $derived(
		availableLanguages
			.filter((lang) => lang !== languageTag) // Hide current language
			.filter((lang: string) => {
				const searchLower = searchQuery.toLowerCase();
				const systemLangName = getLanguageName(lang, systemLanguage.value).toLowerCase();
				const enLangName = getLanguageName(lang, 'en').toLowerCase();
				return systemLangName.includes(searchLower) || enLangName.includes(searchLower);
			}) as AvailableLanguage[]
	);

	const avatarUrl = $derived.by(() => {
		let src = user?.avatar;
		if (!src || src === 'Default_User.svg' || src === '/Default_User.svg') {
			return '/Default_User.svg';
		}
		if (src.startsWith('data:')) {
			return src;
		}

		// Normalize path
		src = src.replace(/^\/+/, '');
		src = src.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		src = src.replace(/^\/+/, '');

		return `/files/${src}?t=${AVATAR_CACHE_BUSTER}`;
	});

	const themeTooltipText = $derived.by(() => {
		const current = themeStore.themePreference;
		if (current === 'system') {
			return 'System theme (click for Light)';
		}
		if (current === 'light') {
			return 'Light theme (click for Dark)';
		}
		return 'Dark theme (click for System)';
	});

	// Helper functions
	function isMobile(): boolean {
		return browser && window.innerWidth < MOBILE_BREAKPOINT;
	}

	// Event handlers
	function handleLanguageSelection(lang: AvailableLanguage): void {
		app.systemLanguage = lang;
		systemLanguage.set(lang as Locale);
		languageTag = lang as Locale;
		searchQuery = '';
	}

	function toggleSidebar(): void {
		const newState: SidebarState = ui.state.leftSidebar === 'full' ? 'collapsed' : 'full';
		toggleUIElement('leftSidebar', newState);
	}

	function handleUserClick(): void {
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		modeTransitionGuard.setMode('view');
	}

	function handleConfigClick(): void {
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		modeTransitionGuard.setMode('view');
	}

	async function signOut(): Promise<void> {
		try {
			let res = await fetch('/api/user/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				}
			});
			if (!res.ok && res.status === 403) {
				await invalidateAll();
				await new Promise(r => setTimeout(r, 100));
				await fetch('/api/user/logout', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-Token': page.data.csrfToken
					}
				});
			}
		} catch (error) {
			logger.error('Error during sign-out:', error instanceof Error ? error.message : 'Unknown error');
		} finally {
			if (browser) window.location.href = '/login';
		}
	}

	/** Leave media gallery and restore collections navigation */
	function handleBackToCollections(): void {
		if (collections.length === 0) {
			goto('/config/collectionbuilder');
		} else {
			goto(firstCollectionPath);
		}
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'collapsed');
		}
	}
</script>

<div class="sidebar-root flex h-full w-full flex-col justify-between bg-transparent">
	<!-- Corporate Identity — min-h-12 + pt-2 matches PageTitle so brand + page name share one Y -->
	{#if isSidebarFull}
		<a href="/" aria-label="SveltyCMS Logo" class="-ms-2 flex min-h-12 shrink-0 items-center pt-2 no-underline!" data-sveltekit-preload-data="hover">
			<SveltyCMSLogo fill="red" className="h-9" />
			<span class="base-font-color relative -ms-1 text-2xl font-bold leading-none"><SiteName siteName={publicEnv.SITE_NAME} highlight="CMS" /></span>
		</a>
	{:else}
		<div class="flex min-h-12 shrink-0 items-center justify-start gap-2 pt-2">
			<Button variant="ghost"
				type="button"
				onclick={() => toggleUIElement('leftSidebar', 'hidden')}
				aria-label="Close Sidebar"
			 class="p-0! min-w-0 preset-outline-surface-500">
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</Button>

			<a href="/" aria-label="SveltyCMS Logo" class="flex items-center no-underline!">
				<SveltyCMSLogo fill="red" className="h-9 -ms-2" />
			</a>
		</div>
	{/if}

	<!-- Expand/Collapse Button -->
	<SystemTooltip
		title={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
		positioning={{ placement: 'right-end' }}
		triggerClass="absolute top-3 z-20 ltr:-end-4 rtl:-start-4"
	>
		<Button variant="ghost"
			type="button"
			onclick={toggleSidebar}
			aria-label={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
			aria-expanded={isSidebarFull}
			class="flex h-10 w-10 items-center justify-center rounded-full! border border-black p-0! min-w-0 dark:border-white"
		>
			<iconify-icon
				icon="bi:arrow-left-circle-fill"
				width="34"
				class="rounded-full bg-surface-500 text-white transition-transform hover:cursor-pointer hover:bg-error-600 dark:bg-white dark:text-surface-600 dark:hover:bg-error-600 {isSidebarFull
					? 'rotate-0 rtl:rotate-180'
					: 'rotate-180 rtl:rotate-0'}"
			></iconify-icon>
			</Button>
		</SystemTooltip>

	<!-- Navigation: Collapsible Sections -->
	<div
		class="flex-1 pe-1 space-y-4 my-4 max-h-[calc(100vh-220px)] navigation-scroll-container {ui.routeContext.isSystemSettings
			? 'overflow-y-hidden flex flex-col'
			: 'overflow-y-auto'}"
	>
		{#if ui.routeContext.isSystemSettings}
			<SettingsMenu isFullSidebar={isSidebarFull} />
		{:else}
			<!-- 1. Pinned Items -->
			{#if pinnedStore.items.length > 0}
				<div class="space-y-1">
					<Button variant="ghost"
						type="button"
						onclick={() => isPinnedOpen = !isPinnedOpen}
						class="flex w-full items-center justify-between py-1.5 text-xs font-bold uppercase tracking-wider rounded {isSidebarFull ? 'px-1' : 'justify-center'}"
					 aria-label="Toggle pinned items">
						<span class="flex items-center gap-1.5">
							<iconify-icon icon="bi:pin-angle-fill" width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{#if isSidebarFull}Pinned{/if}
						</span>
						{#if isSidebarFull}
							<iconify-icon
								icon="bi:chevron-down"
								width="12"
								class="transform transition-transform duration-200 {isPinnedOpen ? '' : '-rotate-90'}"
							></iconify-icon>
						{/if}
					</Button>

					{#if isPinnedOpen}
						<div class="space-y-0.5" transition:scale={{ duration: 150, start: 0.95 }}>
							{#each pinnedStore.items as item (item.id)}
								<div class="group relative flex items-center justify-between rounded hover:bg-surface-100/50 dark:hover:bg-surface-500/20">
									<a
										href={item.path}
										data-sveltekit-preload-data="hover"
										class="flex flex-1 items-center gap-2 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 no-underline!"
										onclick={() => {
											if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
										}}
									>
										<iconify-icon icon={item.icon || 'bi:pin'} width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										{#if isSidebarFull}
											<span class="truncate">{item.name}</span>
										{/if}
									</a>
									{#if isSidebarFull}
										<Button variant="ghost"
											type="button"
											onclick={() => pinnedStore.unpin(item.id)}
											title="Unpin"
										aria-label="Unpin" class="-xs rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-800">
											<iconify-icon icon="bi:x" width="16" class="text-surface-500"></iconify-icon>
										</Button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="mx-1 border-0 border-t border-surface-200/50 dark:border-surface-700/50"></div>
			{/if}

			<!-- 2. Route-context navigation: collections tree OR media folders (never both) -->
			{#if isMediaGalleryRoute}
				<!-- Media gallery: back to collections + virtual folder tree -->
				<div class="space-y-2" data-testid="sidebar-media-context">
					<SystemTooltip
						title="Back to Collections"
						positioning={{ placement: 'right' }}
						triggerClass="w-full"
					>
						<Button
							variant="ghost"
							type="button"
							onclick={handleBackToCollections}
							aria-label="Back to Collections"
							class="flex w-full items-center gap-1.5 rounded py-2 text-xs font-bold uppercase tracking-wider text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-100 {isSidebarFull ? 'justify-start px-2' : 'justify-center'}"
						>
							<iconify-icon icon="bi:arrow-left" width="16" class="shrink-0 text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{#if isSidebarFull}
								<span class="truncate">Collections</span>
							{/if}
						</Button>
					</SystemTooltip>

					<div class="px-1 space-y-2" role="region" aria-label="Media folders">
						<MediaFolders />
					</div>
				</div>
			{:else if showCollectionsHere}
				<!-- Default: collection tree only — no redundant section header button -->
				<div class="w-full ps-0 pe-1 text-start" data-testid="sidebar-collections-context" role="region" aria-label="Collections">
					<Collections />
				</div>
			{/if}
		{/if}
	</div>

	<!-- Plugin Sidebar Items -->
	<div class="mt-2 w-full px-1"><Slot name="sidebar" /></div>
	<!-- Footer -->
	<div class="mb-2 mt-auto w-full px-1">
		<div class="mx-1 mb-2 border-0 border-t border-surface-500"></div>

		<div class="grid w-full items-center justify-center gap-1 text-surface-700 dark:text-surface-200 {isSidebarFull ? 'grid-cols-3' : 'grid-cols-2'}">
			<!-- Avatar -->
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex items-center justify-center">
				<SystemTooltip title={applayout_userprofile()} positioning={{ placement: 'right' }}>
					<a
						href="/user"
						data-sveltekit-preload-data="hover"
						data-testid="nav-user-profile"
						onclick={handleUserClick}
						aria-label="User Profile"
						class="{isSidebarFull
							? 'flex w-full flex-col items-center justify-center rounded p-2 hover:bg-surface-500/20'
							: 'h-8 w-8 rounded-full hover:bg-surface-500/20'} relative flex items-center justify-center text-center no-underline!"
						>
							<Avatar src={avatarUrl} alt="User Avatar" size={isSidebarFull ? 'size-12' : 'size-10'} rounded="rounded-full" class="mx-auto" />
						{#if isSidebarFull && user?.username}
							<div
								class="mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-xs font-semibold leading-tight"
								title={user.username}
							>
								{user.username}
							</div>
						{/if}
					</a>
				</SystemTooltip>
			</div>

 			<!-- Theme Toggle -->
 			<div class="{isSidebarFull ? 'order-2' : 'order-2'} flex items-center justify-center">
 				<SystemTooltip title={themeTooltipText} positioning={{ placement: 'right' }}>
 					<!-- Wrapper div needed because ThemeToggle might not forward all events/props or to serve as reliable trigger anchor -->
 					<div class="flex items-center justify-center">
						<ThemeToggle showTooltip={false} buttonClass="btn-icon hover:bg-surface-300/20" iconSize={28} />
 					</div>
 				</SystemTooltip>
 			</div>

 			<!-- Language Selector -->
 			<div class="{isSidebarFull ? 'order-3 row-span-2' : 'order-4'} flex items-center justify-center px-1">
  				<SystemTooltip title={applayout_systemlanguage()} positioning={{ placement: 'right' }} role={null} tabindex={null}>
 					<div class="language-selector relative">
 						<Dropdown position="right-start" class="w-56">
 							{#snippet trigger()}
 								<Button
 									variant="surface"
 									rounded
 									aria-label="Select language"
 									class="mb-3 flex items-center justify-center uppercase hover:bg-surface-400 {isSidebarFull ? 'h-12 w-12 text-xs font-semibold' : 'h-11 w-11 text-xs font-semibold'}"
 								>
 									{languageTag}
 								</Button>
 							{/snippet}

 							<!-- Header to inform user about System Language context -->
 							<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1">
 								{applayout_systemlanguage()}
 							</div>

 							{#if showLanguageDropdown}
 								<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50">
									<Input aria-label="Search"
										type="text"
										bind:value={searchQuery}
										placeholder="Search language..."
										inputClass="w-full rounded bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none"
									/>
 								</div>

 								<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
 									{#each filteredLanguages as lang (lang)}
										<Button
											variant="ghost"
											class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200"
											onclick={() => handleLanguageSelection(lang)}
										>
											<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
											<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
										</Button>
									{/each}
								</div>
							{:else}
								{#each availableLanguages.filter((l) => l !== languageTag) as lang (lang)}
									<Button
										variant="ghost"
										class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200"
										onclick={() => handleLanguageSelection(lang)}
									>
										<span class="text-sm font-medium">{getLanguageName(lang)}</span>
										<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
									</Button>
								{/each}
 							{/if}
 						</Dropdown>
 					</div>
 				</SystemTooltip>
 			</div>

			<!-- Sign Out -->
			<div class="{isSidebarFull ? 'order-4' : 'order-3'} flex items-center justify-center">
				<SystemTooltip title={applayout_signout()} positioning={{ placement: 'right' }}>
					<Button
						variant="ghost"
						onclick={signOut}
						type="button"
						aria-label="Sign Out"
						data-testid="sign-out-button"
						class="flex h-12 w-12 items-center justify-center rounded-full p-0! min-w-0"
					>
						<iconify-icon icon="uil:signout" width="32" class="" aria-hidden="true"></iconify-icon>
					</Button>
				</SystemTooltip>
			</div>

 			<!-- Config -->
 			<div class="{isSidebarFull ? 'order-5' : 'order-6'} flex items-center justify-center">
 				<SystemTooltip title={applayout_systemconfiguration()} positioning={{ placement: 'right' }}>
					<a
						href="/config"
						data-sveltekit-preload-data="hover"
						onclick={handleConfigClick}
						aria-label="System Configuration"
						class="flex items-center justify-center rounded-full hover:bg-surface-500/20"
					>
						<iconify-icon icon="material-symbols:build-circle" width="35" class=""></iconify-icon>
 					</a>
 				</SystemTooltip>
 			</div>

 			<!-- Version -->
 			<div class="{isSidebarFull ? 'order-7' : 'order-6'} flex items-center justify-center"><VersionCheck compact={true} /></div>

 			<!-- Community Links (only when expanded) -->
 			{#if isSidebarFull}
				<div class="order-8 flex items-center justify-center gap-1">
 					<SystemTooltip title="Discord Community" positioning={{ placement: 'right' }}>
 						<a
 							href="https://discord.gg/VrvZF6e2sC"
 							target="_blank"
 							rel="noopener noreferrer"
 							aria-label="Discord Community"
 							class="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-500/20"
 						>
 							<iconify-icon icon="ic:baseline-discord" width="32" class=""></iconify-icon>
 						</a>
 					</SystemTooltip>
 				</div>
 			{/if}
		</div>
	</div>
</div>

<style>
	/* Sidebar width follows admin theme token (applied on layout aside) */
	:global(aside[aria-label='Left sidebar navigation']) {
		transition: width var(--admin-motion-duration, 300ms) ease-in-out;
	}

	.sidebar-root {
		max-width: var(--admin-sidebar-width, 240px);
		position: relative;
	}

	.sidebar-root::after {
		content: '';
		position: absolute;
		inset-inline-end: -0.5rem; /* match aside px-2 so line sits on the edge */
		top: 3.5rem; /* pt-2 + min-h-12 brand row */
		bottom: 0;
		width: 1px;
		background-color: var(--color-surface-200, #e2e8f0);
		pointer-events: none;
	}

	:global(.dark) .sidebar-root::after {
		background-color: var(--color-surface-500, #64748b);
	}

	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-color: rgb(var(--color-surface-500)) transparent;
		scrollbar-width: thin;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-surface-500));
		border-radius: 3px;
	}
</style>

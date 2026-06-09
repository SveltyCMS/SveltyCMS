<!--
@file src/components/left-sidebar.svelte

@component
**LeftSidebar component displaying collection fields, publish options and translation status.**

@example
<LeftSidebar />

#### Props
- `mode` {object} - The current mode object from the mode store
- `collection` {object} - The current collection object from the collection store

#### Features
- Displays collection fields
- Displays publish options
- Displays translation status
- Optimized event handlers
-->

<script lang="ts">
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
	import type { ContentNode } from '@src/content/types'; // Import Schema type (collection definition)
	// Paraglide Messages
	import {
		applayout_signout,
		applayout_systemconfiguration,
		applayout_systemlanguage,
		applayout_userprofile,
		Collections_MediaGallery
	} from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { goto } from '$app/navigation';
	// Stores
	import { contentStructure, setMode } from '@src/stores/collection-store.svelte';
	import { ui, uiStateManager, toggleUIElement, userPreferredState } from '@src/stores/ui-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { avatarSrc, systemLanguage } from '@src/stores/store.svelte';
	import { themeStore } from '@src/stores/theme-store.svelte';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { getLanguageName } from '@utils/language-utils';
	import { logger } from '@utils/logger';
		import Avatar from '@components/ui/avatar.svelte';
	// Removed axios import
	import { browser } from '$app/environment';
	// Import necessary utilities and types
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
	// Removed isDropdownOpen and dropdownRef as Menu handles this

	// Collapsible Sidebar Sections State
	let isPinnedOpen = $state(true);
	let isCollectionsOpen = $state(true);
	let isMediaOpen = $state(false);

	$effect(() => {
		// Context-aware sidebar: sections are route-specific to match user intent.
		// - /mediagallery             → Media only
		// - default (collections)     → Collections only
		if (currentPath.includes('/mediagallery')) {
			isMediaOpen = true;
			isCollectionsOpen = false;
		} else {
			isCollectionsOpen = true;
			isMediaOpen = false;
		}
	});

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

	let languageTag = $state<Locale>('en' as Locale);

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
		let src = avatarSrc.value;
		if (!src || src === 'Default_User.svg' || src === '/Default_User.svg') {
			return '/Default_User.svg';
		}
		if (src.startsWith('data:')) {
			return src;
		}

		// Normalize path
		// 1. Remove leading slashes
		src = src.replace(/^\/+/, '');
		// 2. Remove prefixes
		src = src.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		// 3. Remove leading slashes again just in case
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
		systemLanguage.set(lang as Locale);
		languageTag = lang as Locale;
		searchQuery = '';
	}

	// Unused settings helper removed

	function toggleSidebar(): void {
		const current = uiStateManager.uiState.value.leftSidebar;
		const newState: SidebarState = current === 'full' ? 'collapsed' : 'full';
		toggleUIElement('leftSidebar', newState);
		userPreferredState.set(newState);
	}

	function handleUserClick(): void {
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		setMode('view');
	}

	function handleConfigClick(): void {
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		setMode('view');
	}

	async function signOut(): Promise<void> {
		try {
			await fetch('/api/user/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				}
			});
		} catch (error) {
			logger.error('Error during sign-out:', error instanceof Error ? error.message : 'Unknown error');
		} finally {
			// Always redirect to login, even if logout fails
			if (browser) {
				window.location.href = '/login';
			}
		}
	}

	function handleCollectionsClick(): void {
		isCollectionsOpen = !isCollectionsOpen;
		if (isCollectionsOpen) {
			isMediaOpen = false;
		}
		if (collections.length === 0) {
			goto('/config/collectionbuilder');
		} else {
			goto(firstCollectionPath);
		}
	}

	$effect(() => {
		if (firstCollectionPath === undefined) return;
	});
</script>

<div class="flex h-full w-full flex-col justify-between bg-transparent">
	<!-- Corporate Identity -->
	{#if isSidebarFull}
		<a href="/" aria-label="SveltyCMS Logo" class="flex pt-2 no-underline!" data-sveltekit-preload-data="hover">
			<SveltyCMSLogo fill="red" className="h-9 -ml-2" />
			<span class="base-font-color relative text-2xl font-bold -ms-2"><SiteName siteName={publicEnv.SITE_NAME} highlight="CMS" /></span>
		</a>
	{:else}
		<div class="flex justify-start gap-2">
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', 'hidden')}
				aria-label="Close Sidebar"
				class="preset-outline-surface-500 btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>

			<a href="/" aria-label="SveltyCMS Logo" class="flex justify-center pt-2 no-underline!">
				<SveltyCMSLogo fill="red" className="h-9 -ml-2 ltr:mr-2 rtl:ml-2 rtl:-mr-2" />
			</a>
		</div>
	{/if}

	<!-- Expand/Collapse Button -->
	<SystemTooltip title={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'} positioning={{ placement: 'right' }}>
		<button
			type="button"
			onclick={toggleSidebar}
			aria-label={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
			aria-expanded={isSidebarFull}
			class="absolute top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full! border border-black p-0 dark:border-black ltr:-inset-e-4 rtl:-inset-s-4"
		>
			<iconify-icon
				icon="bi:arrow-left-circle-fill"
				width="34"
				class="rounded-full bg-surface-500 text-white transition-transform hover:cursor-pointer hover:bg-error-600 dark:bg-white dark:text-surface-600 dark:hover:bg-error-600 {isSidebarFull
					? 'rotate-0 rtl:rotate-180'
					: 'rotate-180 rtl:rotate-0'}"
			></iconify-icon>
		</button>
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
					<button
						type="button"
						onclick={() => isPinnedOpen = !isPinnedOpen}
						class="flex w-full items-center justify-between py-1.5 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider hover:opacity-85 {isSidebarFull ? 'px-1' : 'justify-center'}"
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
					</button>

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
										<button
											type="button"
											onclick={() => pinnedStore.unpin(item.id)}
											class="btn-icon btn-icon-xs rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-800"
											title="Unpin"
										aria-label="Unpin">
											<iconify-icon icon="bi:x" width="16" class="text-surface-500"></iconify-icon>
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="mx-1 border-0 border-t border-surface-200/50 dark:border-surface-700/50"></div>
			{/if}

			<!-- 2. Collections -->
			<div class="space-y-1">
				<button
					type="button"
					onclick={handleCollectionsClick}
					class="flex w-full items-center justify-between py-1.5 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider hover:opacity-85 {isSidebarFull ? 'px-1' : 'justify-center'}"
				 aria-label="Toggle collections">
					<span class="flex items-center gap-1.5">
						<iconify-icon icon="bi:collection" width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{#if isSidebarFull}Collections{/if}
					</span>
					{#if isSidebarFull}
						<iconify-icon
							icon="bi:chevron-down"
							width="12"
							class="transform transition-transform duration-200 {isCollectionsOpen ? '' : '-rotate-90'}"
						></iconify-icon>
					{/if}
				</button>
				{#if isCollectionsOpen && showCollectionsHere}
					<div class="px-1">
						<Collections />
					</div>
				{/if}
			</div>
			<div class="mx-1 border-0 border-t border-surface-200/50 dark:border-surface-700/50"></div>

			<!-- 3. Media Gallery -->
			<div class="space-y-1">
				<button
					type="button"
					onclick={() => {
						goto('/mediagallery');
						if (isMobile()) {
							toggleUIElement('leftSidebar', 'hidden');
						}
					}}
					class="flex w-full items-center justify-between py-1.5 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider hover:opacity-85 {isSidebarFull ? 'px-1' : 'justify-center'}"
				>
					<span class="flex items-center gap-1.5">
						<iconify-icon icon="bi:images" width="16" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						{#if isSidebarFull}{Collections_MediaGallery()}{/if}
					</span>
					{#if isSidebarFull}
						<iconify-icon
							icon="bi:chevron-down"
							width="12"
							class="transform transition-transform duration-200 {isMediaOpen ? '' : '-rotate-90'}"
						></iconify-icon>
					{/if}
				</button>
				{#if isMediaOpen}
					<div class="px-1 space-y-2">
						{#if isSidebarFull && !currentPath.includes('/mediagallery')}
							<a
								href="/mediagallery"
								data-sveltekit-preload-data="hover"
								class="flex items-center gap-2 rounded px-3 py-2 text-xs font-semibold text-tertiary-500 dark:text-primary-500 bg-tertiary-500/10 hover:bg-tertiary-500/20 dark:bg-primary-500/10 hover:dark:bg-primary-500/20 no-underline! transition-colors"
								onclick={() => {
									if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
								}}
							>
								<iconify-icon icon="bi:images" width="14"></iconify-icon>
								Open Media Gallery
							</a>
						{/if}
						<MediaFolders />
					</div>
				{/if}
			</div>
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
						onclick={handleUserClick}
						aria-label="User Profile"
						class="{isSidebarFull
							? 'flex w-full flex-col items-center justify-center rounded-lg p-2 hover:bg-surface-500/20'
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
						<ThemeToggle showTooltip={false} buttonClass="btn-icon  rounded-full hover:bg-surface-300/20" iconSize={28} />
 					</div>
 				</SystemTooltip>
 			</div>

 			<!-- Language Selector -->
 			<div class="{isSidebarFull ? 'order-3 row-span-2' : 'order-4'} flex items-center justify-center px-1">
 				<SystemTooltip title={applayout_systemlanguage()} positioning={{ placement: 'right' }}>
 					<div class="language-selector relative">
 						<Dropdown position="right-start" class="w-56">
 							{#snippet trigger()}
 								<button
 									class="mb-3 preset-filled-surface-500 hover:bg-surface-400 rounded-full flex items-center justify-center uppercase transition-colors {isSidebarFull
 										? 'w-12 h-12 text-xs font-semibold'
 										: 'w-11 h-11 text-xs font-semibold'}"
 									aria-label="Select language"
 								>
 									{languageTag}
 								</button>
 							{/snippet}

 							<!-- Header to inform user about System Language context -->
 							<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1">
 								{applayout_systemlanguage()}
 							</div>

 							{#if showLanguageDropdown}
 								<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50">
 									<input
 										type="text"
 										bind:value={searchQuery}
 										placeholder="Search language..."
 										class="w-full rounded-md bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none"
 										aria-label="Search languages"
 										onclick={(e) => e.stopPropagation()}
 									/>
 								</div>

 								<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
 									{#each filteredLanguages as lang (lang)}
										<button
											class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200"
											onclick={() => handleLanguageSelection(lang)}
										>
											<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
											<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
										</button>
 									{/each}
 								</div>
							{:else}
								{#each availableLanguages.filter((l) => l !== languageTag) as lang (lang)}
									<button
										class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200"
										onclick={() => handleLanguageSelection(lang)}
									>
										<span class="text-sm font-medium">{getLanguageName(lang)}</span>
										<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
									</button>
								{/each}
 							{/if}
 						</Dropdown>
 					</div>
 				</SystemTooltip>
 			</div>

 			<!-- Sign Out -->
 			<div class="{isSidebarFull ? 'order-4' : 'order-3'} flex items-center justify-center">
 				<SystemTooltip title={applayout_signout()} positioning={{ placement: 'right' }}>
 					<button onclick={signOut} type="button" aria-label="Sign Out" class="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-500/20">
 						<iconify-icon icon="uil:signout" width="32" class=""></iconify-icon>
 					</button>
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
						class="btn-icon flex items-center justify-center rounded-full hover:bg-surface-500/20"
 					>
						<iconify-icon icon="material-symbols:build-circle" width="35" class=""></iconify-icon>
 					</a>
 				</SystemTooltip>
 			</div>

 			<!-- Version -->
 			<div class="{isSidebarFull ? 'order-6' : 'order-5'} flex items-center justify-center"><VersionCheck compact={true} /></div>

 			<!-- Community Links (only when expanded) -->
 			{#if isSidebarFull}
 				<div class="order-7 flex items-center justify-center gap-1">
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

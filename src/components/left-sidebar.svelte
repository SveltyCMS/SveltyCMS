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
	import Collections from '@src/components/collections.svelte';
	import MediaFolders from '@src/components/media-folders.svelte';
	import SettingsMenu from '@src/components/settings-menu.svelte';
	import SiteName from '@src/components/site-name.svelte';
	import SveltyCMSLogo from '@src/components/system/icons/svelty-cms-logo.svelte';
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import ThemeToggle from '@src/components/theme-toggle.svelte';
	import VersionCheck from '@src/components/version-check.svelte';
	import type { ContentNode } from '@src/content/types';
	import {
		applayout_signout,
		applayout_systemconfiguration,
		applayout_systemlanguage,
		applayout_userprofile,
		button_Collections,
		Collections_MediaGallery,
		collections_media
	} from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { contentStructure, setMode } from '@src/stores/collection-store.svelte';
	import { ui, uiStateManager, toggleUIElement, userPreferredState } from '@src/stores/ui-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { avatarSrc, systemLanguage } from '@src/stores/store.svelte';
	import { themeStore } from '@src/stores/theme-store.svelte';
	import { getLanguageName } from '@utils/language-utils';
	import { logger } from '@utils/logger';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	const MOBILE_BREAKPOINT = 768;
	const LANGUAGE_DROPDOWN_THRESHOLD = 5;
	const AVATAR_CACHE_BUSTER = Date.now();
	const languageMenuId = 'left-sidebar-language-menu';

	type AvailableLanguage = string;
	type SidebarState = 'full' | 'collapsed' | 'hidden';

	const user = $derived(page.data.user);
	const currentPath = $derived(page.url.pathname);
	const collections: ContentNode[] = $derived(contentStructure.value || []);
	const isMediaMode = $derived(currentPath.includes('/mediagallery'));
	const isSettingsMode = $derived(currentPath.includes('/config/systemsetting'));

	let languageTag = $state(getLocale() as AvailableLanguage);
	let searchQuery = $state('');
	let isLanguageMenuOpen = $state(false);
	let avatarLoadFailed = $state(false);

	const isSidebarFull = $derived(ui.state.leftSidebar === 'full');

	const firstCollectionPath = $derived.by(() => {
		if (collections?.[0]) {
			const node = collections[0] as any;
			const pathValue = node.path || `/collection/${node._id}`;
			return `/${getLocale()}${pathValue.startsWith('/') ? pathValue : `/${pathValue}`}`;
		}
		return '/collections';
	});

	const availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	const showLanguageDropdown = $derived(availableLanguages.length > LANGUAGE_DROPDOWN_THRESHOLD);

	const filteredLanguages = $derived(
		availableLanguages
			.filter((lang) => lang !== languageTag)
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

	function isMobile(): boolean {
		return browser && window.innerWidth < MOBILE_BREAKPOINT;
	}

	function handleLanguageSelection(lang: AvailableLanguage): void {
		systemLanguage.set(lang as Locale);
		languageTag = lang;
		searchQuery = '';
		isLanguageMenuOpen = false;
	}

	function toggleLanguageMenu(): void {
		isLanguageMenuOpen = !isLanguageMenuOpen;
	}

	function closeLanguageMenu(): void {
		isLanguageMenuOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closeLanguageMenu();
		}
	}

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

	function handleAvatarError(event: Event): void {
		const img = event.currentTarget as HTMLImageElement;
		avatarLoadFailed = true;
		img.src = '/Default_User.svg';
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
			if (browser) {
				window.location.href = '/login';
			}
		}
	}
</script>

<svelte:window onclick={closeLanguageMenu} onkeydown={handleWindowKeydown} />

<div class="flex h-full w-full flex-col justify-between bg-transparent">
	{#if isSidebarFull}
		<a href="/" aria-label="SveltyCMS Logo" class="flex pt-2 no-underline!" data-sveltekit-preload-data="hover">
			<SveltyCMSLogo fill="red" className="h-9 -ml-2" />
			<span class="base-font-color relative text-2xl font-bold"> <SiteName siteName={publicEnv.SITE_NAME} highlight="CMS" /> </span>
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

	<SystemTooltip title={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'} positioning={{ placement: 'right' }}>
		<button
			type="button"
			onclick={toggleSidebar}
			aria-label={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
			aria-expanded={isSidebarFull}
			class="absolute top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full! border border-black p-0 dark:border-black ltr:-right-4 rtl:-left-4"
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

	{#if isSettingsMode}
		<SettingsMenu isFullSidebar={isSidebarFull} />

		<a
			class="btn mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-surface-500 py-4 no-underline! transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			href={firstCollectionPath}
			data-sveltekit-preload-data="hover"
			onclick={() => {
				setMode('view');
				if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
			}}
			aria-label="Switch to Collections"
		>
			<iconify-icon icon="bi:arrow-left" width="18" class="text-error-500"></iconify-icon>
			{#if isSidebarFull}
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
				<span>{button_Collections()} </span>
			{:else}
				<iconify-icon icon="bi:collection" width="18" class="text-error-500"></iconify-icon>
			{/if}
		</a>
	{:else if isMediaMode}
		<MediaFolders />

		<a
			class="btn mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-surface-500 py-4 no-underline! transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			href={firstCollectionPath}
			data-sveltekit-preload-data="hover"
			onclick={() => {
				setMode('view');
				if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
			}}
			aria-label="Switch to Collections"
		>
			<iconify-icon icon="bi:arrow-left" width="18" class="text-error-500"></iconify-icon>
			{#if isSidebarFull}
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
				<span>{button_Collections()} </span>
			{:else}
				<iconify-icon icon="bi:collection" width="18" class="text-error-500"></iconify-icon>
			{/if}
		</a>
	{:else}
		<Collections />

		<a
			class="btn preset-outlined-surface-500 dark:preset-filled-surface-500 mt-2 flex h-14 w-full items-center justify-center gap-2 rounded no-underline!"
			href="/mediagallery"
			data-sveltekit-preload-data="hover"
			onclick={() => {
				setMode('media');
				if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
			}}
			aria-label="Switch to Media Gallery"
		>
			{#if isSidebarFull}
				<iconify-icon icon="bi:images" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<span>{Collections_MediaGallery()}</span>
				<iconify-icon icon="bi:arrow-right" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			{:else}
				<iconify-icon icon="bi:images" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<span class="text-sm">{collections_media()}</span>
			{/if}
		</a>
	{/if}

	<div class="mt-2 w-full px-1"><Slot name="sidebar" /></div>

	<div class="mb-2 mt-auto w-full px-1">
		<div class="mx-1 mb-2 border-0 border-t border-surface-500"></div>

		<div class="grid w-full items-center justify-center gap-2 {isSidebarFull ? 'grid-cols-3' : 'grid-cols-2'}">
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex items-center justify-center">
				<SystemTooltip title={applayout_userprofile()} positioning={{ placement: 'right' }}>
					<a
						href="/user"
						data-sveltekit-preload-data="hover"
						onclick={handleUserClick}
						aria-label="User Profile"
						class="{isSidebarFull
							? 'flex w-full flex-col items-center justify-center rounded-lg p-2 hover:bg-surface-500/20'
							: 'h-10 w-10 rounded-full hover:bg-surface-500/20'} relative flex items-center justify-center text-center no-underline!"
					>
						<div class="mx-auto overflow-hidden rounded-full bg-surface-300 dark:bg-surface-700 {isSidebarFull ? 'size-10' : 'size-9'}">
							{#if avatarLoadFailed}
								<div class="flex h-full w-full items-center justify-center text-xs font-semibold text-surface-900 dark:text-white">AV</div>
							{:else}
								<img src={avatarUrl} alt="User Avatar" class="h-full w-full object-cover" onerror={handleAvatarError} />
							{/if}
						</div>

						{#if isSidebarFull && user?.username}
							<div
								class="mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-medium leading-tight"
								title={user.username}
							>
								{user.username}
							</div>
						{/if}
					</a>
				</SystemTooltip>
			</div>

			<div class="{isSidebarFull ? 'order-2' : 'order-2'} flex items-center justify-center">
				<SystemTooltip title={themeTooltipText} positioning={{ placement: 'right' }}>
					<div class="flex items-center justify-center">
						<ThemeToggle showTooltip={false} buttonClass="btn-icon  rounded-full hover:bg-surface-300/20" iconSize={32} />
					</div>
				</SystemTooltip>
			</div>

			<div class="{isSidebarFull ? 'order-3 row-span-2' : 'order-4'} flex items-center justify-center px-1">
				<SystemTooltip title={applayout_systemlanguage()} positioning={{ placement: 'right' }}>
					<div class="language-selector relative">
						<button
							type="button"
							class="preset-filled-surface-500 hover:bg-surface-400 btn-icon flex items-center justify-center rounded-full uppercase transition-colors {isSidebarFull
								? 'mb-3 h-6.5 w-6.5 text-xs'
								: 'h-6 w-6 text-xs'}"
							aria-label="Select language"
							aria-haspopup="menu"
							aria-expanded={isLanguageMenuOpen}
							aria-controls={languageMenuId}
							onclick={(event) => {
								event.stopPropagation();
								toggleLanguageMenu();
							}}
						>
							{languageTag}
						</button>

						{#if isLanguageMenuOpen}
							<div
								id={languageMenuId}
								role="menu"
								class="card preset-filled-surface-100-900 absolute bottom-full left-full z-9999 mb-2 ml-2 w-56 border border-surface-200 p-2 shadow-xl dark:border-surface-500"
							>
								<div
									class="mb-1 border-b border-surface-200 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-tertiary-500 dark:border-surface-50 dark:text-primary-500"
								>
									{applayout_systemlanguage()}
								</div>

								{#if showLanguageDropdown}
									<div class="mb-1 border-b border-surface-200 px-2 pb-2 dark:border-surface-50">
										<input
											type="text"
											bind:value={searchQuery}
											placeholder="Search language..."
											class="w-full rounded-md border-none bg-surface-200 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-white"
											aria-label="Search languages"
											onclick={(event) => event.stopPropagation()}
										/>
									</div>

									<div class="max-h-64 divide-y divide-surface-200 overflow-y-auto dark:divide-surface-700">
										{#each filteredLanguages as lang (lang)}
											<button
												type="button"
												role="menuitem"
												onclick={() => handleLanguageSelection(lang)}
												class="flex w-full cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-left hover:bg-surface-200 dark:hover:bg-surface-700"
											>
												<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
												<span class="ml-2 text-xs font-normal text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
											</button>
										{/each}
									</div>
								{:else}
									{#each availableLanguages.filter((l) => l !== languageTag) as lang (lang)}
										<button
											type="button"
											role="menuitem"
											onclick={() => handleLanguageSelection(lang)}
											class="flex w-full cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-left hover:bg-surface-200 dark:hover:bg-surface-700"
										>
											<span class="text-sm font-medium">{getLanguageName(lang)}</span>
											<span class="ml-2 text-xs font-normal text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
										</button>
									{/each}
								{/if}
							</div>
						{/if}
					</div>
				</SystemTooltip>
			</div>

			<div class="{isSidebarFull ? 'order-4' : 'order-3'} flex items-center justify-center">
				<SystemTooltip title={applayout_signout()} positioning={{ placement: 'right' }}>
					<button onclick={signOut} type="button" aria-label="Sign Out" class="btn-icon hover:bg-surface-500/20">
						<iconify-icon icon="uil:signout" width="26"></iconify-icon>
					</button>
				</SystemTooltip>
			</div>

			<div class="{isSidebarFull ? 'order-5' : 'order-6'} flex items-center justify-center">
				<SystemTooltip title={applayout_systemconfiguration()} positioning={{ placement: 'right' }}>
					<a
						href="/config"
						data-sveltekit-preload-data="hover"
						onclick={handleConfigClick}
						aria-label="System Configuration"
						class="btn-icon flex items-center justify-center rounded-full hover:bg-surface-500/20"
					>
						<iconify-icon icon="material-symbols:build-circle" width="38"></iconify-icon>
					</a>
				</SystemTooltip>
			</div>

			<div class="{isSidebarFull ? 'order-6' : 'order-5'} flex items-center justify-center"><VersionCheck compact={!isSidebarFull} /></div>

			{#if isSidebarFull}
				<div class="order-7 flex items-center justify-center gap-1">
					<SystemTooltip title="Discord Community" positioning={{ placement: 'right' }}>
						<a
							href="https://discord.gg/VrvZF6e2sC"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Discord Community"
							class="btn-icon flex items-center justify-center hover:bg-surface-500/20"
						>
							<iconify-icon icon="ic:baseline-discord" width="30"></iconify-icon>
						</a>
					</SystemTooltip>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
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
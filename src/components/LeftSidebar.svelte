<!--
@file src/components/LeftSidebar.svelte
@component LeftSidebar – Main navigation sidebar with collections, media folders, user controls

@features
- Responsive full/collapsed/hidden states
- Collections vs Media Gallery toggle
- Language selector (dropdown or select)
- User avatar/profile, theme toggle, sign out, config
- Version check & GitHub link
- Mobile-friendly (auto-hide on navigation)
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import axios from 'axios';
	import { browser } from '$app/environment';
	import { logger } from '@utils/logger';

	import { page } from '$app/state';
	import { getLanguageName } from '@utils/languageUtils';
	import { locales as availableLocales } from '@src/paraglide/runtime';

	// Stores
	import { setMode } from '@stores/collectionStore.svelte';
	import { app } from '@stores/store.svelte';
	import { ui } from '@stores/UIStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Import components
	import VersionCheck from '@components/VersionCheck.svelte';
	import Collections from '@components/Collections.svelte';
	import MediaFolders from '@components/MediaFolders.svelte';
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';

	// Skeleton components
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	// Paraglide components
	import * as m from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';

	// Constants
	const MOBILE_BREAKPOINT = 768;
	const AVATAR_CACHE_BUSTER = Date.now();

	// Derived from page & stores
	let user = $derived(page.data.user);

	let collections = $derived(page.data.collections as any[]);
	let currentPath = $derived(page.url.pathname);
	let isMediaMode = $derived(currentPath.includes('/mediagallery'));

	let isSidebarFull = $derived(ui.state.leftSidebar === 'full');
	let isSidebarCollapsed = $derived(ui.state.leftSidebar === 'collapsed');

	let firstCollectionPath = $derived(collections?.[0] ? `/Collections/${collections[0].name}` : '/Collections');

	// Language handling
	let availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	let languageTag = $state(getLocale());
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	let filteredLanguages = $derived(
		availableLanguages.filter(
			(lang) =>
				getLanguageName(lang, app.systemLanguage).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Avatar
	let avatarUrl = $derived.by(() => {
		const src = app.avatarSrc;
		if (!src) return '/Default_User.svg';
		if (src.startsWith('data:')) return src;
		return `${src}?t=${AVATAR_CACHE_BUSTER}`;
	});

	// Tooltips
	let tooltips: Record<string, PopupSettings> = {
		user: { event: 'hover', target: 'User', placement: 'right' },
		github: { event: 'hover', target: 'Github', placement: 'right' },
		signOut: { event: 'hover', target: 'SignOutButton', placement: 'right' },
		config: { event: 'hover', target: 'Config', placement: 'right' },
		systemLanguage: { event: 'hover', target: 'SystemLanguage', placement: 'right' }
	};

	// Helpers
	function isMobile(): boolean {
		return browser && window.innerWidth < MOBILE_BREAKPOINT;
	}

	async function navigateTo(path: string): Promise<void> {
		if (currentPath === path) return;

		if (isMobile()) ui.toggle('leftSidebar', 'hidden');
		setMode('view');

		// Start loading state for navigation
		globalLoadingStore.startLoading(loadingOperations.navigation, `LeftSidebar.navigateTo(${path})`);

		try {
			// Special handling: mediagallery doesn't use language prefix
			if (path === '/mediagallery' || path.startsWith('/mediagallery')) {
				await goto(path);
				return;
			}

			const locale = getLocale();
			const fullPath = path.startsWith(`/${locale}`) ? path : `/${locale}${path}`;
			await goto(fullPath);
		} finally {
			setTimeout(() => globalLoadingStore.stopLoading(loadingOperations.navigation), 100);
		}
	}

	// Click outside to close dropdown
	$effect(() => {
		if (!browser) return;
		const handler = (e: MouseEvent) => {
			if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
				isDropdownOpen = false;
				searchQuery = '';
			}
		};
		document.addEventListener('click', handler);
		return () => document.removeEventListener('click', handler);
	});

	// Actions
	function selectLanguage(lang: string): void {
		app.systemLanguage = lang as any;
		languageTag = lang as any;
		isDropdownOpen = false;
		searchQuery = '';
	}

	function toggleDropdown(e: MouseEvent): void {
		e.stopPropagation();
		isDropdownOpen = !isDropdownOpen;
	}

	function toggleSidebar(): void {
		const next = isSidebarFull ? 'collapsed' : 'full';
		ui.toggle('leftSidebar', next);
	}

	async function goToUser(): Promise<void> {
		await navigateTo('/user');
	}

	async function goToConfig(): Promise<void> {
		await navigateTo('/config');
	}

	async function signOut(): Promise<void> {
		try {
			await axios.post('/api/user/logout', {}, { withCredentials: true });
		} catch (err) {
			logger.error('Logout error:', err);
		} finally {
			// Always redirect to login, even if logout fails
			if (browser) window.location.href = '/login';
		}
	}

	// Key handling
	function handleKey(e: KeyboardEvent, cb: () => void | Promise<void>): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			cb();
		}
	}
</script>

<div class="flex h-full w-full flex-col justify-between">
	<!-- Corporate Identity -->
	{#if isSidebarFull}
		<a href="/" aria-label="SveltyCMS Logo" class="flex pt-2 !no-underline" data-sveltekit-preload-data="hover">
			<SveltyCMSLogo fill="red" className="h-9 -ml-2" />
			<span class="text-token relative text-2xl font-bold">
				<SiteName highlight="CMS" />
			</span>
		</a>
	{:else}
		<div class="flex items-center justify-between pt-2">
			<button type="button" onclick={() => ui.toggle('leftSidebar', 'hidden')} aria-label="Close sidebar" class="btn-icon variant-ghost-surface">
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
			<a href="/" class="flex !no-underline">
				<SveltyCMSLogo fill="red" className="h-9" />
			</a>
		</div>
	{/if}

	<!-- Collapse/Expand Toggle -->
	<button
		type="button"
		onclick={toggleSidebar}
		aria-label={isSidebarFull ? 'Collapse' : 'Expand'}
		class="absolute -right-4 top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-black dark:border-black"
	>
		<iconify-icon
			icon="bi:arrow-left-circle-fill"
			width="34"
			class="rounded-full bg-surface-500 text-white transition-transform dark:bg-white dark:text-surface-600 {isSidebarFull
				? 'rtl:rotate-180'
				: 'rotate-180 rtl:rotate-0'}"
		></iconify-icon>
	</button>

	<!-- Main Content: Collections or MediaFolders -->
	{#if isMediaMode}
		<MediaFolders />
		<!-- Toggle to Collections button -->
		<button
			class="btn mt-2 flex w-full items-center justify-center gap-2 border border-surface-500 py-4 hover:bg-surface-200 dark:hover:bg-surface-400"
			onclick={() => {
				setMode('view');
				navigateTo(firstCollectionPath);
			}}
		>
			<iconify-icon icon="bi:arrow-left" width="18" class="text-error-500"></iconify-icon>
			{#if isSidebarFull}
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
				{m.button_Collections()}
			{:else}
				<iconify-icon icon="bi:collection" width="18" class="text-error-500"></iconify-icon>
			{/if}
		</button>
	{:else}
		<Collections />
		<!-- Toggle to Media Gallery Button -->
		<button
			class="btn mt-2 flex w-full items-center justify-center gap-2 border border-surface-500 py-4 hover:bg-surface-200 dark:hover:bg-surface-400"
			onclick={() => {
				setMode('media');
				navigateTo('/mediagallery');
			}}
			aria-label="Switch to Media Gallery"
		>
			{#if isSidebarFull}
				<iconify-icon icon="bi:images" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				{m.Collections_MediaGallery()}
				<iconify-icon icon="bi:arrow-right" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			{:else}
				<iconify-icon icon="bi:images" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<span class="text-sm">{m.collections_media()}</span>
			{/if}
		</button>
	{/if}

	<!-- Footer Controls -->
	<div class="mb-2 mt-auto">
		<hr class="mx-1 border-t border-surface-400" />

		<div class="grid {isSidebarFull ? 'grid-cols-3 grid-rows-3' : 'grid-cols-2 grid-rows-2'} items-center justify-center">
			<!-- Avatar / User -->
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex justify-center">
				<button
					use:popup={tooltips.user}
					onclick={goToUser}
					onkeypress={(e) => handleKey(e, goToUser)}
					aria-label="User profile"
					class="flex flex-col items-center rounded-lg p-2 hover:bg-surface-500 hover:text-white {isSidebarFull ? 'w-full' : 'btn-icon'}"
				>
					<img
						src={avatarUrl}
						alt="User avatar"
						onerror={(e) => (e.currentTarget.src = '/Default_User.svg')}
						class="rounded-full {isSidebarFull ? 'w-9 h-9' : 'w-8 h-8'} mx-auto object-cover"
					/>
					{#if isSidebarFull && user?.username}
						<span class="mt-1 w-full truncate text-center text-xs font-medium" title={user.username}>
							{user.username}
						</span>
					{/if}
				</button>
				<div class="card variant-filled p-2" data-popup="User">{m.applayout_userprofile()}</div>
			</div>

			<!-- Language Selector Dropdown -->
			<div
				class="{isSidebarFull ? 'order-3 row-span-2 pb-4' : 'order-2'} mx-auto relative"
				use:popup={tooltips.systemLanguage}
				bind:this={dropdownRef}
			>
				<button
					class="variant-filled-surface btn-icon uppercase {isSidebarFull ? 'w-full p-1 rounded-full justify-between' : 'h-9 w-9 rounded-full'}"
					onclick={toggleDropdown}
					aria-label="Select language"
					data-testid="language-selector"
					aria-expanded={isDropdownOpen}
				>
					<span class="text-xs font-bold leading-none">{languageTag}</span>
					{#if isSidebarFull}
						<svg
							class="h-3 w-3 transition-transform {isDropdownOpen ? 'rotate-180' : ''}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					{/if}
				</button>

				{#if isDropdownOpen}
					<div
						class="absolute bottom-full left-1/2 z-[999] mb-2 -translate-x-1/2 rounded border border-surface-500 bg-surface-700 shadow-xl overflow-hidden"
						style="width: {isSidebarFull ? '100%' : '12rem'}; min-width: 8rem;"
					>
						{#if availableLanguages.length > 5}
							<div class="border-b border-surface-600 p-2">
								<input
									type="text"
									bind:value={searchQuery}
									placeholder="Search..."
									class="w-full rounded bg-surface-800 px-2 py-1 text-xs text-white placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-tertiary-500"
									onclick={(e) => e.stopPropagation()}
									aria-label="Search languages"
								/>
							</div>
						{/if}
						<div class="max-h-48 overflow-y-auto py-1">
							{#each filteredLanguages as lang (lang)}
								<button
									onclick={(e) => {
										e.stopPropagation();
										selectLanguage(lang);
									}}
									class="w-full px-3 py-2 text-left text-sm text-white hover:bg-surface-600 {languageTag === lang ? 'bg-surface-600 font-bold' : ''}"
								>
									{getLanguageName(lang)}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				<div class="card variant-filled p-2" data-popup="SystemLanguage" class:hidden={isDropdownOpen}>{m.applayout_systemlanguage()}</div>
			</div>

			<!-- Theme -->
			<div class={isSidebarFull ? 'order-2' : 'order-3'}>
				<ThemeToggle showTooltip={true} tooltipPlacement="right" buttonClass="btn-icon hover:bg-surface-500" iconSize={22} />
			</div>

			<!-- Sign Out -->
			<div class="order-4">
				<button use:popup={tooltips.signOut} onclick={signOut} aria-label="Sign out" class="btn-icon hover:bg-surface-500">
					<iconify-icon icon="uil:signout" width="26"></iconify-icon>
				</button>
				<div class="card variant-filled p-2" data-popup="SignOutButton">{m.applayout_signout()}</div>
			</div>

			<!-- Config -->
			<div class={isSidebarFull ? 'order-5' : 'order-6'}>
				<button
					use:popup={tooltips.config}
					onclick={goToConfig}
					onkeypress={(e) => handleKey(e, goToConfig)}
					aria-label="Configuration"
					class="btn-icon hover:bg-surface-500"
				>
					<iconify-icon icon="material-symbols:build-circle" width="34"></iconify-icon>
				</button>
				<div class="card variant-filled p-2" data-popup="Config">{m.applayout_systemconfiguration()}</div>
			</div>

			<!-- Version -->
			<div class={isSidebarFull ? 'order-6' : 'order-5'}>
				<VersionCheck compact={isSidebarCollapsed} />
			</div>

			<!-- GitHub (full only) -->
			{#if isSidebarFull}
				<div class="order-7">
					<a href="https://github.com/SveltyCMS/SveltyCMS/discussions" target="_blank" rel="noopener">
						<button use:popup={tooltips.github} aria-label="GitHub" class="btn-icon hover:bg-surface-500">
							<iconify-icon icon="grommet-icons:github" width="30"></iconify-icon>
						</button>
						<div class="card variant-filled p-2" data-popup="Github">{m.applayout_githubdiscussion()}</div>
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>

<style lang="postcss">
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-500)) transparent;
	}
	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}
	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-surface-500));
		border-radius: 3px;
	}
</style>

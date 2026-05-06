<!--
@file src/routes/setup/SetupHeader.svelte
@component Enhanced Header component for the setup wizard.
Middle-ground height (h-[38px]), fixed dropdown borders, and right-aligned mobile menu.
-->
<script lang="ts">
	import SiteName from '@src/components/site-name.svelte';
	import AccessibilityHelp from '@src/components/system/accessibility-help.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import ThemeToggle from '@src/components/theme-toggle.svelte';
	import VersionCheck from '@src/components/version-check.svelte';
	import { applayout_systemlanguage, setup_heading_subtitle, setup_search_placeholder } from '@src/paraglide/messages';
	import { getLanguageName } from '@utils/language-utils';
	import { modalState } from '@utils/modal.svelte';

	let { siteName, systemLanguages, currentLanguageTag, onselectLanguage = () => {} } = $props();

	let langSearch = $state('');
	let isLanguageMenuOpen = $state(false);
	let searchInput: HTMLInputElement | null = $state(null);

	const languageMenuId = 'setup-header-language-menu';

	const filteredLanguages = $derived(
		systemLanguages
			.filter((lang: string) => lang !== currentLanguageTag)
			.filter((lang: string) => {
				const searchLower = langSearch.toLowerCase();
				return getLanguageName(lang).toLowerCase().includes(searchLower) || lang.toLowerCase().includes(searchLower);
			})
	);

	function selectLanguage(lang: string) {
		onselectLanguage(lang);
		langSearch = '';
		isLanguageMenuOpen = false;
	}

	function toggleLanguageMenu(event: MouseEvent) {
		event.stopPropagation();
		isLanguageMenuOpen = !isLanguageMenuOpen;

		if (!isLanguageMenuOpen) {
			langSearch = '';
		}
	}

	function closeLanguageMenu() {
		isLanguageMenuOpen = false;
		langSearch = '';
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeLanguageMenu();
		}
	}

	$effect(() => {
		if (isLanguageMenuOpen) {
			setTimeout(() => searchInput?.focus(), 0);
		}
	});
</script>

<svelte:window onclick={closeLanguageMenu} onkeydown={handleWindowKeydown} />

<div
	class="mb-4 shrink-0 rounded-xl border border-surface-200 bg-white p-3 shadow-xl dark:border-surface-700 dark:bg-surface-800 dark:text-surface-50 sm:p-6 lg:mb-6"
>
	<div class="flex items-center justify-between gap-2 sm:gap-4">
		<div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
			<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer" class="shrink-0">
				<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-9 w-auto sm:h-12" />
			</a>

			<div class="flex min-w-0 flex-col justify-center overflow-hidden">
				<h1 class="truncate text-lg font-bold leading-none sm:text-2xl lg:text-3xl">
					<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer">
						<SiteName {siteName} highlight="CMS" />
					</a>
				</h1>
				<div class="mt-0.5 flex"><VersionCheck compact={true} /></div>
			</div>
		</div>

		<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
			<div class="language-selector relative dark:text-white">
				<SystemTooltip title={applayout_systemlanguage?.() || 'Change system language'}>
					<div class="inline-block">
						<button
							type="button"
							class="preset-outlined-surface-500 btn h-9.5 rounded-lg px-2 py-0 sm:h-10 sm:px-3"
							aria-label="Select language"
							aria-haspopup="menu"
							aria-expanded={isLanguageMenuOpen}
							aria-controls={languageMenuId}
							onclick={toggleLanguageMenu}
						>
							<span class="text-[10px] font-bold sm:text-sm">
								<span class="hidden xs:inline">{getLanguageName(currentLanguageTag)}</span>
								<span class="xs:hidden">{currentLanguageTag.toUpperCase()}</span>
							</span>
							<iconify-icon
								icon="mdi:chevron-down"
								class="ml-1 h-4 w-4 transition-transform {isLanguageMenuOpen ? 'rotate-180' : ''}"
							></iconify-icon>
						</button>
					</div>
				</SystemTooltip>

				{#if isLanguageMenuOpen}
					<div
						id={languageMenuId}
						role="menu"
						tabindex="-1"
						class="absolute right-0 z-50 mt-3 w-[75vw] max-w-64 overflow-hidden rounded-xl border border-primary-500 bg-surface-50 p-0 shadow-2xl dark:bg-surface-800"
						onclick={(event) => event.stopPropagation()}
						onkeydown={(event) => event.stopPropagation()}
					>
						<div
							class="border-b border-surface-200 bg-surface-100/90 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-primary-500 dark:border-surface-600 dark:bg-surface-900/90"
						>
							{applayout_systemlanguage()}
						</div>

						{#if systemLanguages.length > 5}
							<div class="mb-2 border-b border-surface-200 px-2 pb-2 dark:text-surface-50">
								<div class="relative">
									<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"></iconify-icon>
									<input
										type="text"
										bind:this={searchInput}
										bind:value={langSearch}
										placeholder={setup_search_placeholder()}
										class="w-full rounded-md border border-surface-200 bg-surface-50 py-1.5 pl-9 pr-3 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-surface-800 dark:text-surface-50"
										aria-label={setup_search_placeholder?.() || 'Search languages'}
									/>
								</div>
							</div>
						{/if}

						<div class="custom-scrollbar max-h-64 overflow-y-auto">
							{#if filteredLanguages.length > 0}
								{#each filteredLanguages as lang (lang)}
									<button
										type="button"
										role="menuitem"
										onclick={() => selectLanguage(lang)}
										class="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-200/60 dark:hover:bg-surface-700/60"
									>
										<span class="text-sm font-medium">{getLanguageName(lang)}</span>
										<span class="text-xs font-bold text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
									</button>
								{/each}
							{:else}
								<div class="px-3 py-4 text-center text-sm text-surface-500">No languages found</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<SystemTooltip title="Accessibility Help">
				<button
					type="button"
					class="btn preset-outlined-surface-500 h-9.5 w-9.5 rounded-lg text-black dark:text-white sm:h-10 sm:w-10"
					onclick={() => modalState.trigger(AccessibilityHelp)}
					aria-label="Accessibility Help & Shortcuts"
				>
					<iconify-icon icon="mdi:accessibility" width="20"></iconify-icon>
				</button>
			</SystemTooltip>

			<ThemeToggle
				showTooltip={true}
				tooltipPlacement="bottom"
				iconSize={20}
				buttonClass="btn preset-outlined-surface-500 h-[38px] w-[38px] rounded-lg text-black dark:text-white sm:h-10 sm:w-10"
			/>
		</div>
	</div>

	<div class="mt-4 border-t border-surface-100 pt-3 dark:border-surface-50">
		<p class="text-center text-xs leading-snug dark:text-white sm:text-base">{setup_heading_subtitle({ siteName: siteName || 'SveltyCMS' })}</p>
	</div>
</div>
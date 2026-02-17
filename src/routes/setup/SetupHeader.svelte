<!--
@file src/routes/setup/SetupHeader.svelte
@description Enhanced Header component for the setup wizard.
Middle-ground height (h-[38px]), fixed dropdown borders, and right-aligned mobile menu.
-->
<script lang="ts">
	import SiteName from '@components/SiteName.svelte';
	import AccessibilityHelp from '@components/system/AccessibilityHelp.svelte';
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';
	import VersionCheck from '@components/VersionCheck.svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import * as m from '@src/paraglide/messages';
	import { getLanguageName } from '@utils/languageUtils';
	import { modalState } from '@utils/modalState.svelte';

	let { siteName, systemLanguages, currentLanguageTag, onselectLanguage = () => {} } = $props();

	let langSearch = $state('');

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
		langSearch = ''; // Reset search on selection
	}
</script>

<div
	class="mb-4 shrink-0 rounded-xl border border-surface-200 bg-white p-3 shadow-xl dark:border-surface-700 dark:bg-surface-800 dark:text-surface-50 sm:p-6 lg:mb-6"
>
	<!-- Row 1: Branding and Controls -->
	<div class="flex items-center justify-between gap-2 sm:gap-4">
		<!-- Left: Logo + (SiteName & Version) -->
		<div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
			<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer" class="shrink-0">
				<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-9 w-auto sm:h-12">
			</a>
			<div class="flex min-w-0 flex-col justify-center overflow-hidden">
				<h1 class="truncate text-lg font-bold leading-none sm:text-2xl lg:text-3xl">
					<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-primary-500">
						<SiteName {siteName} highlight="CMS" />
					</a>
				</h1>
				<div class="mt-0.5 flex"><VersionCheck compact={true} /></div>
			</div>
		</div>

		<!-- Right: Action Buttons Group (Height 9.5 -> h-[38px]) -->
		<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
			<!-- Language Selector -->
			<div class="language-selector relative dark:text-white">
				<Menu positioning={{ placement: 'bottom-end', gutter: 12 }}>
					<SystemTooltip title={m.applayout_systemlanguage?.() || 'Change system language'}>
						<div class="inline-block">
							<!-- Height 9.5 Equivalent (38px) -->
							<Menu.Trigger class="preset-outlined-surface-500 btn h-9.5 rounded-lg px-2 py-0 sm:h-10 sm:px-3">
								<span class="text-[10px] font-bold sm:text-sm">
									<span class="hidden xs:inline">{getLanguageName(currentLanguageTag)}</span>
									<span class="xs:hidden">{currentLanguageTag.toUpperCase()}</span>
								</span>
								<iconify-icon icon="mdi:chevron-down" class="ml-1 h-4 w-4 transition-transform group-data-[state=open]:rotate-180"></iconify-icon>
							</Menu.Trigger>
						</div>
					</SystemTooltip>

					<Portal>
						<Menu.Positioner>
							<!-- Dropdown: Single green border, no padding gap, right-aligned -->
							<Menu.Content
								class="z-50 w-[75vw] max-w-64 overflow-hidden rounded-xl border border-primary-500 bg-surface-50 p-0 shadow-2xl dark:bg-surface-800"
							>
								<!-- Header: Flush with the border -->
								<div
									class="border-b border-surface-200 dark:border-surface-600 bg-surface-100/90 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-primary-500 dark:bg-surface-900/90"
								>
									{m.applayout_systemlanguage()}
								</div>

								<!-- Search Input (Only if > 5 languages) -->
								{#if systemLanguages.length > 5}
									<div class="px-2 pb-2 mb-2 border-b border-surface-200 dark:text-surface-50">
										<div class="relative">
											<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"></iconify-icon>
											<input
												type="text"
												bind:value={langSearch}
												placeholder={m.setup_search_placeholder()}
												class="w-full rounded-md bg-surface-50 dark:bg-surface-800 pl-9 pr-3 py-1.5 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 border border-surface-200 dark:text-surface-50"
												aria-label={m.setup_search_placeholder?.() || 'Search languages'}
												onclick={(e) => e.stopPropagation()}
											>
										</div>
									</div>
								{/if}

								<!-- List -->
								<div class="custom-scrollbar max-h-64 overflow-y-auto">
									{#if filteredLanguages.length > 0}
										{#each filteredLanguages as lang (lang)}
											<Menu.Item
												value={lang}
												onclick={() => selectLanguage(lang)}
												class="flex w-full items-center justify-between px-3 py-2 text-left rounded-md cursor-pointer hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-colors"
											>
												<span class="text-sm font-medium">{getLanguageName(lang)}</span>
												<span class="text-xs font-bold text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
											</Menu.Item>
										{/each}
									{:else}
										<div class="px-3 py-4 text-center text-sm text-surface-500">No languages found</div>
									{/if}
								</div>
							</Menu.Content>
						</Menu.Positioner>
					</Portal>
				</Menu>
			</div>

			<!-- Accessibility Button (h-[38px]) -->
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

			<!-- Theme Toggle (h-[38px]) -->
			<ThemeToggle
				showTooltip={true}
				tooltipPlacement="bottom"
				iconSize={20}
				buttonClass="btn preset-outlined-surface-500 h-[38px] w-[38px] rounded-lg text-black dark:text-white sm:h-10 sm:w-10"
			/>
		</div>
	</div>

	<!-- Row 2: Description (Subtitle) -->
	<div class="mt-4 border-t border-surface-100 pt-3 dark:border-surface-700">
		<p class="text-center text-xs leading-snug dark:text-white sm:text-base">{m.setup_heading_subtitle({ siteName: siteName || 'SveltyCMS' })}</p>
	</div>
</div>

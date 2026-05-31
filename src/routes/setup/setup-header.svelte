<!--
@file src/routes/setup/SetupHeader.svelte
@component Enhanced Header component for the setup wizard.
Middle-ground height (h-[38px]), fixed dropdown borders, and right-aligned mobile menu.
-->
<script lang="ts">
	// Native UI
	import Dropdown from "@components/ui/dropdown.svelte";

	// Components
	import SiteName from '@src/components/site-name.svelte';
	import AccessibilityHelp from '@src/components/system/accessibility-help.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import ThemeToggle from '@src/components/theme-toggle.svelte';
	import VersionCheck from '@src/components/version-check.svelte';
	// Paraglide Messages
	import { applayout_systemlanguage, setup_heading_subtitle } from '@src/paraglide/messages';
	import { getLanguageName } from '@utils/language-utils';
	// Utils
	import { modalState } from '@utils/modal.svelte';

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
	class="shrink-0 bg-white p-2 dark:bg-surface-800 dark:text-surface-50"
>
	<!-- Row 1: Branding and Controls (Grid on desktop, flex on mobile) -->
	<div class="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-center lg:gap-4">
		<!-- Branding: Left on desktop, between on mobile -->
		<div class="flex items-center justify-between lg:justify-start">
			<div class="flex items-center gap-2 sm:gap-4">
				<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer" class="shrink-0">
					<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-9 w-auto sm:h-12" />
				</a>
				<div class="flex min-w-0 flex-col justify-center overflow-hidden">
					<h1 class="truncate text-lg font-bold leading-none sm:text-2xl lg:text-3xl">
						<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer">
							<SiteName {siteName} highlight="CMS" />
						</a>
					</h1>
					<div class="mt-0.5 flex lg:hidden"><VersionCheck compact={true} /></div>
				</div>
			</div>

			<!-- Mobile Controls (Visible only on mobile inside this flex row) -->
			<div class="flex items-center gap-1.5 sm:gap-2 lg:hidden">
				<div class="language-selector relative dark:text-white">
					<SystemTooltip title={applayout_systemlanguage?.() || 'Change system language'}>
						<Dropdown position="bottom-end" closeOnSelect={false} class="p-0! w-[75vw] max-w-64">
							{#snippet trigger()}
								<span class="inline-flex items-center gap-1 preset-outlined-surface-500 btn h-9.5 rounded-lg px-2 py-0 sm:h-10 sm:px-3">
									<span class="text-[10px] font-bold sm:text-sm">
										<span class="hidden xs:inline">{getLanguageName(currentLanguageTag)}</span>
										<span class="xs:hidden">{currentLanguageTag.toUpperCase()}</span>
									</span>
									<iconify-icon icon="mdi:chevron-down" class="ml-1 h-4 w-4 transition-transform"></iconify-icon>
								</span>
							{/snippet}
							<div class="border-b border-surface-200 dark:border-surface-600 bg-surface-100/90 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-primary-500 dark:bg-surface-900/90 -mx-2">
								{applayout_systemlanguage()}
							</div>
							<div class="custom-scrollbar max-h-64 overflow-y-auto">
								{#each filteredLanguages as lang (lang)}
									<button
										type="button"
										onclick={() => selectLanguage(lang)}
										class="flex w-full items-center justify-between px-3 py-2 text-left rounded-md cursor-pointer hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-colors"
									>
										<span class="text-sm font-medium">{getLanguageName(lang)}</span>
										<span class="text-xs font-bold text-primary-500">{lang.toUpperCase()}</span>
									</button>
								{/each}
							</div>
						</Dropdown>
					</SystemTooltip>
				</div>
				<ThemeToggle showTooltip={true} tooltipPlacement="bottom" iconSize={20} buttonClass="btn preset-outlined-surface-500 h-9.5 w-9.5 rounded-lg text-black dark:text-white" />
			</div>
		</div>

		<!-- Center: Subtitle (Desktop only) -->
		<div class="hidden lg:flex justify-center">
			<p class="text-center text-sm leading-snug dark:text-white xl:text-base font-medium opacity-80">
				{setup_heading_subtitle({ siteName: siteName || 'SveltyCMS' })}
			</p>
		</div>

		<!-- Right: Action Buttons Group (Desktop only) -->
		<div class="hidden items-center justify-end gap-1.5 sm:gap-2 lg:flex">
			<!-- Desktop Controls (Copied from above for clean grid layout) -->
			<div class="language-selector relative dark:text-white">
				<SystemTooltip title={applayout_systemlanguage?.() || 'Change system language'}>
					<Dropdown position="bottom-end" closeOnSelect={false} class="p-0! w-64">
						{#snippet trigger()}
							<span class="inline-flex items-center gap-1 preset-outlined-surface-500 btn h-10 rounded-lg px-3">
								<span class="text-sm font-bold">{getLanguageName(currentLanguageTag)}</span>
								<iconify-icon icon="mdi:chevron-down" class="ml-1 h-4 w-4 transition-transform"></iconify-icon>
							</span>
						{/snippet}
						<div class="border-b border-surface-200 dark:border-surface-600 bg-surface-100/90 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-primary-500 dark:bg-surface-900/90 -mx-2">
							{applayout_systemlanguage()}
						</div>
						<div class="custom-scrollbar max-h-64 overflow-y-auto">
							{#each filteredLanguages as lang (lang)}
								<button
									type="button"
									onclick={() => selectLanguage(lang)}
									class="flex w-full items-center justify-between px-3 py-2 text-left rounded-md cursor-pointer hover:bg-surface-200/60 dark:hover:bg-surface-700/60 transition-colors"
								>
									<span class="text-sm font-medium">{getLanguageName(lang)}</span>
									<span class="text-xs font-bold text-primary-500">{lang.toUpperCase()}</span>
								</button>
							{/each}
						</div>
					</Dropdown>
				</SystemTooltip>
			</div>

			<SystemTooltip title="Accessibility Help">
				<button type="button" class="btn preset-outlined-surface-500 h-10 w-10 rounded-lg text-black dark:text-white" onclick={() => modalState.trigger(AccessibilityHelp)} aria-label="Accessibility Help">
					<iconify-icon icon="mdi:accessibility" width="20"></iconify-icon>
				</button>
			</SystemTooltip>

			<ThemeToggle showTooltip={true} tooltipPlacement="bottom" iconSize={20} buttonClass="btn preset-outlined-surface-500 h-10 w-10 rounded-lg text-black dark:text-white" />
		</div>
	</div>

	<!-- Row 2: Description (Mobile only) -->
	<div class="mt-2 lg:hidden">
		<p class="text-center text-xs leading-snug dark:text-white sm:text-base">{setup_heading_subtitle({ siteName: siteName || 'SveltyCMS' })}</p>
	</div>
</div>

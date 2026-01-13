<!--
@file src/routes/setup/SetupHeader.svelte
@description Header component for the setup wizard.
Displays logo, site name, language selector, and theme toggle.
-->
<script lang="ts">
	import SiteName from '@components/SiteName.svelte';
	import { Menu, Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';
	import * as m from '@src/paraglide/messages';
	import { getLanguageName } from '@utils/languageUtils';

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

<div class="mb-4 shrink-0 rounded-xl border border-surface-200 bg-white p-3 shadow-xl dark:text-surface-50 dark:bg-surface-800 sm:p-6 lg:mb-6">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<div class="flex flex-1 items-center gap-3 sm:gap-4">
			<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer">
				<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-12 w-auto" />
			</a>
			<h1 class="text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">
				<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer" class="transition-colors hover:text-primary-500">
					<SiteName {siteName} highlight="CMS" />
				</a>
			</h1>
		</div>

		<div class="flex shrink-0 items-center gap-1 sm:gap-4">
			<div class="hidden rounded border border-indigo-100 bg-indigo-50 px-3 py-1.5 lg:flex">
				<div class="text-xs font-medium uppercase tracking-wider text-surface-500">{m.setup_heading_badge()}</div>
			</div>

			<div class="language-selector relative">
				<Tooltip positioning={{ placement: 'bottom' }}>
					<Tooltip.Trigger>
						<Menu positioning={{ placement: 'bottom-end', gutter: 10 }}>
							<Menu.Trigger class="preset-outlined-surface-500 btn rounded px-2 py-1 flex items-center gap-2">
								<span class="font-medium">{getLanguageName(currentLanguageTag)}</span>
								<iconify-icon icon="mdi:chevron-down" class="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"></iconify-icon>
							</Menu.Trigger>

							<Portal>
								<Menu.Positioner>
									<Menu.Content class="card p-2 shadow-xl preset-filled-surface-100-900 z-50 w-64 border border-surface-200 dark:border-surface-600">
										<!-- Header to inform user about System Language context -->
										<div
											class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-600 mb-2"
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
														onclick={(e) => e.stopPropagation()}
													/>
												</div>
											</div>
										{/if}

										<!-- Language List -->
										<div class="max-h-64 overflow-y-auto custom-scrollbar">
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
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class="card preset-filled-surface-700 z-50 rounded-md p-2 text-xs text-white shadow-xl">
								{m.applayout_systemlanguage?.() || 'Change system language'}
								<Tooltip.Arrow>
									<Tooltip.ArrowTip class="bg-surface-700" />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<ThemeToggle showTooltip={true} tooltipPlacement="bottom" iconSize={22} />
		</div>

		<p class="w-full text-center text-sm dark:text-white sm:text-base">
			{m.setup_heading_subtitle({ siteName: siteName || 'SveltyCMS' })}
		</p>
	</div>
</div>

<!--
@file src/routes/setup/SetupHeader.svelte
@description Header component for the setup wizard.
Displays logo, site name, language selector, and theme toggle.
-->
<script lang="ts">
	import SiteName from '@components/SiteName.svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';
	import * as m from '@src/paraglide/messages';
	import { getLanguageName } from '@utils/languageUtils';

	let {
		siteName,
		systemLanguages,
		currentLanguageTag,
		isLangOpen = $bindable(),
		langSearch = $bindable(),
		onselectLanguage = () => {},
		ontoggleLang = () => {}
	} = $props();

	function selectLanguage(lang: string) {
		onselectLanguage(lang);
	}

	function toggleLang() {
		ontoggleLang();
	}
</script>

<div class="mb-4 shrink-0 rounded-xl border border-surface-200 bg-white p-3 shadow-xl dark:border-white dark:bg-surface-800 sm:p-6 lg:mb-6">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<div class="flex flex-1 items-center gap-3 sm:gap-4">
			<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer">
				<img src="/SveltyCMS_Logo.svg" alt="SveltyCMS Logo" class="h-12 w-auto" />
			</a>
			<h1 class="text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">
				<a href="https://github.com/SveltyCMS/SveltyCMS" target="_blank" rel="noopener noreferrer" class="transition-colors">
					<SiteName {siteName} highlight="CMS" />
				</a>
			</h1>
		</div>

		<div class="flex shrink-0 items-center gap-1 sm:gap-4">
			<div class="hidden rounded border border-indigo-100 bg-indigo-50 px-3 py-1.5 lg:flex">
				<div class="text-xs font-medium uppercase tracking-wider text-surface-500">{m.setup_heading_badge()}</div>
			</div>
			<div class="language-selector relative">
				{#if systemLanguages.length > 5}
					<button onclick={toggleLang} class="preset-ghost btn rounded px-2 py-1">
						<span class="hidden sm:inline">{getLanguageName(currentLanguageTag)}</span>
						<span class="font-mono text-xs font-bold">{currentLanguageTag.toUpperCase()}</span>
						<svg class="ml-1 h-3.5 w-3.5 transition-transform {isLangOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{#if isLangOpen}
						<div
							class="absolute right-0 z-20 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800"
						>
							<input bind:value={langSearch} placeholder={m.setup_search_placeholder()} class="input-sm input mb-2 w-full" />
							<div class="max-h-56 overflow-y-auto">
								{#each systemLanguages.filter((l: string) => getLanguageName(l).toLowerCase().includes(langSearch.toLowerCase())) as lang (lang)}
									<button
										onclick={() => selectLanguage(lang)}
										class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-200/60 dark:hover:bg-surface-600/60 {currentLanguageTag ===
										lang
											? 'bg-surface-200/80 font-medium dark:bg-surface-600/70'
											: ''}"
									>
										<span>{getLanguageName(lang)} {lang.toUpperCase()}</span>
										{#if currentLanguageTag === lang}
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
												<path
													fill-rule="evenodd"
													d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<select bind:value={currentLanguageTag} class="input" onchange={(e) => selectLanguage((e.target as HTMLSelectElement).value)}>
						{#each systemLanguages as lang (lang)}<option value={lang}>{getLanguageName(lang)} {lang.toUpperCase()}</option>{/each}
					</select>
				{/if}
			</div>
			<ThemeToggle showTooltip={true} tooltipPlacement="bottom" buttonClass="preset-ghost btn-icon" iconSize={22} />
		</div>

		<p class="w-full text-center text-sm sm:text-base">
			{m.setup_heading_subtitle({ siteName: siteName || 'SveltyCMS' })}
		</p>
	</div>
</div>

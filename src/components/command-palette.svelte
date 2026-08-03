<!--
@file src/components/command-palette.svelte
@component
**Global command palette / Gin-style admin search (Drupal Coffee successor)**

Unified search for admin pages, collections, actions, plugins, and semantic hits.
Opened with Alt+G (all platforms) or Mod+K. Light/dark aware, WCAG-oriented.

### Features:
- Single elevated card (input + results + footer)
- Prefix filters (c, m, e, u, p, >, /path)
- Recents (tenant/user scoped localStorage)
- Context boost from current route
- Paraglide titles/descriptions for static catalog (display = current locale)
- Multi-locale matchTerms: EN keywords + all Paraglide locales so DE/HI users can type "user"
- Keyboard: ↑↓ Enter Esc Tab (focus trap); no Tab-to-close
- focus-visible rings, contrast-safe selection, reduced motion
-->

<script lang="ts">
	import Input from '@components/ui/input.svelte';
	import HighlightedText from '@components/highlighted-text.svelte';
	import { ui } from '@src/stores/ui-store.svelte';
	import { collections } from '@src/stores/collection-store.svelte';
	import {
		pluginIndexToEntries,
		globalSearchIndex,
		triggerActionStore,
		searchGlobalIndex
	} from '@utils/global-search-index';
	import {
		type CommandPaletteEntry,
		type RankedPaletteItem,
		parsePaletteQuery,
		flattenToRankedItems,
		staticDefsToEntries,
		collectionsToEntries,
		loadRecents,
		pushRecent,
		recentsStorageKey,
		recentsToEntries,
		contextLabelFromPath,
		scoreEntry
	} from '@utils/command-palette';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import * as m from '@src/paraglide/messages';
	import { locales as paraglideLocales } from '@src/paraglide/runtime';

	// ─── i18n helpers ───────────────────────────────────────────────────────
	type MsgFn = (
		inputs?: Record<string, string | number>,
		options?: { locale?: string }
	) => string;

	function msg(
		key: string,
		fallback: string,
		params?: Record<string, string | number>,
		locale?: string
	): string {
		const fn = (m as Record<string, unknown>)[key];
		if (typeof fn === 'function') {
			try {
				const call = fn as MsgFn;
				if (locale) {
					return call(params ?? {}, { locale });
				}
				return call(params);
			} catch {
				return fallback;
			}
		}
		if (params) {
			return Object.entries(params).reduce(
				(s, [k, v]) => s.replace(`{${k}}`, String(v)),
				fallback
			);
		}
		return fallback;
	}

	/** Current UI locale — what the user sees in the result list. */
	function resolveKey(key: string, fallback: string): string {
		return msg(key, fallback);
	}

	/**
	 * All configured Paraglide locales for the match bag.
	 * DE/HI display + EN source strings so typing "user" always works.
	 */
	function resolveAllLocales(key: string, fallback: string): string[] {
		const out = new Set<string>();
		out.add(fallback);
		const localeList = Array.isArray(paraglideLocales)
			? [...paraglideLocales]
			: ['en', 'de'];
		for (const locale of localeList) {
			try {
				out.add(msg(key, fallback, undefined, String(locale)));
			} catch {
				// locale not compiled yet
			}
		}
		// Current locale (may differ if runtime overrides)
		out.add(msg(key, fallback));
		return [...out].filter(Boolean);
	}

	// ─── State ──────────────────────────────────────────────────────────────
	let searchQuery = $state('');
	let selectedIndex = $state(0);
	let inputRef = $state<HTMLInputElement | null>(null);
	let listElement = $state<HTMLDivElement | null>(null);
	let panelElement = $state<HTMLDivElement | null>(null);
	let isSearching = $state(false);
	let prefersReducedMotion = $state(false);
	let statusMessage = $state('');
	let semanticEntries = $state<CommandPaletteEntry[]>([]);
	let recents = $state(loadRecents(recentsKey()));
	let previousFocus: HTMLElement | null = null;

	const pathname = $derived(page.url.pathname);
	const contextLabel = $derived(contextLabelFromPath(pathname));
	const parsed = $derived(parsePaletteQuery(searchQuery));

	const catalog = $derived.by((): CommandPaletteEntry[] => {
		const staticEntries = staticDefsToEntries(resolveKey, {
			resolveAll: resolveAllLocales
		});
		const collectionEntries = collectionsToEntries(
			collections.contentStructure ?? [],
			// Prefer first path segment if it looks like a language code
			pathname.split('/').filter(Boolean)[0]?.length === 2
				? pathname.split('/').filter(Boolean)[0]!
				: 'en'
		);
		const pluginEntries = pluginIndexToEntries($globalSearchIndex);
		// Dedupe by id / path
		const map = new Map<string, CommandPaletteEntry>();
		for (const e of [...staticEntries, ...collectionEntries, ...pluginEntries, ...semanticEntries]) {
			const key = e.id || e.path || e.title;
			if (!map.has(key)) map.set(key, e);
		}
		return [...map.values()];
	});

	const rankedItems = $derived.by((): RankedPaletteItem[] => {
		const { filter, query } = parsed;

		if (!query && filter === 'all') {
			const recentEntries = recentsToEntries(recents);
			const recentRanked = flattenToRankedItems(recentEntries, '', {
				pathname,
				filter: 'all',
				limit: 6
			}).map((r) => ({ ...r, section: 'recent' as const }));

			// Context-suggested: high context score among static+collections
			const contextCandidates = catalog
				.map((entry) => ({
					entry,
					score: scoreEntry(entry, '', { pathname, filter: 'all' })
				}))
				.filter((x) => x.score >= 30)
				.sort((a, b) => b.score - a.score)
				.slice(0, 6);

			const contextRanked: RankedPaletteItem[] = contextCandidates.map((c) => ({
				entry: c.entry,
				triggerPath: c.entry.path,
				score: c.score,
				section: 'context' as const
			}));

			// Default quick actions / top pages
			const defaults = flattenToRankedItems(
				catalog.filter((e) => e.category === 'page' || e.category === 'action'),
				'',
				{ pathname, filter: 'all', limit: 8 }
			);

			const seen = new Set<string>();
			const merged: RankedPaletteItem[] = [];
			for (const item of [...recentRanked, ...contextRanked, ...defaults]) {
				const id = `${item.entry.id}:${item.triggerPath ?? ''}`;
				if (seen.has(id)) continue;
				seen.add(id);
				merged.push(item);
			}
			return merged.slice(0, 14);
		}

		return flattenToRankedItems(catalog, query, {
			pathname,
			filter,
			limit: 14
		});
	});

	const filterLabel = $derived.by(() => {
		const f = parsed.filter;
		if (f === 'all') return null;
		return msg('global_search_filter_chip', `Filter: ${f}`, { filter: f });
	});

	$effect(() => {
		if (isSearching) {
			statusMessage = msg('global_search_searching', 'Searching…');
		} else if (searchQuery.trim() && rankedItems.length === 0) {
			statusMessage = msg('global_search_no_results', 'No results found');
		} else if (rankedItems.length > 0 && searchQuery.trim()) {
			statusMessage = msg(
				'global_search_results_count',
				`${rankedItems.length} results. Use arrow keys to navigate.`,
				{ count: rankedItems.length }
			);
		} else {
			statusMessage = '';
		}
	});

	$effect(() => {
		// Clamp selection when list changes
		void rankedItems;
		if (selectedIndex >= rankedItems.length) {
			selectedIndex = Math.max(0, rankedItems.length - 1);
		}
	});

	// Debounced server/local enrichment (avoids reading full catalog to prevent cycles)
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const q = parsed.query;
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!q || q.length < 2) {
			semanticEntries = [];
			isSearching = false;
			return;
		}
		isSearching = true;
		debounceTimer = setTimeout(async () => {
			try {
				const hits = await searchGlobalIndex(q, { limit: 8 });
				const staticPaths = new Set(
					staticDefsToEntries(resolveKey)
						.map((c) => c.path)
						.filter(Boolean) as string[]
				);
				const extras: CommandPaletteEntry[] = hits
					.filter((h) => {
						const p = Object.values(h.triggers)[0]?.path;
						return p && !staticPaths.has(p);
					})
					.map((h) => ({
						id: `api:${h.title}:${Object.values(h.triggers)[0]?.path ?? ''}`,
						category: 'entry' as const,
						title: h.title,
						description: h.description,
						keywords: h.keywords,
						icon: 'mdi:file-document-outline',
						path: Object.values(h.triggers)[0]?.path,
						triggers: h.triggers,
						weight: 15
					}));
				semanticEntries = extras;
			} catch {
				semanticEntries = [];
			} finally {
				isSearching = false;
			}
		}, 180);
	});

	function recentsKey(): string {
		const tenantId = (page.data as { tenantId?: string | null })?.tenantId;
		const userId = (page.data as { user?: { id?: string; _id?: string } })?.user?.id
			?? (page.data as { user?: { _id?: string } })?.user?._id;
		return recentsStorageKey(tenantId, userId);
	}

	function closePalette() {
		ui.closeGlobalSearch();
		isSearchVisibleCompat(false);
		searchQuery = '';
		selectedIndex = 0;
		semanticEntries = [];
		tick().then(() => {
			previousFocus?.focus?.();
			previousFocus = null;
		});
	}

	function isSearchVisibleCompat(open: boolean) {
		// Keep legacy writable in sync for any external subscribers
		import('@utils/global-search-index').then(({ isSearchVisible }) => {
			isSearchVisible.set(open);
		});
	}

	function executeItem(item: RankedPaletteItem) {
		const triggerKey = item.triggerKey;
		const triggerActions = triggerKey
			? item.entry.triggers?.[triggerKey]?.action
			: undefined;

		// Navigation is handled by the anchor (data-preload="hover") so SvelteKit's
		// speculative preloading pipeline stays in charge — no goto() for primary nav.
		if (triggerActions && triggerActions.length > 0) {
			triggerActionStore.set(triggerActions);
		}

		pushRecent(recentsKey(), {
			id: item.entry.id,
			path: item.triggerPath || item.entry.path || '/',
			title: item.triggerKey ? `${item.entry.title} · ${item.triggerKey}` : item.entry.title,
			description: item.entry.description,
			icon: item.entry.icon
		});
		recents = loadRecents(recentsKey());

		closePalette();
	}

	/** Programmatic activation (keyboard) — clicks the row so anchors navigate natively. */
	function activateItem(index: number) {
		const el = listElement?.querySelector<HTMLElement>(`#palette-result-${index}`);
		el?.click();
	}

	function scrollSelectedIntoView(index: number) {
		if (!listElement || index < 0) return;
		const el = listElement.querySelector(`#palette-result-${index}`) as HTMLElement | null;
		el?.scrollIntoView({
			block: 'nearest',
			behavior: prefersReducedMotion ? 'auto' : 'smooth'
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				event.stopPropagation();
				closePalette();
				break;
			case 'ArrowDown':
				event.preventDefault();
				if (rankedItems.length) {
					selectedIndex = (selectedIndex + 1) % rankedItems.length;
					scrollSelectedIntoView(selectedIndex);
				}
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (rankedItems.length) {
					selectedIndex = (selectedIndex - 1 + rankedItems.length) % rankedItems.length;
					scrollSelectedIntoView(selectedIndex);
				}
				break;
			case 'Enter':
				if (rankedItems[selectedIndex]) {
					event.preventDefault();
					activateItem(selectedIndex);
				}
				break;
			case 'Tab': {
				// Focus trap within panel
				if (!panelElement) break;
				const focusable = panelElement.querySelectorAll<HTMLElement>(
					'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
				);
				if (!focusable.length) break;
				const first = focusable[0]!;
				const last = focusable[focusable.length - 1]!;
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
				break;
			}
			default: {
				// Number keys 1–9 jump to result when not typing modifiers
				if (
					!event.metaKey &&
					!event.ctrlKey &&
					!event.altKey &&
					event.key >= '1' &&
					event.key <= '9' &&
					document.activeElement !== inputRef
				) {
					const idx = Number(event.key) - 1;
					if (rankedItems[idx]) {
						event.preventDefault();
						activateItem(idx);
					}
				}
			}
		}
	}

	function sectionHeading(section: RankedPaletteItem['section']): string {
		switch (section) {
			case 'recent':
				return msg('global_search_section_recent', 'Recent');
			case 'context':
				return msg('global_search_section_context', 'Suggested here');
			case 'actions':
				return msg('global_search_section_actions', 'Actions');
			case 'collections':
				return msg('global_search_section_collections', 'Collections');
			case 'pages':
				return msg('global_search_section_pages', 'Pages');
			default:
				return msg('global_search_section_results', 'Results');
		}
	}

	/** Group consecutive items for section headers while keeping flat keyboard index. */
	const displayGroups = $derived.by(() => {
		const groups: { section: RankedPaletteItem['section']; startIndex: number; items: RankedPaletteItem[] }[] =
			[];
		let current: (typeof groups)[0] | null = null;
		rankedItems.forEach((item, index) => {
			if (!current || current.section !== item.section) {
				current = { section: item.section, startIndex: index, items: [] };
				groups.push(current);
			}
			current.items.push(item);
		});
		return groups;
	});

	onMount(() => {
		previousFocus = document.activeElement as HTMLElement | null;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mq.matches;
		const onMq = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mq.addEventListener('change', onMq);

		recents = loadRecents(recentsKey());
		isSearchVisibleCompat(true);
		tick().then(() => inputRef?.focus());

		return () => {
			mq.removeEventListener('change', onMq);
			isSearchVisibleCompat(false);
		};
	});

	const isMac =
		typeof navigator !== 'undefined' &&
		/Mac|iPod|iPhone|iPad/.test(navigator.userAgent || '');
	const modLabel = isMac ? '⌘' : 'Ctrl';
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-1000 bg-surface-900/50 backdrop-blur-sm dark:bg-black/60"
		onclick={closePalette}
		aria-hidden="true"
		transition:fade={{ duration: prefersReducedMotion ? 0 : 150 }}
	></div>

<!-- Screen reader status -->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</div>

<!-- Panel -->
<div
	bind:this={panelElement}
	class="command-palette fixed inset-x-0 top-[12%] z-1001 mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-surface-300 bg-surface-50 shadow-2xl dark:border-surface-600 dark:bg-surface-900 sm:inset-x-auto sm:inset-s-1/2 sm:-translate-x-1/2"
	style="border-radius: var(--admin-radius-card, 12px);"
	role="dialog"
	aria-modal="true"
	aria-label={msg('global_search_aria_label', 'Global search')}
	tabindex="-1"
	onkeydown={handleKeyDown}
	transition:fly={{ y: prefersReducedMotion ? 0 : -16, duration: prefersReducedMotion ? 0 : 180 }}
>
	<!-- Search input row -->
	<div
		class="flex items-center gap-2 border-b border-surface-200 px-3 dark:border-surface-700"
	>
		<span class="text-surface-500 dark:text-surface-400" aria-hidden="true">
			{#if isSearching}
				<svg
					class="h-5 w-5 animate-spin"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			{:else}
				<iconify-icon icon="mdi:magnify" width="22" height="22"></iconify-icon>
			{/if}
		</span>
		<Input
			bind:inputRef
			bind:value={searchQuery}
			type="search"
			role="combobox"
			aria-expanded="true"
			autocomplete="off"
			autocapitalize="off"
			spellcheck={false}
			aria-label={msg('global_search_aria_label', 'Global search')}
			aria-controls="palette-results"
			aria-autocomplete="list"
			aria-activedescendant={rankedItems.length
				? `palette-result-${selectedIndex}`
				: undefined}
			aria-busy={isSearching}
			placeholder={msg('global_search_placeholder', 'Search pages, collections, actions…')}
			inputClass="h-12 w-full border-0 bg-transparent py-3 text-base text-surface-900 shadow-none outline-none ring-0 focus-visible:ring-0 dark:text-surface-50 dark:placeholder:text-surface-400"
			class="border-0 shadow-none"
		/>
		<kbd
			class="hidden shrink-0 rounded border border-surface-300 bg-surface-100 px-1.5 py-0.5 text-[10px] font-semibold text-surface-600 sm:inline dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300"
		>
			ESC
		</kbd>
	</div>

	<!-- Context / filter chips -->
	{#if contextLabel || filterLabel}
		<div
			class="flex flex-wrap items-center gap-2 border-b border-surface-200 px-4 py-2 text-xs dark:border-surface-700"
		>
			{#if contextLabel}
				<span
					class="rounded-full bg-surface-200/80 px-2.5 py-0.5 font-medium text-surface-700 dark:bg-surface-800 dark:text-surface-200"
				>
					{msg('global_search_from_context', `From: ${contextLabel}`, { context: contextLabel })}
				</span>
			{/if}
			{#if filterLabel}
				<span
					class="rounded-full bg-tertiary-500/15 px-2.5 py-0.5 font-medium text-tertiary-700 dark:bg-primary-500/20 dark:text-primary-300"
				>
					{filterLabel}
				</span>
			{/if}
		</div>
	{/if}

	<!-- Results -->
	<div
		bind:this={listElement}
		id="palette-results"
		class="max-h-[min(50vh,28rem)] overflow-y-auto overscroll-contain p-2"
		role="listbox"
		aria-label={msg('global_search_aria_label', 'Global search')}
	>
		{#if rankedItems.length > 0}
			{#each displayGroups as group (group.section + group.startIndex)}
				<div
					class="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400"
					role="presentation"
				>
					{sectionHeading(group.section)}
				</div>
				{#each group.items as item, i (item.entry.id + (item.triggerKey ?? '') + (group.startIndex + i))}
					{@const index = group.startIndex + i}
					{@const selected = index === selectedIndex}
					{@const path = item.triggerPath || item.entry.path || ''}
					{#snippet rowContent()}
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md
								{selected
								? 'bg-white/15 text-white'
								: 'bg-surface-200 text-surface-600 dark:bg-surface-800 dark:text-surface-300'}"
							aria-hidden="true"
						>
							<iconify-icon icon={item.entry.icon || 'mdi:file-document-outline'} width="20"
							></iconify-icon>
						</span>
						<div class="min-w-0 flex-1">
							<div class="truncate font-medium">
								{#if item.triggerKey && Object.keys(item.entry.triggers ?? {}).length > 1}
									<span class="opacity-90">{item.entry.title}</span>
									<span class="opacity-70"> · </span>
									<HighlightedText
										text={item.triggerKey}
										term={parsed.query}
										charLimit={80}
										highlightClass={selected
											? 'bg-white/30 text-white rounded px-0.5'
											: 'bg-warning-500/40 text-warning-950 dark:bg-warning-600/50 dark:text-warning-50 rounded px-0.5'}
									/>
								{:else}
									<HighlightedText
										text={item.entry.title}
										term={parsed.query}
										charLimit={80}
										highlightClass={selected
											? 'bg-white/30 text-white rounded px-0.5'
											: 'bg-warning-500/40 text-warning-950 dark:bg-warning-600/50 dark:text-warning-50 rounded px-0.5'}
									/>
								{/if}
							</div>
							<div
								class="mt-0.5 truncate text-sm {selected
									? 'text-white/85'
									: 'text-surface-600 dark:text-surface-400'}"
							>
								<HighlightedText
									text={item.entry.description}
									term={parsed.query}
									charLimit={100}
									highlightClass={selected
										? 'bg-white/25 text-white rounded px-0.5'
										: 'bg-warning-500/30 text-warning-950 dark:bg-warning-600/40 dark:text-warning-50 rounded px-0.5'}
								/>
							</div>
						</div>
						{#if path}
							<span
								class="hidden max-w-36 shrink-0 truncate rounded px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline
									{selected
									? 'bg-white/15 text-white/90'
									: 'bg-surface-200 text-surface-600 dark:bg-surface-800 dark:text-surface-400'}"
								title={path}
							>
								{path}
							</span>
						{/if}
						{#if index < 9 && !parsed.query}
							<span
								class="hidden w-5 shrink-0 text-center text-[10px] font-bold opacity-50 sm:inline {selected
									? 'text-white'
									: ''}"
								aria-hidden="true"
							>
								{index + 1}
							</span>
						{/if}
					{/snippet}
					{#if path}
						<a
							href={path}
							data-preload="hover"
							id="palette-result-{index}"
							role="option"
							aria-selected={selected}
							class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-[filter,transform,background-color,color] duration-150
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-50
								dark:focus-visible:ring-surface-300 dark:focus-visible:ring-offset-surface-900
								{selected
								? 'bg-tertiary-600 text-white dark:bg-primary-600 dark:text-white'
								: 'text-surface-900 hover:brightness-110 active:scale-[0.98] dark:text-surface-50 dark:hover:bg-surface-800'}"
							onclick={() => executeItem(item)}
							onmouseenter={() => (selectedIndex = index)}
						>
							{@render rowContent()}
						</a>
					{:else}
						<button
							type="button"
							id="palette-result-{index}"
							role="option"
							aria-selected={selected}
							class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-[filter,transform,background-color,color] duration-150
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-50
								dark:focus-visible:ring-surface-300 dark:focus-visible:ring-offset-surface-900
								{selected
								? 'bg-tertiary-600 text-white dark:bg-primary-600 dark:text-white'
								: 'text-surface-900 hover:brightness-110 active:scale-[0.98] dark:text-surface-50 dark:hover:bg-surface-800'}"
							onclick={() => executeItem(item)}
							onmouseenter={() => (selectedIndex = index)}
						>
							{@render rowContent()}
						</button>
					{/if}
				{/each}
			{/each}
		{:else if searchQuery.trim()}
			<div class="flex flex-col items-center justify-center px-4 py-12 text-center" role="status">
				<iconify-icon
					icon="mdi:magnify-close"
					width="40"
					class="mb-3 text-surface-400 dark:text-surface-500"
				></iconify-icon>
				<p class="text-base font-medium text-surface-800 dark:text-surface-100">
					{msg('global_search_no_results', 'No results found')}
				</p>
				<p class="mt-1 max-w-sm text-sm text-surface-600 dark:text-surface-400">
					{msg(
						'global_search_no_results_hint',
						'Try different keywords, or use prefixes like c, m, > for actions.'
					)}
				</p>
			</div>
		{:else}
			<div class="px-4 py-8 text-center text-sm text-surface-600 dark:text-surface-400">
				{msg('global_search_start_typing', 'Type to search the whole CMS')}
			</div>
		{/if}
	</div>

	<!-- Footer -->
	<div
		class="flex flex-wrap items-center justify-between gap-2 border-t border-surface-200 bg-surface-100/80 px-4 py-2 text-[11px] font-medium text-surface-600 dark:border-surface-700 dark:bg-surface-950/50 dark:text-surface-400"
	>
		<div class="flex flex-wrap items-center gap-3">
			<span class="inline-flex items-center gap-1">
				<kbd
					class="rounded border border-surface-300 bg-surface-50 px-1 dark:border-surface-600 dark:bg-surface-800"
					>↑↓</kbd
				>
				{msg('global_search_nav_hint', 'Navigate')}
			</span>
			<span class="inline-flex items-center gap-1">
				<kbd
					class="rounded border border-surface-300 bg-surface-50 px-1 dark:border-surface-600 dark:bg-surface-800"
					>↵</kbd
				>
				{msg('global_search_select_hint', 'Select')}
			</span>
			<span class="inline-flex items-center gap-1">
				<kbd
					class="rounded border border-surface-300 bg-surface-50 px-1 dark:border-surface-600 dark:bg-surface-800"
					>esc</kbd
				>
				{msg('global_search_close_hint', 'Close')}
			</span>
		</div>
		<div class="inline-flex items-center gap-2 text-surface-500 dark:text-surface-400">
			<span class="inline-flex items-center gap-1">
				<kbd
					class="rounded border border-surface-300 bg-surface-50 px-1 dark:border-surface-600 dark:bg-surface-800"
					>{modLabel}+K</kbd
				>
				<span class="hidden sm:inline">·</span>
				<kbd
					class="rounded border border-surface-300 bg-surface-50 px-1 dark:border-surface-600 dark:bg-surface-800"
					>Alt+G</kbd
				>
			</span>
		</div>
	</div>
</div>

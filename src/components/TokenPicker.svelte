<!--
@file src/components/TokenPicker.svelte
@component
**Token Picker Component**

A UI component for selecting and inserting tokens into input fields.
Features fuzzy search, collapsible groups, and rich token display.

@example
<TokenPicker
  tokens={availableTokens}
  onSelect={(token) => insertToken(token)}
  open={showPicker}
  onClose={() => showPicker = false}
/>
-->

<script lang="ts">
	import { getEditDistance } from '@utils/utils';
	import type { TokenDefinition, TokenCategory } from '@src/services/token/types';
	import { getTokensByCategory } from '@src/services/token/TokenRegistry';

	interface Props {
		tokens: TokenDefinition[];
		onSelect: (token: string) => void;
		open?: boolean;
		onClose?: () => void;
	}

	let { tokens, onSelect, open = $bindable(false), onClose }: Props = $props();

	// Search state
	let searchQuery = $state('');
	let selectedIndex = $state(-1);
	let inputRef = $state<HTMLInputElement | null>(null);
	let listRef = $state<HTMLDivElement | null>(null);

	// Grouped tokens
	let groupedTokens = $derived.by(() => {
		if (!tokens || tokens.length === 0) return {};
		return getTokensByCategory(tokens);
	});

	// Filtered and sorted tokens based on search
	let filteredTokens = $derived.by(() => {
		if (!searchQuery.trim()) {
			return tokens;
		}

		const query = searchQuery.toLowerCase();
		const results = tokens
			.map((token) => {
				const nameMatch = token.name.toLowerCase().includes(query);
				const descMatch = token.description.toLowerCase().includes(query);
				const tokenMatch = token.token.toLowerCase().includes(query);

				// Calculate edit distance for fuzzy matching
				const nameDistance = getEditDistance(query, token.name.toLowerCase()) ?? Infinity;
				const descDistance = getEditDistance(query, token.description.toLowerCase()) ?? Infinity;
				const tokenDistance = getEditDistance(query, token.token.toLowerCase()) ?? Infinity;

				const minDistance = Math.min(nameDistance, descDistance, tokenDistance);

				return {
					token,
					score: nameMatch ? 0 : descMatch ? 1 : tokenMatch ? 2 : minDistance,
					matches: nameMatch || descMatch || tokenMatch
				};
			})
			.filter((item) => item.matches || item.score < 10)
			.sort((a, b) => a.score - b.score)
			.map((item) => item.token);

		return results;
	});

	// Grouped filtered tokens
	let filteredGrouped = $derived.by(() => {
		if (!searchQuery.trim()) {
			return groupedTokens;
		}

		const filtered = filteredTokens;
		const grouped: Record<TokenCategory, TokenDefinition[]> = {
			entry: [],
			collection: [],
			site: [],
			user: [],
			system: []
		};

		for (const token of filtered) {
			if (token.category in grouped) {
				grouped[token.category].push(token);
			}
		}

		return grouped;
	});

	// Collapsed state for categories
	let collapsedCategories = $state<Set<TokenCategory>>(new Set());

	function toggleCategory(category: TokenCategory) {
		if (collapsedCategories.has(category)) {
			collapsedCategories.delete(category);
		} else {
			collapsedCategories.add(category);
		}
		collapsedCategories = new Set(collapsedCategories); // Trigger reactivity
	}

	function handleSelect(token: TokenDefinition) {
		onSelect(`{{${token.token}}}`);
		open = false;
		searchQuery = '';
		selectedIndex = -1;
	}

	function handleKeyDown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				open = false;
				onClose?.();
				break;
			case 'ArrowDown':
				event.preventDefault();
				if (filteredTokens.length > 0) {
					selectedIndex = (selectedIndex + 1) % filteredTokens.length;
					scrollToSelected();
				}
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (filteredTokens.length > 0) {
					selectedIndex = selectedIndex <= 0 ? filteredTokens.length - 1 : selectedIndex - 1;
					scrollToSelected();
				}
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0 && filteredTokens[selectedIndex]) {
					handleSelect(filteredTokens[selectedIndex]);
				}
				break;
		}
	}

	function scrollToSelected() {
		if (listRef && selectedIndex >= 0) {
			const selectedElement = listRef.querySelector(`[data-token-index="${selectedIndex}"]`);
			if (selectedElement) {
				selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}
	}

	function getCategoryIcon(category: TokenCategory): string {
		switch (category) {
			case 'entry':
				return 'mdi:file-document-outline';
			case 'collection':
				return 'mdi:folder-outline';
			case 'site':
				return 'mdi:web';
			case 'user':
				return 'mdi:account-outline';
			case 'system':
				return 'mdi:cog-outline';
			default:
				return 'mdi:tag-outline';
		}
	}

	function getCategoryLabel(category: TokenCategory): string {
		switch (category) {
			case 'entry':
				return 'Entry Fields';
			case 'collection':
				return 'Collection';
			case 'site':
				return 'Site Settings';
			case 'user':
				return 'User';
			case 'system':
				return 'System';
			default:
				return category;
		}
	}

	// Auto-focus input when opened
	$effect(() => {
		if (open && inputRef) {
			setTimeout(() => {
				inputRef?.focus();
			}, 100);
		}
	});

	// Reset search when closed
	$effect(() => {
		if (!open) {
			searchQuery = '';
			selectedIndex = -1;
		}
	});
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
		onclick={() => {
			open = false;
			onClose?.();
		}}
		role="presentation"
	></div>

	<!-- Picker Modal -->
	<div
		class="fixed left-1/2 top-1/2 z-[10000] max-h-[80vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface-800 shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Token Picker"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="border-b border-surface-600 p-4">
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-primary-500">Insert Token</h3>
				<button
					type="button"
					onclick={() => {
						open = false;
						onClose?.();
					}}
					class="btn-icon btn-sm"
					aria-label="Close"
				>
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</button>
			</div>

			<!-- Search Input -->
			<input
				bind:this={inputRef}
				bind:value={searchQuery}
				onkeydown={handleKeyDown}
				type="search"
				placeholder="Search tokens..."
				class="input w-full"
				autocomplete="off"
			/>
		</div>

		<!-- Token List -->
		<div
			bind:this={listRef}
			class="max-h-[60vh] overflow-y-auto p-4"
			role="listbox"
			aria-label="Available tokens"
		>
			{#if filteredTokens.length === 0}
				<div class="py-8 text-center text-surface-400">No tokens found</div>
			{:else}
				{#each Object.entries(filteredGrouped) as [category, categoryTokens] (category)}
					{#if categoryTokens.length > 0}
						<!-- Category Header -->
						<button
							type="button"
							onclick={() => toggleCategory(category as TokenCategory)}
							class="mb-2 flex w-full items-center justify-between rounded px-2 py-1 text-sm font-medium text-surface-300 hover:bg-surface-700"
						>
							<div class="flex items-center gap-2">
								<iconify-icon
									icon={getCategoryIcon(category as TokenCategory)}
									width="18"
								></iconify-icon>
								<span>{getCategoryLabel(category as TokenCategory)}</span>
								<span class="text-xs text-surface-500">({categoryTokens.length})</span>
							</div>
							<iconify-icon
								icon={collapsedCategories.has(category as TokenCategory)
									? 'mdi:chevron-right'
									: 'mdi:chevron-down'}
								width="18"
							></iconify-icon>
						</button>

						<!-- Category Tokens -->
						{#if !collapsedCategories.has(category as TokenCategory)}
							<div class="mb-4 space-y-1">
								{#each categoryTokens as token, index (token.token)}
									{@const globalIndex = filteredTokens.findIndex((t) => t.token === token.token)}
									<button
										type="button"
										data-token-index={globalIndex}
										onclick={() => handleSelect(token)}
										class="w-full rounded px-3 py-2 text-left hover:bg-surface-700 {selectedIndex === globalIndex
											? 'bg-primary-500/20 ring-1 ring-primary-500'
											: ''}"
										role="option"
										aria-selected={selectedIndex === globalIndex}
									>
										<div class="flex items-start justify-between gap-2">
											<div class="flex-1">
												<div class="flex items-center gap-2">
													<span class="font-medium text-primary-400">{token.name}</span>
													<span class="text-xs text-surface-500 font-mono">
														{{token.token}}
													</span>
												</div>
												{#if token.description}
													<p class="mt-1 text-xs text-surface-400">{token.description}</p>
												{/if}
												{#if token.example}
													<p class="mt-1 text-xs text-surface-500 italic">
														Example: {token.example}
													</p>
												{/if}
											</div>
										</div>
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				{/each}
			{/if}
		</div>

		<!-- Footer -->
		<div class="border-t border-surface-600 p-3 text-xs text-surface-400">
			<div class="flex items-center justify-between">
				<span>Use ↑↓ to navigate, Enter to select, Esc to close</span>
				<span>{filteredTokens.length} token{filteredTokens.length !== 1 ? 's' : ''} available</span>
			</div>
		</div>
	</div>
{/if}


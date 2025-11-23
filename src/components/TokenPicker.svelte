<!--
@file src/components/TokenPicker.svelte
@component
**A component for cycling through all application theme states.**
### Features:
- 
-->
<script lang="ts">
	import { activeInputStore } from '@src/stores/activeInputStore.svelte';
	import { TokenRegistry } from '@src/services/token/engine';
	import { page } from '$app/state';
	import { collection } from '@src/stores/collectionStore.svelte';
	import { fade, slide } from 'svelte/transition';
	import { showToast } from '@utils/toast';

	// Icons for categories (using Iconify)
	const icons: Record<string, string> = {
		entry: 'mdi:file-document-outline',
		user: 'mdi:account-circle-outline',
		site: 'mdi:web',
		system: 'mdi:cog-outline',
		recentlyUsed: 'mdi:history'
	};

	// Search state
	let search = $state('');
	let openCategories = $state<Record<string, boolean>>({ entry: true, user: false, site: false, system: false });

	// Reactive token groups based on current collection schema and user
	let groupedTokens = $derived(TokenRegistry.getTokens(collection.value ?? undefined, page.data?.user));

	// Filter tokens by search query
	let filteredGroups = $derived.by(() => {
		const q = search.toLowerCase();
		const result: Record<string, any[]> = {};
		for (const [cat, tokens] of Object.entries(groupedTokens)) {
			const filtered = tokens.filter((t) => t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q));
			if (filtered.length > 0) result[cat] = filtered;
		}
		return result;
	});

	function toggleCategory(cat: string) {
		openCategories[cat] = !openCategories[cat];
	}

	function insert(token: string) {
		const val = `{{${token}}}`;
		const input = activeInputStore.value?.element;

		if (!input) {
			navigator.clipboard.writeText(val).then(() => {
				showToast(`Token ${val} copied to clipboard`, 'success');
			});
			return;
		}

		const start = input.selectionStart ?? 0;
		const end = input.selectionEnd ?? start;
		input.value = input.value.slice(0, start) + val + input.value.slice(end);
		input.focus();
		input.setSelectionRange(start + val.length, start + val.length);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	// Draggable action for the window
	function draggable(node: HTMLElement) {
		let x = 0,
			y = 0;
		const container = node.closest('.token-window') as HTMLElement;
		function onMouseDown(e: MouseEvent) {
			if ((e.target as HTMLElement).closest('button')) return;
			x = e.clientX;
			y = e.clientY;
			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
		}
		function onMouseMove(e: MouseEvent) {
			const dx = e.clientX - x;
			const dy = e.clientY - y;
			x = e.clientX;
			y = e.clientY;
			container.style.top = `${container.offsetTop + dy}px`;
			container.style.left = `${container.offsetLeft + dx}px`;
		}
		function onMouseUp() {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		}
		node.addEventListener('mousedown', onMouseDown);
		return { destroy: () => node.removeEventListener('mousedown', onMouseDown) };
	}
</script>

{#if activeInputStore.value}
	<div
		class="token-window fixed z-[9999] flex max-h-[500px] w-80 flex-col rounded-lg border border-surface-400 bg-white shadow-2xl dark:bg-surface-900"
		style="bottom: 20px; right: 20px;"
		transition:fade={{ duration: 150 }}
	>
		<!-- Header -->
		<div use:draggable class="flex cursor-move select-none items-center justify-between rounded-t-lg border-b border-surface-400 p-3">
			<div class="flex items-center gap-2 text-tertiary-500 dark:text-primary-500">
				<iconify-icon icon="mdi:code-braces" width="20"></iconify-icon>
				<span class="text-base font-bold">Token Picker for</span>
			</div>

			<div class="variant-filled-secondary badge text-sm font-medium">{activeInputStore.value.field.label || 'Clipboard'}</div>

			<button onclick={() => activeInputStore.set(null)} aria-label="Close token picker" class="variant-ghost btn-icon btn-icon-sm">
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</div>

		<!-- Search -->
		<div class="border-b border-surface-400 p-2">
			<input bind:value={search} class="input p-2" placeholder="Search tokens..." />
		</div>

		<!-- Token List -->
		<div class="scrollbar-thin scrollbar-thumb-surface-600 scrollbar-track-surface-800 flex-1 overflow-y-auto p-2">
			{#each Object.entries(filteredGroups) as [category, tokens]}
				<div class="mb-2 last:mb-0">
					<button
						onclick={() => toggleCategory(category)}
						class="flex w-full items-center justify-between rounded p-2 text-xs font-bold uppercase tracking-wider text-surface-400 transition-colors hover:bg-surface-700"
					>
						<div class="flex items-center gap-2">
							<iconify-icon icon={icons[category] || 'mdi:circle-small'} width="18"></iconify-icon>
							<span class="text-tertiary-500 dark:text-primary-500">{category}</span>
							<span class="variant-filled-tertiary badge-icon text-xs dark:variant-filled-primary">{tokens.length}</span>
						</div>
						<iconify-icon
							icon="mdi:chevron-down"
							width="16"
							class="transition-transform duration-200 {openCategories[category] || search ? 'rotate-180' : ''}"
						></iconify-icon>
					</button>
					{#if openCategories[category] || search}
						<div transition:slide={{ duration: 200 }} class="mt-1 space-y-1 pl-1">
							{#each tokens as t}
								<button
									onclick={() => insert(t.token)}
									class="group w-full rounded border border-transparent p-2 text-left transition-all hover:border-primary-500/50 hover:bg-primary-500/20"
									title={t.description}
								>
									<div class="mb-1 flex items-center justify-between">
										<span class="text-sm font-semibold">{t.name}</span>
										<code class="variant-filled-secondary badge rounded-full">
											{t.token}
										</code>
									</div>
									{#if t.description}
										<div class="text-xs text-tertiary-500 group-hover:text-surface-300 dark:text-primary-500">
											{t.description}
										</div>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
			{#if Object.keys(filteredGroups).length === 0}
				<div class="flex h-32 flex-col items-center justify-center text-sm text-surface-500">
					<iconify-icon icon="mdi:text-search" width="32" class="mb-2 opacity-50"></iconify-icon>
					<span>No tokens found</span>
				</div>
			{/if}
		</div>

		<!-- Footer -->
	</div>
{/if}

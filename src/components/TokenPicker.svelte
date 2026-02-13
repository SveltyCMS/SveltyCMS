<!--
@file src/components/TokenPicker.svelte
@component TokenPicker – Floating token selector and configurator for input fields

@features
- List/search tokens grouped by category
- Configure modifiers with arguments
- Live preview of resolved value using actual context
- Editable token string with smart replacement
- Supports existing token detection in active input
- Draggable window, responsive positioning
-->

<script lang="ts">
	import { activeInput } from '@src/stores/activeInputStore.svelte';
	import { TokenRegistry, replaceTokens } from '@src/services/token/engine';
	import { modifierMetadata } from '@src/services/token/modifiers';
	import { page } from '$app/state';
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { ui } from '@src/stores/UIStore.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { fade, slide } from 'svelte/transition';
	import { nowISODateString } from '@utils/dateUtils';
	import type { TokenDefinition, ModifierMetadata } from '@src/services/token/types';

	const icons: Record<string, string> = {
		entry: 'mdi:file-document-outline',
		user: 'mdi:account-circle-outline',
		site: 'mdi:web',
		system: 'mdi:cog-outline'
	};

	// Reactive state
	let mode = $state<'list' | 'configure'>('list');
	let search = $state('');
	let selectedToken = $state<TokenDefinition | null>(null);
	let selectedModifiers = $state<{ def: ModifierMetadata; args: unknown[] }[]>([]);
	let resolvedPreview = $state('');
	let isLoadingPreview = $state(false);
	let editablePreview = $state('');
	let previousTokenResult = $state('');

	// UI state
	let showInfo = $state<Record<string, boolean>>({});
	let openCategories = $state<Record<string, boolean>>({
		entry: true,
		user: false,
		site: false,
		system: false
	});

	// Derived data
	let groupedTokens = $derived(TokenRegistry.getTokens(collection.value ?? undefined, page.data?.user));

	let filteredGroups = $derived.by(() => {
		const q = search.toLowerCase();
		const result: Record<string, TokenDefinition[]> = {};
		for (const [cat, tokens] of Object.entries(groupedTokens)) {
			const filtered = tokens.filter((t) => t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q));
			if (filtered.length > 0) result[cat] = filtered;
		}
		return result;
	});

	let availableModifiers = $derived(
		selectedToken ? modifierMetadata.filter((m) => m.accepts.includes(selectedToken!.type) || m.accepts.includes('any')) : []
	);

	let tokenResult = $derived.by(() => {
		if (!selectedToken) return '';
		let str = `{{ ${selectedToken.token}`;
		selectedModifiers.forEach((mod) => {
			str += ` | ${mod.def.name}`;
			if (mod.args.length > 0 && mod.args.some((a) => a !== undefined && a !== '')) {
				const argStr = mod.args.map((a) => (typeof a === 'string' ? `'${a}'` : String(a))).join(',');
				str += `(${argStr})`;
			}
		});
		str += ' }}';
		return str;
	});

	let rightPosition = $derived(ui.isRightSidebarVisible ? '340px' : '2rem');

	// Debounced live preview resolution
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const text = editablePreview;
		if (!text) {
			resolvedPreview = '';
			isLoadingPreview = false;
			return;
		}

		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			isLoadingPreview = true;
			try {
				const context = {
					entry: collectionValue.value,
					user: page.data.user,
					site: publicEnv,
					system: { now: nowISODateString() }
				};
				resolvedPreview = await replaceTokens(text, context);
			} catch (e) {
				console.error('Token preview resolution failed', e);
				resolvedPreview = 'Error';
			} finally {
				isLoadingPreview = false;
			}
		}, 150);
	});

	// Smart token detection from active input on open/change
	$effect(() => {
		if (!activeInput.current) {
			// Reset everything on close
			mode = 'list';
			selectedToken = null;
			selectedModifiers = [];
			search = '';
			resolvedPreview = '';
			isLoadingPreview = false;
			showInfo = {};
			editablePreview = '';
			previousTokenResult = '';
			return;
		}

		const input = activeInput.current.element;
		if (!input?.value) return;

		const match = input.value.match(/\{\{\s*([^}]+)\s*\}\}/);
		if (!match) return;

		const [tokenPath, ...modParts] = match[1].split('|').map((s: string) => s.trim());
		const foundToken = Object.values(groupedTokens)
			.flat()
			.find((t) => t.token === tokenPath);

		if (foundToken) {
			selectedToken = foundToken;
			mode = 'configure';
			selectedModifiers = modParts
				.map((modStr: string) => {
					const m = modStr.match(/^(\w+)(?:\((.*)\))?$/);
					if (!m) return null;
					const modDef = modifierMetadata.find((md) => md.name === m[1].toLowerCase());
					if (!modDef) return null;
					const rawArgs = m[2] ? m[2].split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
					const args = modDef.args.map((a, i) => rawArgs[i] ?? a.default);
					return { def: modDef, args };
				})
				.filter(Boolean) as { def: ModifierMetadata; args: unknown[] }[];
		}
	});

	// Smart editable preview handling
	$effect(() => {
		const currentToken = tokenResult;
		const active = activeInput.current;

		if (currentToken !== previousTokenResult) {
			if (previousTokenResult && editablePreview.includes(previousTokenResult)) {
				editablePreview = editablePreview.replace(previousTokenResult, currentToken);
			} else if (!editablePreview && active?.element) {
				const el = active.element;
				const start = el.selectionStart ?? el.value.length;
				editablePreview = el.value.slice(0, start) + currentToken + el.value.slice(el.selectionEnd ?? start);
			} else if (!editablePreview) {
				editablePreview = currentToken;
			}
			previousTokenResult = currentToken;
		}
	});

	// Actions
	function selectToken(t: TokenDefinition) {
		selectedToken = t;
		selectedModifiers = [];
		mode = 'configure';
		previousTokenResult = '';
		editablePreview = '';
	}

	function addModifier(m: ModifierMetadata) {
		const args = m.args.map((a) => a.default);
		selectedModifiers = [...selectedModifiers, { def: m, args }];
	}

	function removeModifier(i: number) {
		selectedModifiers = selectedModifiers.filter((_, idx) => idx !== i);
	}

	function insert() {
		const active = activeInput.current;
		if (!active) return;

		if (active.onInsert) {
			active.onInsert(editablePreview.trim());
			activeInput.set(null);
			return;
		}

		const el = active.element;
		if (!el) return;

		el.value = editablePreview.trim();
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.dispatchEvent(new Event('change', { bubbles: true }));

		activeInput.set(null);
	}

	function addAnotherToken() {
		mode = 'list';
		selectedToken = null;
		selectedModifiers = [];
		previousTokenResult = '';
	}

	function back() {
		mode = 'list';
		selectedToken = null;
		selectedModifiers = [];
		previousTokenResult = '';
	}

	function deleteToken() {
		const active = activeInput.current;
		if (!active?.element) return;

		active.element.value = '';
		active.element.dispatchEvent(new Event('input', { bubbles: true }));
		active.element.dispatchEvent(new Event('change', { bubbles: true }));
		activeInput.set(null);
	}

	function toggleInfo(token: string, e: Event) {
		e.stopPropagation();
		showInfo[token] = !showInfo[token];
	}

	// Draggable
	function draggable(node: HTMLElement) {
		let x = 0,
			y = 0;
		const container = node.closest('.token-window') as HTMLElement;
		const move = (e: MouseEvent) => {
			container.style.top = `${container.offsetTop + e.clientY - y}px`;
			container.style.left = `${container.offsetLeft + e.clientX - x}px`;
			x = e.clientX;
			y = e.clientY;
		};
		const stop = () => {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', stop);
		};
		node.addEventListener('mousedown', (e) => {
			if ((e.target as HTMLElement).closest('button')) return;
			x = e.clientX;
			y = e.clientY;
			window.addEventListener('mousemove', move);
			window.addEventListener('mouseup', stop);
		});
		return { destroy: () => node.removeEventListener('mousedown', () => {}) };
	}
</script>

{#if activeInput.current}
	<div
		class="token-window card fixed z-9999 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded border border-surface-200-700 bg-surface-100-800-token p-4 shadow-xl"
		style="bottom: 2rem; right: {rightPosition};"
		transition:fade={{ duration: 150 }}
	>
		<header use:draggable class="mb-4 flex cursor-move select-none items-center justify-between">
			<div class="flex items-center gap-3">
				{#if mode === 'configure'}
					<button onclick={back} class="btn-icon btn-icon-sm preset-outlined-surface-500" aria-label="Back">
						<iconify-icon icon="mdi:arrow-left"></iconify-icon>
					</button>
				{/if}
				<h3 class="text-lg font-bold text-tertiary-500 dark:text-primary-500">
					{mode === 'configure' ? 'Configure Token' : 'Select Token'}
					<span class="text-sm font-normal opacity-70">for</span>
					<span class="badge variant-soft-secondary">
						{activeInput.current?.field.label || activeInput.current?.field.name || 'Field'}
					</span>
				</h3>
			</div>
			<button onclick={() => activeInput.set(null)} class="btn-icon btn-icon-sm preset-outlined-surface-500" aria-label="Close">
				<iconify-icon icon="mdi:close"></iconify-icon>
			</button>
		</header>

		{#if mode === 'list'}
			<div class="relative mb-4">
				<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
				<input bind:value={search} class="input pl-10" type="search" placeholder="Search tokens..." />
			</div>

			<div class="scrollbar-thin flex-1 space-y-2 overflow-y-auto pr-1">
				{#each Object.entries(filteredGroups) as [cat, tokens] (cat)}
					<div class="card preset-tonal p-2">
						<button
							onclick={() => (openCategories[cat] = !openCategories[cat])}
							class="flex w-full items-center justify-between text-sm font-bold uppercase opacity-70 hover:opacity-100"
						>
							<div class="flex items-center gap-2">
								<iconify-icon icon={icons[cat]}></iconify-icon>
								<span>{cat}</span>
							</div>
							<iconify-icon icon="mdi:chevron-down" class="transition-transform {openCategories[cat] || search ? 'rotate-180' : ''}"></iconify-icon>
						</button>

						{#if openCategories[cat] || search}
							<div transition:slide class="mt-2 space-y-1">
								{#each tokens as t (t.token)}
									<div
										class="card preset-filled-surface-500 hover:variant-soft-primary cursor-pointer p-2 transition-colors"
										onclick={() => selectToken(t)}
										onkeydown={(e) => e.key === 'Enter' && selectToken(t)}
										tabindex="0"
										role="button"
									>
										<div class="flex items-start justify-between gap-2">
											<div class="flex-1 text-left">
												<div class="text-sm font-medium">{t.name}</div>
												<code class="code text-[10px] opacity-70">{t.token}</code>
											</div>
											<div class="flex items-center gap-1">
												<span class="badge variant-soft-secondary text-[10px] uppercase">{t.type}</span>
												<button
													onclick={(e: MouseEvent) => toggleInfo(t.token, e)}
													class="btn-icon btn-icon-sm preset-outlined-surface-500"
													aria-label="More information"
													title="Info"
												>
													<iconify-icon icon="mdi:information-outline"></iconify-icon>
												</button>
											</div>
										</div>

										{#if showInfo[t.token]}
											<div transition:slide class="mt-2 border-t border-surface-500/20 pt-2 text-xs">
												<p class="mb-2 opacity-80">{t.description}</p>
												<code class="code block overflow-x-auto p-2">
													{t.example || `{{ ${t.token} }}`}
												</code>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else if selectedToken}
			<div class="flex-1 space-y-4 overflow-y-auto pr-2">
				<!-- Token Info -->
				<div class="card variant-soft-primary border border-primary-500/30 p-4">
					<div class="mb-2 flex items-center justify-between">
						<div class="text-lg font-bold text-primary-700 dark:text-primary-400">{selectedToken.name}</div>
						<span class="badge preset-filled-primary-500">{selectedToken.type}</span>
					</div>
					<code class="code mb-2 block">{selectedToken.token}</code>
					<p class="text-sm opacity-80">{selectedToken.description}</p>
				</div>

				<!-- Applied Modifiers -->
				{#if selectedModifiers.length > 0}
					<div class="space-y-2">
						<div class="text-xs font-bold uppercase opacity-50">Applied Modifiers</div>
						{#each selectedModifiers as mod, i (mod.def.name + i)}
							<div class="card variant-ringed-surface group relative p-3">
								<div class="mb-2 flex items-center justify-between">
									<span class="font-bold text-secondary-500">{mod.def.label}</span>
									<button
										onclick={() => removeModifier(i)}
										class="btn-icon btn-icon-sm preset-outlined-error-500 text-error-500"
										aria-label="Remove modifier"
									>
										<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
									</button>
								</div>
								{#if mod.def.args.length > 0}
									<div class="space-y-2">
										{#each mod.def.args as arg, argIdx (arg.name)}
											<label class="label text-xs">
												<span class="opacity-70">{arg.name}</span>
												{#if arg.type === 'select'}
													<select bind:value={mod.args[argIdx]} class="select select-sm">
														{#each arg.options ?? [] as opt (opt)}
															<option value={opt}>{opt}</option>
														{/each}
													</select>
												{:else if arg.type === 'number'}
													<input type="number" bind:value={mod.args[argIdx]} class="input input-sm" />
												{:else}
													<input type="text" bind:value={mod.args[argIdx]} class="input input-sm" />
												{/if}
											</label>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Add Modifier -->
				<div>
					<div class="mb-2 text-xs font-bold uppercase opacity-50">Add Modifier</div>
					<div class="flex flex-wrap gap-2">
						{#each availableModifiers as m (m.name)}
							<button onclick={() => addModifier(m)} class="chip preset-filled-surface-500 hover:variant-filled-secondary transition-colors">
								<iconify-icon icon="mdi:plus"></iconify-icon>
								{m.label}
							</button>
						{/each}
						{#if availableModifiers.length === 0}
							<span class="text-xs italic opacity-50">No compatible modifiers</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="mt-4 space-y-3 border-t border-surface-500/30 pt-4">
				<div>
					<div class="mb-1 text-[10px] uppercase opacity-50">Token Editor</div>
					<textarea
						bind:value={editablePreview}
						rows="3"
						class="textarea rounded bg-surface-900 p-3 font-mono text-sm text-secondary-400"
						placeholder="Edit token syntax here..."
					></textarea>
				</div>

				<div>
					<div class="mb-1 text-[10px] uppercase opacity-50">Live Result</div>
					{#if isLoadingPreview}
						<div class="card preset-tonal animate-pulse p-3 text-sm">Resolving...</div>
					{:else}
						<div class="card variant-soft-secondary p-3 text-sm font-bold">
							{resolvedPreview || '(Empty)'}
						</div>
					{/if}
				</div>

				<div class="flex gap-2">
					<button onclick={deleteToken} class="btn variant-soft-error" title="Clear input">
						<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
					</button>
					<button onclick={addAnotherToken} class="btn preset-tonal-surface flex-1">
						<iconify-icon icon="mdi:plus"></iconify-icon>
						Add Another
					</button>
					<button onclick={insert} class="btn preset-filled-primary-500 flex-1 font-bold"> Insert Token </button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<!--
@file src/components/TokenPicker.svelte
@component
**A component for cycling through all application theme states.**
### Features:
- 
-->
<script lang="ts">
	import { activeInputStore } from '@src/stores/activeInputStore.svelte';
	import { TokenRegistry, replaceTokens } from '@src/services/token/engine';
	import { modifierMetadata } from '@src/services/token/modifiers';
	import { page } from '$app/state';
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { uiStateManager } from '@src/stores/UIStore.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { fade, slide } from 'svelte/transition';
	import { nowISODateString } from '@utils/dateUtils';
	import type { TokenDefinition, ModifierMetadata } from '@src/services/token/types';

	// Icons
	const icons: Record<string, string> = {
		entry: 'mdi:file-document-outline',
		user: 'mdi:account-circle-outline',
		site: 'mdi:web',
		system: 'mdi:cog-outline'
	};

	// --- State ---
	let mode = $state('list');
	let search = $state('');
	let selectedToken = $state<TokenDefinition | null>(null);
	let selectedModifiers = $state<{ def: ModifierMetadata; args: any[] }[]>([]);
	let resolvedPreview = $state('');
	let isLoadingPreview = $state(false);
	let debounceTimer: any;

	// Track which tokens have their info expanded in the list
	let showInfo = $state<Record<string, boolean>>({});

	let openCategories = $state<Record<string, boolean>>({ entry: true, user: false, site: false, system: false });

	$effect(() => {
		if (!activeInputStore.value) {
			mode = 'list';
			selectedToken = null;
			selectedModifiers = [];
			search = '';
			resolvedPreview = '';
			isLoadingPreview = false;
			showInfo = {};
			return;
		}

		// Smart detection: Check if input already contains a token
		const input = activeInputStore.value.element;
		if (input?.value) {
			const tokenMatch = input.value.match(/\{\{\s*([^}]+)\s*\}\}/);
			if (tokenMatch) {
				// Parse the token
				const tokenContent = tokenMatch[1];
				const [tokenPath, ...modParts] = tokenContent.split('|').map((s) => s.trim());

				// Find the token definition
				const allTokens = Object.values(groupedTokens).flat();
				const foundToken = allTokens.find((t) => t.token === tokenPath);

				if (foundToken) {
					selectedToken = foundToken;
					mode = 'configure';

					// Parse modifiers (basic parsing for now)
					selectedModifiers = modParts
						.map((modStr) => {
							const match = modStr.match(/^(\w+)(?:\((.*)\))?$/);
							if (match) {
								const modName = match[1].toLowerCase();
								const modDef = modifierMetadata.find((m) => m.name === modName);
								if (modDef) {
									const args = match[2] ? match[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
									return { def: modDef, args: args.length > 0 ? args : modDef.args.map((a) => a.default) };
								}
							}
							return null;
						})
						.filter(Boolean) as { def: ModifierMetadata; args: any[] }[];
				}
			}
		}
	});

	$effect(() => {
		// Track editablePreview for reactivity
		const previewText = editablePreview;

		if (!previewText) {
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
					system: {
						now: nowISODateString()
					}
				};

				resolvedPreview = await replaceTokens(previewText, context);
			} catch (e) {
				console.error('Failed to resolve token preview', e);
				resolvedPreview = 'Error';
			} finally {
				isLoadingPreview = false;
			}
		}, 100); // Faster debounce for local resolution
	});

	// Data
	let groupedTokens = $derived(TokenRegistry.getTokens(collection.value ?? undefined, page.data?.user));

	// Filter Logic
	let filteredGroups = $derived.by(() => {
		const q = search.toLowerCase();
		const result: Record<string, TokenDefinition[]> = {};
		for (const [cat, tokens] of Object.entries(groupedTokens)) {
			const filtered = tokens.filter((t) => t.name.toLowerCase().includes(q) || t.token.toLowerCase().includes(q));
			if (filtered.length > 0) result[cat] = filtered;
		}
		return result;
	});

	// Compatible Modifiers for Selected Token
	let availableModifiers = $derived(
		selectedToken ? modifierMetadata.filter((m) => m.accepts.includes(selectedToken!.type) || m.accepts.includes('any')) : []
	);

	// Generated Token String Preview
	let tokenResult = $derived.by(() => {
		if (!selectedToken) return '';
		let str = `{{ ${selectedToken.token}`;
		selectedModifiers.forEach((mod) => {
			str += ` | ${mod.def.name}`;
			if (mod.args.length > 0 && mod.args.some((a) => a)) {
				// Format args: date('YYYY')
				const argStr = mod.args.map((a) => (typeof a === 'string' ? `'${a}'` : a)).join(',');
				str += `(${argStr})`;
			}
		});
		str += ' }}';
		return str;
	});

	// Full input preview with token syntax (editable)
	let editablePreview = $state('');
	let previousTokenResult = '';

	// Initialize editable preview when token or input changes
	$effect(() => {
		// Track both tokenResult and activeInputStore for reactivity
		const currentToken = tokenResult;
		const currentInput = activeInputStore.value;

		// If this is the first load (previous is empty), or if we switched tokens completely
		if (!previousTokenResult) {
			if (currentInput?.element) {
				const input = currentInput.element;
				const start = input.selectionStart ?? input.value.length;
				// If the input already has this token, we might want to respect that,
				// but for now let's just insert at cursor or use the token if input is empty
				if (!editablePreview) {
					editablePreview = input.value.slice(0, start) + currentToken + input.value.slice(input.selectionEnd || start);
				}
			} else if (!editablePreview) {
				editablePreview = currentToken;
			}
		} else if (currentToken !== previousTokenResult) {
			// Smart update: If the previous token string exists in the preview, replace it with the new one
			// This preserves surrounding text that the user might have typed
			if (editablePreview.includes(previousTokenResult)) {
				editablePreview = editablePreview.replace(previousTokenResult, currentToken);
			} else {
				// Fallback: If the user deleted the token from the preview, we append the new one?
				// Or we just don't update? Let's assume if they deleted it, they might want it back if they are changing modifiers.
				// But appending might be annoying. Let's try to be safe:
				// If the preview is empty, set it.
				if (!editablePreview) {
					editablePreview = currentToken;
				}
				// If it's not empty and doesn't contain the old token, we do nothing to avoid messing up their custom text.
				// They can manually clear or re-insert if needed.
			}
		}

		previousTokenResult = currentToken;
	});

	// --- Actions ---

	function selectToken(t: TokenDefinition) {
		selectedToken = t;
		selectedModifiers = [];
		mode = 'configure';
		// Reset previous token result so the effect treats it as a fresh start
		previousTokenResult = '';
		editablePreview = ''; // Clear preview to force regeneration
	}

	function addModifier(m: ModifierMetadata) {
		// Initialize args with defaults
		const args = m.args.map((a) => a.default);
		selectedModifiers = [...selectedModifiers, { def: m, args }];
	}

	function removeModifier(index: number) {
		selectedModifiers = selectedModifiers.filter((_, i) => i !== index);
	}

	function insert() {
		const activeInput = activeInputStore.value;
		if (!activeInput) return;

		// Custom insertion handler (e.g. RichText, Rating)
		if (activeInput.onInsert) {
			activeInput.onInsert(editablePreview);
			activeInputStore.set(null);
			mode = 'list';
			return;
		}

		// Standard Input/Textarea insertion
		const input = activeInput.element;
		if (!input) return;

		// Replace the entire input value with the edited preview
		input.value = editablePreview;

		input.focus();
		input.setSelectionRange(editablePreview.length, editablePreview.length);

		// Dispatch both input and change events to ensure frameworks (like Svelte's bind:value) catch the update
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));

		// Reset
		activeInputStore.set(null);
		mode = 'list';
	}

	function addAnotherToken() {
		// Just go back to list mode to select another token
		// The current token is already in editablePreview
		mode = 'list';
		selectedToken = null;
		selectedModifiers = [];
		previousTokenResult = ''; // Reset tracking
	}

	function back() {
		mode = 'list';
		selectedToken = null;
		previousTokenResult = '';
	}

	function deleteToken() {
		const input = activeInputStore.value?.element;
		if (!input) return;

		// Clear the input value
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));

		// Close the picker
		activeInputStore.set(null);
	}

	function toggleInfo(tokenToken: string, e: Event) {
		e.stopPropagation();
		showInfo[tokenToken] = !showInfo[tokenToken];
	}

	// Draggable Logic
	function draggable(node: HTMLElement) {
		let x = 0,
			y = 0;
		const container = node.closest('.token-window') as HTMLElement;
		const move = (e: MouseEvent) => {
			container.style.top = `${container.offsetTop + (e.clientY - y)}px`;
			container.style.left = `${container.offsetLeft + (e.clientX - x)}px`;
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
	}

	// Calculate right position based on sidebar visibility
	let rightPosition = $derived(uiStateManager.uiState.value.rightSidebar !== 'hidden' ? '340px' : '2rem');
</script>

{#if activeInputStore.value}
	<div
		class="token-window card bg-surface-100 dark:bg-surface-800 border-surface-200-800 fixed z-[9999] flex max-h-[80vh] w-full max-w-md flex-col rounded border p-4 shadow-xl"
		style="bottom: 2rem; right: {rightPosition};"
		transition:fade={{ duration: 150 }}
	>
		<!-- Header -->
		<header use:draggable class="card-header mb-4 flex cursor-move select-none items-center justify-between p-0">
			<div class="flex items-center gap-2">
				{#if mode === 'configure'}
					<button onclick={back} class="preset-ghost-surface-500 btn-icon btn-icon-sm" aria-label="Back"
						><iconify-icon icon="mdi:arrow-left"></iconify-icon></button
					>
				{/if}
				<h3 class="text-lg font-bold text-tertiary-500 dark:text-primary-500">
					{#if mode === 'configure'}
						Configure Token
					{:else}
						Select Token
					{/if}
					<span class="text-sm font-normal opacity-70">for</span>
					<span class="preset-soft-secondary-500 badge">{activeInputStore.value?.field.label || activeInputStore.value?.field.name || 'Field'}</span>
				</h3>
			</div>
			<button onclick={() => activeInputStore.set(null)} class="preset-ghost-surface-500 btn-icon btn-icon-sm" aria-label="Close">
				<iconify-icon icon="mdi:close"></iconify-icon>
			</button>
		</header>

		<!-- MODE: LIST -->
		{#if mode === 'list'}
			<div class="relative mb-4">
				<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"></iconify-icon>
				<input bind:value={search} class="input pl-10" type="search" placeholder="Search tokens..." />
			</div>
			<div class="scrollbar-thin flex-1 space-y-2 overflow-y-auto pr-1">
				{#each Object.keys(filteredGroups) as cat}
					{@const tokens = filteredGroups[cat]}
					<div class="card preset-soft p-2">
						<button
							onclick={() => (openCategories[cat] = !openCategories[cat])}
							class="flex w-full items-center justify-between text-sm font-bold uppercase opacity-70 hover:opacity-100"
						>
							<div class="flex items-center gap-2"><iconify-icon icon={icons[cat]}></iconify-icon> <span>{cat}</span></div>
							<iconify-icon icon="mdi:chevron-down" class="transition-transform {openCategories[cat] || search ? 'rotate-180' : ''}"></iconify-icon>
						</button>
						{#if openCategories[cat] || search}
							<div transition:slide={{ duration: 200 }} class="mt-2 space-y-1">
								{#each tokens as t}
									<div class="card preset-filled-surface-500 cursor-pointer p-2 transition-colors hover:preset-soft-primary-500">
										<div class="flex items-start justify-between gap-2">
											<button onclick={() => selectToken(t)} class="flex-1 text-left">
												<div class="text-sm font-medium">{t.name}</div>
												<code class="code text-[10px] opacity-70">{t.token}</code>
											</button>

											<div class="flex items-center gap-1">
												<span class="preset-soft-secondary-500 badge text-[10px] uppercase">{t.type}</span>
												<button
													onclick={(e) => toggleInfo(t.token, e)}
													class="preset-ghost-surface-500 btn-icon btn-icon-sm hover:preset-filled-surface-500"
													title="Info"
												>
													<iconify-icon icon="mdi:information-outline"></iconify-icon>
												</button>
											</div>
										</div>

										{#if showInfo[t.token]}
											<div transition:slide={{ duration: 150 }} class="mt-2 border-t border-surface-500/20 pt-2 text-xs">
												<p class="mb-2 opacity-80">{t.description}</p>
												<div class="code block w-full overflow-x-auto p-2">
													{t.example || `{{${t.token}}}`}
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- MODE: CONFIGURE -->
		{#if mode === 'configure' && selectedToken}
			<div class="flex-1 space-y-4 overflow-y-auto pr-2">
				<!-- Token Info -->
				<div class="card preset-soft-primary-500 border border-primary-500/30 p-4">
					<div class="mb-2 flex items-center justify-between">
						<div class="text-lg font-bold text-primary-700 dark:text-primary-400">{selectedToken.name}</div>
						<span class="preset-filled-primary-500 badge">{selectedToken.type}</span>
					</div>
					<code class="code mb-2 block w-full">{selectedToken.token}</code>
					<p class="text-sm opacity-80">{selectedToken.description}</p>
				</div>

				<!-- Applied Modifiers -->
				{#if selectedModifiers.length > 0}
					<div class="space-y-2">
						<div class="text-xs font-bold uppercase opacity-50">Applied Modifiers</div>
						{#each selectedModifiers as mod, i}
							<div class="group card preset-ringed-surface relative p-3">
								<div class="mb-2 flex items-center justify-between">
									<span class="font-bold text-secondary-500">{mod.def.label}</span>
									<button
										onclick={() => removeModifier(i)}
										class="preset-ghost-error-500 btn-icon btn-icon-sm text-error-500"
										aria-label="Remove Modifier"
									>
										<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
									</button>
								</div>

								<!-- Modifier Arguments -->
								{#if mod.def.args.length > 0}
									<div class="space-y-2">
										{#each mod.def.args as arg, argIndex}
											<label class="label">
												<span class="text-xs opacity-70">{arg.name}</span>
												{#if arg.type === 'select'}
													<select bind:value={mod.args[argIndex]} class="select-sm select">
														{#each arg.options || [] as opt}
															<option value={opt}>{opt}</option>
														{/each}
													</select>
												{:else if arg.type === 'number'}
													<input type="number" bind:value={mod.args[argIndex]} class="input-sm input" />
												{:else}
													<input type="text" bind:value={mod.args[argIndex]} class="input-sm input" />
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
						{#each availableModifiers as m}
							<button onclick={() => addModifier(m)} class="preset-filled-surface-500 chip transition-colors hover:preset-filled-secondary-500">
								<iconify-icon icon="mdi:plus"></iconify-icon>
								<span>{m.label}</span>
							</button>
						{/each}
						{#if availableModifiers.length === 0}
							<span class="text-xs italic opacity-50">No compatible modifiers</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer Preview -->
			<div class="mt-4 space-y-3 border-t border-surface-500/30 pt-4">
				<div>
					<div class="mb-1 text-[10px] uppercase opacity-50">Token Editor</div>
					<textarea
						bind:value={editablePreview}
						class="textarea rounded bg-surface-900 p-3 font-mono text-sm text-secondary-400"
						rows="2"
						placeholder="Token code..."
					></textarea>
				</div>

				<div>
					<div class="mb-1 text-[10px] uppercase opacity-50">Result (Live)</div>
					{#if isLoadingPreview}
						<div class="card preset-soft animate-pulse p-3 text-sm">Loading...</div>
					{:else}
						<div class="card preset-soft-secondary-500 p-3 text-sm font-bold text-secondary-700 dark:text-secondary-300">
							{resolvedPreview || '(Empty)'}
						</div>
					{/if}
				</div>

				<div class="flex gap-2 pt-2">
					<button onclick={deleteToken} class="preset-soft-error-500 btn" title="Delete all tokens">
						<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
					</button>
					<button onclick={addAnotherToken} class="preset-soft-surface-500 btn flex-1 font-bold">
						<iconify-icon icon="mdi:plus"></iconify-icon>
						<span>Add Another</span>
					</button>
					<button onclick={insert} class="preset-filled-primary-500 btn flex-1 font-bold"> Insert Token </button>
				</div>
			</div>
		{/if}
	</div>
{/if}

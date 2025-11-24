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
	let mode = $state<'list' | 'configure'>('list');
	let search = $state('');
	let selectedToken = $state<TokenDefinition | null>(null);
	let selectedModifiers = $state<{ def: ModifierMetadata; args: any[] }[]>([]);
	let resolvedPreview = $state('');
	let isLoadingPreview = $state(false);
	let debounceTimer: any;

	let openCategories = $state<Record<string, boolean>>({ entry: true, user: false, site: false, system: false });

	$effect(() => {
		if (!activeInputStore.value) {
			mode = 'list';
			selectedToken = null;
			selectedModifiers = [];
			search = '';
			resolvedPreview = '';
			isLoadingPreview = false;
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
		const result: Record<string, any[]> = {};
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

	// Initialize editable preview when token or input changes
	$effect(() => {
		// Track both tokenResult and activeInputStore for reactivity
		const currentToken = tokenResult;
		const currentInput = activeInputStore.value;

		if (!currentToken) {
			editablePreview = '';
			return;
		}
		const input = currentInput?.element;
		if (input) {
			const start = input.selectionStart ?? input.value.length;
			editablePreview = input.value.slice(0, start) + currentToken + input.value.slice(input.selectionEnd || start);
		} else {
			editablePreview = currentToken;
		}
	});

	// --- Actions ---

	function selectToken(t: TokenDefinition) {
		selectedToken = t;
		selectedModifiers = [];
		mode = 'configure';
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
		const input = activeInputStore.value?.element;
		if (!input) return;

		// Replace the entire input value with the edited preview
		input.value = editablePreview;

		input.focus();
		input.setSelectionRange(editablePreview.length, editablePreview.length);
		input.dispatchEvent(new Event('input', { bubbles: true }));

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
	}

	function back() {
		mode = 'list';
		selectedToken = null;
	}

	function deleteToken() {
		const input = activeInputStore.value?.element;
		if (!input) return;

		// Clear the input value
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		// Close the picker
		activeInputStore.set(null);
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
</script>

{#if activeInputStore.value}
	<div
		class="token-window card bg-surface-100-800-token border-surface-200-700-token fixed z-[9999] flex max-h-[80vh] w-full max-w-md flex-col rounded border p-4 shadow-xl"
		style="top: 20%; right: 5%;"
		transition:fade={{ duration: 150 }}
	>
		<!-- Header -->
		<header use:draggable class="card-header mb-4 flex cursor-move select-none items-center justify-between p-0">
			<div class="flex items-center gap-2">
				{#if mode === 'configure'}
					<button onclick={back} class="variant-ghost-surface btn-icon btn-icon-sm" aria-label="Back"
						><iconify-icon icon="mdi:arrow-left"></iconify-icon></button
					>
				{/if}
				<h3 class="text-lg font-bold text-tertiary-500 dark:text-primary-500">
					{#if mode === 'configure'}
						Configure Token for <span class="variant-filled-secondary badge text-lg"
							>{activeInputStore.value?.field.label || activeInputStore.value?.field.name || 'Field'}</span
						>
					{:else}
						Select Token for <span class="variant-filled-secondary badge text-lg"
							>{activeInputStore.value?.field.label || activeInputStore.value?.field.name || 'Field'}</span
						>
					{/if}
				</h3>
			</div>
			<button onclick={() => activeInputStore.set(null)} class="variant-ghost-surface btn-icon btn-icon-sm" aria-label="Close">
				<iconify-icon icon="mdi:close"></iconify-icon>
			</button>
		</header>

		<!-- MODE: LIST -->
		{#if mode === 'list'}
			<div class="mb-4">
				<input bind:value={search} class="input" type="search" placeholder="Search tokens..." />
			</div>
			<div class="scrollbar-thin flex-1 space-y-1 overflow-y-auto pr-1">
				{#each Object.entries(filteredGroups) as [cat, tokens]}
					<div class="card variant-soft p-1">
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
									<button
										onclick={() => selectToken(t)}
										class="variant-ghost-surface btn w-full justify-between text-left hover:variant-filled-tertiary dark:hover:variant-filled-primary"
									>
										<div class="flex flex-col items-start overflow-hidden">
											<span class="w-full truncate font-medium">{t.name}</span>
											<span class="w-full truncate text-[10px] opacity-70">{t.description}</span>
										</div>
										<span class="variant-filled-secondary badge ml-2 shrink-0">{t.type}</span>
									</button>
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
				<div class="border-variant-soft card flex items-center justify-between gap-2 border p-3">
					<div class="text-lg font-bold text-primary-500">{selectedToken.name}</div>
					<code class="code">{selectedToken.token}</code>
				</div>

				<!-- Applied Modifiers -->
				{#if selectedModifiers.length > 0}
					<div class="space-y-2">
						<div class="text-xs font-bold uppercase opacity-50">Modifiers</div>
						{#each selectedModifiers as mod, i}
							<div class="group card variant-ringed-surface relative p-2">
								<div class="mb-2 flex items-center justify-between">
									<span class="font-bold text-secondary-500">{mod.def.label}</span>
									<button onclick={() => removeModifier(i)} class="variant-ghost-error btn-icon btn-icon-sm" aria-label="Remove Modifier"
										><iconify-icon icon="mdi:trash-can"></iconify-icon></button
									>
								</div>

								<!-- Modifier Arguments -->
								{#if mod.def.args.length > 0}
									<div class="space-y-2">
										{#each mod.def.args as arg, argIndex}
											<label class="label">
												<span class="text-xs">{arg.name}</span>
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
							<button onclick={() => addModifier(m)} class="variant-filled-surface chip hover:variant-filled-secondary">
								<iconify-icon icon="mdi:plus"></iconify-icon><span>{m.label}</span>
							</button>
						{/each}
						{#if availableModifiers.length === 0}
							<span class="text-xs italic opacity-50">No compatible modifiers</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer Preview -->
			<div class="mt-4 border-t border-surface-500/30 pt-4">
				<div class="mb-1 text-[10px] uppercase opacity-50">Preview (Editable)</div>
				<textarea
					bind:value={editablePreview}
					class="textarea mb-3 bg-tertiary-500/10 font-mono text-sm dark:bg-primary-500/10"
					rows="3"
					placeholder="Edit the full input with token..."
				></textarea>

				<div class="mb-1 text-[10px] uppercase opacity-50">Result</div>
				{#if isLoadingPreview}
					<div class="card variant-ringed-surface mb-3 select-none p-2 text-sm text-surface-900 dark:text-surface-50">Loading...</div>
				{:else}
					<div class="card variant-ringed-surface mb-3 select-none p-2 text-sm font-bold text-surface-900 dark:text-surface-50">
						{resolvedPreview || '(Empty)'}
					</div>
				{/if}

				<div class="flex gap-2">
					<button onclick={deleteToken} class="variant-ghost-error btn" title="Delete all tokens">
						<iconify-icon icon="mdi:delete"></iconify-icon>
					</button>
					<button onclick={addAnotherToken} class="variant-ghost-secondary btn flex-1 font-bold">
						<iconify-icon icon="mdi:plus"></iconify-icon>
						<span>Add Another Token</span>
					</button>
					<button onclick={insert} class="variant-filled-tertiary btn flex-1 font-bold dark:variant-filled-primary">Insert</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

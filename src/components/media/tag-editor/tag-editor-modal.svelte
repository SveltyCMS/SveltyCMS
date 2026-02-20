<!--
@file src/components/media/tag-editor/tag-editor-modal.svelte
@component
**A modal for managing media tags**

Features:
- AI Tagging
- Manual Tagging
- Tag Management
-->
<script lang="ts">
	import { toaster } from '@src/stores/store.svelte';
	import { logger } from '@utils/logger';
	import type { MediaImage } from '@utils/media/media-models';
	import { SvelteSet } from 'svelte/reactivity';

	// Props
	let {
		show = $bindable(),
		file = $bindable(null),
		onUpdate = () => {}
	}: {
		show: boolean;
		file: MediaImage | null;
		onUpdate?: (updatedFile: MediaImage) => void;
	} = $props();

	let newTagInput = $state('');
	let isGenerating = $state(false);
	let isSaving = $state(false);

	// Edit state
	let editingTag = $state<{
		type: 'ai' | 'user';
		index: number;
		value: string;
	} | null>(null);

	function getImageUrl(file: MediaImage) {
		// Try to get thumbnail, fallback to original url
		const thumbs = file.thumbnails || {};
		// Map common keys
		if ('sm' in thumbs) {
			return thumbs.sm.url;
		}
		if ('thumbnail' in thumbs) {
			return thumbs.thumbnail.url;
		}
		if ('md' in thumbs) {
			return thumbs.md.url;
		}
		return file.url;
	}

	async function handleAITagging() {
		if (!file?._id) {
			return;
		}
		isGenerating = true;
		try {
			const response = await fetch('/api/media/ai-tag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mediaId: file._id })
			});
			const result = await response.json();
			if (!(response.ok && result.success)) {
				throw new Error(result.error || 'Failed to generate tags');
			}

			if (file) {
				file = result.data;
				onUpdate(result.data);
			}
			toaster.success({ description: 'AI tags generated!' });
		} catch (e: any) {
			logger.error('AI Tagging error:', e);
			toaster.error({ description: e.message || 'An unexpected error occurred' });
		} finally {
			isGenerating = false;
		}
	}

	async function addManualTag() {
		if (!(file?._id && newTagInput.trim())) {
			return;
		}
		try {
			// Add to aiTags "pending" area
			const response = await fetch(`/api/media/${file._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						aiTags: [...(file.metadata?.aiTags || []), newTagInput.trim()]
					}
				})
			});
			const result = await response.json();
			if (!(response.ok && result.success)) {
				throw new Error(result.error);
			}

			if (file) {
				file = result.data;
				onUpdate(result.data);
			}
			newTagInput = '';
			toaster.success({ description: 'Tag added!' });
		} catch (e: any) {
			toaster.error({ description: e.message });
		}
	}

	async function removeTag(tag: string, type: 'ai' | 'user') {
		if (!file?._id) {
			return;
		}
		try {
			const metadata = { ...file.metadata };
			if (type === 'ai') {
				metadata.aiTags = metadata.aiTags?.filter((t) => t !== tag) || [];
			} else {
				metadata.tags = metadata.tags?.filter((t) => t !== tag) || [];
			}

			const response = await fetch(`/api/media/${file._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ metadata })
			});
			const result = await response.json();
			if (!(response.ok && result.success)) {
				throw new Error(result.error);
			}

			if (file) {
				file = result.data;
				onUpdate(result.data);
			}
		} catch (e: any) {
			toaster.error({ description: e.message });
		}
	}

	async function editTag(oldTag: string, newTag: string, type: 'ai' | 'user') {
		if (!(file?._id && newTag.trim()) || oldTag === newTag) {
			editingTag = null;
			return;
		}

		try {
			const metadata = { ...file.metadata };
			if (type === 'ai') {
				metadata.aiTags = metadata.aiTags?.map((t) => (t === oldTag ? newTag.trim() : t)) || [];
			} else {
				metadata.tags = metadata.tags?.map((t) => (t === oldTag ? newTag.trim() : t)) || [];
			}

			const response = await fetch(`/api/media/${file._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ metadata })
			});
			const result = await response.json();
			if (!(response.ok && result.success)) {
				throw new Error(result.error);
			}

			if (file) {
				file = result.data;
				onUpdate(result.data);
			}
		} catch (e: any) {
			toaster.error({ description: e.message });
		} finally {
			editingTag = null;
		}
	}

	async function saveAITags() {
		if (!file?._id) {
			return;
		}
		isSaving = true;
		try {
			// Merge AI tags into User tags
			const currentTags = new SvelteSet(file.metadata?.tags || []);
			file.metadata?.aiTags?.forEach((t) => {
				currentTags.add(t);
			});

			const response = await fetch(`/api/media/${file._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						tags: Array.from(currentTags),
						aiTags: [] // Clear AI tags after saving
					}
				})
			});
			const result = await response.json();
			if (!(response.ok && result.success)) {
				throw new Error(result.error);
			}

			if (file) {
				file = result.data;
				onUpdate(result.data);
			}
			toaster.success({ description: 'Tags saved!' });
		} catch (e: any) {
			toaster.error({ description: e.message });
		} finally {
			isSaving = false;
		}
	}

	function close() {
		show = false;
	}

	function autofocus(node: HTMLElement) {
		node.focus();
	}
</script>

{#if show && file}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={(e) => e.key === 'Escape' && close()}
	>
		<div class="card w-full max-w-lg p-4 bg-surface-100 dark:bg-surface-800 shadow-xl m-4" role="document">
			<header class="flex justify-between items-center mb-4">
				<h3 class="h3 font-bold">Manage Tags</h3>
				<button class="btn-icon btn-icon-sm" onclick={close} aria-label="Close Modal">
					<iconify-icon icon="mdi:close" width="24"></iconify-icon>
				</button>
			</header>

			<div class="space-y-4 max-h-[60vh] overflow-y-auto p-1">
				<!-- File Info Summary -->
				<div class="flex items-center gap-3 p-2 bg-surface-200 dark:bg-surface-700 rounded">
					<img src={getImageUrl(file)} alt="Thumbnail" class="w-12 h-12 object-cover rounded bg-black" />
					<div class="text-sm truncate">
						<div class="font-bold truncate">{file.filename}</div>
						<div class="opacity-70 text-xs">{file.mimeType}</div>
					</div>
				</div>

				<!-- AI/Pending Tags -->
				<section class="p-3 border border-primary-500/30 rounded bg-primary-50/50 dark:bg-primary-900/10">
					<div class="flex justify-between items-center mb-2">
						<span class="text-sm font-bold flex items-center gap-1 text-primary-600 dark:text-primary-400">
							<iconify-icon icon="mdi:robot-excited-outline"></iconify-icon>
							AI / Pending Tags
						</span>
						{#if !file.metadata?.aiTags?.length}
							<button class="btn btn-sm variant-filled-secondary" onclick={handleAITagging} disabled={isGenerating}>
								{#if isGenerating}
									<iconify-icon icon="eos-icons:loading" class="animate-spin"></iconify-icon>
								{:else}
									<iconify-icon icon="mdi:magic-staff"></iconify-icon>
									<span>Generate</span>
								{/if}
							</button>
						{/if}
					</div>

					<div class="flex flex-wrap gap-2 mb-3">
						{#if file.metadata?.aiTags?.length}
							{#each file.metadata.aiTags as tag, i (tag)}
								{#if editingTag?.type === 'ai' && editingTag.index === i}
									<input
										type="text"
										value={editingTag.value}
										class="input input-sm w-24 px-1 py-0 text-xs"
										oninput={(e) => (editingTag!.value = e.currentTarget.value)}
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'ai');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'ai')}
										use:autofocus
									/>
								{:else}
									<button
										class="badge variant-filled-secondary flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-secondary-300"
										onclick={() => (editingTag = { type: 'ai', index: i, value: tag })}
									>
										{tag}
										<span
											role="button"
											tabindex="0"
											onclick={(e) => {
												e.stopPropagation();
												removeTag(tag, 'ai');
											}}
											onkeydown={(e) => e.key === 'Enter' && removeTag(tag, 'ai')}
											aria-label="Remove Tag"
										>
											<iconify-icon icon="mdi:close" width="14"></iconify-icon>
										</span>
									</button>
								{/if}
							{/each}
						{:else}
							<div class="text-xs opacity-60 italic">No pending tags.</div>
						{/if}
					</div>

					<div class="flex gap-2">
						<input
							class="input input-sm flex-1"
							type="text"
							placeholder="Add tag manually..."
							bind:value={newTagInput}
							onkeydown={(e) => e.key === 'Enter' && addManualTag()}
						/>
						<button class="btn btn-sm variant-filled-surface" onclick={addManualTag} disabled={!newTagInput.trim()} aria-label="Add Tag">
							<iconify-icon icon="mdi:plus"></iconify-icon>
						</button>
					</div>

					{#if file.metadata?.aiTags?.length}
						<div class="mt-3 pt-3 border-t border-primary-500/20">
							<button class="btn btn-sm variant-filled-success w-full" onclick={saveAITags} disabled={isSaving}>
								<iconify-icon icon="mdi:check-all"></iconify-icon>
								<span>Save All to Media Tags</span>
							</button>
						</div>
					{/if}
				</section>

				<!-- Saved Tags -->
				<section class="p-3 border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-900">
					<div class="mb-2 text-sm font-bold opacity-80">Saved Tags</div>
					<div class="flex flex-wrap gap-2">
						{#if file.metadata?.tags?.length}
							{#each file.metadata.tags as tag, i (tag)}
								{#if editingTag?.type === 'user' && editingTag.index === i}
									<input
										type="text"
										value={editingTag.value}
										class="input input-sm w-24 px-1 py-0 text-xs"
										oninput={(e) => (editingTag!.value = e.currentTarget.value)}
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'user');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'user')}
										use:autofocus
									/>
								{:else}
									<button
										class="badge variant-filled-surface flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-surface-400"
										onclick={() => (editingTag = { type: 'user', index: i, value: tag })}
									>
										{tag}
										<span
											role="button"
											tabindex="0"
											onclick={(e) => {
												e.stopPropagation();
												removeTag(tag, 'user');
											}}
											onkeydown={(e) => e.key === 'Enter' && removeTag(tag, 'user')}
											aria-label="Remove Tag"
										>
											<iconify-icon icon="mdi:close" width="14"></iconify-icon>
										</span>
									</button>
								{/if}
							{/each}
						{:else}
							<div class="text-xs opacity-60 italic">No saved tags.</div>
						{/if}
					</div>
				</section>
			</div>
		</div>
	</div>
{/if}

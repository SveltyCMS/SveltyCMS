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
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Modal from '@components/ui/modal.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
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
		return thumbs.sm?.url || thumbs.thumbnail?.url || thumbs.md?.url || file.url;
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
			toast.success('AI tags generated!');
		} catch (e: any) {
			logger.error('AI Tagging error:', e);
			toast.error({ description: e.message || 'An unexpected error occurred' });
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
			toast.success('Tag added!');
		} catch (e: any) {
			toast.error({ description: e.message });
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
			toast.error({ description: e.message });
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
			toast.error({ description: e.message });
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
			toast.success('Tags saved!');
		} catch (e: any) {
			toast.error({ description: e.message });
		} finally {
			isSaving = false;
		}
	}

	function close() {
		show = false;
	}

</script>

{#if file}
	{@const activeFile = file}
	<Modal bind:open={show} title="Manage Tags" size="md" onclose={close}>
		{#snippet children()}
			<div class="space-y-4 max-h-[60vh] overflow-y-auto p-1">
				<!-- File Info Summary -->
				<div class="flex items-center gap-3 p-2 bg-surface-200 dark:bg-surface-700 rounded">
					<img src={getImageUrl(activeFile)} alt="Thumbnail" class="w-12 h-12 object-cover rounded bg-black" />
					<div class="text-sm truncate">
						<div class="font-bold truncate">{activeFile.filename}</div>
						<div class="opacity-70 text-xs">{activeFile.mimeType}</div>
					</div>
				</div>

				<!-- AI/Pending Tags -->
				<section class="p-3 border border-tertiary-500 dark:border-primary-500/30 rounded bg-primary-50/50 dark:bg-primary-900/10">
					<div class="flex justify-between items-center mb-2">
						<span class="text-sm font-bold flex items-center gap-1 text-tertiary-600 dark:text-primary-600 ">
							<iconify-icon icon="mdi:robot-excited-outline"></iconify-icon>
							AI / Pending Tags
						</span>
						{#if !activeFile.metadata?.aiTags?.length}
							<Button variant="outline" onclick={handleAITagging} disabled={isGenerating} aria-label="generate-ai-tags" size="sm">
								{#if isGenerating}
									<iconify-icon icon="eos-icons:loading" class="animate-spin"></iconify-icon>
								{:else}
									<iconify-icon icon="mdi:magic-staff"></iconify-icon>
									<span>Generate</span>
								{/if}
							</Button>
						{/if}
					</div>

					<div class="flex flex-wrap gap-2 mb-3">
						{#if activeFile.metadata?.aiTags?.length}
							{#each activeFile.metadata.aiTags as tag, i (tag)}
								{#if editingTag?.type === 'ai' && editingTag.index === i}
									<Input
										type="text"
										bind:value={editingTag.value}
										inputClass="h-8 w-24 px-1 py-0 text-xs"
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'ai');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'ai')}
										autofocus
										aria-label="edit-ai-tag"
									/>
								{:else}
									<Button variant="outline"
										size="sm"
										onclick={() => (editingTag = { type: 'ai', index: i, value: tag })}
																			aria-label="edit-ai-tag"
																		 class="flex items-center gap-1 hover:ring-2 hover:ring-secondary-300">
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
									</Button>
								{/if}
							{/each}
						{:else}
							<div class="text-xs opacity-60 italic">No pending tags.</div>
						{/if}
					</div>

					<div class="flex gap-2">
						<Input
							type="text"
							label="Add tag manually..."
							bind:value={newTagInput}
							onkeydown={(e) => e.key === 'Enter' && addManualTag()}
							inputClass="h-8 text-xs"
							class="flex-1"
							aria-label="add-tag-manually"
						/>
						<Button variant="outline" onclick={addManualTag} disabled={!newTagInput.trim()} aria-label="Add Tag" size="sm">
							<iconify-icon icon="mdi:plus"></iconify-icon>
						</Button>
					</div>

					{#if activeFile.metadata?.aiTags?.length}
						<div class="mt-3 pt-3 border-t border-tertiary-500 dark:border-primary-500/20">
							<Button variant="outline" onclick={saveAITags} disabled={isSaving} aria-label="save-all-tags" size="sm" class="w-full">
								<iconify-icon icon="mdi:check-all"></iconify-icon>
								<span>Save All to Media Tags</span>
							</Button>
						</div>
					{/if}
				</section>

				<!-- Saved Tags -->
				<section class="p-3 border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-900">
					<div class="mb-2 text-sm font-bold opacity-80">Saved Tags</div>
					<div class="flex flex-wrap gap-2">
						{#if activeFile.metadata?.tags?.length}
							{#each activeFile.metadata.tags as tag, i (tag)}
								{#if editingTag?.type === 'user' && editingTag.index === i}
									<Input
										type="text"
										bind:value={editingTag.value}
										inputClass="h-8 w-24 px-1 py-0 text-xs"
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'user');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'user')}
										autofocus
										aria-label="edit-saved-tag"
									/>
								{:else}
									<Button variant="outline"
										size="sm"
										onclick={() => (editingTag = { type: 'user', index: i, value: tag })}
																			aria-label="edit-saved-tag"
																		 class="flex items-center gap-1 hover:ring-2 hover:ring-surface-400">
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
									</Button>
								{/if}
							{/each}
						{:else}
							<div class="text-xs opacity-60 italic">No saved tags.</div>
						{/if}
					</div>
				</section>
			</div>
		{/snippet}
	</Modal>
{/if}

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
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Modal from '@components/ui/modal.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import type { MediaImage } from '@utils/media/media-models';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		show = $bindable(),
		file = $bindable(null),
		onUpdate = () => {},
		hideGenerate = false
	}: {
		show: boolean;
		file: MediaImage | null;
		onUpdate?: (updatedFile: MediaImage) => void;
		hideGenerate?: boolean;
	} = $props();

	let newTagInput = $state('');
	let isGenerating = $state(false);
	let isSaving = $state(false);

	let editingTag = $state<{
		type: 'ai' | 'user';
		index: number;
		value: string;
	} | null>(null);

	function getImageUrl(activeFile: MediaImage) {
		const thumbs = activeFile.thumbnails || {};
		return thumbs.sm?.url || thumbs.thumbnail?.url || thumbs.md?.url || activeFile.url;
	}

	function formatMimeType(mime: string | undefined) {
		if (!mime) return 'UNKNOWN';
		return mime.split('/')[1]?.toUpperCase() || mime.toUpperCase();
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
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'An unexpected error occurred';
			logger.error('AI Tagging error:', e);
			toast.error({ description: message });
		} finally {
			isGenerating = false;
		}
	}

	async function addManualTag() {
		if (!(file?._id && newTagInput.trim())) {
			return;
		}
		try {
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
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Failed to add tag';
			toast.error({ description: message });
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
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Failed to remove tag';
			toast.error({ description: message });
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
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Failed to update tag';
			toast.error({ description: message });
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
						aiTags: []
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
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Failed to save tags';
			toast.error({ description: message });
		} finally {
			isSaving = false;
		}
	}

	function close() {
		show = false;
	}

	function handleTagInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void addManualTag();
		}
	}
</script>

{#if file}
	{@const activeFile = file}
	{@const pendingCount = activeFile.metadata?.aiTags?.length ?? 0}
	{@const savedCount = activeFile.metadata?.tags?.length ?? 0}

	<Modal
		bind:open={show}
		size="lg"
		dialogClass="tag-editor-dialog max-md:flex-col max-md:justify-end max-md:items-stretch max-md:p-0"
		headerClass="max-md:px-4 max-md:py-3"
		contentClass="max-md:flex-none max-md:overflow-y-auto max-md:p-0 md:p-5"
		class="tag-editor-modal w-full max-w-lg max-md:m-0 max-md:h-auto max-md:max-h-[90dvh] max-md:w-full max-md:max-w-none max-md:shrink-0 max-md:rounded-none max-md:border-0 max-md:border-t max-md:shadow-2xl"
		onclose={close}
	>
		{#snippet header()}
			<div class="flex min-w-0 flex-1 items-center gap-3 pe-1">
				<div
					class="media-checkerboard flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 md:h-12 md:w-12 dark:border-surface-700"
				>
					<img src={getImageUrl(activeFile)} alt="" class="h-full w-full object-cover" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-[10px] font-bold uppercase tracking-[0.08em] text-surface-500 dark:text-surface-400">
						Manage Tags
					</p>
					<p
						class="truncate text-sm font-semibold text-surface-900 md:text-base dark:text-surface-50"
						title={activeFile.filename}
					>
						{activeFile.filename}
					</p>
					<p class="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
						{formatMimeType(activeFile.mimeType)}
						{#if pendingCount > 0 || savedCount > 0}
							<span class="text-surface-400 dark:text-surface-500"> · </span>
							<span class="text-primary-500">{pendingCount + savedCount} tags</span>
						{/if}
					</p>
				</div>
			</div>
		{/snippet}

		{#snippet children()}
			<div
				class="tag-editor-body flex flex-col max-md:px-4 max-md:pt-4 max-md:pb-5 md:max-h-[min(68dvh,30rem)] md:overflow-y-auto"
				data-testid="tag-editor-body"
			>
				<!-- AI / Pending -->
				<section class="flex flex-col gap-2.5 border-b border-surface-200 pb-3 md:gap-3 md:pb-4 dark:border-surface-800">
					<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
						<div class="min-w-0">
							<h3 class="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-surface-800 dark:text-surface-100">
								<iconify-icon icon="mdi:robot-outline" width="16" class="shrink-0 text-primary-500"></iconify-icon>
								<span>AI / Pending</span>
								{#if pendingCount > 0}
									<Badge variant="primary" preset="tonal" size="sm">{pendingCount}</Badge>
								{/if}
							</h3>
							<p class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
								Review suggestions before saving to the asset.
							</p>
						</div>
						{#if pendingCount === 0 && !hideGenerate}
							<Button
								color="var(--color-primary-500)"
								size="sm"
								onclick={handleAITagging}
								disabled={isGenerating}
								aria-label="Generate AI tags"
								class="h-10 w-full gap-1.5 md:h-9 md:w-auto md:shrink-0 md:px-3"
							>
								{#if isGenerating}
									<iconify-icon icon="mdi:loading" width="15" class="animate-spin"></iconify-icon>
								{:else}
									<iconify-icon icon="mdi:magic-staff" width="15"></iconify-icon>
								{/if}
								<span>Generate</span>
							</Button>
						{/if}
					</div>

					<div class="flex min-h-6 flex-wrap gap-1.5">
						{#if pendingCount > 0}
							{#each activeFile.metadata!.aiTags! as tag, i (tag)}
								{#if editingTag?.type === 'ai' && editingTag.index === i}
									<input
										type="text"
										bind:value={editingTag.value}
										class="h-7 w-28 rounded-md border border-surface-300 bg-surface-50 px-2 text-xs text-surface-900 outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-50"
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'ai');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'ai')}
										aria-label="Edit AI tag"
									/>
								{:else}
									<Badge variant="primary" preset="tonal" size="sm" class="gap-1 pe-1">
										<button
											type="button"
											class="max-w-[8.5rem] truncate"
											onclick={() => (editingTag = { type: 'ai', index: i, value: tag })}
											aria-label="Edit tag {tag}"
										>
											{tag}
										</button>
										<button
											type="button"
											class="rounded-full p-0.5 text-surface-500 hover:text-error-500"
											onclick={() => removeTag(tag, 'ai')}
											aria-label="Remove tag {tag}"
										>
											<iconify-icon icon="mdi:close" width="12"></iconify-icon>
										</button>
									</Badge>
								{/if}
							{/each}
						{:else}
							<span class="text-xs text-surface-500 dark:text-surface-400">No pending tags yet.</span>
						{/if}
					</div>

					<div class="flex items-center gap-2">
						<Input
							type="text"
							bind:value={newTagInput}
							placeholder="Add tag…"
							aria-label="Add tag manually"
							inputClass="h-10 text-sm md:h-9"
							class="min-w-0 flex-1"
							onkeydown={handleTagInputKeydown}
						/>
						<Button
							variant="surface"
							size="sm"
							onclick={addManualTag}
							disabled={!newTagInput.trim()}
							aria-label="Add tag"
							class="h-10 shrink-0 px-4 md:h-9 md:px-3"
						>
							Add
						</Button>
					</div>

					{#if pendingCount > 0}
						<Button
							color="var(--color-primary-500)"
							size="sm"
							onclick={saveAITags}
							disabled={isSaving}
							aria-label="Save all tags to media"
							class="h-10 w-full gap-1.5 md:h-9"
						>
							{#if isSaving}
								<iconify-icon icon="mdi:loading" width="16" class="animate-spin"></iconify-icon>
							{:else}
								<iconify-icon icon="mdi:check-all" width="16"></iconify-icon>
							{/if}
							<span>Save {pendingCount} to Media Tags</span>
						</Button>
					{/if}
				</section>

				<!-- Saved Tags -->
				<section class="flex flex-col gap-2.5 pt-3 md:gap-3 md:pt-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<h3 class="flex items-center gap-1.5 text-sm font-semibold text-surface-800 dark:text-surface-100">
								<span>Saved Tags</span>
								{#if savedCount > 0}
									<Badge variant="surface" preset="tonal" size="sm">{savedCount}</Badge>
								{/if}
							</h3>
							<p class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
								Published on this asset in the gallery.
							</p>
						</div>
					</div>

					<div class="flex min-h-6 flex-wrap gap-1.5">
						{#if savedCount > 0}
							{#each activeFile.metadata!.tags! as tag, i (tag)}
								{#if editingTag?.type === 'user' && editingTag.index === i}
									<input
										type="text"
										bind:value={editingTag.value}
										class="h-7 w-28 rounded-md border border-surface-300 bg-surface-50 px-2 text-xs text-surface-900 outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-50"
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'user');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'user')}
										aria-label="Edit saved tag"
									/>
								{:else}
									<Badge variant="surface" preset="tonal" size="sm" class="gap-1 pe-1">
										<button
											type="button"
											class="max-w-[8.5rem] truncate"
											onclick={() => (editingTag = { type: 'user', index: i, value: tag })}
											aria-label="Edit tag {tag}"
										>
											{tag}
										</button>
										<button
											type="button"
											class="rounded-full p-0.5 text-surface-500 hover:text-error-500"
											onclick={() => removeTag(tag, 'user')}
											aria-label="Remove tag {tag}"
										>
											<iconify-icon icon="mdi:close" width="12"></iconify-icon>
										</button>
									</Badge>
								{/if}
							{/each}
						{:else}
							<span class="text-xs text-surface-500 dark:text-surface-400">No saved tags on this file.</span>
						{/if}
					</div>
				</section>
			</div>
		{/snippet}
	</Modal>
{/if}

<style>
	/* Mobile: full-width bottom sheet, height fits content — no viewport stretch */
	@media (max-width: 767px) {
		:global(dialog.tag-editor-dialog[open]) {
			display: flex;
			flex-direction: column;
			justify-content: flex-end;
			align-items: stretch;
			padding: 0;
		}

		:global(dialog.tag-editor-dialog > [data-dialog-content].tag-editor-modal) {
			width: 100%;
			max-width: 100%;
			margin: 0;
			height: auto;
			min-height: 0;
			max-height: 90dvh;
			flex: 0 1 auto;
		}
	}

	.media-checkerboard {
		background-color: var(--color-surface-100);
		background-image:
			linear-gradient(45deg, var(--color-surface-200) 25%, transparent 25%),
			linear-gradient(-45deg, var(--color-surface-200) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--color-surface-200) 75%),
			linear-gradient(-45deg, transparent 75%, var(--color-surface-200) 75%);
		background-size: 10px 10px;
		background-position:
			0 0,
			0 5px,
			5px -5px,
			-5px 0;
	}

	:global(.dark) .media-checkerboard {
		background-color: var(--color-surface-900);
		background-image:
			linear-gradient(45deg, var(--color-surface-800) 25%, transparent 25%),
			linear-gradient(-45deg, var(--color-surface-800) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--color-surface-800) 75%),
			linear-gradient(-45deg, transparent 75%, var(--color-surface-800) 75%);
	}
</style>

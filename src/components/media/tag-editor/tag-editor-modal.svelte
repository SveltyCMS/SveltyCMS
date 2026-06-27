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
	let tagInputRef = $state<HTMLInputElement | null>(null);
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
			tagInputRef?.blur();
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
		class="tag-editor-modal w-full max-w-xl max-md:max-w-none"
		onclose={close}
	>
		{#snippet header()}
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<div
					class="media-checkerboard tag-editor-thumb flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700"
				>
					<img src={getImageUrl(activeFile)} alt="" class="h-full w-full object-cover" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-[10px] font-bold uppercase tracking-[0.08em] text-surface-500 dark:text-surface-400">
						Manage Tags
					</p>
					<p
						class="truncate text-sm font-semibold text-surface-900 dark:text-surface-50"
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
			<div class="tag-editor-body -mx-4 flex max-h-[min(72dvh,34rem)] flex-col overflow-y-auto sm:-mx-6">
				<section class="tag-editor-section tag-editor-section--accent">
					<div class="tag-editor-section-head">
						<div class="min-w-0">
							<h3 class="flex items-center gap-1.5 text-sm font-semibold text-surface-900 dark:text-surface-50">
								<iconify-icon icon="mdi:robot-outline" width="17" class="text-primary-500"></iconify-icon>
								AI / Pending
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
								class="h-9 shrink-0 gap-1.5 px-3"
							>
								{#if isGenerating}
									<iconify-icon icon="mdi:loading" width="16" class="animate-spin"></iconify-icon>
								{:else}
									<iconify-icon icon="mdi:magic-staff" width="16"></iconify-icon>
								{/if}
								<span class="hidden sm:inline">Generate</span>
							</Button>
						{/if}
					</div>

					<div class="tag-editor-tags">
						{#if pendingCount > 0}
							{#each activeFile.metadata!.aiTags! as tag, i (tag)}
								{#if editingTag?.type === 'ai' && editingTag.index === i}
									<input
										type="text"
										bind:value={editingTag.value}
										class="tag-editor-edit-input"
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'ai');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'ai')}
										aria-label="Edit AI tag"
									/>
								{:else}
									<Badge variant="primary" preset="tonal" size="sm" class="tag-editor-chip">
										<button
											type="button"
											class="max-w-[9rem] truncate"
											onclick={() => (editingTag = { type: 'ai', index: i, value: tag })}
											aria-label="Edit tag {tag}"
										>
											{tag}
										</button>
										<button
											type="button"
											class="tag-editor-chip-remove"
											onclick={() => removeTag(tag, 'ai')}
											aria-label="Remove tag {tag}"
										>
											<iconify-icon icon="mdi:close" width="12"></iconify-icon>
										</button>
									</Badge>
								{/if}
							{/each}
						{:else}
							<div class="tag-editor-empty">
								<iconify-icon icon="mdi:tag-off-outline" width="22" class="text-surface-400"></iconify-icon>
								<p>No pending tags yet.</p>
							</div>
						{/if}
					</div>

					<div class="tag-editor-input-pill">
						<input
							bind:this={tagInputRef}
							type="text"
							bind:value={newTagInput}
							placeholder="Add tag…"
							class="tag-editor-input"
							aria-label="Add tag manually"
							onkeydown={handleTagInputKeydown}
						/>
						<button
							type="button"
							class="tag-editor-input-confirm"
							onclick={addManualTag}
							disabled={!newTagInput.trim()}
							aria-label="Add tag"
						>
							<iconify-icon icon="mdi:check-bold" width="16"></iconify-icon>
						</button>
					</div>

					{#if pendingCount > 0}
						<Button
							color="var(--color-primary-500)"
							size="sm"
							onclick={saveAITags}
							disabled={isSaving}
							aria-label="Save all tags to media"
							class="h-10 w-full gap-1.5"
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

				<section class="tag-editor-section">
					<div class="tag-editor-section-head">
						<div>
							<h3 class="text-sm font-semibold text-surface-900 dark:text-surface-50">Saved Tags</h3>
							<p class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
								Published on this asset in the gallery.
							</p>
						</div>
						{#if savedCount > 0}
							<span class="tag-editor-count">{savedCount}</span>
						{/if}
					</div>

					<div class="tag-editor-tags">
						{#if savedCount > 0}
							{#each activeFile.metadata!.tags! as tag, i (tag)}
								{#if editingTag?.type === 'user' && editingTag.index === i}
									<input
										type="text"
										bind:value={editingTag.value}
										class="tag-editor-edit-input"
										onkeydown={(e) => {
											if (e.key === 'Enter') editTag(tag, editingTag!.value, 'user');
											if (e.key === 'Escape') editingTag = null;
										}}
										onblur={() => editTag(tag, editingTag!.value, 'user')}
										aria-label="Edit saved tag"
									/>
								{:else}
									<Badge variant="surface" preset="tonal" size="sm" class="tag-editor-chip">
										<button
											type="button"
											class="max-w-[9rem] truncate"
											onclick={() => (editingTag = { type: 'user', index: i, value: tag })}
											aria-label="Edit tag {tag}"
										>
											{tag}
										</button>
										<button
											type="button"
											class="tag-editor-chip-remove"
											onclick={() => removeTag(tag, 'user')}
											aria-label="Remove tag {tag}"
										>
											<iconify-icon icon="mdi:close" width="12"></iconify-icon>
										</button>
									</Badge>
								{/if}
							{/each}
						{:else}
							<div class="tag-editor-empty">
								<iconify-icon icon="mdi:bookmark-outline" width="22" class="text-surface-400"></iconify-icon>
								<p>No saved tags on this file.</p>
							</div>
						{/if}
					</div>
				</section>
			</div>
		{/snippet}
	</Modal>
{/if}

<style>
	:global(.tag-editor-modal) {
		overflow: hidden;
	}

	.tag-editor-thumb {
		width: 3.25rem;
		height: 3.25rem;
	}

	@media (min-width: 640px) {
		.tag-editor-thumb {
			width: 3.75rem;
			height: 3.75rem;
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

	.tag-editor-section {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		padding: 1rem 1rem 1.125rem;
		border-top: 1px solid var(--color-surface-200);
	}

	:global(.dark) .tag-editor-section {
		border-top-color: var(--color-surface-800);
	}

	.tag-editor-section--accent {
		border-top: none;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--color-primary-500) 8%, transparent) 0%,
			transparent 100%
		);
	}

	.tag-editor-section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.tag-editor-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		height: 1.5rem;
		padding-inline: 0.375rem;
		font-size: 0.6875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-surface-700);
		background: var(--color-surface-200);
		border-radius: 9999px;
	}

	:global(.dark) .tag-editor-count {
		color: var(--color-surface-200);
		background: var(--color-surface-800);
	}

	.tag-editor-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		min-height: 2rem;
	}

	:global(.tag-editor-chip) {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem;
		max-width: 100%;
	}

	.tag-editor-chip-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.125rem;
		color: var(--color-surface-500);
		border-radius: 9999px;
		transition: color 0.15s ease;
	}

	.tag-editor-chip-remove:hover {
		color: var(--color-error-500);
	}

	.tag-editor-empty {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 1.25rem 0.75rem;
		text-align: center;
		border: 1px dashed var(--color-surface-300);
		border-radius: 0.625rem;
	}

	:global(.dark) .tag-editor-empty {
		border-color: var(--color-surface-700);
	}

	.tag-editor-empty p {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-surface-500);
	}

	.tag-editor-input-pill {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		height: 2.5rem;
		padding: 0.1875rem 0.1875rem 0.1875rem 0.875rem;
		background: var(--color-surface-50);
		border: 1px solid var(--color-surface-300);
		border-radius: 9999px;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	:global(.dark) .tag-editor-input-pill {
		background: var(--color-surface-900);
		border-color: var(--color-surface-700);
	}

	.tag-editor-input-pill:focus-within {
		border-color: color-mix(in srgb, var(--color-primary-500) 55%, var(--color-surface-300));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 18%, transparent);
	}

	.tag-editor-input {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0;
		font-size: 0.8125rem;
		color: var(--color-surface-900);
		background: transparent;
		border: none;
		outline: none;
	}

	:global(.dark) .tag-editor-input {
		color: var(--color-surface-50);
	}

	.tag-editor-input::placeholder {
		color: var(--color-surface-500);
	}

	.tag-editor-input-confirm {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		color: white;
		cursor: pointer;
		background: var(--color-primary-500);
		border: none;
		border-radius: 9999px;
		transition:
			transform 0.1s ease,
			opacity 0.15s ease,
			background 0.15s ease;
	}

	.tag-editor-input-confirm:hover:not(:disabled) {
		background: var(--color-primary-600);
	}

	.tag-editor-input-confirm:active:not(:disabled) {
		transform: scale(0.94);
	}

	.tag-editor-input-confirm:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	.tag-editor-edit-input {
		height: 1.75rem;
		width: 7rem;
		padding-inline: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-surface-900);
		background: var(--color-surface-50);
		border: 1px solid var(--color-surface-300);
		border-radius: 0.375rem;
		outline: none;
	}

	:global(.dark) .tag-editor-edit-input {
		color: var(--color-surface-50);
		background: var(--color-surface-900);
		border-color: var(--color-surface-700);
	}

	.tag-editor-edit-input:focus-visible {
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary-500) 20%, transparent);
	}
</style>

<!--
@file src/routes/(app)/mediagallery/MediaGrid.svelte
@component
**Grid view component for the media gallery. Displays media items in a responsive grid layout with file information and actions**

```tsx
<MediaGrid filteredFiles={filteredFiles} gridSize="small" />
```
#### Props
- `filteredFiles: MediaBase[]`: An array of media items to be displayed in the grid view.
- `gridSize: 'small' | 'medium' | 'large'`: The size of the grid layout to be used.	

Key features:
- Responsive grid layout for media items
- Display of file name, size, and type
- Thumbnail preview for images
- Actions for file info, edit, and delete
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
-->

<script lang="ts">
	// Utils
	import { formatBytes } from '@utils/utils';
	import { logger } from '@utils/logger';
	import type { MediaImage, MediaBase } from '@utils/media/mediaModels';

	// Skeleton
	import { toaster } from '@stores/store.svelte';

	// Svelte transitions
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onBulkDelete?: (files: (MediaBase | MediaImage)[]) => void;
		onEditImage?: (file: MediaImage) => void;
		onsizechange?: (detail: { size: string; type: string }) => void;
	}

	const {
		filteredFiles = $bindable([]),
		gridSize = 'medium',
		ondeleteImage = () => {},
		onBulkDelete = () => {},
		onEditImage = () => {},
		onsizechange = () => {}
	}: Props = $props();

	let showInfo = $state<boolean[]>([]);
	let selectedFiles = $state<Set<string>>(new Set());
	let isSelectionMode = $state(false);
	let isTagging = $state<Record<string, boolean>>({});
	let editingTag = $state<{ fileId: string; tagIndex: number; value: string } | null>(null);
	let newTagInput = $state<Record<string, string>>({});
	let showTags = $state<Record<string, boolean>>({});

	async function handleAITagging(file: MediaImage) {
		const mediaId = file._id;
		if (!mediaId) return;

		isTagging[mediaId] = true;
		toaster.info({ description: 'Generating AI tags...' });

		try {
			const response = await fetch('/api/media/ai-tag', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mediaId })
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to get AI tags.');
			}

			// Update the file in the local state to be reactive
			const index = filteredFiles.findIndex((f) => f._id === mediaId);
			if (index !== -1) {
				filteredFiles[index] = result.data;
			}

			toaster.success({ description: result.message || 'AI tags generated!' });
		} catch (err) {
			logger.error('Failed to generate AI tags', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		} finally {
			isTagging[mediaId] = false;
		}
	}

	async function saveAITags(file: MediaImage) {
		const mediaId = file._id;
		if (!mediaId || !file.metadata?.aiTags) return;

		try {
			const response = await fetch(`/api/media/${mediaId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						tags: [...(file.metadata.tags || []), ...file.metadata.aiTags],
						aiTags: [] // Clear AI tags after saving
					}
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to save tags.');
			}

			// Update local state
			const index = filteredFiles.findIndex((f) => f._id === mediaId);
			if (index !== -1) {
				filteredFiles[index] = result.data;
			}

			toaster.success({ description: 'Tags saved successfully!' });
		} catch (err) {
			logger.error('Failed to save tags', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		}
	}

	async function removeAITag(file: MediaImage, tagToRemove: string) {
		const mediaId = file._id;
		if (!mediaId || !file.metadata?.aiTags) return;

		const updatedAITags = file.metadata.aiTags.filter((tag) => tag !== tagToRemove);

		try {
			const response = await fetch(`/api/media/${mediaId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						aiTags: updatedAITags
					}
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to remove tag.');
			}

			// Data updated on server - parent component will refresh
		} catch (err) {
			logger.error('Failed to remove tag', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		}
	}

	async function editAITag(file: MediaImage, oldTag: string, newTag: string) {
		const mediaId = file._id;
		if (!mediaId || !file.metadata?.aiTags || !newTag.trim()) return;

		const updatedAITags = file.metadata.aiTags.map((tag) => (tag === oldTag ? newTag.trim() : tag));

		try {
			const response = await fetch(`/api/media/${mediaId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						aiTags: updatedAITags
					}
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to edit tag.');
			}

			// Data updated on server - parent component will refresh
			editingTag = null;
		} catch (err) {
			logger.error('Failed to edit tag', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		}
	}

	async function addManualTag(file: MediaImage) {
		const mediaId = file._id;
		if (!mediaId) return;

		const newTag = newTagInput[mediaId]?.trim();
		if (!newTag) return;

		try {
			const response = await fetch(`/api/media/${mediaId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						aiTags: [...(file.metadata?.aiTags || []), newTag]
					}
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to add tag.');
			}

			// Data updated on server - parent component will refresh
			newTagInput[mediaId] = '';
			toaster.success({ description: 'Tag added!' });
		} catch (err) {
			logger.error('Failed to add tag', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		}
	}

	async function editUserTag(file: MediaImage, oldTag: string, newTag: string) {
		const mediaId = file._id;
		if (!mediaId || !file.metadata?.tags || !newTag.trim()) return;

		const updatedTags = file.metadata.tags.map((tag) => (tag === oldTag ? newTag.trim() : tag));

		console.log('Editing user tag:', { mediaId, oldTag, newTag, updatedTags });

		try {
			const response = await fetch(`/api/media/${mediaId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						tags: updatedTags
					}
				})
			});

			console.log('Edit response status:', response.status);
			const result = await response.json();
			console.log('Edit response:', result);

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to edit tag.');
			}

			// Data updated on server - parent component will refresh
			editingTag = null;
		} catch (err) {
			console.error('Edit tag error:', err);
			logger.error('Failed to edit tag', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		}
	}

	async function removeUserTag(file: MediaImage, tagToRemove: string) {
		const mediaId = file._id;
		if (!mediaId || !file.metadata?.tags) return;

		const updatedTags = file.metadata.tags.filter((tag) => tag !== tagToRemove);

		try {
			const response = await fetch(`/api/media/${mediaId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					metadata: {
						...file.metadata,
						tags: updatedTags
					}
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Failed to remove tag.');
			}

			// Data updated on server - parent component will refresh
		} catch (err) {
			logger.error('Failed to remove tag', err);
			toaster.error({ description: err instanceof Error ? err.message : 'An error occurred.' });
		}
	}

	function handleDelete(file: MediaBase | MediaImage) {
		ondeleteImage(file);
	}

	function toggleSelection(file: MediaBase | MediaImage) {
		const fileId = file._id?.toString() || file.filename;
		if (selectedFiles.has(fileId)) {
			selectedFiles.delete(fileId);
		} else {
			selectedFiles.add(fileId);
		}
		selectedFiles = selectedFiles; // Trigger reactivity
	}

	function selectAll() {
		selectedFiles = new Set(filteredFiles.map((f) => f._id?.toString() || f.filename));
	}

	function deselectAll() {
		selectedFiles = new Set();
	}

	function handleBulkDelete() {
		const filesToDelete = filteredFiles.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToDelete.length > 0) {
			onBulkDelete(filesToDelete);
			selectedFiles = new Set();
			isSelectionMode = false;
		}
	}

	// Update showInfo array when filteredFiles length changes
	$effect(() => {
		showInfo = Array.from({ length: filteredFiles.length }, () => false);
	});

	// Helper function to truncate filename intelligently
	function truncateFilename(filename: string, maxLength: number = 25): string {
		if (!filename || filename.length <= maxLength) return filename;

		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			// No extension, just truncate
			return filename.slice(0, maxLength - 3) + '...';
		}

		const extension = filename.slice(lastDotIndex);
		const nameWithoutExt = filename.slice(0, lastDotIndex);
		const availableLength = maxLength - extension.length - 3; // 3 for '...'

		if (availableLength < 5) {
			// If name would be too short, just show first part + extension
			return filename.slice(0, maxLength - extension.length - 3) + '...' + extension;
		}

		return nameWithoutExt.slice(0, availableLength) + '...' + extension;
	}

	// Autofocus action
	function autofocus(node: HTMLElement) {
		node.focus();
	}

	function getThumbnails(file: MediaBase | MediaImage) {
		return 'thumbnails' in file ? file.thumbnails || {} : {};
	}

	function getThumbnail(file: MediaBase | MediaImage, size: string) {
		const thumbnails = getThumbnails(file);
		return thumbnails ? thumbnails[size as keyof typeof thumbnails] : undefined;
	}

	function getImageUrl(file: MediaBase | MediaImage, size: string) {
		const thumbnail = getThumbnail(file, size);
		return thumbnail?.url || (file as any).url;
	}
</script>

<div class="flex flex-wrap items-center gap-4 overflow-auto">
	{#if filteredFiles.length === 0}
		<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
			<p class="text-lg">No media found</p>
		</div>
	{:else}
		<!-- Batch Operations Toolbar -->
		<div class="mb-4 flex w-full items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700">
			<div class="flex items-center gap-2">
				<button
					onclick={() => {
						isSelectionMode = !isSelectionMode;
						selectedFiles = new Set();
					}}
					class="preset-ghost-surface-500 btn btn-sm"
					aria-label="Toggle selection mode"
				>
					<iconify-icon icon={isSelectionMode ? 'mdi:close' : 'mdi:checkbox-multiple-marked'} width="20"></iconify-icon>
					{isSelectionMode ? 'Cancel' : 'Select'}
				</button>

				{#if isSelectionMode}
					<button onclick={selectAll} class="preset-ghost-surface-500 btn btn-sm">
						<iconify-icon icon="mdi:select-all" width="20"></iconify-icon>
						Select All
					</button>
					<button onclick={deselectAll} class="preset-ghost-surface-500 btn btn-sm">
						<iconify-icon icon="mdi:select-off" width="20"></iconify-icon>
						Deselect All
					</button>
				{/if}
			</div>

			{#if selectedFiles.size > 0}
				<div class="flex items-center gap-2">
					<span class="text-sm">{selectedFiles.size} selected</span>
					<button onclick={handleBulkDelete} class="preset-filled-error-500 btn btn-sm">
						<iconify-icon icon="mdi:delete" width="20"></iconify-icon>
						Delete Selected
					</button>
				</div>
			{/if}
		</div>

		{#each filteredFiles as file, index (file._id?.toString() || file.filename)}
			{@const fileId = file._id?.toString() || file.filename}
			{@const isSelected = selectedFiles.has(fileId)}
			<div
				onmouseenter={() => (showInfo[index] = true)}
				onmouseleave={() => (showInfo[index] = false)}
				onclick={() => isSelectionMode && toggleSelection(file)}
				onkeydown={(e) => {
					if (isSelectionMode && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						toggleSelection(file);
					}
				}}
				role="button"
				tabindex="0"
				class="card relative border border-surface-300 dark:border-surface-500 {isSelected ? 'ring-2 ring-primary-500' : ''}"
				in:scale={{ duration: 300, start: 0.9, opacity: 0, easing: quintOut }}
				out:scale={{ duration: 250, start: 0.95, opacity: 0, easing: quintOut }}
			>
				{#if isSelectionMode}
					<div class="absolute left-2 top-2 z-10">
						<input type="checkbox" checked={isSelected} onchange={() => toggleSelection(file)} class="checkbox" aria-label="Select file" />
					</div>
				{/if}

				<header class="m-2 flex w-auto items-center justify-between">
					<button aria-label="File Info" class="btn-icon" title="File Info">
						<iconify-icon icon="raphael:info" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					</button>
					<table class=" w-full table-auto">
						<thead class="text-tertiary-500">
							<tr class="divide-x divide-preset-400 border-b-2 border-surface-400 text-center">
								<th class="text-left">Format</th>
								<th class="">Pixel</th>
								<th class="">Size</th>
							</tr>
						</thead>
						<tbody>
							{#if 'width' in file && file.width && 'height' in file && file.height}
								<tr><td class="font-semibold">Dimensions:</td><td>{file.width}x{file.height}</td></tr>
							{/if}
							{#each Object.keys(getThumbnails(file)) as size (size)}
								{@const thumbnail = getThumbnail(file, size)}
								{#if thumbnail}
									<tr
										class="divide-x divide-preset-400 border-b border-surface-400 last:border-b-0 {size === gridSize
											? 'bg-primary-50 dark:bg-primary-900/20'
											: ''}"
										onclick={(e) => {
											e.preventDefault();
											if (size === 'tiny' || size === 'small' || size === 'medium' || size === 'large') {
												onsizechange({
													size: size === 'tiny' ? 'small' : size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'tiny',
													type: 'grid'
												});
											}
										}}
									>
										<td class="font-bold text-tertiary-500"
											>{size}
											{#if size === gridSize}
												<span class="ml-1 text-xs text-primary-500">(active)</span>
											{/if}
										</td>
										<td class="pr-1 text-right">
											{#if thumbnail.width && thumbnail.height}
												{thumbnail.width}x{thumbnail.height}
											{:else}
												N/A
											{/if}
										</td>
										<td class="text-right">
											{#if thumbnail.size}
												{formatBytes(thumbnail.size)}
											{:else if size === 'original' && file.size}
												{formatBytes(file.size)}
											{:else}
												N/A
											{/if}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
					{#if file.type === 'image'}
						<button
							onclick={() => {
								const id = file._id?.toString();
								if (id) {
									showTags[id] = !showTags[id];
								}
							}}
							aria-label="Toggle Tags"
							class="btn-icon"
							title="View/Edit Tags"
						>
							<iconify-icon icon="mdi:tag-multiple" width="22" class={showTags[file._id?.toString() || ''] ? 'text-primary-500' : 'text-surface-500'}
							></iconify-icon>
						</button>
						<button
							onclick={() => handleAITagging(file as MediaImage)}
							aria-label="Generate AI Tags"
							class="btn-icon"
							disabled={file._id ? isTagging[file._id] : false}
							title="Generate AI Tags"
						>
							{#if file._id && isTagging[file._id]}
								<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
							{:else}
								<iconify-icon icon="mdi:robot-happy-outline" width="22" class="text-secondary-500"></iconify-icon>
							{/if}
						</button>
						<button onclick={() => onEditImage(file as MediaImage)} aria-label="Edit" class="btn-icon" title="Edit Image">
							<iconify-icon icon="mdi:pen" width="24" class="text-primary-500"></iconify-icon>
						</button>
					{/if}
					<button onclick={() => handleDelete(file)} aria-label="Delete" class="btn-icon" title="Delete Image">
						<iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500"> </iconify-icon>
					</button>
				</header>

				<section class="flex items-center justify-center p-2">
					{#if file?.filename && file?.path && file?.hash}
						<img
							src={getImageUrl(file, gridSize) ?? '/static/Default_User.svg'}
							alt={`Thumbnail for ${file.filename}`}
							class={`rounded object-cover ${
								gridSize === 'tiny' ? 'h-16 w-16' : gridSize === 'small' ? 'h-24 w-24' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'
							}`}
							onerror={(e: Event) => {
								const target = e.target as HTMLImageElement;
								if (target) {
									logger.error('Failed to load media thumbnail for file:', file.filename);
									target.src = '/static/Default_User.svg';
									target.alt = 'Fallback thumbnail image';
								}
							}}
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img">
							<iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500" aria-hidden="true"></iconify-icon>
						</div>
					{/if}
				</section>

				<footer class="flex flex-col gap-2 p-2">
					<!-- Tags Overlay (absolute positioned, doesn't affect layout) -->
					{#if showTags[file._id?.toString() || ''] && 'metadata' in file && (file.metadata?.aiTags?.length || file.metadata?.tags?.length)}
						<div
							class="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-4"
							onclick={(e) => {
								// Close if clicking on the background (not the content)
								if (e.target === e.currentTarget) {
									const id = file._id?.toString();
									if (id) showTags[id] = false;
								}
							}}
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									const id = file._id?.toString();
									if (id) showTags[id] = false;
								}
							}}
							role="dialog"
							aria-label="Tag editor"
							tabindex="-1"
						>
							<div class="max-h-full w-full overflow-auto rounded-lg bg-surface-50 p-3 dark:bg-surface-800">
								<!-- AI Tags Section -->
								{#if file.metadata?.aiTags && file.metadata.aiTags.length > 0}
									<div class="mb-3 rounded border border-primary-400 bg-primary-50 p-2 dark:bg-primary-900/20">
										<div class="mb-1 flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400">
											<iconify-icon icon="mdi:robot-happy" width="14"></iconify-icon>
											AI Suggested Tags:
										</div>
										<div class="flex flex-wrap gap-1">
											{#each file.metadata.aiTags as tag, tagIndex}
												{@const fileId = file._id?.toString() || ''}
												{@const isEditing = editingTag?.fileId === fileId && editingTag?.tagIndex === tagIndex}

												{#if isEditing}
													<input
														type="text"
														value={editingTag?.value ?? ''}
														oninput={(e) => {
															if (editingTag) {
																editingTag.value = (e.currentTarget as HTMLInputElement).value;
															}
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter') {
																e.preventDefault();
																editAITag(file as MediaImage, tag, editingTag?.value || '');
															} else if (e.key === 'Escape') {
																editingTag = null;
															}
														}}
														onblur={(e) => {
															e.stopPropagation(); // Prevent parent click event
															if (editingTag?.value && editingTag.value !== tag) {
																editAITag(file as MediaImage, tag, editingTag.value);
															} else {
																editingTag = null;
															}
														}}
														class="input input-sm w-24 px-1 py-0 text-xs"
														use:autofocus
													/>
												{:else}
													<span
														class="badge preset-filled-primary-500 flex items-center gap-1 text-xs cursor-pointer hover:ring-2 hover:ring-primary-300"
														onclick={(e) => {
															e.stopPropagation();
															editingTag = { fileId, tagIndex, value: tag };
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter' || e.key === ' ') {
																e.preventDefault();
																e.stopPropagation();
																editingTag = { fileId, tagIndex, value: tag };
															}
														}}
														role="button"
														tabindex="0"
														title="Click to edit"
													>
														{tag}
														<button
															onclick={(e) => {
																e.stopPropagation();
																removeAITag(file as MediaImage, tag);
															}}
															class="hover:text-error-500"
															aria-label="Remove tag">×</button
														>
													</span>
												{/if}
											{/each}
										</div>

										<!-- Add Manual Tag -->
										<div class="mt-2 flex gap-1">
											<input
												type="text"
												value={newTagInput[file._id?.toString() || ''] || ''}
												oninput={(e) => {
													const id = file._id?.toString();
													if (id) {
														newTagInput[id] = (e.currentTarget as HTMLInputElement).value;
													}
												}}
												onkeydown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														addManualTag(file as MediaImage);
													}
												}}
												placeholder="Add tag..."
												class="input input-sm flex-1 px-2 py-1 text-xs"
											/>
											<button
												onclick={(e) => {
													e.stopPropagation();
													addManualTag(file as MediaImage);
												}}
												class="btn btn-sm preset-ghost-primary-500"
												title="Add tag"
											>
												<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
											</button>
										</div>

										<button
											onclick={(e) => {
												e.stopPropagation();
												saveAITags(file as MediaImage);
											}}
											class="btn btn-sm preset-filled-success-500 mt-2 w-full"
										>
											<iconify-icon icon="mdi:check" width="16"></iconify-icon>
											Save Tags
										</button>
									</div>
								{/if}

								<!-- User Tags Section -->
								{#if file.metadata?.tags && file.metadata.tags.length > 0}
									<div class="rounded bg-surface-100 p-2 dark:bg-surface-700">
										<div class="mb-1 text-xs font-medium text-surface-600 dark:text-surface-400">Saved Tags:</div>
										<div class="flex flex-wrap gap-1">
											{#each file.metadata.tags as tag, tagIndex}
												{@const fileId = file._id?.toString() || ''}
												{@const isEditing = editingTag?.fileId === `saved-${fileId}` && editingTag?.tagIndex === tagIndex}

												{#if isEditing}
													<input
														type="text"
														value={editingTag?.value ?? ''}
														oninput={(e) => {
															if (editingTag) {
																editingTag.value = (e.currentTarget as HTMLInputElement).value;
															}
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter') {
																e.preventDefault();
																editUserTag(file as MediaImage, tag, editingTag?.value || '');
															} else if (e.key === 'Escape') {
																editingTag = null;
															}
														}}
														onblur={(e) => {
															e.stopPropagation();
															if (editingTag?.value && editingTag.value !== tag) {
																editUserTag(file as MediaImage, tag, editingTag.value);
															} else {
																editingTag = null;
															}
														}}
														class="input input-sm w-24 px-1 py-0 text-xs"
														use:autofocus
													/>
												{:else}
													<span
														class="badge preset-filled-success-500 flex items-center gap-1 text-xs cursor-pointer hover:ring-2 hover:ring-success-300"
														onclick={(e) => {
															e.stopPropagation();
															editingTag = { fileId: `saved-${fileId}`, tagIndex, value: tag };
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter' || e.key === ' ') {
																e.preventDefault();
																e.stopPropagation();
																editingTag = { fileId: `saved-${fileId}`, tagIndex, value: tag };
															}
														}}
														role="button"
														tabindex="0"
														title="Click to edit"
													>
														{tag}
														<button
															onclick={(e) => {
																e.preventDefault();
																e.stopPropagation();
																removeUserTag(file as MediaImage, tag);
															}}
															class="ml-1 hover:text-error-500"
															aria-label="Remove tag"
															type="button">×</button
														>
													</span>
												{/if}
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Filename -->
					<p class="truncate text-center font-medium" title={file.filename}>{truncateFilename(file.filename)}</p>

					<!-- Type & Size badges -->
					<div class="flex items-center justify-between gap-1">
						<!-- File Type Badge -->
						<div class="preset-ghost-tertiary-500 badge flex items-center gap-1">
							<iconify-icon
								icon={file.type === 'image'
									? 'fa-solid:image'
									: file.type === 'video'
										? 'fa-solid:video'
										: file.type === 'audio'
											? 'fa-solid:play-circle'
											: file.type === 'document'
												? 'fa-solid:file-lines'
												: 'vscode-icons:file'}
								width="16"
								height="16"
							></iconify-icon>
							<span class="text-tertiary-500 dark:text-primary-500">{file.mimeType?.split('/').pop()?.toUpperCase() || 'UNKNOWN'}</span>
						</div>

						<!-- File Size Badge -->
						<div class="preset-ghost-tertiary-500 badge flex items-center gap-1">
							{#if file.size}
								<span class="text-tertiary-500 dark:text-primary-500">{formatBytes(file.size)}</span>
							{:else}
								<span class="text-tertiary-500 dark:text-primary-500">Unknown</span>
							{/if}
						</div>
					</div>
				</footer>
			</div>
		{/each}
	{/if}
</div>

<style>
	/* Smooth transitions for grid layout changes */
	.card {
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Smooth grid item repositioning */
	:global(.flex.flex-wrap) {
		transition: all 0.3s ease-out;
	}
</style>

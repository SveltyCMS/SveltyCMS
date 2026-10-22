<!--
@files src/routes/(app)/mediagallery/upload-media/local-upload.svelte
@component
**Local media upload queue and drop zone**

## Props
- `folder`: Target virtual folder (`global` keeps the media root).
- `onUploadComplete`: Called after a successful batch.
- `redirectOnSuccess`: Navigate to `/mediagallery` when true.

### Features:
- Drag and drop file upload with a full-height, non-clipped drop zone
- File validation (size, type) and duplicate detection
- Synchronous image/audio previews (no missing thumbnails on first paint)
- Shared `formatBytes` / MIME-subtype labels with the media gallery
- File upload progress and cancel
-->

<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { formatBytes } from '@utils/file';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { optimizeImage } from '@src/utils/media/canvas-image-optimizer';
	import { uploadMediaFilesHandle } from '@utils/media/upload-client';
	import Button from '@components/ui/button.svelte';
	import {
		button_cancel,
		common_input,
		mediagallery_add_files,
		mediagallery_browse_files,
		mediagallery_cancel_upload,
		mediagallery_clear_queue,
		mediagallery_drag_files_hint,
		mediagallery_dropzone_aria,
		mediagallery_file,
		mediagallery_files,
		mediagallery_max_file_size,
		mediagallery_multiple_files,
		mediagallery_optimize_before_upload,
		mediagallery_queue_hint,
		mediagallery_remove_file,
		mediagallery_size,
		mediagallery_speed,
		mediagallery_upload_action,
		mediagallery_upload_progress,
		mediagallery_upload_title,
		useravatar_uploading
	} from '@src/paraglide/messages';

	interface Props {
		folder?: string;
		onUploadComplete?: () => void;
		redirectOnSuccess?: boolean;
	}

	const {
		onUploadComplete = () => {},
		redirectOnSuccess = true,
		folder = 'global'
	}: Props = $props();

	interface QueuedFile {
		file: File;
		key: string;
		previewUrl?: string;
	}

	let files = $state<QueuedFile[]>([]);
	let input: HTMLInputElement | null = $state(null);
	let uploadProgress = $state(0);
	let uploadSpeed = $state(0);
	let uploadFileLabel = $state('');
	let isUploading = $state(false);
	let uploadCancel: (() => void) | null = $state(null);
	let optimizeBeforeUpload = $state(true); // Default to on for 2026 performance
	let dragActive = $state(false);

	/** Duplicate guard — the array itself is the rendered state. */
	const fileSet = new SvelteSet<string>();

	const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
	const ALLOWED_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/svg+xml',
		'video/mp4',
		'video/webm',
		'audio/mpeg',
		'audio/wav',
		'application/pdf',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	];

	function fileKey(file: File): string {
		return `${file.name}-${file.size}`;
	}

	/**
	 * Create the preview URL while the file is being queued (synchronously).
	 * The previous `$effect`-driven SvelteMap filled after the render that
	 * needed it, so the first frame showed a broken-image icon.
	 */
	function createPreview(file: File): string | undefined {
		if (file.type?.startsWith('image/') || file.type?.startsWith('audio/')) {
			return URL.createObjectURL(file);
		}
		return undefined;
	}

	function revokePreview(entry: QueuedFile): void {
		if (entry.previewUrl?.startsWith('blob:')) {
			URL.revokeObjectURL(entry.previewUrl);
		}
	}

	function revokeAllPreviews(): void {
		for (const entry of files) revokePreview(entry);
	}

	// Release blob URLs when the component unmounts.
	$effect(() => {
		return () => {
			for (const entry of files) {
				if (entry.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.previewUrl);
			}
		};
	});

	/** Get icon string. */
	function getFileIcon(file: File): string {
		const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
		switch (true) {
			case file.type?.startsWith('image/'):
				return 'fa-solid:image';
			case file.type?.startsWith('video/'):
				return 'fa-solid:video';
			case file.type?.startsWith('audio/'):
				return 'fa-solid:play-circle';
			case fileExt === '.pdf':
				return 'vscode-icons:file-type-pdf2';
			case fileExt === '.doc' || fileExt === '.docx' || fileExt === '.docm':
				return 'vscode-icons:file-type-word';
			case fileExt === '.ppt' || fileExt === '.pptx':
				return 'vscode-icons:file-type-powerpoint';
			case fileExt === '.xls' || fileExt === '.xlsx':
				return 'vscode-icons:file-type-excel';
			case fileExt === '.txt':
				return 'fa-solid:file-lines';
			case fileExt === '.zip' || fileExt === '.rar':
				return 'fa-solid:file-zipper';
			default:
				return 'vscode-icons:file';
		}
	}

	/** Human-readable MIME subtype — same label the gallery tiles use. */
	function formatMimeType(mime: string | undefined = undefined): string {
		if (!mime) {
			return 'Unknown';
		}
		const parts = mime.split('/');
		return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
	}

	function validateAndAddFiles(newFiles: File[]) {
		if (!newFiles || newFiles.length === 0) {
			toast.warning({ description: 'No files selected or recognized for upload' });
			return;
		}

		const validFiles: QueuedFile[] = [];
		const errors: string[] = [];

		newFiles.forEach((file) => {
			const key = fileKey(file);
			if (file.size > MAX_FILE_SIZE) {
				errors.push(`${file.name} exceeds maximum file size of 50MB`);
			} else if (ALLOWED_TYPES.includes(file.type)) {
				if (!fileSet.has(key)) {
					validFiles.push({ file, key, previewUrl: createPreview(file) });
					fileSet.add(key);
				}
			} else {
				errors.push(`${file.name} is not an allowed file type`);
			}
		});

		if (errors.length > 0) {
			toast.error({ description: errors.join('\n') });
		}

		if (validFiles.length > 0) {
			files = [...files, ...validFiles];
		} else if (errors.length === 0) {
			toast.warning({ description: 'No new files to upload (all files already added)' });
		}
	}

	function handleFileDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		if (!event.dataTransfer || !event.dataTransfer.files || event.dataTransfer.files.length === 0) {
			toast.warning({ description: 'No files recognized in drop' });
			return;
		}
		validateAndAddFiles(Array.from(event.dataTransfer.files));
	}

	/** Paste images from the clipboard straight into the queue. */
	function handlePaste(event: ClipboardEvent) {
		const target = event.target as HTMLElement | null;
		// Never steal a paste from a text field or rich-text editor.
		if (target?.closest('input, textarea, [contenteditable="true"]')) return;

		const pasted = Array.from(event.clipboardData?.files ?? []);
		if (pasted.length === 0) return;
		event.preventDefault();
		validateAndAddFiles(pasted);
	}

	function onChange() {
		if (!input?.files) {
			return;
		}
		validateAndAddFiles(Array.from(input.files));
		if (input) {
			input.value = '';
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragActive = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragActive = false;
	}

	function handleDeleteFile(entry: QueuedFile) {
		files = files.filter((f) => f !== entry);
		fileSet.delete(entry.key);
		revokePreview(entry);
	}

	function handleCancel() {
		revokeAllPreviews();
		files = [];
		fileSet.clear();
	}

	const totalQueuedSize = $derived(files.reduce((sum, entry) => sum + entry.file.size, 0));

	async function uploadLocalFiles() {
		if (files.length === 0) {
			toast.warning('No files selected for upload');
			return;
		}

		isUploading = true;
		uploadProgress = 0;
		const startTime = Date.now();
		const sourceFiles = files.map((entry) => entry.file);

		// --- WebGPU OPTIMIZATION STEP ---
		let filesToUpload = [...sourceFiles];
		if (optimizeBeforeUpload) {
			toast.info('Optimizing media via WebGPU...');
			const optimized: File[] = [];
			for (const file of sourceFiles) {
				if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
					try {
						const result = await optimizeImage(file);
						optimized.push(result.file);
					} catch (err) {
						logger.warn(`Optimization failed for ${file.name}, using original.`, err);
						optimized.push(file);
					}
				} else {
					optimized.push(file);
				}
			}
			filesToUpload = optimized;
		}

		const controller = new AbortController();
		let lastProgressLoaded = 0;
		const handle = uploadMediaFilesHandle(filesToUpload, {
			formActionUrl: '/mediagallery?/upload',
			folder,
			sequential: filesToUpload.length > 1,
			signal: controller.signal,
			onProgress: (percent) => {
				uploadProgress = percent;
				const currentTime = Date.now();
				const timeDiff = (currentTime - startTime) / 1000;
				const estimatedLoaded =
					(percent / 100) * filesToUpload.reduce((sum, file) => sum + file.size, 0);
				const loadedDiff = estimatedLoaded - lastProgressLoaded;
				uploadSpeed = timeDiff > 0 ? loadedDiff / timeDiff : 0;
				lastProgressLoaded = estimatedLoaded;
			},
			onFileProgress: (fp) => {
				uploadProgress = fp.overallPercent;
				uploadFileLabel =
					filesToUpload.length > 1
						? `${fp.fileIndex + 1}/${fp.fileCount}: ${fp.fileName}`
						: fp.fileName;
			}
		});
		uploadCancel = () => {
			controller.abort();
			handle.cancel();
		};

		try {
			const result = await handle.promise;

			if (result.aborted) {
				toast.info('Upload cancelled');
			} else if (result.success) {
				toast.success('Files uploaded successfully');
				handleCancel();
				onUploadComplete();
				if (redirectOnSuccess) {
					void goto('/mediagallery', { refreshAll: true });
				}
			} else {
				throw new Error(result.message || 'Upload failed');
			}
		} catch (error) {
			logger.error('Error uploading files:', error);
			toast.error({
				description: `Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		} finally {
			isUploading = false;
			uploadCancel = null;
			uploadProgress = 0;
			uploadFileLabel = '';
		}
	}
</script>

<svelte:window onpaste={handlePaste} />

{#if files.length === 0}
	<!-- Drop Zone State -->
	<div
		ondrop={handleFileDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		class="mt-2 flex min-h-56 w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-4 py-6 transition-colors sm:flex-row {dragActive
			? 'border-tertiary-500 bg-tertiary-500/10'
			: 'border-surface-600 bg-secondary-500/10 dark:border-surface-500 dark:bg-surface-700'}"
		role="region"
		aria-label={mediagallery_dropzone_aria()}
		data-testid="media-upload-dropzone"
	>
		<div class="flex w-full flex-col items-center gap-4 p-2 sm:flex-row sm:p-4">
			<iconify-icon icon="fa6-solid:file-arrow-up" width={32} class="shrink-0 sm:w-12"
			></iconify-icon>

			<div class="min-w-0 flex-1 space-y-4 text-center sm:text-start">
				<div class="space-y-1">
					<p class="font-bold text-tertiary-500 dark:text-primary-500">
						{mediagallery_upload_title()}
					</p>
					<p class="text-sm">{mediagallery_drag_files_hint()}</p>
				</div>

				<label class="flex items-center gap-2 cursor-pointer justify-center mt-2 sm:justify-start">
					<input
						type="checkbox"
						bind:checked={optimizeBeforeUpload}
						class="checkbox checkbox-sm"
						aria-label={common_input()}
					/>
					<span class="text-xs font-bold opacity-75">{mediagallery_optimize_before_upload()}</span>
				</label>

				<p class="text-sm opacity-75">{mediagallery_multiple_files()}</p>

				<Button
					variant="tertiary"
					type="button"
					onclick={() => input?.click()}
					disabled={isUploading}
					class="mt-3"
					data-testid="media-upload-browse"
				>
					{mediagallery_browse_files()}
				</Button>

				<p class="mt-2 text-sm text-tertiary-500 dark:text-primary-500">
					{mediagallery_max_file_size()}
				</p>
			</div>
		</div>

		<!-- File Input -->
		<input
			bind:this={input}
			type="file"
			class="sr-only"
			hidden
			multiple
			onchange={onChange}
			aria-hidden="true"
			tabindex="-1"
			aria-label={common_input()}
		/>
	</div>
{:else}
	<div class="mb-5 flex flex-wrap items-center justify-between gap-2 text-center sm:text-start">
		<p class="text-tertiary-500 dark:text-primary-500" aria-live="polite">
			{mediagallery_queue_hint()}
		</p>
		<p class="text-xs text-(--admin-text-muted)" data-testid="media-upload-summary">
			{files.length}
			{files.length === 1 ? mediagallery_file() : mediagallery_files()} ·
			{formatBytes(totalQueuedSize)}
		</p>
		<Button variant="ghost" size="sm" type="button" onclick={handleCancel} class="shrink-0">
			{mediagallery_clear_queue()}
		</Button>
	</div>
	<!-- Grid View State -->
	<div class="flex flex-col space-y-4 pb-2">
		<!-- File Grid -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each files as entry (entry.key)}
				{const file = entry.file}
				{const iconName = getFileIcon(file)}

				<div
					class="group relative flex flex-col overflow-hidden rounded-lg border border-surface-500/30 shadow-sm transition-all hover:shadow-md dark:border-surface-500/40"
					data-testid="media-upload-queued"
				>
					<!-- Delete button -->
					<div class="absolute inset-e-1 top-1 z-10 flex cursor-pointer shadow-sm">
						<SystemTooltip title={mediagallery_remove_file()} positioning={{ placement: 'top' }}>
							<Button
								variant="ghost"
								type="button"
								onclick={() => handleDeleteFile(entry)}
								aria-label={`${mediagallery_remove_file()} ${file.name}`}
								class="p-0! min-w-0 bg-error-500 rounded-full"
							>
								<iconify-icon icon="material-symbols:delete" width={24} class="text-white"
								></iconify-icon>
							</Button>
						</SystemTooltip>
					</div>

					<!-- Preview -->
					<div class="media-queue-checkerboard flex aspect-square items-center justify-center">
						{#if file.type?.startsWith('image/') && entry.previewUrl}
							<img
								src={entry.previewUrl}
								alt={file.name}
								title={file.name}
								class="h-full w-full object-contain"
								loading="lazy"
								decoding="async"
								data-testid="media-upload-preview"
							/>
						{:else if file.type?.startsWith('audio/') && entry.previewUrl}
							<audio controls class="max-w-full">
								<source src={entry.previewUrl} type={file.type} />
							</audio>
						{:else}
							<iconify-icon icon={iconName} width="48" class="text-(--admin-text-muted)"
							></iconify-icon>
						{/if}
					</div>

					<!-- Media Filename -->
					<div class="flex h-10 w-full flex-col justify-center px-2 py-1 text-center">
						<SystemTooltip title={file.name} positioning={{ placement: 'top' }}>
							<div
								class="text-xs font-bold leading-tight line-clamp-2 overflow-hidden overflow-wrap-anywhere"
							>
								{file.name}
							</div>
						</SystemTooltip>
					</div>

					<!-- Media Type & Size (Footer) — mirrors the gallery tile labels -->
					<div class="flex items-center justify-between gap-1 p-1 text-white">
						<SystemTooltip title={file.type} positioning={{ placement: 'top' }}>
							<span
								class="bg-tertiary-500 dark:bg-primary-500/50 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 overflow-hidden"
							>
								<iconify-icon icon={iconName} width="12"></iconify-icon>
								<span class="truncate">{formatMimeType(file.type)}</span>
							</span>
						</SystemTooltip>
						<SystemTooltip title={mediagallery_size()} positioning={{ placement: 'top' }}>
							<span
								class="bg-tertiary-500 dark:bg-primary-500/50 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 font-mono"
							>
								{formatBytes(file.size)}
							</span>
						</SystemTooltip>
					</div>
				</div>
			{/each}

			<!-- Add File Card -->
			<Button
				variant="surface"
				type="button"
				onclick={() => input?.click()}
				class="flex h-auto! min-h-0 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--admin-border-default) py-4 whitespace-normal"
				data-testid="media-upload-add-files"
			>
				<iconify-icon icon="mingcute:add-fill" width={24}></iconify-icon>
				<span class="text-center text-sm font-bold leading-tight">{mediagallery_add_files()}</span>
			</Button>
		</div>

		<!-- Hidden Input for Add Card -->
		<input
			bind:this={input}
			type="file"
			class="hidden"
			multiple
			onchange={onChange}
			aria-label={common_input()}
		/>

		<!-- Actions Footer -->
		<div
			class="flex items-center justify-between gap-3 border-t border-surface-500/30 pt-4 dark:border-surface-500/40"
		>
			<Button variant="outline" type="button" onclick={handleCancel}>{button_cancel()}</Button>
			<Button
				variant="tertiary"
				type="button"
				onclick={uploadLocalFiles}
				disabled={isUploading}
				class="min-w-0"
				data-testid="media-upload-submit"
			>
				{#if isUploading}
					<iconify-icon icon="eos-icons:loading" width={24} class="animate-spin"></iconify-icon>
					<span class="whitespace-nowrap">{useravatar_uploading()} {uploadProgress}%</span>
				{:else}
					<iconify-icon icon="mingcute:check-fill" width={24}></iconify-icon>
					<span class="whitespace-nowrap"
						>{mediagallery_upload_action()}
						{files.length}{' '}{files.length !== 1
							? mediagallery_files()
							: mediagallery_file()}</span
					>
				{/if}
			</Button>
		</div>
	</div>
{/if}

<!-- Upload Progress -->
{#if isUploading}
	<div
		class="mt-4 w-full rounded-lg border border-surface-500 bg-surface-500/10 p-4 dark:bg-surface-700"
	>
		<div
			class="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-300 dark:bg-surface-600"
			role="progressbar"
			aria-label={mediagallery_upload_progress()}
			aria-valuenow={uploadProgress}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				class="h-full bg-tertiary-500 dark:bg-primary-500 transition-all duration-300"
				style="width: {uploadProgress}%"
			></div>
		</div>
		<div
			class="flex flex-wrap items-center justify-between gap-2 text-xs text-(--admin-text-muted) dark:text-surface-50"
		>
			<span>{mediagallery_speed()} {formatBytes(uploadSpeed)}/s</span>
			{#if uploadFileLabel}
				<span class="max-w-48 truncate" title={uploadFileLabel}>{uploadFileLabel}</span>
			{/if}
			<span class="tabular-nums font-medium">{uploadProgress}%</span>
			<Button
				variant="outline"
				size="sm"
				type="button"
				onclick={() => uploadCancel?.()}
				aria-label={mediagallery_cancel_upload()}
			>
				{button_cancel()}
			</Button>
		</div>
	</div>
{/if}

<style>
	.media-queue-checkerboard {
		background-color: color-mix(in srgb, var(--admin-bg-card, #ffffff) 92%, black);
		background-image:
			linear-gradient(
				45deg,
				color-mix(in srgb, var(--admin-border-default, #e5e7eb) 55%, transparent) 25%,
				transparent 25%
			),
			linear-gradient(
				-45deg,
				color-mix(in srgb, var(--admin-border-default, #e5e7eb) 55%, transparent) 25%,
				transparent 25%
			),
			linear-gradient(
				45deg,
				transparent 75%,
				color-mix(in srgb, var(--admin-border-default, #e5e7eb) 55%, transparent) 75%
			),
			linear-gradient(
				-45deg,
				transparent 75%,
				color-mix(in srgb, var(--admin-border-default, #e5e7eb) 55%, transparent) 75%
			);
		background-size: 12px 12px;
		background-position:
			0 0,
			0 6px,
			6px -6px,
			-6px 0;
	}
</style>

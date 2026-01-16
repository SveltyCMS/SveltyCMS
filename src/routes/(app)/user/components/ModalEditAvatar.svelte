<!-- 
@file src/routes/(app)/user/components/ModalEditAvatar.svelte
@component
**Modal for editing user avatar thumbnail image**

Efficiently handles avatar uploads with validation, deletion, and real-time preview. Optimized for performance and accessibility.

@props
- `parent` {ModalComponent['props']} - Parent modal properties including `regionFooter`, `onClose`, and `buttonPositive`
- `avatarSrc` {string} - Current avatar source from store (default: '/Default_User.svg')
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { logger } from '@src/utils/logger';
	import axios from 'axios';

	// Stores
	import { avatarSrc } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar, FileUpload } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '@stores/store.svelte';
	import { modalState, showConfirm } from '@utils/modalState.svelte';

	let files = $state<File[]>([]);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let previewUrl = $state<string | null>(null); // Local preview URL, separate from global store
	let imageLoadError = $state(false); // Track if current avatar failed to load

	// Computed value for avatar display with fallback
	const displayAvatar = $derived.by(() => {
		if (previewUrl) return previewUrl;
		if (imageLoadError) return '/Default_User.svg';
		const avatarUrl = avatarSrc.value || '/Default_User.svg';
		// Add timestamp for cache busting, unless it's a data URI or default avatar
		if (avatarUrl !== '/Default_User.svg' && !avatarUrl.startsWith('data:')) {
			return `${avatarUrl}?t=${Date.now()}`;
		}
		return avatarUrl;
	});

	// Valibot validation schema
	import { object, instance, check, pipe, parse, type InferInput, type ValiError } from 'valibot';

	interface Props {
		// Props
		isGivenData?: boolean; // Unused but kept for interface compat
		title?: string;
		body?: string;
		parent?: any; // Loose type for now
	}

	const { title, body }: Props = $props();

	const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/gif'];
	const MAX_FILE_SIZE = 5242880; // 5MB
	const COMPRESSION_THRESHOLD = 1024 * 1024; // 1MB - compress files larger than this

	// Unified accept string for file inputs
	const acceptMime = imageTypes.join(',');

	const blobSchema = instance(Blob);
	type BlobType = InferInput<typeof blobSchema>;

	const fileSchema = pipe(
		blobSchema,
		check((input: BlobType) => {
			if (input.size > MAX_FILE_SIZE) {
				throw new Error(m.modaledit_avatarfilesize());
			}
			if (!imageTypes.includes(input.type)) {
				throw new Error('Invalid file type');
			}
			return true;
		})
	);

	const avatarSchema = object({
		file: fileSchema
	});

	// Handle file input change
	function onFileChange(details: { acceptedFiles: File[] }) {
		// v4 FileUpload passes details with acceptedFiles array
		const inputFiles = details.acceptedFiles;
		if (!inputFiles || inputFiles.length === 0) return;

		files = inputFiles;
		const lastFile = files[files.length - 1];

		// Reset error state when new file is selected
		imageLoadError = false;

		// Create optimized preview for large files
		createOptimizedPreview(lastFile);
	}

	// Create optimized preview to avoid blocking UI
	async function createOptimizedPreview(file: File) {
		try {
			// For very large files, create a smaller preview
			if (file.size > 1024 * 1024) {
				// 1MB
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				const img = new Image();

				img.onload = () => {
					// Scale down large images for preview
					const maxSize = 200;
					const ratio = Math.min(maxSize / img.width, maxSize / img.height);
					canvas.width = img.width * ratio;
					canvas.height = img.height * ratio;

					ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
					previewUrl = canvas.toDataURL('image/jpeg', 0.8); // Update local preview only
				};

				img.src = URL.createObjectURL(file);
			} else {
				// For smaller files, use direct FileReader
				const fileReader = new FileReader();
				fileReader.onload = (e) => {
					if (e.target instanceof FileReader) {
						previewUrl = e.target.result as string; // Update local preview only
					}
				};
				fileReader.readAsDataURL(file);
			}
		} catch (error) {
			logger.error('Error creating preview:', error);
			// Fallback to default avatar
			previewUrl = null;
		}
	}

	// Handle form submit
	async function onFormSubmit(): Promise<void> {
		if (!files || files.length === 0) return;
		if (isUploading) return; // Prevent double submission

		const file = files[0];

		try {
			parse(avatarSchema, { file });

			// Show confirmation if replacing existing avatar
			if (avatarSrc.value && avatarSrc.value !== '/Default_User.svg') {
				showConfirm({
					title: 'Replace Avatar',
					body: 'Are you sure you want to replace your current avatar?',
					onConfirm: async () => {
						await uploadAvatar(file);
					}
				});
			} else {
				// No existing avatar, upload directly
				await uploadAvatar(file);
			}
		} catch (error) {
			if ((error as ValiError<typeof avatarSchema>).issues) {
				const valiError = error as ValiError<typeof avatarSchema>;
				logger.error(valiError.issues[0]?.message);
				toaster.error({ description: valiError.issues[0]?.message || 'Invalid file' });
				return;
			}
			logger.error((error as Error).message);
			toaster.error({ description: (error as Error).message || 'Upload failed' });
			return;
		}
	}

	// Compress large files before upload
	async function compressFile(file: File): Promise<File> {
		// Don't compress SVGs or files already small enough
		if (file.type === 'image/svg+xml' || file.size < COMPRESSION_THRESHOLD) {
			return file;
		}

		return new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			const img = new Image();

			img.onload = () => {
				// Calculate new dimensions (max 1024px)
				const maxSize = 1024;
				const ratio = Math.min(maxSize / img.width, maxSize / img.height);
				canvas.width = img.width * ratio;
				canvas.height = img.height * ratio;

				// Draw and compress
				ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
				canvas.toBlob(
					(blob) => {
						if (blob) {
							const compressedFile = new File([blob], file.name, {
								type: 'image/jpeg',
								lastModified: Date.now()
							});
							resolve(compressedFile);
						} else {
							resolve(file); // Fallback to original
						}
					},
					'image/jpeg',
					0.85 // Quality
				);
			};

			img.onerror = () => resolve(file); // Fallback to original
			img.src = URL.createObjectURL(file);
		});
	}

	// Upload avatar
	async function uploadAvatar(file: File): Promise<void> {
		isUploading = true;
		uploadProgress = 0;

		try {
			// Compress large files first
			const processedFile = await compressFile(file);

			// Create FormData
			const formData = new FormData();
			formData.append('avatar', processedFile);

			// Upload with axios for progress tracking
			const response = await axios.post('/api/user/saveAvatar', formData, {
				headers: { 'Content-Type': 'multipart/form-data' },
				onUploadProgress: (progressEvent) => {
					if (progressEvent.total) {
						uploadProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
					}
				}
			});

			const result = response.data;

			// Update the avatar store with the new URL from API
			if (result.avatarUrl) {
				avatarSrc.value = result.avatarUrl;
				logger.info('Avatar store updated', { avatarUrl: result.avatarUrl });
			}

			// Invalidate all data to ensure consistency
			await invalidateAll();

			// Show success toast
			toaster.success({ description: 'Avatar updated successfully!' });
			modalState.close();
		} catch (error) {
			console.error('Avatar upload failed:', error);
			imageLoadError = true;
			toaster.error({ description: 'Failed to update avatar' });
			// Revert preview on error
			previewUrl = null;
		} finally {
			isUploading = false;
			// Keep progress at 100 briefly so user sees it completed
			setTimeout(() => {
				if (!isUploading) uploadProgress = 0;
			}, 1000);
		}
	}

	// Delete avatar with confirmation
	async function deleteAvatar(): Promise<void> {
		logger.info('deleteAvatar function called');

		showConfirm({
			title: 'Delete Avatar',
			body: 'Are you sure you want to delete your avatar? This action cannot be undone.',
			onConfirm: async () => {
				// User confirmed - proceed with deletion
				try {
					const currentAvatar = avatarSrc.value;
					logger.info('Attempting to delete avatar:', currentAvatar);

					const response = await fetch('/api/user/deleteAvatar', {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ avatarUrl: currentAvatar })
					});

					const result = await response.json();

					logger.info('Delete response:', result);

					if (response.ok && result.success) {
						// Update the avatar store
						avatarSrc.value = '/Default_User.svg';
						previewUrl = null;

						// Show success message
						toaster.success({
							description: '<iconify-icon icon="radix-icons:avatar" color="white" width="24" class="mr-1"></iconify-icon> Avatar Deleted'
						});

						// Close dialog
						modalState.close();

						// Reload page data
						await invalidateAll();
					} else {
						throw new Error(result.message || 'Delete failed');
					}
				} catch (error) {
					logger.error('Error deleting avatar:', error);

					const msg = error instanceof Error ? error.message : 'Failed to delete avatar';

					toaster.error({ description: `<iconify-icon icon="radix-icons:cross-2" color="white" width="24" class="mr-1"></iconify-icon> ${msg}` });
				}
			}
		});
	}

	// Base Classes
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="modal-avatar space-y-4">
	<header class={`text-center text-primary-500 ${cHeader} shrink-0`}>
		{title ?? '(title missing)'}
	</header>
	<article class="text-center text-sm">
		{body ?? '(body missing)'}
	</article>

	<form class="modal-form {cForm}">
		<div class="grid grid-cols-1 grid-rows-{avatarSrc.value ? '1' : '2'} items-center justify-center">
			<FileUpload acceptedFiles={files} accept={acceptMime} maxFiles={1} {onFileChange} class="w-full flex flex-col items-center gap-4">
				<!-- Hidden Input -->
				<FileUpload.HiddenInput />

				<!-- Avatar Trigger (Clickable) -->
				<FileUpload.Trigger class="outline-none relative mx-auto mb-3 cursor-pointer rounded-full focus:ring-2 focus:ring-primary-500">
					<Avatar class="size-32 rounded-full overflow-hidden bg-surface-100-900 border-4 border-surface-100-900 shadow-xl">
						<Avatar.Image src={displayAvatar} alt="User avatar" class="size-full object-cover" />
						<Avatar.Fallback class="flex size-full items-center justify-center bg-surface-500 text-3xl font-bold uppercase text-white">
							AB
						</Avatar.Fallback>
					</Avatar>

					<!-- Hover/Focus overlay cue when not uploading -->
					{#if !isUploading}
						<div class="absolute inset-0 hidden items-center justify-center rounded-full bg-black/30 text-white focus-within:flex hover:flex">
							<span class="text-xs font-medium">Click to upload</span>
						</div>
					{/if}
					{#if isUploading}
						<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
							<div class="text-sm font-medium text-white">...</div>
						</div>
					{/if}
				</FileUpload.Trigger>

				<!-- Dropzone Area -->
				<FileUpload.Dropzone class="w-full">
					<div class="flex flex-col items-center justify-center p-4">
						<iconify-icon icon="mdi:cloud-upload" width="48" class="mb-2 text-primary-500"></iconify-icon>
						<p class="text-sm">{m.modaledit_avatarfilesallowed()}</p>
					</div>
				</FileUpload.Dropzone>
			</FileUpload>
		</div>
		{#if !files.length && !isUploading}
			<small class="block text-center text-tertiary-500 opacity-75 dark:text-primary-500">{m.modaledit_avatarfilesize()}</small>
		{/if}
		<!-- Progress Bar -->
		{#if isUploading}
			<div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
				<div class="flex flex-col items-center gap-2">
					<div class="h-16 w-16 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
					{#if uploadProgress > 0}
						<span class="text-sm font-bold text-white">{uploadProgress}%</span>
					{/if}
				</div>
			</div>
		{/if}
	</form>

	<footer class="modal-footer justify-between pt-4 border-t border-surface-500/20">
		<!-- Delete Avatar -->
		{#if avatarSrc.value && avatarSrc.value !== '/Default_User.svg'}
			<button type="button" onclick={deleteAvatar} class="preset-filled-error-500 btn">
				<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				<span class="hidden sm:block">{m.button_delete()}</span>
			</button>
		{:else}
			<div></div>
			<!-- Empty div when using the default avatar -->
		{/if}
		<div class="flex justify-between gap-2">
			<!-- Cancel -->
			<button class="preset-outlined-secondary-500 btn" onclick={() => modalState.close()} disabled={isUploading}>
				{m.button_cancel()}
			</button>
			<!-- Save -->
			<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" onclick={onFormSubmit} disabled={!files.length || isUploading}>
				{#if isUploading}
					<div class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
					Uploading...
				{:else}
					{m.button_save()}
				{/if}
			</button>
		</div>
	</footer>
</div>

<!--
@file src/routes/(app)/user/components/modal-edit-avatar.svelte
@component
**Modal for editing user avatar thumbnail image**

Efficiently handles avatar uploads with validation, deletion, and real-time preview. Optimized for performance and accessibility.

@props
- `parent` {ModalComponent['props']} - Parent modal properties including `regionFooter`, `onClose`, and `buttonPositive`
- `avatarSrc` {string} - Current avatar source from store (default: '/Default_User.svg')
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	// Lucide icons

	import Avatar from "@components/ui/avatar.svelte";
	import FileUpload from "@components/ui/file-upload.svelte";
	// ParaglideJS
	import { button_cancel, button_delete, button_save, modaledit_avatarfilesallowed, modaledit_avatarfilesize } from '@src/paraglide/messages';
	// Stores
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@src/utils/logger';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let files = $state<File[]>([]);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let previewUrl = $state<string | null>(null); // Local preview URL, separate from global store
	let imageLoadError = $state(false); // Track if current avatar failed to load

	// Valibot validation schema
	import { check, type InferInput, instance, object, parse, pipe, type ValiError } from 'valibot';

	interface Props {
		isGivenData?: boolean;
		parent?: {
			regionFooter?: string;
			onClose?: () => void;
			buttonPositive?: string;
		};
	}

	let { isGivenData: _isGivenData = false, parent: _parent = {} }: Props = $props();

	// ... (rest of code) ...

	// Computed value for avatar display with fallback
	const displayAvatar = $derived.by(() => {
		if (previewUrl) {
			return previewUrl;
		}
		if (imageLoadError) {
			return '/Default_User.svg';
		}
		let src = page.data.user?.avatar || '/Default_User.svg';

		if (src === '/Default_User.svg') {
			return src;
		}
		if (src.startsWith('data:')) {
			return src;
		}

		// Normalize path
		src = src.replace(/^\/+/, '');
		src = src.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		src = src.replace(/^\/+/, '');

		return `/files/${src}?t=${Date.now()}`;
	});

	const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/gif'];
	const MAX_FILE_SIZE = 5_242_880; // 5MB
	const COMPRESSION_THRESHOLD = 1024 * 1024; // 1MB - compress files larger than this

	// Unified accept string for file inputs
	const acceptMime = imageTypes.join(',');

	const blobSchema = instance(Blob);
	type BlobType = InferInput<typeof blobSchema>;

	const fileSchema = pipe(
		blobSchema,
		check((input: BlobType) => {
			if (input.size > MAX_FILE_SIZE) {
				throw new Error(modaledit_avatarfilesize());
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
	function onFileChange(newFiles: File[]) {
		// Native FileUpload passes File[] directly
		if (!newFiles || newFiles.length === 0) {
			return;
		}

		const lastFile = newFiles.at(-1);

		// Reset error state when new file is selected
		imageLoadError = false;

		// Create optimized preview for large files
		createOptimizedPreview(lastFile!);
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
		if (!files || files.length === 0) {
			return;
		}
		if (isUploading) {
			return; // Prevent double submission
		}

		const file = files[0];

		try {
			parse(avatarSchema, { file });

			// Show confirmation if replacing existing avatar
			if (page.data.user?.avatar && page.data.user.avatar !== '/Default_User.svg') {
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
				toast.error({
					description: valiError.issues[0]?.message || 'Invalid file'
				});
				return;
			}
			logger.error((error as Error).message);
			toast.error({ description: (error as Error).message || 'Upload failed' });
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

				// Upload with fetch
				const response = await fetch('/api/user/save-avatar', {
					method: 'POST',
					headers: { 'X-CSRF-Token': page.data.csrfToken || '' },
					body: formData
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const result = await response.json();

				// Avatar updated on server — invalidateAll below will refresh page.data.user

			// Invalidate all data to ensure consistency
			await invalidateAll();

			// Show success toast
			toast.success('Avatar updated successfully!');
			modalState.close();
		} catch (error: unknown) {
			console.error('Avatar upload failed:', error);
			imageLoadError = true;
			toast.error(
				error instanceof Error ? error.message : String(error) ||
					'Failed to update avatar',
			);
			// Revert preview on error
			previewUrl = null;
		} finally {
			isUploading = false;
			// Keep progress at 100 briefly so user sees it completed
			setTimeout(() => {
				if (!isUploading) {
					uploadProgress = 0;
				}
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
					const currentAvatar = page.data.user?.avatar ?? '/Default_User.svg';
				logger.info('Attempting to delete avatar:', currentAvatar);

					const response = await fetch('/api/user/delete-avatar', {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': page.data.csrfToken || '' },
						body: JSON.stringify({ avatarUrl: currentAvatar })
					});

					const result = await response.json();

					if (response.ok && result.success) {
						// Avatar deleted on server — invalidateAll below will refresh page.data.user
							previewUrl = null;

						// Show success message
						toast.success({
							description: '<iconify-icon icon="radix-icons:avatar" width={24} ></iconify-icon> Avatar Deleted'
						});

						// Close dialog
						modalState.close();

						// Reload page data
						await invalidateAll();
					} else {
						throw new Error(result.error || 'Delete failed');
					}
				} catch (error: unknown) {
					logger.error('Error deleting avatar:', error);

					const msg = error instanceof Error ? error.message : 'Failed to delete avatar';

					toast.error({
						description: `<iconify-icon icon="radix-icons:cross-2" width={24} ></iconify-icon> ${msg}`
					});
				}
			}
		});
	}

	// Base Classes

	const cForm = 'border border-surface-200 dark:border-surface-700 p-4 space-y-4 rounded';
</script>

<div class="modal-avatar space-y-4">
	<form class="modal-form {cForm}">
		<div class="grid grid-cols-1 grid-rows-{page.data.user?.avatar ? '1' : '2'} items-center justify-center">
			<FileUpload bind:files accept={acceptMime} multiple={false} onchange={onFileChange} class="border-none! p-0! w-full">
				<div class="flex flex-col items-center gap-4 w-full">
					<!-- Avatar Trigger (Clickable) -->
					<div class="outline-none relative mx-auto mb-3 cursor-pointer rounded-full focus:ring-2 focus:ring-primary-500">
						<Avatar
							src={displayAvatar}
							alt="User avatar"
							initials="AB"
							size="size-32"
							class="rounded-full border-4 border-surface-200 dark:border-surface-700 shadow-xl aspect-square"
						/>

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
					</div>

					<!-- Dropzone Area -->
					<div class="w-full">
						<div class="flex flex-col items-center justify-center p-4">
							<iconify-icon icon="mdi:cloud-upload" width={24}></iconify-icon>
							<p class="text-sm">{modaledit_avatarfilesallowed()}</p>
						</div>
					</div>
				</div>
			</FileUpload>
		</div>
		{#if !files.length && !isUploading}
			<small class="block text-center text-tertiary-500 opacity-75 dark:text-primary-500">{modaledit_avatarfilesize()}</small>
		{/if}
		<!-- Progress Bar -->
		{#if isUploading}
			<div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
				<div class="flex flex-col items-center gap-2">
					<div class="h-16 w-16 animate-spin rounded-full border-4 border-tertiary-500 dark:border-primary-500 border-t-transparent"></div>
					{#if uploadProgress > 0}
						<span class="text-sm font-bold text-white">{uploadProgress}%</span>
					{/if}
				</div>
			</div>
		{/if}
	</form>

	<footer class="modal-footer justify-between pt-4 border-t border-surface-200 dark:border-surface-700">
		<!-- Delete Avatar -->
		{#if page.data.user?.avatar && page.data.user.avatar !== '/Default_User.svg'}
			<Button variant="error" type="button" onclick={deleteAvatar} aria-label="Delete Avatar">
				<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon>
				<span class="hidden sm:block">{button_delete()}</span>
			</Button>
		{:else}
			<div></div>
			<!-- Empty div when using the default avatar -->
		{/if}
		<div class="flex justify-between gap-2">
			<!-- Cancel -->
			<Button variant="outline" onclick={() => modalState.close()} disabled={isUploading}>{button_cancel()}</Button>
			<!-- Save -->
			<Button variant="tertiary" onclick={onFormSubmit} disabled={!files.length || isUploading} class="dark:preset-filled-primary-500">
				{#if isUploading}
					<div class="me-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
					Uploading...
				{:else}
					{button_save()}
				{/if}
			</Button>
		</div>
	</footer>
</div>

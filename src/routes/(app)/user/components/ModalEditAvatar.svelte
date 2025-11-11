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
	import axios from 'axios';
	import { invalidateAll } from '$app/navigation';
	import { logger } from '@utils/logger';

	// Stores
	import { page } from '$app/state';
	import { avatarSrc } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { showToast } from '@utils/toast';
	import { Avatar } from '@skeletonlabs/skeleton';
	import { FileDropzone } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	let files: FileList | null = $state(null);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let previewUrl = $state<string | null>(null); // Local preview URL, separate from global store
	let imageLoadError = $state(false); // Track if current avatar failed to load

	// Computed value for avatar display with fallback
	let displayAvatar = $derived.by(() => {
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
		parent: ModalComponent['props'] & {
			regionFooter?: string;
			onClose?: (event: MouseEvent) => void;
			buttonPositive?: string;
		};
	}

	let { parent }: Props = $props();

	const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/gif'];
	const MAX_FILE_SIZE = 5242880; // 5MB
	const COMPRESSION_THRESHOLD = 1024 * 1024; // 1MB - compress files larger than this

	// Unified accept string for file inputs
	const acceptMime = imageTypes.join(',');

	// Hidden file input reference for avatar click-to-upload
	// Use $state to keep Svelte 5 happy when bind:this assigns to it
	let fileInput: HTMLInputElement | null = $state(null);

	function triggerFileSelect() {
		if (isUploading) return;
		fileInput?.click();
	}

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
	function onChange(e: Event) {
		const inputFiles = (e.target as HTMLInputElement).files;
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
				const confirmModal = {
					type: 'confirm' as const,
					title: 'Replace Avatar',
					body: 'Are you sure you want to replace your current avatar?',
					response: async (confirmed: boolean) => {
						if (confirmed) {
							await uploadAvatar(file);
						}
					}
				};
				modalStore.trigger(confirmModal);
			} else {
				// No existing avatar, upload directly
				await uploadAvatar(file);
			}
		} catch (error) {
			if ((error as ValiError<typeof avatarSchema>).issues) {
				const valiError = error as ValiError<typeof avatarSchema>;
				logger.error(valiError.issues[0]?.message);
				showToast(valiError.issues[0]?.message || 'Invalid file', 'error');
				return;
			}
			logger.error((error as Error).message);
			showToast((error as Error).message || 'Upload failed', 'error');
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

			const formData = new FormData();
			formData.append('avatar', processedFile);
			formData.append('user_id', page.data.user._id);

			const response = await axios.post('/api/user/saveAvatar', formData, {
				headers: { 'Content-Type': 'multipart/form-data' },
				timeout: 30000, // 30 second timeout
				onUploadProgress: (progressEvent) => {
					if (progressEvent.total) {
						uploadProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
					}
				}
			});

			if (response.status === 200) {
				avatarSrc.value = response.data.avatarUrl; // Update global store only on successful save
				showToast('<iconify-icon icon="mdi:check" width="24" class="mr-1"></iconify-icon> Avatar updated successfully!', 'success');
				modalStore.close();
				await invalidateAll();
			}
		} catch (error) {
			logger.error('Error uploading avatar:', error);

			// Log detailed error information
			if (axios.isAxiosError(error)) {
				logger.error('Server response:', error.response?.data);
				logger.error('Status:', error.response?.status);
			}

			const msg = axios.isAxiosError(error) && error.response?.data?.message ? error.response.data.message : 'Failed to update avatar';
			showToast(`<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${msg}`, 'error');
			// Reset preview on error
			previewUrl = null;
		} finally {
			isUploading = false;
			uploadProgress = 0;
		}
	}

	// Delete avatar with confirmation
	async function deleteAvatar(): Promise<void> {
		logger.info('deleteAvatar function called');

		// Use a Promise to wait for the user's response
		const confirmed = await new Promise<boolean>((resolve) => {
			const confirmModal: ModalSettings = {
				type: 'confirm',
				title: 'Delete Avatar',
				body: 'Are you sure you want to delete your avatar? This action cannot be undone.',
				response: (r: boolean) => {
					logger.info('Confirmation response received:', r);
					resolve(r);
				}
			};
			logger.info('Triggering confirmation modal');
			modalStore.trigger(confirmModal);
		});

		// If user cancelled, return early
		if (!confirmed) {
			logger.info('Delete cancelled by user');
			return;
		}

		// User confirmed - proceed with deletion
		try {
			const currentAvatar = avatarSrc.value;
			logger.info('Attempting to delete avatar:', currentAvatar);

			const response = await axios.delete('/api/user/deleteAvatar', {
				data: { avatarUrl: currentAvatar }
			});

			logger.info('Delete response:', response.data);

			if (response.status === 200 && response.data.success) {
				// Update the avatar store
				avatarSrc.value = '/Default_User.svg';
				previewUrl = null;

				// Show success message
				showToast('<iconify-icon icon="radix-icons:avatar" color="white" width="24" class="mr-1"></iconify-icon> Avatar Deleted', 'success');

				// Close ALL modals (confirmation + avatar modal)
				modalStore.clear();

				// Reload page data
				await invalidateAll();
			} else {
				throw new Error(response.data.message || 'Delete failed');
			}
		} catch (error) {
			logger.error('Error deleting avatar:', error);

			if (axios.isAxiosError(error)) {
				logger.error('Server response:', error.response?.data);
				logger.error('Status:', error.response?.status);
			}

			const msg = axios.isAxiosError(error) && error.response?.data?.message ? error.response.data.message : 'Failed to delete avatar';

			showToast(`<iconify-icon icon="radix-icons:cross-2" color="white" width="24" class="mr-1"></iconify-icon> ${msg}`, 'error');

			// On error, user stays in avatar modal (confirmation modal auto-closes)
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-lg';
</script>

{#if $modalStore[0]}
	<div class="modal-avatar {cBase}">
		<header class={`text-center text-primary-500 ${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center text-sm">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>

		<form class="modal-form {cForm}">
			<div class="grid grid-cols-1 grid-rows-{avatarSrc.value ? '1' : '2'} items-center justify-center">
				<!-- Hidden file input for avatar click-to-upload -->
				<input bind:this={fileInput} type="file" class="hidden" accept={acceptMime} onchange={onChange} aria-hidden="true" />

				<!-- Avatar Thumbnail: Click to upload -->
				<div
					class="relative mx-auto mb-3 cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500"
					role="button"
					tabindex={isUploading ? -1 : 0}
					aria-label="Upload avatar"
					onclick={triggerFileSelect}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							triggerFileSelect();
						}
					}}
				>
					<Avatar src={displayAvatar} alt="User avatar" loading="lazy" rounded="rounded-full" width="w-32" />
					<!-- Hover/Focus overlay cue when not uploading -->
					{#if !isUploading}
						<div class="absolute inset-0 hidden items-center justify-center rounded-full bg-black/30 text-white focus-within:flex hover:flex">
							<span class="text-xs font-medium">Click to upload</span>
						</div>
					{/if}
					{#if isUploading}
						<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
							<div class="text-sm font-medium text-white">{uploadProgress}%</div>
						</div>
					{/if}
				</div>
				<!-- FileDropzone Area-->
				<FileDropzone
					onchange={onChange}
					required
					name="Avatar Upload"
					accept={acceptMime}
					aria-label="Upload avatar"
					slotLead="flex flex-col justify-center items-center"
					disabled={isUploading}
				>
					{#snippet lead()}
						<!-- icon -->
						<svg xmlns="http://www.w3.org/2000/svg" width="3.5em" height="3.5em" viewBox="0 0 24 24"
							><g fill="none" fill-rule="evenodd"
								><path
									d="M24 0v24H0V0h24ZM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018Zm.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022Zm-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01l-.184-.092Z"
								/><path
									fill="currentColor"
									d="M12 2v6.5a1.5 1.5 0 0 0 1.356 1.493L13.5 10H20v10a2 2 0 0 1-1.85 1.995L18 22H6a2 2 0 0 1-1.995-1.85L4 20V4a2 2 0 0 1 1.85-1.995L6 2h6Zm-.707 9.173l-2.121 2.121a1 1 0 1 0 1.414 1.414l.414-.414V17a1 1 0 1 0 2 0v-2.706l.414.414a1 1 0 1 0 1.414-1.414l-2.12-2.121a1 1 0 0 0-1.415 0ZM14 2.043a2 2 0 0 1 .877.43l.123.113L19.414 7a2 2 0 0 1 .502.84l.04.16H14V2.043Z"
								/></g
							></svg
						>
					{/snippet}
					{#snippet meta()}
						{m.modaledit_avatarfilesallowed()}
					{/snippet}
				</FileDropzone>
			</div>
			{#if !files && !isUploading}
				<small class="block text-center text-tertiary-500 opacity-75 dark:text-primary-500">{m.modaledit_avatarfilesize()}</small>
			{:else if isUploading}
				<div class="flex items-center justify-center space-x-2">
					<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-500"></div>
					<small class="text-center text-primary-500">Uploading... {uploadProgress}%</small>
				</div>
			{/if}
		</form>

		<footer class="modal-footer {parent.regionFooter} justify-between">
			<!-- Delete Avatar -->
			{#if avatarSrc.value !== '/Default_User.svg'}
				<button
					type="button"
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						deleteAvatar();
					}}
					class="bg-error-500 text-white btn"
				>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
					<span class="hidden sm:block">{m.button_delete()}</span>
				</button>
			{:else}
				<div></div>
				<!-- Empty div when using the default avatar -->
			{/if}
			<div class="flex justify-between gap-2">
				<!-- Cancel -->
				<button class="border border-secondary-500 text-secondary-500 hover:bg-secondary-500/10 btn" onclick={parent.onClose} disabled={isUploading}>
					{m.button_cancel()}
				</button>
				<!-- Save -->
				<button
					class="bg-tertiary-500 text-white btn dark:bg-primary-500 text-white {parent.buttonPositive}"
					onclick={onFormSubmit}
					disabled={!files || isUploading}
				>
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
{/if}

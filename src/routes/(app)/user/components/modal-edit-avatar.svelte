<!-- 
@file src/routes/(app)/user/components/modal-edit-avatar.svelte
@component
**Modal for editing user avatar thumbnail image**
-->

<script lang="ts">
	import { button_cancel, button_delete, button_save, modaledit_avatarfilesallowed, modaledit_avatarfilesize } from '@src/paraglide/messages';
	import { avatarSrc } from '@src/stores/store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@src/utils/logger';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { invalidateAll } from '$app/navigation';
	import { check, type InferInput, instance, object, parse, pipe, type ValiError } from 'valibot';

	let files = $state<File[]>([]);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let previewUrl = $state<string | null>(null);
	let imageLoadError = $state(false);

	interface Props {
		isGivenData?: boolean;
		parent?: {
			regionFooter?: string;
			onClose?: () => void;
			buttonPositive?: string;
		};
	}

	let { isGivenData: _isGivenData = false, parent: _parent = {} }: Props = $props();

	const fileInputId = 'avatar-file-upload';

	const displayAvatar = $derived.by(() => {
		if (previewUrl) {
			return previewUrl;
		}

		if (imageLoadError) {
			return '/Default_User.svg';
		}

		let src = avatarSrc.value || '/Default_User.svg';

		if (src === '/Default_User.svg') {
			return src;
		}

		if (src.startsWith('data:')) {
			return src;
		}

		src = src.replace(/^\/+/, '');
		src = src.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		src = src.replace(/^\/+/, '');

		return `/files/${src}?t=${Date.now()}`;
	});

	const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/gif'];
	const MAX_FILE_SIZE = 5_242_880;
	const COMPRESSION_THRESHOLD = 1024 * 1024;
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

	function setSelectedFiles(inputFiles: File[]) {
		if (!inputFiles || inputFiles.length === 0) {
			return;
		}

		files = [inputFiles[0]];
		imageLoadError = false;
		createOptimizedPreview(inputFiles[0]);
	}

	function handleFileInputChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		setSelectedFiles(Array.from(input.files ?? []));
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		setSelectedFiles(Array.from(event.dataTransfer?.files ?? []));
	}

	async function createOptimizedPreview(file: File) {
		try {
			if (file.size > 1024 * 1024) {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				const img = new Image();
				const objectUrl = URL.createObjectURL(file);

				img.onload = () => {
					const maxSize = 200;
					const ratio = Math.min(maxSize / img.width, maxSize / img.height);
					canvas.width = img.width * ratio;
					canvas.height = img.height * ratio;

					ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
					previewUrl = canvas.toDataURL('image/jpeg', 0.8);
					URL.revokeObjectURL(objectUrl);
				};

				img.onerror = () => {
					URL.revokeObjectURL(objectUrl);
					previewUrl = null;
				};

				img.src = objectUrl;
			} else {
				const fileReader = new FileReader();
				fileReader.onload = (e) => {
					if (e.target instanceof FileReader) {
						previewUrl = e.target.result as string;
					}
				};
				fileReader.readAsDataURL(file);
			}
		} catch (error) {
			logger.error('Error creating preview:', error);
			previewUrl = null;
		}
	}

	async function onFormSubmit(): Promise<void> {
		if (!files || files.length === 0) {
			return;
		}

		if (isUploading) {
			return;
		}

		const file = files[0];

		try {
			parse(avatarSchema, { file });

			if (avatarSrc.value && avatarSrc.value !== '/Default_User.svg') {
				showConfirm({
					title: 'Replace Avatar',
					body: 'Are you sure you want to replace your current avatar?',
					onConfirm: async () => {
						await uploadAvatar(file);
					}
				});
			} else {
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
		}
	}

	async function compressFile(file: File): Promise<File> {
		if (file.type === 'image/svg+xml' || file.size < COMPRESSION_THRESHOLD) {
			return file;
		}

		return new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			const img = new Image();
			const objectUrl = URL.createObjectURL(file);

			img.onload = () => {
				const maxSize = 1024;
				const ratio = Math.min(maxSize / img.width, maxSize / img.height);
				canvas.width = img.width * ratio;
				canvas.height = img.height * ratio;

				ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
				canvas.toBlob(
					(blob) => {
						URL.revokeObjectURL(objectUrl);

						if (blob) {
							const compressedFile = new File([blob], file.name, {
								type: 'image/jpeg',
								lastModified: Date.now()
							});
							resolve(compressedFile);
						} else {
							resolve(file);
						}
					},
					'image/jpeg',
					0.85
				);
			};

			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				resolve(file);
			};

			img.src = objectUrl;
		});
	}

	async function uploadAvatar(file: File): Promise<void> {
		isUploading = true;
		uploadProgress = 0;

		try {
			const processedFile = await compressFile(file);

			const formData = new FormData();
			formData.append('avatar', processedFile);

			uploadProgress = 50;

			const response = await fetch('/api/user/save-avatar', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			uploadProgress = 100;

			if (result.avatarUrl) {
				avatarSrc.value = result.avatarUrl;
				logger.info('Avatar store updated', { avatarUrl: result.avatarUrl });
			}

			await invalidateAll();

			toast.success('Avatar updated successfully!');
			modalState.close();
		} catch (error) {
			console.error('Avatar upload failed:', error);
			imageLoadError = true;
			toast.error('Failed to update avatar');
			previewUrl = null;
		} finally {
			isUploading = false;
			setTimeout(() => {
				if (!isUploading) {
					uploadProgress = 0;
				}
			}, 1000);
		}
	}

	async function deleteAvatar(): Promise<void> {
		logger.info('deleteAvatar function called');

		showConfirm({
			title: 'Delete Avatar',
			body: 'Are you sure you want to delete your avatar? This action cannot be undone.',
			onConfirm: async () => {
				try {
					const currentAvatar = avatarSrc.value;
					logger.info('Attempting to delete avatar:', currentAvatar);

					const response = await fetch('/api/user/delete-avatar', {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ avatarUrl: currentAvatar })
					});

					const result = await response.json();

					logger.info('Delete response:', result);

					if (response.ok && result.success) {
						avatarSrc.value = '/Default_User.svg';
						previewUrl = null;

						toast.success({
							description: '<iconify-icon icon="radix-icons:avatar" width={24} ></iconify-icon> Avatar Deleted'
						});

						modalState.close();

						await invalidateAll();
					} else {
						throw new Error(result.message || 'Delete failed');
					}
				} catch (error) {
					logger.error('Error deleting avatar:', error);

					const msg = error instanceof Error ? error.message : 'Failed to delete avatar';

					toast.error({
						description: `<iconify-icon icon="radix-icons:cross-2" width={24} ></iconify-icon> ${msg}`
					});
				}
			}
		});
	}

	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="modal-avatar space-y-4">
	<form class="modal-form {cForm}">
		<div class="grid grid-cols-1 grid-rows-{avatarSrc.value ? '1' : '2'} items-center justify-center">
			<input id={fileInputId} type="file" accept={acceptMime} class="sr-only" onchange={handleFileInputChange} />

			<label for={fileInputId} class="relative mx-auto mb-3 cursor-pointer rounded-full outline-none focus-within:ring-2 focus-within:ring-primary-500">
				<div
					class="flex size-32 aspect-square items-center justify-center overflow-hidden rounded-full border-4 border-surface-200 bg-surface-100 shadow-xl dark:border-surface-700 dark:bg-surface-800"
				>
					{#if imageLoadError}
						<div class="flex size-full items-center justify-center bg-surface-500 text-3xl font-bold uppercase text-white">
							AB
						</div>
					{:else}
						<img
							src={displayAvatar}
							alt="User avatar"
							class="size-full object-cover"
							onerror={() => {
								imageLoadError = true;
							}}
						/>
					{/if}
				</div>

				{#if !isUploading}
					<div class="absolute inset-0 hidden items-center justify-center rounded-full bg-black/30 text-white hover:flex">
						<span class="text-xs font-medium">Click to upload</span>
					</div>
				{/if}

				{#if isUploading}
					<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
						<div class="text-sm font-medium text-white">...</div>
					</div>
				{/if}
			</label>

			<label
				for={fileInputId}
				class="w-full cursor-pointer rounded-lg border border-dashed border-surface-400 transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
				ondragover={(event) => event.preventDefault()}
				ondrop={handleDrop}
			>
				<div class="flex flex-col items-center justify-center p-4">
					<iconify-icon icon="mdi:cloud-upload" width={24}></iconify-icon>
					<p class="text-sm">{modaledit_avatarfilesallowed()}</p>
				</div>
			</label>
		</div>

		{#if !files.length && !isUploading}
			<small class="block text-center text-tertiary-500 opacity-75 dark:text-primary-500">{modaledit_avatarfilesize()}</small>
		{/if}

		{#if isUploading}
			<div class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
				<div class="flex flex-col items-center gap-2">
					<div class="h-16 w-16 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
					{#if uploadProgress > 0}
						<span class="text-sm font-bold text-white">{uploadProgress}%</span>
					{/if}
				</div>
			</div>
		{/if}
	</form>

	<footer class="modal-footer justify-between border-t border-surface-500/20 pt-4">
		{#if avatarSrc.value && avatarSrc.value !== '/Default_User.svg'}
			<button type="button" onclick={deleteAvatar} class="preset-filled-error-500 btn">
				<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon>
				<span class="hidden sm:block">{button_delete()}</span>
			</button>
		{:else}
			<div></div>
		{/if}

		<div class="flex justify-between gap-2">
			<button type="button" class="preset-outlined-secondary-500 btn" onclick={() => modalState.close()} disabled={isUploading}>{button_cancel()}</button>

			<button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" onclick={onFormSubmit} disabled={!files.length || isUploading}>
				{#if isUploading}
					<div class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
					Uploading...
				{:else}
					{button_save()}
				{/if}
			</button>
		</div>
	</footer>
</div>
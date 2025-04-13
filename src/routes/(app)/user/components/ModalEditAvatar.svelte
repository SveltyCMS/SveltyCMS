<!-- 
@file src/components/user/ModalEditAvatar.svelte
@component
**Modal for editing user avatar thumbnail image**

Efficiently handles avatar uploads with validation, deletion, and real-time preview. Optimized for performance and accessibility.

@props
- `avatarSrc` {string} - Current avatar source from store (default: '/Default_User.svg')
-->

<script lang="ts">
	import axios from 'axios';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	// Stores
	import { avatarSrc } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar, FileUpload, Modal } from '@skeletonlabs/skeleton-svelte';
	import { Toaster, createToaster } from '@skeletonlabs/skeleton-svelte';
	const toaster = createToaster();

	import { object, instance, check, pipe, parse } from 'valibot';

	let files: FileList | null = $state(null);
	let openState = $state(false);

	const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/gif'];
	const MAX_FILE_SIZE = 5242880; // 5MB

	const blobSchema = instance(Blob);
	const fileSchema = pipe(
		blobSchema,
		check((input: Blob) => {
			if (input.size > MAX_FILE_SIZE) {
				throw new Error(m.modaledit_avatarfilesize());
			}
			if (!imageTypes.includes(input.type)) {
				throw new Error('Invalid file type');
			}
			return true;
		})
	);

	const avatarSchema = object({ file: fileSchema });

	function modalClose() {
		toaster.success({
			title: 'Success',
			description: 'Avatar Updated',
			type: 'success'
		});
		openState = false;
	}

	function handleFileChange(details: { files: File[] }) {
		if (!details.files || details.files.length === 0) return;

		files = details.files as unknown as FileList;
		const lastFile = files[files.length - 1];
		console.log('Selected file:', lastFile);

		const fileReader = new FileReader();
		fileReader.onload = (e) => {
			if (e.target?.result) {
				avatarSrc.set(e.target.result as string);
			}
		};
		fileReader.readAsDataURL(lastFile);
	}

	// Handle form submit
	async function onFormSubmit(): Promise<void> {
		if (!files || files.length === 0) return;

		const file = files[0];

		try {
			parse(avatarSchema, { file });
			await uploadAvatar(file);
		} catch (error) {
			toaster.error({
				title: 'Error',
				description: error instanceof Error ? error.message : 'Upload failed',
				type: 'error'
			});
		}
	}

	// Upload avatar
	async function uploadAvatar(file: File): Promise<void> {
		try {
			const formData = new FormData();
			formData.append('avatar', file);
			formData.append('user_id', page.data.user._id);

			const response = await axios.post('/api/user/saveAvatar', formData, {
				headers: { 'Content-Type': 'multipart/form-data' }
			});

			if (response.status === 200) {
				avatarSrc.set(response.data.avatarUrl);
				toaster.success({
					title: 'Success',
					description: 'Avatar updated successfully!',
					type: 'success'
				});
				openState = false;
				await invalidateAll();
			}
		} catch (error) {
			toaster.error({
				title: 'Error',
				description: 'Failed to update avatar',
				type: 'error'
			});
		}
	}

	async function deleteAvatar(): Promise<void> {
		try {
			const response = await axios.delete('/api/user/deleteAvatar');

			if (response.status === 200) {
				avatarSrc.set('/Default_User.svg');
				toaster.success({
					title: 'Success',
					description: 'Avatar deleted successfully',
					type: 'success'
				});
				openState = false;
				await invalidateAll(); // Reload the page data to get the updated user object
			}
		} catch (error) {
			toaster.error({
				title: 'Error',
				description: 'Failed to delete avatar',
				type: 'error'
			});
		}
	}
</script>

<!-- Toaster Component -->
<Toaster {toaster} />

<Modal
	open={openState}
	onOpenChange={(e) => (openState = e.open)}
	triggerBase="btn preset-tonal"
	contentBase="card bg-surface-100-900 p-4 space-y-4 shadow-xl max-w-screen-sm"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet trigger()}{m.userpage_editavatar()}{/snippet}

	{#snippet content()}
		<div class="modal-avatar space-y-4">
			<header class="text-primary-500 text-center text-2xl font-bold">
				{m.usermodaluser_settingtitle()}
			</header>

			<form class="border-surface-500 rounded-container space-y-4 border p-4">
				<div class="grid grid-cols-1 items-center justify-center">
					<!-- Avatar Thumbnail -->
					<Avatar src={$avatarSrc ? $avatarSrc : '/Default_User.svg'} name="SveltyCMS" />

					<!-- FileDropzone Area-->
					<FileUpload
						name="Avatar Upload"
						subtext={m.modaledit_avatarfilesallowed()}
						accept={imageTypes.join(',')}
						onFileChange={console.log}
						onFileReject={console.error}
						classes="w-full"
					>
						{#snippet iconInterface()}
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
							>{/snippet}
						{#snippet iconFile()}{m.modaledit_avatarfilesallowed()}{/snippet}
						{#snippet iconFileRemove()}IconRemove{/snippet}
					</FileUpload>
				</div>

				{#if !files}
					<small class="text-tertiary-500 dark:text-primary-500 block text-center opacity-75">
						{m.modaledit_avatarfilesize()}
					</small>
				{/if}
			</form>

			<footer class="flex items-center justify-between">
				<!-- Delete Avatar -->
				{#if $avatarSrc !== '/Default_User.svg'}
					<button type="button" onclick={deleteAvatar} class="btn preset-filled-error">
						{m.button_delete()}
					</button>
				{:else}
					<div></div>
					<!-- Empty div when using the default avatar -->
				{/if}

				<div class="flex gap-2">
					<!-- Cancel -->
					<button class="btn preset-outline-secondary" onclick={modalClose}>
						{m.button_cancel()}
					</button>
					<!-- Save -->
					<button class="btn preset-filled-tertiary" onclick={onFormSubmit}>
						{m.button_save()}
					</button>
				</div>
			</footer>
		</div>
	{/snippet}
</Modal>

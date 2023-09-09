<script lang="ts">
	import axios from 'axios';
	import { page } from '$app/stores';
	const user = $page.data.user;

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { FileDropzone } from '@skeletonlabs/skeleton';
	let files: FileList;

	export let avatarSrc: any;

	let _avatarSrc: undefined | string = undefined;

	function onChange(e: Event) {
		files = (e.target as HTMLInputElement).files!;

		const lastFile = files[files.length - 1];
		const fileReader = new FileReader();

		fileReader.onload = (e) => {
			if (e.target instanceof FileReader) {
				_avatarSrc = e.target.result as string;
			}
		};

		fileReader.readAsDataURL(lastFile as Blob);
	}

	// Zod validation
	import z from 'zod';
	const imageTypes = [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/webp',
		'image/avif',
		'image/svg+xml',
		'image/gif'
	];

	const avatarSchema = z.object({
		file: z
			.instanceof(Blob)
			.optional()
			.superRefine((val, ctx) => {
				if (val) {
					if (val.size > 5242880) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: $LL.USER_FileSize()
						});
					}

					if (!imageTypes.includes(val.type)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: $LL.USER_Avatar_Unsupported()
						});
					}
				}
			})
	});

	//Create a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		// Check if files were selected
		if (!files) return;

		const file = files[0];

		try {
			avatarSchema.parse({
				file
			});
		} catch (error) {
			console.error((error as Error).message);
			return;
		}

		// Upload the image to the server
		const formData = new FormData();
		if (file) {
			formData.append('avatar', file);
			formData.append('userID', user.id);
		}
		const response = await axios.post(
			'/api/user/saveAvatar',

			formData,

			{
				headers: {
					'content-type': 'multipart/form-data'
				}
			}
		);
		if (response.status === 200) {
			$avatarSrc = response.data.url;
		}

		// Pass the response to the parent component and close the modal
		if ($modalStore[0].response) {
			$modalStore[0].response({ dataURL: $avatarSrc, response });
		}
		modalStore.close();
	}

	// Function to delete the user's avatar
	async function deleteAvatar() {
		try {
			const response = await axios.post('/api/user/deleteAvatar', { userID: user.id });

			if (response.status === 200) {
				// Clear the _avatarSrc variable and update the avatarSrc store
				_avatarSrc = undefined;
				avatarSrc.set('/Default_User.svg'); // Set default avatar or empty

				// Close the modal after successful deletion
				modalStore.close();
			}
		} catch (error) {
			console.error('Error deleting avatar:', error);
		}
	}
	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-avatar {cBase}">
	<header class={`text-center text-primary-500 ${cHeader}`}>
		{$modalStore[0]?.title ?? '(title missing)'}
	</header>
	<article class="text-center text-sm">
		{$modalStore[0]?.body ?? '(body missing)'}
	</article>

	<form class="modal-form {cForm}">
		<div class="grid grid-cols-1 grid-rows-{$avatarSrc ? '1' : '2'} items-center justify-center">
			<!-- Avatar Thumbnail -->
			<Avatar
				src={_avatarSrc ? _avatarSrc : $avatarSrc ? $avatarSrc : '/Default_User.svg'}
				rounded-full
				class="mx-auto mb-3 w-32"
			/>

			<!-- FileDropzone Area-->
			<FileDropzone
				on:change={onChange}
				required
				name="Avatar Upload"
				accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml,image/gif"
				slotLead="flex flex-col justify-center items-center"
			>
				<svelte:fragment slot="lead">
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
				</svelte:fragment>
				<svelte:fragment slot="meta">{$LL.USER_FilesAllowed()}</svelte:fragment>
			</FileDropzone>
		</div>
		{#if !files}
			<small class="block text-center opacity-75">{$LL.USER_FileSize()}</small>
		{/if}
	</form>

	<footer class="modal-footer {parent.regionFooter} justify-between">
		{#if $avatarSrc !== '/Default_User.svg'}
			<button type="button" on:click={deleteAvatar} class="variant-filled-error btn">
				<iconify-icon icon="icomoon-free:bin" width="24" />{$LL.USER_Delete()}
			</button>
		{:else}
			<div></div>
			<!-- Empty div when using the default avatar -->
		{/if}
		<div class="flex justify-between">
			<button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>
				{$LL.USER_Cancel()}
			</button>
			<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{$LL.USER_Save()}</button>
		</div>
	</footer>
</div>

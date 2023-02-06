<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Stores
	import { modalStore } from '@skeletonlabs/skeleton';

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	// skeleton
	import { FileDropzone } from '@skeletonlabs/skeleton';
	let files: FileList;
	function onChange(e: any): void {
		console.log('file data:', e);
	}

	import { Avatar } from '@skeletonlabs/skeleton';
	let avatarSrc = $user?.avatar;

	// Form Data
	const formData = {
		avatarSrc: 'Should show Existing Avatar Image'
	};

	// Zod validation
	import z from 'zod';
	const imageTypes = [
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/webp',
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
							message: 'Avatar must be less than 5MB'
						});
					}

					if (!imageTypes.includes(val.type)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: 'Unsupported file type. Supported formats: jpeg, jpg, png, webp, svg, gif'
						});
					}
				}
			})
	});

	// We've created a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		// Check if files were selected
		if (!files) return;

		// Get the first file in the files list
		const file = files[0];

		// Validate the file using Zod
		try {
			const validatedFile = avatarSchema.file.assert(file);
		} catch (error) {
			console.error(error.message);
			return;
		}

		// Resize and save the image using Sharp.js
		const sharp = require('sharp');
		const fs = require('fs');
		const inputBuffer = await fs.promises.readFile(validatedFile.path);
		const resizedBuffer = await sharp(inputBuffer)
			.resize({ width: 200, height: 200 })
			.webp()
			.toBuffer();
		const imagePath = `media/users/${$user?.userId}.webp`;
		await fs.promises.writeFile(imagePath, resizedBuffer);

		// Update the form data with the new image path
		formData.avatarSrc = imagePath;

		// Pass the form data to the parent component and close the modal
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'space-y-4';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-avatar {cBase}">
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}">
		<div class="input-label flex justify-between">
			<Avatar src={avatarSrc ?? '/Default_User.svg'} rounded-xl class="w-32 mr-4 " />

			<FileDropzone bind:files on:change={onChange} required>
				<svg xmlns="http://www.w3.org/2000/svg" width="4.5em" height="4.5em" viewBox="0 0 24 24"
					><g fill="none" fill-rule="evenodd"
						><path
							d="M24 0v24H0V0h24ZM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.017-.018Zm.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022Zm-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01l-.184-.092Z"
						/><path
							fill="currentColor"
							d="M12 2v6.5a1.5 1.5 0 0 0 1.356 1.493L13.5 10H20v10a2 2 0 0 1-1.85 1.995L18 22H6a2 2 0 0 1-1.995-1.85L4 20V4a2 2 0 0 1 1.85-1.995L6 2h6Zm-.707 9.173l-2.121 2.121a1 1 0 1 0 1.414 1.414l.414-.414V17a1 1 0 1 0 2 0v-2.706l.414.414a1 1 0 1 0 1.414-1.414l-2.12-2.121a1 1 0 0 0-1.415 0ZM14 2.043a2 2 0 0 1 .877.43l.123.113L19.414 7a2 2 0 0 1 .502.84l.04.16H14V2.043Z"
						/></g
					></svg
				>
				<div class="flex flex-col text-center">
					<p class="!text-xl font-bold">Upload a file or Drap & Drop</p>
					<p class="">Files should not exceed 5mb.</p>
					<p class="">PNG, JPEG, GIF, SVG, WEBP allowed</p>
				</div>
			</FileDropzone>
		</div>
	</form>

	<!-- prettier-ignore -->
	<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Save</button>
    </footer>
</div>

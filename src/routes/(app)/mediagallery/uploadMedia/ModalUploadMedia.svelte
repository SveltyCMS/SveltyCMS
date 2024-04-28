<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { getModalStore, FileDropzone, Avatar } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	let MediaSrc: undefined | string = undefined;
	let files: FileList;

	// Form Data
	const formData = {
		File: null
	};

	function onChange(e: Event) {
		files = (e.target as HTMLInputElement).files!;

		const lastFile = files[files.length - 1];
		const fileReader = new FileReader();

		fileReader.onload = (e) => {
			if (e.target instanceof FileReader) {
				MediaSrc = e.target.result as string;
			}
		};

		fileReader.readAsDataURL(lastFile as Blob);
	}

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 ';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500 ';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class=" {cBase}">
		<header class={`${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="hidden text-center sm:block">{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->

		<form class="modal-form {cForm}">
			{#if !files}
				<div class="flex items-center justify-center">
					<!-- FileDropzone Area-->
					<FileDropzone
						required
						on:change={onChange}
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
						<svelte:fragment slot="meta">{m.modaledit_avatarfilesallowed()}</svelte:fragment>
					</FileDropzone>
				</div>

				<small class="block text-center text-tertiary-500 opacity-75 dark:text-primary-500">{m.modaledit_avatarfilesize()}</small>
			{:else}
				<!--  Thumbnail -->
				<img src={MediaSrc} class="mx-auto mb-3 w-32" />
			{/if}
		</form>

		<footer class="modal-footer flex justify-between {parent.regionFooter}">
			<button class="variant-outline-secondary btn" on:click={parent.onClose}>{m.button_cancel()}</button>
			<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.button_save()}</button>
		</footer>
	</div>
{/if}

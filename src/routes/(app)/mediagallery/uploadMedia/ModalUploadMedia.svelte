<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	export let mediaType: string;
	export let sectionName: string;
	export let files: File[] = [];

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Form Data
	const formData = {
		File: null
	};

	function generateThumbnail(file: File): string {
		const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

		let thumbnail = '';
		if (file.type.startsWith('image/')) {
			// For image files, display thumbnail
			thumbnail = URL.createObjectURL(file);
		} else if (fileExt === '.pdf') {
			// For PDF files, use a PDF icon
			thumbnail = 'vscode-icons:file-type-pdf2';
		} else if (fileExt === '.doc' || fileExt === '.docx') {
			// For Microsoft Word document files, use a Word icon
			thumbnail = 'vscode-icons:file-type-word';
		} else if (file.type.startsWith('audio/')) {
			// For audio files, use a play button icon
			thumbnail = 'fa-solid:play-circle';
		} else if (file.type.startsWith('video/')) {
			// For video files, use a video icon
			thumbnail = 'fa-solid:video';
		} else {
			// For other file types, use a generic file icon
			thumbnail = 'vscode-icons:file';
		}

		return thumbnail;
	}

	function handleEdit(file: File) {
		// Handle the edit action here
		console.log('Edited file:', file);
	}

	function handleDelete(file: File) {
		// Handle the delete action here
		files = files.filter((f) => f !== file);
	}

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'bg-surface-100-800-token w-screen h-screen p-4 flex flex-col justify-center items-center';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500 ';
	const cForm = 'mt-3 border border-surface-500 p-2 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class=" {cBase}">
		<header class={`${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="hidden text-center sm:block">{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->

		<form class=" {cForm}">
			<!-- Show all media as card with delete button and edit button -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{#each files as file}
					<div class="card card-hover relative">
						<!-- Edit and delete buttons -->
						<div class="absolute left-0 top-2 flex w-full justify-between px-2 opacity-0 hover:opacity-100">
							<button on:click={() => handleEdit(file)} class="variant-ghost-surface btn-icon">
								<iconify-icon icon="material-symbols:edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
							</button>
							<button on:click={() => handleDelete(file)} class="variant-ghost-surface btn-icon">
								<iconify-icon icon="material-symbols:delete" width="24" class="text-error-500" />
							</button>
						</div>

						<!-- Media preview -->
						<div class="card-header flex h-48 flex-col items-center justify-center">
							{#if generateThumbnail(file)}
								{#if file.type.startsWith('image/')}
									<img src={generateThumbnail(file)} alt={file.name} class="max-h-full max-w-full" />
								{:else if file.type.startsWith('audio/')}
									<audio controls class="max-h-full max-w-full">
										<!-- audio player -->
										<source src={URL.createObjectURL(file)} type={file.type} />
										Your browser does not support the audio element.
									</audio>
								{:else}
									<iconify-icon icon={generateThumbnail(file)} width="80" height="80" />
								{/if}
							{:else}
								<p>Loading thumbnail...</p>
							{/if}
						</div>

						<!-- Media name -->
						<div class="label mt-2 flex h-16 items-center justify-center bg-gray-100 p-2 dark:bg-surface-600">
							<p class="overflow-hidden overflow-ellipsis whitespace-normal text-center text-tertiary-500 dark:text-primary-500">{file.name}</p>
						</div>

						<!-- Media Type & Size -->
						<div class="flex flex-grow items-center justify-between p-1 dark:bg-surface-700">
							<p class="variant-ghost-secondary badge gap-2"><iconify-icon icon={generateThumbnail(file)} width="20" height="20" /> {file.type}</p>
							<p class="variant-ghost-tertiary badge">{(file.size / 1024).toFixed(2)} KB</p>
						</div>
					</div>
				{/each}
			</div>
		</form>

		<footer class="modal-footer m-4 flex w-full justify-between {parent.regionFooter}">
			<button class="variant-outline-secondary btn" on:click={parent.onClose}>{m.button_cancel()}</button>
			<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.button_save()}</button>
		</footer>
	</div>
{/if}

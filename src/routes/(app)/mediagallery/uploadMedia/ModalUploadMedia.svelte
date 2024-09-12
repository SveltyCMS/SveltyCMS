<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/ModalUploadMedia.svelte
@description This page is used to upload media to the media gallery. 
-->

<script lang="ts">
	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let parent: any;
	export let sectionName: string;
	export let files: File[] = []; // This holds all files, both initially provided and newly added
	export let onDelete: (file: File) => void;
	export let uploadFiles: Function;

	let fileSet = new Set<string>(); // To track unique files by name and size
	let duplicateWarning = '';

	// Initialize fileSet to prevent duplicates
	$: fileSet = new Set(files.map((file) => `${file.name}-${file.size}`));

	// Generate thumbnail URL or icon based on file type
	function generateThumbnail(file: File): string {
		const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
		switch (true) {
			case file.type?.startsWith('image/'):
				return URL.createObjectURL(file); // Show actual image as thumbnail
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

	function formatMimeType(mimeType?: string): string {
		if (!mimeType) {
			return 'Unknown Type';
		}
		const typeMapping: { [key: string]: string } = {
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
			'application/pdf': 'PDF',
			'application/vnd.ms-powerpoint': 'PowerPoint',
			'application/vnd.ms-excel': 'Excel',
			'text/plain': 'Text',
			'application/zip': 'Archive'
		};
		return typeMapping[mimeType] || mimeType.split('/').pop()?.toUpperCase() || 'UNKNOWN';
	}

	// Handle the delete action here
	function handleDelete(file: File) {
		files = files.filter((f) => f !== file);
		fileSet.delete(`${file.name}-${file.size}`);
		onDelete(file);

		// Update the files array and fileSet after deletion
		if (files.length === 0) {
			handleCancel(); // Close the modal if no files are left
		}
	}

	// Handle the file input here
	function handleFileInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			const newFilesArray = Array.from(input.files);
			newFilesArray.forEach((file) => {
				const fileKey = `${file.name}-${file.size}`;
				if (fileSet.has(fileKey)) {
					duplicateWarning = `The file "${file.name}" already exists.`;
				} else {
					duplicateWarning = '';
					files.push(file);
					fileSet.add(fileKey);
				}
			});
		}
	}

	function handleCancel() {
		// Clear the files array and fileSet
		files = [];
		fileSet.clear();
		modalStore.close(); // Close the modal
	}

	const onFormSubmit = () => {
		uploadFiles(files); // Ensure files are passed back to the parent

		// Clear files and close the modal
		handleCancel();
	};

	// Base Classes
	const cBase = 'bg-surface-100-800-token w-screen h-screen p-4 flex flex-col justify-center items-center';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500 ';
	const cForm = 'mt-3 border border-surface-500 p-2 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class={cBase}>
		<header class={cHeader}>
			{sectionName}
		</header>
		<article class="hidden text-center sm:block">{$modalStore[0]?.body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->

		<form id="upload-form" class={cForm} action="/mediagallery" method="post" on:submit|preventDefault={onFormSubmit}>
			<!-- Show all media as cards with delete buttons -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{#each files as file (file.name + file.size)}
					<div class="card card-hover relative">
						<!-- Delete buttons -->
						<div class="absolute right-0 top-2 flex w-full justify-end px-2 opacity-0 hover:opacity-100">
							<button on:click={() => handleDelete(file)} class="variant-ghost-surface btn-icon">
								<iconify-icon icon="material-symbols:delete" width="24" class="text-error-500" />
							</button>
						</div>

						<!-- Media preview -->
						<div class="card-header flex h-32 flex-col items-center justify-center">
							{#if generateThumbnail(file)}
								{#if file.type?.startsWith('image/')}
									<img src={generateThumbnail(file)} alt={file.name} class="max-h-full max-w-full" />
								{:else if file.type?.startsWith('audio/')}
									<!-- Audio player -->
									<audio controls class="max-h-full max-w-full">
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
						<div class="label mt-1 flex h-16 items-center justify-center bg-gray-100 p-2 dark:bg-surface-600">
							<p class="overflow-hidden overflow-ellipsis whitespace-normal text-center text-tertiary-500 dark:text-primary-500">
								{file.name}
							</p>
						</div>

						<!-- Media Type & Size -->
						<div class="flex flex-grow items-center justify-between p-1 dark:bg-surface-700">
							<div class="flex items-center gap-1">
								<iconify-icon icon={generateThumbnail(file)} width="16" height="16" />
								<span>{formatMimeType(file.type)}</span>
							</div>
							<span class="variant-ghost-tertiary badge">{(file.size / 1024).toFixed(2)} KB</span>
						</div>
					</div>
				{/each}
			</div>

			<!-- File input for adding more files -->
			<div class="mb-4 mt-2 flex items-center justify-between border-t border-surface-400 p-4">
				<div class="mb-4 mt-2 flex items-center gap-2">
					<label for="file-input" class="block text-tertiary-500 dark:text-primary-500">Add more files:</label>
					<input id="file-input" type="file" multiple on:change={handleFileInputChange} />
				</div>
				{#if duplicateWarning}
					<p class="variant-filled-error rounded px-2 py-4">{duplicateWarning}</p>
				{/if}
			</div>
		</form>

		<footer class="modal-footer m-4 flex w-full justify-between {parent.regionFooter}">
			<button class="variant-outline-secondary btn" on:click={handleCancel}>{m.button_cancel()}</button>
			<button type="submit" form="upload-form" class="variant-filled-primary btn {parent.buttonPositive}">{m.button_save()}</button>
		</footer>
	</div>
{/if}

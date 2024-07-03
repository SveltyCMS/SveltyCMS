<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	export let mediaType: string;
	export let sectionName: string;
	export let files: File[] = [];
	export let onDelete: (file: File) => void;

	import { enhance } from '$app/forms';
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { SubmitFunction } from '../$types';
	const modalStore = getModalStore();

	// Form Data
	const formData = {
		File: null
	};

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
		if (typeof mimeType === 'undefined') {
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
			// Add more mappings as needed
		};
		return typeMapping[mimeType] || mimeType.split('/').pop().toUpperCase();
	}

	// Specific function to generate icons for types badge
	function getTypeIcon(file: File): string {
		if (file.type?.startsWith('image/')) return 'carbon:image';
		return generateThumbnail(file);
	}

	function handleEdit(file: File) {
		// Handle the edit action here
		console.log('Edited file:', file);
	}

	function handleDelete(file: File) {
		// Handle the delete action here
		files = files.filter((f) => f !== file);
		onDelete(file);
	}

	// We've created a custom submit function to pass the response and close the modal.
	const onFormSubmit: SubmitFunction = ({ formData }) => {
		files.forEach(async (file, index) => {
			formData.append('files', file);
		});

		modalStore.close();

		return ({ result }) => {
			console.log(result);
			console.log('Form returned.');
		};
	};

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
		<article class="hidden text-center sm:block">{$modalStore[0]?.body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->

		<form id="upload-form" class=" {cForm}" action="/mediagallery" method="post" use:enhance={onFormSubmit}>
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
						<div class="card-header flex h-32 flex-col items-center justify-center">
							{#if generateThumbnail(file)}
								{#if file.type?.startsWith('image/')}
									<img src={generateThumbnail(file)} alt={file.name} class="max-h-full max-w-full" />
								{:else if file.type?.startsWith('audio/')}
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
						<div class="label mt-1 flex h-16 items-center justify-center bg-gray-100 p-2 dark:bg-surface-600">
							<p class="overflow-hidden overflow-ellipsis whitespace-normal text-center text-tertiary-500 dark:text-primary-500">{file.name}</p>
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
		</form>

		<footer class="modal-footer m-4 flex w-full justify-between {parent.regionFooter}">
			<button class="variant-outline-secondary btn" on:click={parent.onClose}>{m.button_cancel()}</button>
			<button type="submit" form="upload-form" class="btn {parent.buttonPositive}">{m.button_save()}</button>
		</footer>
	</div>
{/if}

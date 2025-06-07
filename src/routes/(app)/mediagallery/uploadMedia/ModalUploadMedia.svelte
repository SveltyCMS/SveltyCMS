<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/ModalUploadMedia.svelte
@component
**This page is used to upload media to the media gallery**

@example
<ModalUploadMedia parent={parent} sectionName={sectionName} files={files} onDelete={onDelete} uploadFiles={uploadFiles} />

#### Props
- `parent` {any} - Parent component
- `sectionName` {string} - Name of the section
- `files` {File[]} - Array of files to be uploaded **Optional**
- `onDelete` {Function} - Function to delete a file
- `uploadFiles` {Function} - Function to upload files

#### Features
- Displays a collection of media files based on the specified media type.
- Provides a user-friendly interface for searching, filtering, and navigating through media files.
- Emits the `mediaDeleted` event when a media file is deleted.
-->

<script lang="ts">
	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		parent: {
			type: string;
			id?: string;
			name?: string;
			[key: string]: unknown;
		};
		sectionName: string;
		files?: File[]; // This holds all files, both initially provided and newly added
		onDelete: (file: File) => void;
		uploadFiles: (files: File[]) => Promise<void>;
	}

	let { parent, sectionName, files = $bindable([]), onDelete, uploadFiles }: Props = $props();

	let fileSet = $state(new Set<string>()); // To track unique files by name and size
	let duplicateWarning = $state('');
	let objectUrls = $state<Map<string, string>>(new Map()); // Map fileKey to ObjectURL

	// Effect to manage object URLs based on the files array
	$effect(() => {
		const currentFiles = files; // Read dependency
		const currentFileKeys = new Set(currentFiles.map((f) => `${f.name}-${f.size}`));
		const newObjectUrls = new Map<string, string>();
		const previousObjectUrls = objectUrls; // Capture previous state for cleanup comparison

		// Create/update URLs for current files
		for (const file of currentFiles) {
			const fileKey = `${file.name}-${file.size}`;
			if (file.type?.startsWith('image/') || file.type?.startsWith('audio/')) {
				if (previousObjectUrls.has(fileKey)) {
					// Reuse existing URL if file is still present
					newObjectUrls.set(fileKey, previousObjectUrls.get(fileKey)!);
				} else {
					// Create new URL for new files
					try {
						const url = URL.createObjectURL(file);
						newObjectUrls.set(fileKey, url);
					} catch (e) {
						console.error(`Error creating ObjectURL for ${file.name}:`, e);
						// Optionally handle the error, e.g., set a placeholder URL or skip
					}
				}
			}
		}

		// Update the state
		objectUrls = newObjectUrls;

		// Cleanup function: Revoke URLs for files that are no longer present
		return () => {
			const urlsInCurrentState = new Set(newObjectUrls.values());
			previousObjectUrls.forEach((url, key) => {
				// Revoke URL if the file key is gone OR if the URL itself is not in the new map (e.g., error during creation)
				if (!currentFileKeys.has(key) || !urlsInCurrentState.has(url)) {
					console.log(`Revoking URL for removed/changed file: ${key}`);
					URL.revokeObjectURL(url);
				}
			});
		};
	});

	// Effect for final cleanup on component unmount
	$effect(() => {
		// This effect runs once on mount and its cleanup runs once on unmount
		return () => {
			console.log('Component unmounting, revoking all object URLs');
			// Make sure to access the latest state of objectUrls inside the cleanup
			const urlsToRevoke = objectUrls;
			urlsToRevoke.forEach((url, key) => {
				console.log(`Revoking URL on unmount: ${key}`);
				URL.revokeObjectURL(url);
			});
		};
	});

	// Get icon string for file type (used as fallback or for non-previewable types)
	function getFileIcon(file: File): string {
		const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
		switch (true) {
			// Keep image/audio cases for consistency in the other usage below, but they won't be hit here often
			case file.type?.startsWith('image/'):
				return 'fa-solid:image'; // Generic image icon
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
				return 'vscode-icons:file'; // Default file icon
		}
	}

	// Format file MIME type
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
			// Add more mappings as needed
		};
		// Prioritize specific mappings, then try to extract from MIME type, fallback to UNKNOWN
		return typeMapping[mimeType] || mimeType.split('/').pop()?.toUpperCase() || 'UNKNOWN';
	}

	// Handle the delete action here
	function handleDelete(file: File) {
		const fileKey = `${file.name}-${file.size}`;
		// The $effect watching 'files' will revoke the ObjectURL automatically
		files = files.filter((f) => f !== file); // Update the files array
		fileSet.delete(fileKey); // Update the set
		onDelete(file); // Notify parent

		// If that was the last file, just close the modal
		if (files.length === 0) {
			modalStore.close(); // Close the modal directly
		}
	}

	// Handle the file input here
	function handleFileInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			const newFilesArray = Array.from(input.files);
			const addedFiles: File[] = []; // Track files actually added in this batch
			duplicateWarning = ''; // Reset warning

			for (const file of newFilesArray) {
				const fileKey = `${file.name}-${file.size}`;
				if (fileSet.has(fileKey)) {
					// Show warning only for the first duplicate found in this batch
					if (!duplicateWarning) {
						duplicateWarning = `File "${file.name}" already exists and was skipped.`;
					}
					console.warn(`Duplicate file skipped: ${file.name}`);
				} else {
					addedFiles.push(file);
					fileSet.add(fileKey); // Add to set immediately
				}
			}

			// Update the files array reactively by concatenating
			if (addedFiles.length > 0) {
				files = [...files, ...addedFiles]; // Trigger $effect update
			}

			// Clear the input value to allow selecting the same file again if needed after deletion
			input.value = '';
		}
	}

	// Function to handle the Cancel button click
	function handleCancel() {
		// Explicitly revoke URLs and clear the map for immediate UI update
		objectUrls.forEach((url, key) => {
			console.log(`Revoking URL on cancel: ${key}`);
			URL.revokeObjectURL(url);
		});
		objectUrls = new Map(); // Clear the state map

		// Clear the files array and fileSet
		files = []; // This will also trigger the $effect cleanup, but revoking first ensures immediate removal
		fileSet.clear();
		modalStore.close(); // Close the modal
	}

	const onFormSubmit = async () => {
		// Prevent submission if there are no files
		if (files.length === 0) {
			// Optionally show a message to the user
			console.warn('No files selected for upload.');
			// You might want to set a warning message state here instead of just logging
			duplicateWarning = 'No files selected for upload.'; // Reuse existing warning state for simplicity
			return; // Stop the submission
		}

		try {
			// Await the upload process before proceeding
			await uploadFiles(files);

			// Clear files and close the modal ONLY on successful upload
			handleCancel();
		} catch (error) {
			console.error('Error uploading files:', error);
			// Keep the modal open and display an error message
			// You might want a dedicated error state instead of reusing duplicateWarning
			duplicateWarning = `Upload failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	};

	// Base Classes
	const cBase = 'border bg-surface-100-800-token w-full md:w-3/4 rounded p-4 flex flex-col justify-center items-center';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500 ';
	const cForm = 'w-full mt-3 border border-surface-500 p-2 space-y-4 rounded-container-token flex flex-col'; // Added w-full, flex, flex-col
</script>

{#if $modalStore[0]}
	<div class={cBase} style="max-height: 90vh;">
		<!-- Added max-height to outer div -->
		<header class={cHeader}>
			{sectionName}
		</header>
		<article class="hidden flex-shrink-0 text-center sm:block">
			{$modalStore[0]?.body ?? '(body missing)'}
		</article>
		<!-- Enable for debugging: -->

		<form id="upload-form" class="{cForm} flex-grow overflow-hidden" onsubmit={onFormSubmit}>
			<!-- Scrollable content area -->
			<div class="flex-grow overflow-y-auto">
				<!-- Show all media as cards with delete buttons on hover -->
				<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{#each files as file (file.name + file.size)}
						{@const fileKey = `${file.name}-${file.size}`}
						{@const previewUrl = objectUrls.get(fileKey)}
						{@const iconName = getFileIcon(file)}
						<div class="card card-hover relative">
							<!-- Delete buttons -->
							<div class="absolute right-0 top-2 flex w-full justify-end px-2 opacity-0 hover:opacity-100">
								<button type="button" onclick={() => handleDelete(file)} aria-label="Delete" class="variant-ghost-surface btn-icon">
									<iconify-icon icon="material-symbols:delete" width="24" class="text-error-500"></iconify-icon>
								</button>
							</div>

							<!-- Media preview -->
							<div class="card-header flex h-32 flex-col items-center justify-center">
								{#if file.type?.startsWith('image/') && previewUrl}
									<img src={previewUrl} alt={file.name} class="max-h-full max-w-full object-contain" />
								{:else if file.type?.startsWith('audio/') && previewUrl}
									<!-- Audio player -->
									<audio controls class="max-h-full max-w-full">
										<source src={previewUrl} type={file.type} />
										Your browser does not support the audio element.
									</audio>
								{:else}
									<!-- Fallback Icon -->
									<iconify-icon icon={iconName} width="80" height="80"></iconify-icon>
								{/if}
							</div>

							<!-- Media Filename -->
							<div
								class="label mt-1 overflow-hidden overflow-ellipsis whitespace-normal bg-gray-100 p-2 text-center text-tertiary-500 dark:bg-surface-600 dark:text-primary-500"
							>
								{file.name}
							</div>

							<!-- Media Type & Size -->
							<div class="flex flex-grow items-center justify-between p-1 dark:bg-surface-700">
								<div class="variant-ghost-tertiary badge flex items-center gap-1">
									<!-- Media Icon & type  -->
									<iconify-icon icon={iconName} width="16" height="16"></iconify-icon>
									<span class="text-tertiary-500 dark:text-primary-500">{formatMimeType(file.type)}</span>
								</div>
								<!-- File Size in KB -->
								<p class="variant-ghost-tertiary badge flex items-center gap-1">
									<span class="text-tertiary-500 dark:text-primary-500">{(file.size / 1024).toFixed(2)}</span>
									KB
								</p>
							</div>
						</div>
					{/each}
				</div>

				<!-- File input for adding more files -->
				<div class="flex w-full items-center justify-between border-t border-surface-400">
					<div class="mb-4 mt-2 flex w-full items-center gap-2">
						<label for="file-input" class="text-nowrap text-tertiary-500 dark:text-primary-500">Add more files:</label>
						<input id="file-input" type="file" class="input" onchange={handleFileInputChange} />
					</div>
					{#if duplicateWarning}
						<p class="variant-filled-error rounded px-2 py-4">{duplicateWarning}</p>
					{/if}
				</div>
			</div>
		</form>

		<footer class="modal-footer m-4 flex w-full justify-between {parent.regionFooter} flex-shrink-0">
			<button type="button" class="variant-outline-secondary btn" onclick={handleCancel}>{m.button_cancel()}</button>
			<button type="submit" form="upload-form" class="variant-filled-tertiary btn dark:variant-filled-primary {parent.buttonPositive}"
				>{m.button_save()}</button
			>
		</footer>
	</div>
{/if}

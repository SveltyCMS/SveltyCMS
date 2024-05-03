<script lang="ts">
	import { goto } from '$app/navigation';
	import { asAny } from '@src/utils/utils';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';
	let tabSet: number = 0;

	export let value: File | MediaImage | undefined = undefined;
	export let multiple = false;
	export let show = true;

	let files: File[] = [];
	let input: HTMLInputElement;
	let showMedia = false;

	let dropZone: HTMLDivElement;

	function handleFileDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();

		const droppedFiles = e.dataTransfer?.files;
		if (droppedFiles) {
			for (const file of droppedFiles) {
				files = [...files, file];
			}
		}

		dropZone.style.removeProperty('border-color');
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dropZone.style.borderColor = '#6bdfff';
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dropZone.style.removeProperty('border-color');
	}

	function generateThumbnail(file: File) {
		let thumbnailUrl: string | null = null;

		if (file.type.startsWith('image/')) {
			thumbnailUrl = URL.createObjectURL(file);
		} else if (file.type === 'application/pdf') {
			// You can use a third-party library like pdf.js to render PDF thumbnails
			thumbnailUrl = '/path/to/pdf-thumbnail.png';
		} else {
			// Display an icon based on file type
			thumbnailUrl = `/path/to/file-type-icon.png`;
		}

		return thumbnailUrl;
	}

	function handleEdit(file: File) {
		// Handle the edit action here
		console.log('Edited file:', file);
	}

	function handleDelete(file: File) {
		// Handle the delete action here
		files = files.filter((f) => f !== file);
	}

	function onChange() {
		if (input.files) {
			for (const file of input.files) {
				files = [...files, file];
			}
		}
	}
</script>

<div class="mb-4 flex items-center justify-between">
	<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
	<button class="variant-filled-secondary btn" on:click={() => goto('/mediagallery')}>
		<iconify-icon icon="material-symbols:arrow-back-rounded" width="24" class="rtl:rotate-180" />
		{m.button_back()}
	</button>
</div>

<div class="wrapper">
	<TabGroup>
		<Tab bind:group={tabSet} name="local" value={0}>
			<svelte:fragment slot="lead">
				<div class="flex items-center justify-between gap-2">
					<iconify-icon icon="material-symbols:database" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Local Upload</p>
				</div>
			</svelte:fragment>
		</Tab>

		<Tab bind:group={tabSet} name="remote" value={1}>
			<svelte:fragment slot="lead">
				<div class="flex items-center justify-between gap-2">
					<iconify-icon icon="arcticons:tautulli-remote" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Remote Uploa</p>
				</div>
			</svelte:fragment>
		</Tab>

		<!-- Tab Panels --->
		<svelte:fragment slot="panel">
			{#if tabSet === 0}
				{#if show}
					<!-- Upload Dropzone -->
					<div
						bind:this={dropZone}
						on:drop={handleFileDrop}
						on:dragover={handleDragOver}
						on:dragleave={handleDragLeave}
						class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
						role="cell"
						tabindex="0"
					>
						<div class="grid grid-cols-6 items-center p-4">
							<iconify-icon icon="fa6-solid:file-arrow-up" width="40" />

							<div class="col-span-5 space-y-4 text-center">
								<p class="font-bold">
									<span class="text-tertiary-500 dark:text-primary-500">Media Upload</span>
									{m.widget_ImageUpload_Drag()}
								</p>

								<p class="text-sm opacity-75">multiple files allowed</p>

								<button on:click={() => input.click()} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary"
									>{m.widget_ImageUpload_BrowseNew()}</button
								>

								<!-- File Size Limit -->
								<p class="mt-2 text-sm text-tertiary-500 dark:text-primary-500">Max File Size: XX MB</p>
							</div>
						</div>

						<!-- File Input -->
						<input bind:this={input} type="file" hidden {multiple} on:change={onChange} />
					</div>

					<!-- Show existing Media Images -->
					{#if showMedia}
						<div
							class="bg-surface-100-800-token fixed left-[50%] top-[50%] z-[999999999] flex h-[90%] w-[95%] translate-x-[-50%] translate-y-[-50%] flex-col rounded border-[1px] border-surface-400 p-2"
						>
							<div class="bg-surface-100-800-token flex items-center justify-between border-b p-2">
								<p class="ml-auto font-bold text-black dark:text-primary-500">{m.widget_ImageUpload_SelectImage()}</p>
								<button on:click={() => (showMedia = false)} class="variant-ghost-secondary btn-icon ml-auto">
									<iconify-icon icon="material-symbols:close" width="24" class="text-tertiary-500 dark:text-primary-500" />
								</button>
							</div>
							<!-- show all media as card with delete button and edit button -->
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
								{#each files as file}
									<div class="card">
										<div class="thumbnail">
											{#if generateThumbnail(file)}
												<img src={generateThumbnail(file)} alt={file.name} />
											{:else}
												<p>Loading thumbnail...</p>
											{/if}
										</div>
										<div class="file-info">
											<p class="file-name">{file.name}</p>
											<p class="file-size">{(file.size / 1024).toFixed(2)} KB</p>
											<p class="file-type">{file.type}</p>
										</div>
										<div class="actions">
											<button on:click={() => handleEdit(file)}>
												<iconify-icon icon="material-symbols:edit" />
											</button>
											<button on:click={() => handleDelete(file)}>
												<iconify-icon icon="material-symbols:delete" />
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			{:else if tabSet === 1}
				<textarea bind:value={files} placeholder="Paste Remote URL here ..." rows="6" class="textarea w-full" />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>

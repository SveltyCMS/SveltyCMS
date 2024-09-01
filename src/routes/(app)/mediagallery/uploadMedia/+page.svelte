<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/+page.svelte
@description This page is used to upload media to the media gallery.
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import ModalUploadMedia from './ModalUploadMedia.svelte';

	// Skeleton
	import { TabGroup, Tab, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	let tabSet: number = 0;

	// Modal Upload preview
	function modalAddMedia(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalUploadMedia,
			// Provide default slot content as a template literal
			slot: '<p>add Media</p>',
			props: { mediaType: 'image', sectionName: 'Gallery', files, onDelete }
		};
		const d: ModalSettings = {
			type: 'component',
			title: 'Uploaded Media',
			body: 'Check your uploaded Media and press Save.',
			component: modalComponent,
			response: (r: any) => {
				if (r) {
					console.log('response:', r);
				}
			}
		};
		modalStore.trigger(d);
	}

	export const value: File | MediaImage | undefined = undefined;
	export const multiple = false;

	let files: File[] = [];
	let input: HTMLInputElement;

	let dropZone: HTMLDivElement;

	function handleFileDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('Files dropped');

		const droppedFiles = e.dataTransfer?.files;
		if (droppedFiles) {
			for (const file of droppedFiles) {
				files = [...files, file];
				console.log('Added file:', file.name);
			}
		}

		dropZone.style.removeProperty('border-color');
		modalAddMedia(); // Trigger the modal after files are dropped
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('Dragging over dropzone');
		dropZone.style.borderColor = '#5fd317';
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('Dragging left dropzone');
		dropZone.style.removeProperty('border-color');
	}

	function onChange() {
		if (input.files) {
			console.log('Files selected from input');
			for (let i = 0; i < input.files.length; i++) {
				const file = input.files[i];
				files = [...files, file];
				console.log('Added file:', file.name);
			}
			modalAddMedia(); // Trigger the modal after files are selected
		}
	}

	function onDelete(file: File) {
		files = files.filter((f) => f !== file);
	}
</script>

<!-- PageTitle -->
<div class="mb-4 flex items-center justify-between">
	<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />

	<!-- Back -->
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
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
				<div
					bind:this={dropZone}
					on:drop={handleFileDrop}
					on:dragover={handleDragOver}
					on:dragleave={handleDragLeave}
					class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
					role="cell"
					tabindex="0"
					aria-dropeffect="none"
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
					<input bind:this={input} type="file" hidden multiple on:change={onChange} />
				</div>
			{:else if tabSet === 1}
				<textarea bind:value={files} placeholder="Paste Remote URL here ..." rows="6" class="textarea w-full" />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>

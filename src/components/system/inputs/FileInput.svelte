<!-- 
@file src/components/system/inputs/FileInput.svelte
@component
**FileInput component**

### Props
- `value`: File | MediaImage | undefined - Currently selected file or media image.
- `multiple`: boolean - Allow multiple file selection.
- `show`: boolean - Whether to show the file input area.
- `className`: string - Additional CSS classes for styling.

### Features
- File input 
- Multiple file input
- Drag and drop
-->

<script lang="ts">
	import type { MediaImage } from '@utils/media/mediaModels';
	import { twMerge } from 'tailwind-merge';
	// Component
	import Media from '@components/Media.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	let { value = $bindable(), multiple = $bindable(false), show = $bindable(true), className = '', onChange } = $props();

	// Declare reactive state with $state
	let input: HTMLInputElement | null = $state(null);
	let showMedia = $state(false);

	// Handle media selection
	function handleMediaSelect(data: MediaImage) {
		show = false;
		showMedia = false;
		value = data;
		onChange?.(data);
	}

	// Handle file change
	function handleFileChange() {
		if (!input?.files || input.files.length === 0) return;
		const file = input.files[0];
		value = file;
		show = false;
		onChange?.(file);
	}

	// Handle file drop
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const file = e?.dataTransfer?.files[0];
		if (file) {
			value = file;
			onChange?.(file);
		}
	}

	// Handle drag over
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		const target = e.target as HTMLElement;
		target.style.borderColor = '#6bdfff';
	}

	// Handle drag leave
	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		const target = e.target as HTMLElement;
		target.style.removeProperty('border-color');
	}

	// Open file input dialog
	function openFileInput() {
		input?.click();
	}

	// Toggle media selection modal
	function toggleMedia(showMediaValue: boolean) {
		showMedia = showMediaValue;
	}
</script>

{#if show}
	<!-- Upload Dropzone -->
	<div
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		role="cell"
		tabindex="0"
		class={twMerge(
			'relative mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700',
			className
		)}
	>
		<div class="grid grid-cols-6 items-center p-4">
			<iconify-icon icon="fa6-solid:file-arrow-up" width="40"></iconify-icon>
			<span class="text-white"> test</span>

			<div class="col-span-5">
				{#if !show}
					<p class="font-bold">
						<span class="text-tertiary-500 dark:text-primary-500">{m.widget_ImageUpload_Upload()}</span>
						{m.widget_ImageUpload_Drag()}
					</p>
				{:else}
					<p class="font-bold">
						<span class="text-tertiary-500 dark:text-primary-500">{m.widget_ImageUpload_Replace()}</span>
						{m.widget_ImageUpload_Drag()}
					</p>
				{/if}
				<p class="text-sm opacity-75">{m.widget_ImageUpload_Allowed()}.</p>

				<div class="flex w-full justify-center gap-2">
					<button
						onclick={openFileInput}
						aria-label={m.widget_ImageUpload_BrowseNew()}
						class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500"
					>
						{m.widget_ImageUpload_BrowseNew()}
					</button>

					<button
						onclick={() => toggleMedia(true)}
						aria-label={m.widget_ImageUpload_SelectMedia()}
						class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500"
					>
						{m.widget_ImageUpload_SelectMedia()}
					</button>
				</div>
			</div>
		</div>

		<!-- File Input -->
		<input bind:this={input} type="file" accept="image/*,image/webp,image/avif,image/svg+xml" hidden {multiple} onchange={handleFileChange} />
	</div>

	<!-- Show existing Media Images -->
	{#if showMedia}
		<div
			class="bg-surface-100 dark:bg-surface-800 fixed left-[50%] top-[50%] z-[999999999] flex h-[90%] w-[95%] translate-x-[-50%] translate-y-[-50%] flex-col rounded border-[1px] border-surface-400 p-2"
		>
			<div class="bg-surface-100 dark:bg-surface-800 flex items-center justify-between border-b p-2">
				<p class="ml-auto font-bold text-black dark:text-primary-500">
					{m.widget_ImageUpload_SelectImage()}
				</p>
				<button onclick={() => toggleMedia(false)} aria-label="Close" class="preset-ghost-secondary-500 btn-icon ml-auto">
					<iconify-icon icon="material-symbols:close" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				</button>
			</div>
			<Media onselect={handleMediaSelect} />
		</div>
	{/if}
{/if}

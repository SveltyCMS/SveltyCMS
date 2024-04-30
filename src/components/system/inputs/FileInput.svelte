<script lang="ts">
	import { asAny } from '@src/utils/utils';
	import type { MediaImage } from '@src/utils/types';
	import { createEventDispatcher } from 'svelte';

	// Component
	import Media from '@src/components/Media.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let value: File | MediaImage | undefined = undefined;
	export let multiple = false;
	export let show = true;

	let ev = createEventDispatcher();
	let input: HTMLInputElement;
	let showMedia = false;

	let mediaOnSelect = (data: MediaImage) => {
		show = false;
		value = data;
		ev('change', value);
	};

	let onChange = () => {
		if (input.files?.length == 0) return;
		value = input.files?.[0] as File;
		show = false;
		ev('change', value);
	};
</script>

{#if show}
	<!-- Upload Dropzone -->
	<div
		on:drop|preventDefault={(e) => {
			value = e?.dataTransfer?.files[0];
		}}
		on:dragover|preventDefault={(e) => {
			asAny(e.target).style.borderColor = '#6bdfff';
		}}
		on:dragleave|preventDefault={(e) => {
			asAny(e.target).style.removeProperty('border-color');
		}}
		class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
		role="cell"
		tabindex="0"
	>
		<div class="grid grid-cols-6 items-center p-4">
			<iconify-icon icon="fa6-solid:file-arrow-up" width="40" />

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

				<!-- TODO: Change according to type -->

				<!-- {#if types == 'image'}
					<p class="text-sm opacity-75">only image allowed</p>
				{:else if types == 'video'}
					<p class="text-sm opacity-75">only video allowed,</p>
				{:else if types == 'audio'}
					<p class="text-sm opacity-75">only audio allowed,</p>
				{:else if types == 'document'}
					<p class="text-sm opacity-75">only document allowed</p>
				{/if} -->

				<div class="flex w-full justify-center gap-2">
					<button on:click={() => input.click()} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary"
						>{m.widget_ImageUpload_BrowseNew()}</button
					>
					<!-- {#if showMedia} -->
					<button on:click={() => (showMedia = true)} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary">
						{m.widget_ImageUpload_SelectMedia()}
					</button>
					<!-- {/if} -->
				</div>
				<!-- File Size Limit -->
				<!-- <p class="mt- 2 text-sm text-tertiary-500 dark:text-primary-500">Max File Size: {sizelimit}</p> -->
			</div>
		</div>

		<!-- File Input -->
		<input bind:this={input} type="file" accept="image/*,image/webp,image/avif,image/svg+xml" hidden {multiple} on:change={onChange} />
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
			<Media bind:onselect={mediaOnSelect} />
		</div>
	{/if}
{/if}

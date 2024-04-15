<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from '.';
	import { asAny, convertTimestampToDateString, getFieldName } from '@src/utils/utils';
	import type { ImageFiles } from '@src/utils/types';

	// Konva
	import type { Transformer } from 'konva/lib/shapes/Transformer';
	import type { Stage } from 'konva/lib/Stage';
	import type { Group } from 'konva/lib/Group';

	// Stores
	import { entryData, mode, loadingProgress } from '@stores/store';

	// Components
	import Media from '@src/components/Media.svelte';
	import XIcon from '@src/components/system/icons/XIcon.svelte';

	let _data: File | ImageFiles | undefined;
	let updated = false;
	let input: HTMLInputElement;
	let showMedia = false;

	let isFlipped = false; // State variable to track flip button
	let isEditor = false; // State variable to track flip button

	export let field: FieldType;
	export const WidgetData = async () => {
		if (_data && _data instanceof File) {
			_data.path = field.path;
		}

		return updated ? _data : null;
	};
	export let value: File | ImageFiles = $entryData[getFieldName(field)]; // pass file directly from imageArray

	const fieldName = getFieldName(field);

	function setFile(node: HTMLInputElement) {
		node.onchange = (e) => {
			if ((e.target as HTMLInputElement).files?.length == 0) return;
			updated = true;
			_data = (e.target as HTMLInputElement).files?.[0] as File;
		};

		if (value instanceof File) {
			let fileList = new DataTransfer();
			fileList.items.add(value);
			node.files = fileList.files;
			_data = node.files[0];
			updated = true;
		} else if ($mode === 'edit' && value?.thumbnail) {
			axios.get(value.thumbnail.url, { responseType: 'blob' }).then(({ data }) => {
				if (value instanceof File) return;
				let fileList = new DataTransfer();
				let file = new File([data], value.thumbnail.name, {
					type: value.thumbnail.type
				});
				fileList.items.add(file);
				node.files = fileList.files;
				_data = node.files[0];
			});
		}
	}
	let editing = false;
	let edit = {
		stage: {} as Stage,
		group: {} as Group,
		transformers: [] as Transformer[],
		async startEdit() {
			updated = true;
			editing = true;
			let image = new Image();
			image.src = '/media/' + (value as any).original.url || URL.createObjectURL(_data as File);
			if (image.naturalHeight == 0) {
				await new Promise((resolve) => {
					image.onload = resolve;
				});
			}
			let Konva = (await import('konva')).default;
			let scale = {
				x: (window.innerWidth - 50) / 1.5 / image.naturalWidth,
				y: (window.innerHeight - 80) / 1.5 / image.naturalHeight
			};
			this.stage = new Konva.Stage({
				container: 'canvas',
				width: window.innerWidth - 50,
				height: window.innerHeight - 80,
				scale
			});

			let layer = new Konva.Layer();
			this.stage.add(layer);
			let imageObj = new Konva.Image({
				image: image,
				x: (this.stage.width() / 2) * (1 / scale.x) - image.naturalWidth / 2,
				y: (this.stage.height() / 2) * (1 / scale.y) - image.naturalHeight / 2,
				draggable: true
			});
			this.group = new Konva.Group();
			this.group.add(imageObj);
			layer.add(this.group);
			let tr = new Konva.Transformer({
				node: imageObj,
				rotateAnchorOffset: 20
			});
			this.transformers.push(tr);
			layer.add(tr);
		},
		async saveEdit() {
			this.transformers.forEach((t) => {
				t.destroy();
			});

			this.stage.scale({ x: 1, y: 1 });
			_data = await new Promise((resolve) => {
				this.group.toBlob({
					callback: async (blob) => {
						if (blob && _data && _data instanceof File) {
							let name = ((value as any).original.name as string) || _data.name;
							let type = ((value as any).original.type as string) || _data.type;
							type = type.includes('svg') ? 'image/png' : type;
							name = name.endsWith('svg') ? name.replace('svg', 'png') : name;
							let file = new File([await blob.arrayBuffer()], name, {
								type
							});
							file.path = field.path;
							resolve(file);
						} else {
							resolve(undefined);
						}
					}
				});
			});
			console.log(_data);
			editing = false;
		}
	};

	let mediaOnSelect = (data: ImageFiles) => {
		updated = true;
		showMedia = false;
		_data = data;
	};
</script>

<input use:setFile bind:this={input} accept="image/*,image/webp,image/avif,image/svg+xml" name={fieldName} type="file" hidden />

{#if _data}
	<div class:editor={editing} class="flex w-[500px] max-w-full flex-col border-2 border-dashed border-gray-300">
		<div class="flex h-[50px] w-full items-center bg-[#242734]">
			{#if editing}
				<iconify-icon on:click={() => edit.saveEdit()} width="26" class="cursor-pointer px-2" style="color:#05ff05" icon="ic:sharp-save-as"
				></iconify-icon>
				<button on:click={() => (editing = false)} class="ml-auto mr-2 cursor-pointer">
					<XIcon />
				</button>
			{:else}
				<iconify-icon on:click={() => edit.startEdit()} class=" cursor-pointer px-2 text-white" icon="flat-color-icons:edit-image" width="24" />
				<iconify-icon
					on:click={() => (_data = undefined)}
					class="ml-auto cursor-pointer px-2 text-white"
					icon="streamline:arrow-reload-horizontal-1-solid"
					width="24"
				/>
			{/if}
		</div>
		{#if editing}
			<div id="canvas" class="flex items-center justify-center border-2 border-dashed border-black"></div>
		{:else}
			<img src={_data instanceof File ? URL.createObjectURL(_data) : _data.thumbnail.url} alt="" />
		{/if}
	</div>
	<!-- {#if _data}
	<div
		class:editor={editing}
		class="flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
	>
		<div class="mx-2 flex items-center justify-between gap-2">
			<p class="text-left">Name: <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>

			<p class="text-left">
				Size: <span class="text-tertiary-500 dark:text-primary-500">{(_data.Size / 1024).toFixed(2)} KB</span>
			</p>
		</div>
		<div class="m-2 grid min-h-[200px] grid-cols-12 gap-2">
			{#if _data && !isFlipped}
				{#if editing}
					<div id="canvas" class="flex items-center justify-center border-2 border-dashed border-black"></div>
				{:else}
					<img
						src={_data instanceof File ? URL.createObjectURL(_data) : _data.thumbnail.url}
						alt=""
						class="col-span-11 m-auto max-h-[200px] max-w-[500px] rounded"
					/>
				{/if}
			{:else}
				<div class="col-span-11 ml-2 grid grid-cols-2 gap-1 text-left">
					<p class="">Type:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.type}</p>
					<p class="">Path:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.path}</p>
					<p class="">Uploaded:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
					<p class="">Last Modified:</p>
					<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
				</div>
			{/if}

			<div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2">
			 Flip 
				<button on:click={() => (isFlipped = !isFlipped)} class="variant-ghost btn-icon">
					<iconify-icon
						icon="uiw:reload"
						width="24"
						class={isFlipped ? ' rotate-90 text-yellow-500 transition-transform duration-300' : 'text-white  transition-transform duration-300'}
					/>
				</button>
				  Edit  
				<button on:click={() => (isEditor = !isEditor)} class="variant-ghost btn-icon">
					<iconify-icon icon="material-symbols:edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
				</button>
				  Delete 
				<button on:click={() => (_data = undefined)} class="variant-ghost btn-icon">
					<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500" />
				</button>
			</div>
		</div>
	</div> -->
{:else}
	<div
		on:drop|preventDefault={(e) => {
			updated = true;
			_data = e?.dataTransfer?.files[0];
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
			{#if !_data}<iconify-icon icon="fa6-solid:file-arrow-up" width="40" />{/if}

			<div class="col-span-5">
				{#if !_data}
					<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">Upload Image</span> or Drag & Drop</p>
				{:else}
					<p class="font-bold"><span class="text-tertiary-500 dark:text-primary-500">ReplaceImage</span> or Drag & Drop</p>
				{/if}
				<p class="text-sm opacity-75">PNG, JPG, GIF, WEBP, AVIF, and SVG allowed.</p>

				<button on:click={() => input.click()} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary">Browse</button>
			</div>
		</div>
	</div>
{/if}

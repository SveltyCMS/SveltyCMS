<script lang="ts">
	import axios from 'axios';
	import type { FieldType } from '.';
	import { convertTimestampToDateString, getFieldName } from '@src/utils/utils';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Konva
	import type { Image as KonvaImage } from 'konva/lib/shapes/Image';
	import type { Transformer } from 'konva/lib/shapes/Transformer';
	import type { Layer } from 'konva/lib/Layer';
	import type { Stage } from 'konva/lib/Stage';
	import type { Group } from 'konva/lib/Group';

	// Stores
	import { entryData, mode } from '@stores/store';

	// Components
	import type { MediaImage } from '@src/utils/types';
	import FileInput from '@src/components/system/inputs/FileInput.svelte';

	let isFlipped = false; // State variable to track flip button

	export let field: FieldType;
	export let value: File | MediaImage = $entryData[getFieldName(field)]; // pass file directly from imageArray

	let _data: File | MediaImage | undefined = value;
	let multiple = false; // TODO: add Multiple Uploads
	$: updated = _data !== value;

	export const WidgetData = async () => {
		if (_data) {
			if (_data instanceof File) {
				_data.path = field.path;
			}
		}

		return updated ? _data : null;
	};

	if ($mode == 'edit') {
		axios.get((value as MediaImage).thumbnail.url, { responseType: 'blob' }).then(({ data }) => {
			if (value instanceof File) return;
			let file = new File([data], value.thumbnail.name, {
				type: value.thumbnail.type
			});

			_data = file;
		});
	}
	let editing = false;
	let edit = {
		stage: {} as Stage,
		group: {} as Group,
		transformers: [] as Transformer[],
		layer: {} as Layer,
		imageObj: {} as KonvaImage,
		image: {} as HTMLImageElement,
		async startEdit() {
			editing = true;
			this.image = new Image();
			if (_data && updated) {
				if (_data instanceof File) {
					this.image.src = URL.createObjectURL(_data as File);
				} else {
					this.image.src = '/media/' + _data.original.url;
				}
			} else {
				this.image.src = '/media/' + (value as MediaImage).original.url;
			}
			if (this.image.naturalHeight == 0) {
				await new Promise((resolve) => {
					this.image.onload = resolve;
				});
			}
			let Konva = (await import('konva')).default;
			let scale = Math.min((window.innerWidth - 50) / 1.5 / this.image.naturalWidth, (window.innerHeight - 80) / 1.5 / this.image.naturalHeight);

			this.stage = new Konva.Stage({
				container: 'canvas',
				width: window.innerWidth - 50,
				height: window.innerHeight - 80,
				scale: {
					x: scale,
					y: scale
				}
			});

			this.layer = new Konva.Layer();
			this.stage.add(this.layer);

			this.imageObj = new Konva.Image({
				image: this.image,
				x: (this.stage.width() / 2) * (1 / scale) - this.image.naturalWidth / 2,
				y: (this.stage.height() / 2) * (1 / scale) - this.image.naturalHeight / 2,
				draggable: true
			});
			this.group = new Konva.Group();
			this.group.add(this.imageObj);

			this.transformers = [
				new Konva.Transformer({
					nodes: [this.imageObj],
					rotateAnchorOffset: 20
				})
			];

			this.layer.add(this.group, ...this.transformers);
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
			editing = false;
		},
		async addBlur() {
			let Konva = (await import('konva')).default;
			let range = document.createElement('input');
			let canvas = document.getElementsByTagName('canvas')[0] as HTMLCanvasElement;
			range.type = 'range';
			range.min = '0';
			range.max = '30';
			range.value = '15';
			range.style.position = 'absolute';

			range.onchange = () => {
				blurRect.pixelSize(Number(range.value));
			};
			let updateRangePos = () => {
				let rect = canvas.getBoundingClientRect();
				range.style.left = (blurRect.x() + blurRect.width() / 2) * this.stage.scaleX() - range.offsetWidth / 2 + rect.left + 'px';
				range.style.top = (blurRect.y() + blurRect.height()) * this.stage.scaleY() + 20 + rect.top + 'px';
			};
			let blurRect = new Konva.Image({
				image: this.image,
				width: 300,
				height: 100,
				pixelSize: range.value,
				draggable: true
			});

			blurRect.filters([Konva.Filters.Pixelate]);
			blurRect.on('dragmove', (e) => {
				blurRect.scale({ x: 1, y: 1 });
				blurRect.crop({
					x: -(this.imageObj.x() - blurRect.x()),
					y: -(this.imageObj.y() - blurRect.y()),
					width: blurRect.width(),
					height: blurRect.height()
				});
				updateRangePos();
				blurRect.cache();
			});
			blurRect.on('transform', () => {
				blurRect.setAttrs({
					width: blurRect.width() * blurRect.scaleX(),
					height: blurRect.height() * blurRect.scaleY(),
					scaleX: 1,
					scaleY: 1
				});
				blurRect.crop({
					x: -(this.imageObj.x() - blurRect.x()),
					y: -(this.imageObj.y() - blurRect.y()),
					width: blurRect.width(),
					height: blurRect.height()
				});
				blurRect.cache();
				updateRangePos();
			});

			canvas.parentElement?.parentElement?.appendChild(range);
			updateRangePos();
			let tr = new Konva.Transformer({
				rotateAnchorOffset: 20,
				nodes: [blurRect],
				rotateEnabled: false
			});
			this.transformers.push(tr);
			this.layer.add(tr);
			this.group.add(blurRect);
		}
	};

	// Skeleton
	import ModalImageEditor from './ModalImageEditor.svelte';
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Modal Trigger - Edit Avatar
	function modalImageEditor(): void {
		// console.log('Triggered - modalImageEditorr');
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalImageEditor,
			props: { _data },

			// Add your props as key/value pairs
			// props: { background: 'bg-pink-500' },
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: m.usermodaluser_settingtitle(),
			body: m.usermodaluser_settingbody(),
			component: modalComponent,
			// Pass arbitrary data to the component

			response: (r: { dataURL: string }) => {
				console.log('ModalImageEditor response:', r);
				if (r) {
					// avatarSrc.set(r.dataURL); // Update the avatarSrc store with the new URL

					// Trigger the toast
					const t = {
						message: '<iconify-icon icon="radix-icons:avatar" color="white" width="26" class="mr-1"></iconify-icon> Avatar Updated',

						// Provide any utility or variant background style:
						background: 'gradient-primary',
						timeout: 3000,
						// Add your custom classes here:
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
				}
			}
		};
		modalStore.trigger(d);
	}
</script>

{#if _data}
	<div
		class:editor={editing}
		class="flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
	>
		<!-- Image Header -->
		<div class="mx-2 flex flex-col gap-2">
			<div class="flex items-center justify-between gap-2">
				<p class="text-left">{m.widget_ImageUpload_Name()} <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>

				<p class="text-left">
					{m.widget_ImageUpload_Size()} <span class="text-tertiary-500 dark:text-primary-500">{(_data.size / 1024).toFixed(2)} KB</span>
				</p>
				{#if editing}
					<!-- Save -->
					<button on:click={() => edit.saveEdit()} class="variant-ghost-surface btn">
						<iconify-icon width="26" icon="ic:sharp-save-as" style="color:#05ff05" class="" />
					</button>

					<!-- Close -->
					<button on:click={() => (editing = false)} class="variant-ghost-surface btn-icon">
						<iconify-icon icon="material-symbols:close" width="24" />
					</button>
				{/if}
			</div>

			{#if editing}
				<div class="flex items-center justify-between">
					<!-- Konva -->

					<!-- Blur -->
					<button on:click={() => edit.addBlur()} class="variant-ghost-surface btn flex flex-col text-sm"
						><iconify-icon icon="material-symbols:blur-on" width="24"></iconify-icon>
						Blur
					</button>

					<!-- Crop -->
					<button on:click={() => edit.addBlur()} class="variant-ghost-surface btn flex flex-col text-sm"
						><iconify-icon icon="material-symbols:crop" width="24"></iconify-icon>
						Crop
					</button>

					<!-- Focalpoint -->
					<button on:click={() => edit.addBlur()} class="variant-ghost-surface btn flex flex-col text-sm"
						><iconify-icon icon="ic:baseline-plus" width="24"></iconify-icon>
						Focalpoint
					</button>

					<!-- Rotate -->
					<button on:click={() => edit.addBlur()} class="variant-ghost-surface btn flex flex-col text-sm"
						><iconify-icon icon="carbon:rotate" width="24"></iconify-icon>
						Rotate
					</button>

					<!-- Zoom -->
					<button on:click={() => edit.addBlur()} class="variant-ghost-surface btn flex flex-col text-sm"
						><iconify-icon icon="material-symbols:resize" width="24"></iconify-icon>
						Zoom
					</button>
				</div>
			{/if}
		</div>
		{#if editing}
			<div id="canvas" class="flex items-center justify-center border-2 border-dashed border-black"></div>
		{:else}
			<!-- Preview -->
			<div class="flex items-center justify-between">
				<!-- <img src={_data instanceof File ? URL.createObjectURL(_data) : _data.thumbnail.url} alt="" /> -->
				{#if !isFlipped}
					<img
						src={_data instanceof File ? URL.createObjectURL(_data) : _data.thumbnail.url}
						alt=""
						class="col-span-11 m-auto max-h-[200px] max-w-[500px] rounded"
					/>
				{:else}
					<div class="col-span-11 ml-2 grid grid-cols-2 gap-1 text-left">
						Media Data soon....
						<!-- <p class="">{m.widget_ImageUpload_Type()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.type}</p>
						<p class="">{m.widget_ImageUpload_Path()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.path}</p>
						<p class="">{m.widget_ImageUpload_Uploaded()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
						<p class="">{m.widget_ImageUpload_LastModified()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p> -->
					</div>
				{/if}

				<!-- Buttons -->
				<div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2">
					{#if !editing}
						<!-- Flip -->
						<button on:click={() => (isFlipped = !isFlipped)} class="variant-ghost btn-icon">
							<iconify-icon
								icon="uiw:reload"
								width="24"
								class={isFlipped ? ' rotate-90 text-yellow-500 transition-transform duration-300' : 'text-white  transition-transform duration-300'}
							/>
						</button>

						<!-- Modal ImageEditor -->
						<button on:click={modalImageEditor} class="variant-ghost btn-icon">
							M<iconify-icon icon="material-symbols:edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
						</button>

						<!-- Edit -->
						<button on:click={() => edit.startEdit()} class="variant-ghost btn-icon">
							<iconify-icon icon="material-symbols:edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
						</button>

						<!-- Delete -->
						<button on:click={() => (_data = undefined)} class="variant-ghost btn-icon">
							<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500" />
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- File Input -->
	<FileInput bind:value={_data} bind:multiple={field.multiupload} />
{/if}

<style lang="postcss">
	img {
		max-width: 600px;
		max-height: 200px;
		margin: auto;
		margin-top: 10px;
	}
	.editor {
		overflow: auto;
		position: fixed;
		z-index: 999999999;
		top: 0;
		left: 0;
		width: calc(100vw - 2px);
		height: 100vh;
		background-color: #242734;
		animation: fadeIn 0.2s forwards;
	}
	@keyframes fadeIn {
		0% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}
	:global(.editor canvas) {
		background-color: white !important;
	}
</style>

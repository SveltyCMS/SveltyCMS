<script lang="ts">
	import type { SvelteComponent } from 'svelte';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';

	// Props
	/** Exposes parent props to this component. */
	export let parent: SvelteComponent;

	export let _data: any;
	export let field: any;
	export let updated: any;
	export let value: any;
	export let mediaOnSelect: any;

	const modalStore = getModalStore();

	// Notes: Use `w-screen h-screen` to fit the visible canvas size.
	const cBase = 'bg-surface-100-800-token w-screen h-screen p-4 flex justify-center items-center';

	import type { MediaImage } from '@src/utils/types';
	import { meta_data, getFieldName } from '@src/utils/utils';
	import { mode } from '@src/stores/store';
	import axios from 'axios';

	// Components
	import Media from '@src/components/Media.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';

	// Konva
	import type { Image as KonvaImage } from 'konva/lib/shapes/Image';
	import type { Transformer } from 'konva/lib/shapes/Transformer';
	import type { Layer } from 'konva/lib/Layer';
	import type { Stage } from 'konva/lib/Stage';
	import type { Group } from 'konva/lib/Group';

	if ($mode == 'edit') {
		(value as MediaImage)?.thumbnail?.url &&
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
</script>

{#if $modalStore[0]}
	<div class="relative {cBase}">
		<!-- Header -->
		<div class="absolute left-0 top-0 flex w-full items-center justify-between p-2">
			<PageTitle name="Image Editor" icon="bi:image" />

			<div class="flex items-center gap-4">
				<!-- Save -->
				<button class="variant-ghost btn-icon" on:click={() => edit.saveEdit()}>
					<iconify-icon icon="ic:sharp-save-as" width="28" class="text-tertiary-500 dark:text-primary-500" />
				</button>

				<!-- Cancel / Close Modal -->
				<button class="variant-ghost btn-icon" on:click={parent.onClose}>
					<iconify-icon icon="material-symbols:close" width="24" />
				</button>

				<!-- Close -->
				<!-- <button on:click={() => (editing = false)} class="variant-ghost-surface btn-icon">
					<iconify-icon icon="material-symbols:close" width="24" />
				</button> -->
			</div>
		</div>

		<!-- Editor -->
		<div class="flex h-full max-h-[calc(90vh-65px)] w-full flex-col items-center space-y-4 overflow-auto rounded-md border-2 border-surface-500">
			{#if !editing}
				<div class="variant-ghost-surface btn-group w-full justify-center rounded-t-md">
					<!-- Crop -->
					<button on:click={() => edit.addBlur()} class="flex flex-col">
						<iconify-icon icon="material-symbols:crop" width="24"></iconify-icon>
						<p class="text-sm text-tertiary-500 dark:text-primary-500">Crop</p>
					</button>

					<!-- Blur -->
					<button on:click={() => edit.addBlur()} class="flex flex-col">
						<iconify-icon icon="material-symbols:blur-on" width="24"></iconify-icon>
						<p class="text-sm text-tertiary-500 dark:text-primary-500">Blur</p>
					</button>

					<!-- Focalpoint-->
					<button on:click={() => edit.addBlur()} class="flex flex-col">
						<iconify-icon icon="bi:plus-circle-fill" width="24"></iconify-icon>
						<p class="text-sm text-tertiary-500 dark:text-primary-500">Focal</p>
					</button>

					<!-- Rotate  -->
					<button on:click={() => edit.addBlur()} class="flex flex-col text-sm"
						><iconify-icon icon="carbon:rotate" width="24"></iconify-icon>
						<p class="text-sm text-tertiary-500 dark:text-primary-500">Rotate</p>
					</button>

					<!-- Zoom -->
					<button on:click={() => edit.addBlur()} class="flex flex-col text-sm"
						><iconify-icon icon="material-symbols:zoom-out-map" width="24"></iconify-icon>
						<p class="text-sm text-tertiary-500 dark:text-primary-500">Zoom</p>
					</button>
				</div>
				<!-- Konva -->
				<div id="canvas" class="flex items-center justify-center border-2 border-dashed border-black"></div>
			{/if}
			<Media bind:onselect={mediaOnSelect} />
		</div>
	</div>
{/if}

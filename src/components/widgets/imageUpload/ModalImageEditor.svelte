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

	// Components
	import Media from '@src/components/Media.svelte';

	// Konva
	import type { Image as KonvaImage } from 'konva/lib/shapes/Image';
	import type { Transformer } from 'konva/lib/shapes/Transformer';
	import type { Layer } from 'konva/lib/Layer';
	import type { Stage } from 'konva/lib/Stage';
	import type { Group } from 'konva/lib/Group';
	import PageTitle from '@src/components/PageTitle.svelte';

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
			updated = true;
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
			range.onpointerdown = (e) => {
				e.stopPropagation();
			};
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
			});

			this.stage.content.appendChild(range);
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
	<div class="modal-example-fullscreen {cBase}">
		<div class="flex flex-col items-center space-y-4">
			<div class="flex items-center justify-between">
				<PageTitle name="Image Editor" icon="" />

				<!-- Save -->
				<iconify-icon on:click={() => edit.saveEdit()} width="26" class="cursor-pointer px-2" style="color:#05ff05" icon="ic:sharp-save-as" />

				<!-- Cancel / Close Modal -->
				<button class="variant-filled btn-icon" on:click={parent.onClose}><iconify-icon icon="material-symbols:close" width="24" /></button>
			</div>

			<div class="w-full">
				<Media bind:onselect={mediaOnSelect} />
			</div>
		</div>
	</div>
{/if}

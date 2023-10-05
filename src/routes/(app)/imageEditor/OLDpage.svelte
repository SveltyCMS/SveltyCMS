<script lang="ts">
	import Cropper from '@src/components/Cropper.svelte';
	import { saveEditedImage } from '@src/stores/store';

	export let field = { db_fieldName: '', path: '', image: '' };
	export let value: any;
	export let scale: any;
	export let collection: any;
	export let widgetValue: any;
	export let rotate: number | string = 0;
	export let crop_left: object = { initialValue: 10, value: 10 };
	export let crop_right: object = { initialValue: 10, value: 10 };
	export let crop_top: object = { initialValue: 10, value: 10 };
	export let crop_bottom: object = { initialValue: 10, value: 10 };
	export let blurs: object[] = [];
	export let rotateDetails: object = {};

	let name = '';
	let width: number | string = 0;
	let height: number | string = 0;

	function setFile(node: HTMLInputElement) {
		if (value.type) {
			let fileList = new DataTransfer();
			fileList.items.add(value);
			widgetValue = node.files = fileList.files;
		}
		node.onchange = (e) => {
			widgetValue = (e.target as HTMLInputElement).files;
			const i = new Image();
			i.src = URL.createObjectURL(widgetValue[0]);
			i.onload = function () {
				width = this.width;
				height = this.height;
			};
		};
		const i = new Image();
		i.src = URL.createObjectURL(widgetValue[0]);
		i.onload = function () {
			width = this.width;
			height = this.height;
		};
	}

	$: {
		if ($saveEditedImage) {
			saveImage();
		}
	}
	function saveImage() {
		const blurAreas: any = [];
		blurs.forEach((element) => {
			blurAreas.push({
				left: ((element.left.value * width) / 400).toFixed(0),
				top: ((element.top.value * height) / 225).toFixed(0),
				width: ((element.width.value * width) / 400).toFixed(0),
				height: ((element.height.value * height) / 225).toFixed(0)
			});
		});
		const formData = new FormData();
		formData.append('name', name);
		formData.append(widgetValue[0].name, widgetValue[0]);
		formData.append('rotate', rotate);
		formData.append('rotateScale', rotateDetails.scale);
		formData.append('width', width);
		formData.append('height', height);
		formData.append('crop_left', ((crop_left.value * width) / 400).toFixed(0));
		formData.append('crop_right', ((crop_right.value * width) / 400).toFixed(0));
		formData.append('crop_top', ((crop_top.value * height) / 225).toFixed(0));
		formData.append('crop_bottom', ((crop_bottom.value * height) / 225).toFixed(0));
		formData.append('blur_areas', JSON.stringify(blurAreas));

		
	}

</script>

<input
	use:setFile
	name={field.db_fieldName}
	class="input"
	type="file"
/>

{#if image}
<Cropper
	bind:SCALE={scale}
	bind:rotateDetails
	bind:image={image}
	bind:rotate
	bind:blurs
	bind:crop_left
	bind:crop_right
	bind:crop_top
	bind:crop_bottom
/>
{/if}


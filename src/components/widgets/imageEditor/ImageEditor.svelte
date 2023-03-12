<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	import Cropper from '$src/components/Cropper.svelte';
	import { saveEditedImage } from '$src/stores/store';
	import { saveData } from '$src/lib/utils/utils_svelte';

	export let field = { title: '', path: '', image: '' };
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
		saveData(collection, formData).then(() => {
			saveEditedImage.set(false);
		});
	}

	// zod validation
	// TODO check input value
	import z from 'zod';
	const zod_obj: Record<string, z.ZodString> = {
		name: z
			.string({ required_error: 'Name Required' })
			.max(24, { message: 'max 24 Characteres' })
			.trim()
	};

	let errorStatus: Record<string, { status: boolean; msg: string }> = {
		general: { status: false, msg: '' },
		name: { status: false, msg: '' }
	};

	const zodValidate = (obj_to_test: string, value: string) => {};
</script>

<input
	use:setFile
	name={field.title}
	class="block w-fulxl text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
	type="file"
/>
<Cropper
	bind:SCALE={scale}
	bind:rotateDetails
	image={widgetValue?.[0]}
	bind:rotate
	bind:blurs
	bind:crop_left
	bind:crop_right
	bind:crop_top
	bind:crop_bottom
/>
<!-- <lable class="my-2" for="#input-text">Name</lable>

<input class="input" placeholder="Image Name" type="text" id="input-text" bind:value={name} /> -->

<!-- Image Name-->
<div class="group relative z-0 mb-6 w-full">
	<Icon icon="bi:images" width="24" class="absolute top-3.5 left-0 text-primary-500" />

	<!-- on:keydown={() => (errorStatus.name.status = false)}
	color={errorStatus.name.status ? 'red' : 'base'}
	on:blur={() => zodValidate('name', name)} -->
	<input
		bind:value={name}
		type="text"
		name="name"
		class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-surface-500 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
		placeholder=" "
	/>
	<label
		for="name"
		class="absolute top-3 left-6 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
	>
		Image Name<span class="ml-2 text-error-500">*</span>
	</label>
	<!-- 
	{#if errorStatus.name.status}
		<div class="absolute top-11 left-0 text-xs text-error-500">
			{errorStatus.name.msg}
		</div>
	{/if} -->
</div>

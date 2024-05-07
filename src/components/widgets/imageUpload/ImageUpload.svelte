<script lang="ts">
	import type { FieldType } from '.';
	import { convertTimestampToDateString, getFieldName, meta_data } from '@src/utils/utils';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { entryData, mode } from '@stores/store';

	// Components
	import type { MediaImage } from '@src/utils/types';
	import FileInput from '@src/components/system/inputs/FileInput.svelte';

	let isFlipped = false; // State variable to track flip button

	export let field: FieldType;
	export let value: File | MediaImage = $entryData[getFieldName(field)]; // pass file directly from imageArray

	let _data: File | MediaImage | undefined = value;

	$: updated = _data !== value;

	export const WidgetData = async () => {
		if (_data) {
			if (_data instanceof File) {
				_data.path = field.path;
			}
		}

		if (!(value instanceof File) && !(_data instanceof File) && _data?._id !== value?._id && value?._id && $mode == 'edit') {
			//send replaced media's id so we can remove it from media_images usage
			meta_data.add('media_images_remove', [value._id.toString()]);
		}

		//if not updated value is not changed and is MediaImage type so send back only id
		return updated || $mode == 'create' ? _data : { _id: (value as MediaImage)?._id };
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

{#if !_data}
	<!-- File Input -->
	<FileInput bind:value={_data} bind:multiple={field.multiupload} />
{:else}
	<div class="flex w-full max-w-full flex-col border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700">
		<!-- Preview -->
		<div class="mx-2 flex flex-col gap-2">
			<!-- Image Header -->
			<div class="flex items-center justify-between gap-2">
				<p class="text-left">{m.widget_ImageUpload_Name()} <span class="text-tertiary-500 dark:text-primary-500">{_data.name}</span></p>

				<p class="text-left">
					{m.widget_ImageUpload_Size()} <span class="text-tertiary-500 dark:text-primary-500">{(_data.size / 1024).toFixed(2)} KB</span>
				</p>
			</div>
			<!-- Image-->
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
						<p class="">{m.widget_ImageUpload_Type()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.type}</p>
						<p class="">Path:</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{_data.path}</p>
						<p class="">{m.widget_ImageUpload_Uploaded()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
						<p class="">{m.widget_ImageUpload_LastModified()}</p>
						<p class="font-bold text-tertiary-500 dark:text-primary-500">{convertTimestampToDateString(_data.lastModified)}</p>
					</div>
				{/if}

				<!-- Buttons -->
				<div class="col-span-1 flex flex-col items-end justify-between gap-2 p-2">
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
						<iconify-icon icon="material-symbols:edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
					</button>

					<!-- Delete -->
					<button on:click={() => (_data = undefined)} class="variant-ghost btn-icon">
						<iconify-icon icon="material-symbols:delete-outline" width="30" class="text-error-500" />
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

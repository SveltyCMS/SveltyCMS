<script lang="ts">
	import { goto } from '$app/navigation';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import ModalUploadMedia from './ModalUploadMedia.svelte';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Modal Trigger - New Category
	function modalAddMedia(mediaType: string, sectionName: string): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalUploadMedia,
			// Provide default slot content as a template literal
			slot: '<p>add Media</p>',
			props: { mediaType, sectionName }
		};
		const d: ModalSettings = {
			type: 'component',
			title: `Add New Media ${sectionName}`,
			body: `Upload new media ${sectionName} and then press Save.`,
			component: modalComponent,
			response: (r: any) => {
				if (r) {
					console.log('response:', r);
				}
			}
		};
		modalStore.trigger(d);
	}
</script>

<div class="container mx-auto p-4">
	<div class="mb-4 flex items-center justify-between">
		<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
		<button class="variant-filled-secondary btn" on:click={() => goto('/mediagallery')}>
			<iconify-icon icon="material-symbols:arrow-back-rounded" width="24" class="rtl:rotate-180" />
			{m.button_back()}
		</button>
	</div>

	<div class="wrapper divide-y divide-surface-400">
		<!-- Audio -->
		<button class="flex w-full items-center justify-between" on:click={() => modalAddMedia('Audio', m.uploadMedia_Audio())}>
			<div class="text-left rtl:text-right">
				<h2 class="my-2 text-xl font-bold text-tertiary-500 dark:text-primary-500">
					{m.uploadMedia_Audio()}
				</h2>
				<p class="mb-2">{m.uploadMedia_Audio_Text()}</p>
			</div>

			<iconify-icon icon="material-symbols:add" width="24" class="variant-ghost-tertiary btn-icon dark:variant-ghost-primary" />
		</button>

		<!-- Document -->
		<button class="flex w-full items-center justify-between" on:click={() => modalAddMedia('Document', m.uploadMedia_Document())}>
			<div class="text-left rtl:text-right">
				<h2 class="my-2 text-xl font-bold text-tertiary-500 dark:text-primary-500">{m.uploadMedia_Document()}</h2>
				<p class="mb-2">{m.uploadMedia_Document_Text()}</p>
			</div>

			<iconify-icon icon="material-symbols:add" width="24" class="variant-ghost-tertiary btn-icon dark:variant-ghost-primary" />
		</button>

		<!-- Image -->
		<button class="flex w-full items-center justify-between" on:click={() => modalAddMedia('Image', m.uploadMedia_Image())}>
			<div class="text-left rtl:text-right">
				<h2 class="my-2 text-xl font-bold text-tertiary-500 dark:text-primary-500">{m.uploadMedia_Image()}</h2>
				<p class="mb-2">{m.uploadMedia_Image_Text()}</p>
			</div>

			<iconify-icon icon="material-symbols:add" width="24" class="variant-ghost-tertiary btn-icon dark:variant-ghost-primary" />
		</button>

		<!-- Remote Video -->
		<button class="flex w-full items-center justify-between" on:click={() => modalAddMedia('Remote Video', m.uploadMedia_RemoteVideo())}>
			<div class="text-left rtl:text-right">
				<h2 class="my-2 text-xl font-bold text-tertiary-500 dark:text-primary-500">{m.uploadMedia_RemoteVideo()}</h2>
				<p class="mb-2">{m.uploadMedia_RemoteVideo_Text()}</p>
			</div>

			<iconify-icon icon="material-symbols:add" width="24" class="variant-ghost-tertiary btn-icon dark:variant-ghost-primary" />
		</button>

		<!-- Video -->
		<button class="flex w-full items-center justify-between" on:click={() => modalAddMedia('Video', m.uploadMedia_Video())}>
			<div class="text-left rtl:text-right">
				<h2 class="my-2 text-xl font-bold text-tertiary-500 dark:text-primary-500">{m.uploadMedia_Video()}</h2>
				<p class="mb-2">{m.uploadMedia_Video_Text()}.</p>
			</div>

			<iconify-icon icon="material-symbols:add" width="24" class="variant-ghost-tertiary btn-icon dark:variant-ghost-primary" />
		</button>
	</div>
</div>

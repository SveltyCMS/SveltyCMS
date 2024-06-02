<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import ModalEditSystem from './ModalEditSystem.svelte';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { privateConfigCategories, publicConfigCategories } from '@root/config/guiConfig';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Modal Edit System
	function openModal(title, configCategory, description, isPrivate): void {
		const modalComponent: ModalComponent = {
			ref: ModalEditSystem,
			props: { title, configCategory, description, isPrivate, parent: { onClose: () => modalStore.close() } }
		};
		const modalSettings: ModalSettings = {
			type: 'component',
			title,
			component: modalComponent
		};
		modalStore.trigger(modalSettings);
	}

	const categories = [
		...Object.entries(privateConfigCategories).map(([category, config]) => ({
			name: category,
			category,
			config,
			isPrivate: true
		})),
		...Object.entries(publicConfigCategories).map(([category, config]) => ({
			name: category,
			category,
			config,
			isPrivate: false
		}))
	];
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="System Settings" icon="uil:setting" />
</div>

<div class="mt-4">
	<div class="wrapper !bg-error-500 text-center">
		<p>In Development only</p>
		<p>Environment Data is only shown to admin</p>
	</div>
</div>

<div class="my-2 mt-2 grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
	{#each categories as { name, category, config, isPrivate }}
		<button
			on:click={() => openModal(name, category, config.description, isPrivate)}
			class="variant-outline-primary btn flex items-center justify-center gap-2"
		>
			<div class="grid grid-cols-1 justify-items-center">
				<iconify-icon icon={config.icon} width="28" class="text-tertiary-500 dark:text-primary-500" />
				<span class="capitalize">{name}</span>
			</div>
		</button>
	{/each}
</div>

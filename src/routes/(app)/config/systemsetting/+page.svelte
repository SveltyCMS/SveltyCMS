<script lang="ts">
	import { privateConfigCategories, publicConfigCategories } from '@root/config/guiConfig';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import ModalEditSystem from './ModalEditSystem.svelte';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings, ToastSettings } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	async function saveConfig(configData: { [key: string]: any }, isPrivate: boolean) {
		try {
			const response = await fetch('/api/save-config', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ configData, isPrivate })
			});
			const result = await response.json();
			if (result.success) {
				toastStore.trigger({
					message: 'Configuration saved successfully!',
					background: 'bg-success'
				} as ToastSettings);

				// Trigger a restart API route
				await triggerRestart();
			} else {
				toastStore.trigger({
					message: 'Failed to save configuration.',
					background: 'bg-error'
				} as ToastSettings);
			}
		} catch (error) {
			console.error('Error saving configuration:', error);
			toastStore.trigger({
				message: 'Error saving configuration.',
				background: 'bg-error'
			} as ToastSettings);
		}
	}

	async function triggerRestart() {
		try {
			const response = await fetch('/api/restart', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			const result = await response.json();
			if (result.success) {
				toastStore.trigger({
					message: 'Server restart triggered successfully!',
					background: 'bg-success'
				} as ToastSettings);
			} else {
				toastStore.trigger({
					message: 'Failed to trigger server restart.',
					background: 'bg-error'
				} as ToastSettings);
			}
		} catch (error) {
			console.error('Error triggering server restart:', error);
			toastStore.trigger({
				message: 'Error triggering server restart.',
				background: 'bg-error'
			} as ToastSettings);
		}
	}

	// Modal Edit System
	function openModal(title, configCategory, description, isPrivate): void {
		const modalComponent: ModalComponent = {
			ref: ModalEditSystem,
			props: {
				title,
				configCategory,
				description,
				isPrivate,
				parent: {
					onClose: () => modalStore.close(),
					onSave: async (formData: { [key: string]: any }) => {
						await saveConfig(formData, isPrivate);
						modalStore.close();
					}
				}
			}
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

<!-- Page Title with Back Button -->
<PageTitle name="System Settings" icon="uil:setting" showBackButton={true} backUrl="/config" />

<div class="my-4">
	<div class="wrapper !bg-error-500 text-center">
		<p>Current in Development!!! For testing purposes only</p>
		<p>Environment Data is only shown to role admin</p>
	</div>
</div>

<div class="my-2 mt-2 grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
	{#each categories as { name, category, config, isPrivate }}
		<button
			onclick={() => openModal(name, category, config.description, isPrivate)}
			aria-label={config.description}
			class="variant-outline-primary btn flex items-center justify-center gap-2"
		>
			<div class="grid grid-cols-1 justify-items-center">
				<iconify-icon icon={config.icon} width="28" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<span class="capitalize">{name}</span>
			</div>
		</button>
	{/each}
</div>

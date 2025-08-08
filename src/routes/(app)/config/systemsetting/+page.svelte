<!-- 
@file src/routes/(app)/config/systemsetting/+page.svelte
@description Main page for system settings.

ENHANCEMENTS:
- The `saveConfig` function now orchestrates a safer save process:
  1. It first calls a new API endpoint to back up the current configuration.
  2. Only on successful backup does it proceed to save the new configuration.
  3. It provides clearer, step-by-step user feedback using toasts.
-->
<script lang="ts">
	import { privateConfigCategories, publicConfigCategories } from '@root/config/guiConfig';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import ModalEditSystem from './ModalEditSystem.svelte';
	import { getToastStore, getModalStore, type ToastSettings } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// --- ENHANCED SAVE PROCESS ---
	async function saveConfig(configData: { [key: string]: any }, isPrivate: boolean) {
		const toast = (message: string, background: string) => {
			toastStore.trigger({ message, background } as ToastSettings);
		};

		try {
			// Step 1: Back up the current configuration
			toast('Backing up current configuration...', 'variant-filled-secondary');
			const backupResponse = await fetch('/api/config/backup', { method: 'POST' });

			if (!backupResponse.ok) {
				const backupResult = await backupResponse.json();
				throw new Error(backupResult.message || 'Failed to create configuration backup.');
			}
			toast('Backup successful!', 'variant-filled-success');

			// Step 2: Save the new configuration
			toast('Saving new configuration...', 'variant-filled-secondary');
			const saveResponse = await fetch('/api/save-config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ configData, isPrivate })
			});

			if (!saveResponse.ok) {
				const saveResult = await saveResponse.json();
				throw new Error(saveResult.message || 'Failed to save configuration.');
			}
			toast('Configuration saved successfully!', 'variant-filled-success');

			// Step 3: Trigger server restart
			await triggerRestart();
		} catch (error: any) {
			console.error('Error in save process:', error);
			toast(error.message, 'variant-filled-error');
		}
	}

	async function triggerRestart() {
		const toast = (message: string, background: string) => {
			toastStore.trigger({ message, background } as ToastSettings);
		};
		try {
			toast('Triggering server restart...', 'variant-filled-secondary');
			const response = await fetch('/api/restart', { method: 'POST' });
			const result = await response.json();

			if (result.success) {
				toast('Server restart triggered successfully!', 'variant-filled-success');
			} else {
				throw new Error('Failed to trigger server restart.');
			}
		} catch (error: any) {
			console.error('Error triggering server restart:', error);
			toast(error.message, 'variant-filled-error');
		}
	}

	// Modal Edit System
	function openModal(title: string, configCategory: string, description: string, isPrivate: boolean): void {
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

<div class="alert variant-soft-warning mb-2 text-center">
	<iconify-icon icon="mdi:alert" class="text-2xl"></iconify-icon>
	<div class="flex-1">
		<p class="font-bold">Caution: For Administrators Only</p>
		<p>Changes made here directly affect the server configuration and can cause instability if not done correctly.</p>
	</div>
</div>

<div class="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	{#each categories as { name, category, config, isPrivate }}
		<button
			on:click={() => openModal(name, category, config.description, isPrivate)}
			aria-label={config.description}
			class="variant-outline-primary btn flex h-24 flex-col items-center justify-center gap-2 text-center"
		>
			<iconify-icon icon={config.icon} class="text-3xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
			<span class="capitalize">{name}</span>
		</button>
	{/each}
</div>

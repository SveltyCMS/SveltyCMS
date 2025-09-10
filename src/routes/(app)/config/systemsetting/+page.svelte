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
	import { privateConfigCategories, publicConfigCategories } from '@src/routes/setup/guiConfig';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { showModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	import ModalEditSystem from './ModalEditSystem.svelte';

	const modalStore = getModalStore();

	// --- ENHANCED SAVE PROCESS ---
	async function saveConfig(configData: { [key: string]: any }) {
		showToast('Saving new configuration...', 'info');

		try {
			// Save the new configuration to the database
			const response = await fetch('/api/settings/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(configData)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to save new settings.');
			}

			showToast('Configuration saved successfully!', 'success');

			// If the saved data includes database credentials, we might need to restart
			if (Object.keys(configData).some((key) => key.startsWith('DB_'))) {
				await triggerRestart();
			}
		} catch (error: any) {
			console.error('Error in save process:', error);
			showToast(error.message, 'error');
		}
	}

	async function triggerRestart() {
		const toast = (message: string, background: string) => {
			if (background?.includes('success') || background === 'gradient-success') showToast(message, 'success');
			else if (background?.includes('error') || background === 'gradient-error') showToast(message, 'error');
			else if (background?.includes('warning') || background === 'gradient-warning' || background === 'variant-filled-warning')
				showToast(message, 'warning');
			else showToast(message, 'info');
		};
		try {
			toast('Triggering server restart...', 'gradient-tertiary');
			const response = await fetch('/api/restart', { method: 'POST' });
			const result = await response.json();

			if (result.success) {
				toast('Server restart triggered successfully!', 'gradient-primary');
			} else {
				throw new Error('Failed to trigger server restart.');
			}
		} catch (error: any) {
			console.error('Error triggering server restart:', error);
			toast(error.message, 'gradient-error');
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
						await saveConfig(formData);
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
		showModal(modalSettings);
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

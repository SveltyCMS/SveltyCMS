<!--
@file src/routes/(app)/config/AccessManagement/+page.svelte
@component 
**This page manages the Access Management system, including roles and permissions**
-->

<script lang="ts">
	import PageTitle from '@src/components/page-title.svelte';
	import { system_permission, system_roles } from '@src/paraglide/messages';
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { showConfirm } from '@utils/modal.svelte';
	import { modalState } from '@utils/modal.svelte';
	import AdminRole from './admin-role.svelte';
	import Permissions from './permissions.svelte';
	import Roles from './roles.svelte';
	import WebsiteTokens from './website-tokens.svelte';

	let currentTab = $state('0');
	let rolesData = $state(page.data.roles);
	let modifiedCount = $state(0);
	let hasModifiedChanges = $state(false);

	const setRoleData = (data: any) => {
		rolesData = data;
		hasModifiedChanges = true;
	};

	const updateModifiedCount = (count: number) => {
		modifiedCount = count;
		hasModifiedChanges = count > 0;
	};

	const saveAllChanges = async () => {
		await globalLoadingStore.withLoading(
			loadingOperations.configSave,
			async () => {
				try {
					const response = await fetch('/api/permission/update', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ roles: rolesData })
					});

					if (response.status === 200) {
						toast.success('Configuration updated successfully!');
						hasModifiedChanges = false;
						modifiedCount = 0;
					} else if (response.status === 304) {
						toast.info('No changes detected, configuration not updated.');
					} else {
						const responseText = await response.text();
						toast.error(`Error updating configuration: ${responseText}`);
					}
				} catch (error) {
					logger.error('Network error during save:', error);
					toast.error('Network error occurred while updating configuration.');
				}
			},
			'Saving access control configuration'
		);
	};

	const resetChanges = async () => {
		rolesData = page.data.roles;
		hasModifiedChanges = false;
		modifiedCount = 0;
		toast.info('Changes have been reset.');
	};

	function tabButtonClass(tab: string) {
		return `flex-1 ${currentTab === tab ? 'bg-surface-100 dark:bg-surface-800' : ''}`;
	}

	beforeNavigate(({ cancel }) => {
		if (hasModifiedChanges || modalState.isOpen) {
			cancel();

			if (modalState.isOpen) {
				toast.warning('Please close the edit modal before navigating away.');
				return;
			}

			showConfirm({
				title: 'Unsaved Changes',
				body: 'You have unsaved changes in the Access Management configuration. Are you sure you want to leave this page?',
				onConfirm: () => {
					hasModifiedChanges = false;
					toast.info('Changes discarded. You can now navigate away.');
				}
			});
		}
	});
</script>

<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<PageTitle name="Access Management" icon="mdi:account-key" showBackButton={true} backUrl="/config" />

	<div class="mt-2 flex items-center justify-center gap-4 lg:mt-0 lg:justify-end">
		<button
			onclick={saveAllChanges}
			aria-label="Save all changes"
			class="preset-filled-tertiary-500 btn"
			disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
		>
			{#if globalLoadingStore.isLoadingReason(loadingOperations.configSave)}
				Saving...
			{:else}
				Save ({modifiedCount})
			{/if}
		</button>

		<button
			onclick={resetChanges}
			aria-label="Reset changes"
			class="preset-filled-secondary-500 btn"
			disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
		>
			Reset
		</button>
	</div>
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-center text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.
	</p>
</div>

<div class="flex flex-col">
	<div class="grow">
		<div
			class="flex justify-around border-b border-surface-200-800 text-tertiary-500 dark:text-primary-500"
			role="tablist"
			aria-label="Access management sections"
		>
			<button
				type="button"
				role="tab"
				aria-selected={currentTab === '0'}
				aria-current={currentTab === '0' ? 'page' : undefined}
				class={tabButtonClass('0')}
				onclick={() => (currentTab = '0')}
			>
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:shield-lock-outline" width={24}></iconify-icon>
					<span class={currentTab === '0' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>{system_permission()}</span>
				</div>
			</button>

			<button
				type="button"
				role="tab"
				aria-selected={currentTab === '1'}
				aria-current={currentTab === '1' ? 'page' : undefined}
				class={tabButtonClass('1')}
				onclick={() => (currentTab = '1')}
			>
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:account-group" width={24}></iconify-icon>
					<span class={currentTab === '1' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>{system_roles()}</span>
				</div>
			</button>

			<button
				type="button"
				role="tab"
				aria-selected={currentTab === '2'}
				aria-current={currentTab === '2' ? 'page' : undefined}
				class={tabButtonClass('2')}
				onclick={() => (currentTab = '2')}
			>
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:account-cog" width={24}></iconify-icon>
					<span class={currentTab === '2' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>Admin</span>
				</div>
			</button>

			<button
				type="button"
				role="tab"
				aria-selected={currentTab === '3'}
				aria-current={currentTab === '3' ? 'page' : undefined}
				class={tabButtonClass('3')}
				onclick={() => (currentTab = '3')}
			>
				<div class="flex items-center justify-center gap-1 py-4">
					<iconify-icon icon="mdi:web" width={24}></iconify-icon>
					<span class={currentTab === '3' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>Website Tokens</span>
				</div>
			</button>
		</div>

		{#if currentTab === '0'}
			<div class="p-4" role="tabpanel">
				<Permissions roleData={rolesData} {setRoleData} {updateModifiedCount} />
			</div>
		{/if}

		{#if currentTab === '1'}
			<div class="p-4" role="tabpanel">
				<Roles roleData={rolesData} {setRoleData} {updateModifiedCount} permissions={page.data.permissions} />
			</div>
		{/if}

		{#if currentTab === '2'}
			<div class="p-4" role="tabpanel">
				<AdminRole roleData={rolesData} {setRoleData} />
			</div>
		{/if}

		{#if currentTab === '3'}
			<div class="p-4" role="tabpanel">
				<WebsiteTokens permissions={page.data.permissions} />
			</div>
		{/if}
	</div>
</div>
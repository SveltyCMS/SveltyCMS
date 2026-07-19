<!--
@file src/routes/(app)/config/access-management/+page.svelte
@component
**This page manages the Access Management system, including roles and permissions**

@example
<AccessManagement />

### Props
- `roleData`: An object containing role data, including the current admin role and available roles.

### Features
- Navigate between permissions, roles, and admin role management tabs
- View and manage system permissions
- Assign roles and permissions to users
-->

<script lang="ts">
import AdminPageShell from "@components/admin-page-shell.svelte";
import AdminCard from '@components/admin-card.svelte';
import Tabs from "@components/ui/tabs";
import { system_permission, system_roles } from "@src/paraglide/messages";
import {
	globalLoadingStore,
	loadingOperations,
} from "@src/stores/loading-store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
import StickyActions from "@components/ui/sticky-actions.svelte";
import { logger } from "@utils/logger";
import { page } from "$app/state";
import { beforeNavigate } from "$app/navigation";
import { showConfirm } from "@utils/modal.svelte";
import { modalState } from "@utils/modal.svelte";
import AdminRole from "./admin-role.svelte";
import Permissions from "./permissions.svelte";
import Roles from "./roles.svelte";
import WebsiteTokens from "./website-tokens.svelte";
	import Button from '@components/ui/button.svelte';

// Use $state for local component state
let currentTab = $state("0"); // Initial tab set to string '0' for Tabs component

// Use $state for page data that needs to be mutable
let rolesData = $state(page.data.roles); // Renamed from `roles` to `rolesData` for clarity with internal `roles` in sub-components

// Track the number of modified permissions/roles for the "Save" button
let modifiedCount = $state(0);
let hasModifiedChanges = $state(false);

// Function to update the roles data from child components
const setRoleData = (data: any) => {
	rolesData = data;
	hasModifiedChanges = true; // Any change from children marks the page as modified
};

// Function to update the count of modified items (e.g., permissions, roles)
const updateModifiedCount = (count: number) => {
	modifiedCount = count;
	hasModifiedChanges = count > 0;
};

const saveAllChanges = async () => {
	await globalLoadingStore.withLoading(
		loadingOperations.configSave,
		async () => {
			try {
				// Shared mutation client — CSRF attached automatically (Testing 2026)
				const { fetchApi } = await import("@utils/api");
				const result = await fetchApi("/api/permission/update", {
					method: "POST",
					body: JSON.stringify({ roles: rolesData }),
				});

				if (result.success) {
					toast.success("Configuration updated successfully!");
					hasModifiedChanges = false;
					modifiedCount = 0;
				} else if (result.code === "HTTP_304") {
					toast.info("No changes detected, configuration not updated.");
				} else {
					toast.error(
						`Error updating configuration: ${result.message || result.error || "unknown"}`,
					);
				}
			} catch (error) {
				logger.error("Network error during save:", error);
				toast.error("Network error occurred while updating configuration.");
			}
		},
		"Saving access control configuration",
	);
};

const resetChanges = async () => {
	rolesData = page.data.roles;
	hasModifiedChanges = false;
	modifiedCount = 0;
	toast.info("Changes have been reset.");
};

// Accessibility: Unsaved changes warning
beforeNavigate(({ cancel }) => {
	if (hasModifiedChanges || modalState.isOpen) {
		cancel();
		if (modalState.isOpen) {
			toast.warning("Please close the edit modal before navigating away.");
			return;
		}
		showConfirm({
			title: "Unsaved Changes",
			body: "You have unsaved changes in the Access Management configuration. Are you sure you want to leave this page?",
			onConfirm: () => {
				hasModifiedChanges = false; // Bypass next check
				toast.info("Changes discarded. You can now navigate away.");
			},
		});
	}
});
</script>

<AdminPageShell title="Access Management" icon="mdi:shield-account-outline" showBackButton={true} backUrl="/config">
	{#snippet actions()}
		<StickyActions data-testid="access-mgmt-actions">
		<Button variant="tertiary"
			onclick={saveAllChanges}
			aria-label="Save all changes"
			data-testid="access-mgmt-save"
			disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
		 class="font-semibold shadow-xs">
			{#if globalLoadingStore.isLoadingReason(loadingOperations.configSave)}
				Saving...
			{:else}
				Save ({modifiedCount})
			{/if}
		</Button>

		<Button variant="ghost"
			onclick={resetChanges}
			aria-label="Reset changes"
			data-testid="access-mgmt-reset"
			disabled={!hasModifiedChanges || globalLoadingStore.isLoading}
		 class="font-semibold shadow-xs">
			Reset
		</Button>
		</StickyActions>
	{/snippet}

	<AdminCard class="p-4 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/40 backdrop-blur-md shadow-xs" data-testid="access-mgmt-page">
		<div class="mb-4">
			<p class="text-tertiary-500 dark:text-primary-500 text-sm">
				Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
				can perform in the system.
			</p>
		</div>

		<Tabs value={currentTab} onValueChange={(e) => (currentTab = e.value)} class="grow">
			<Tabs.List class="flex justify-around text-tertiary-500 dark:text-primary-500 border-b border-surface-200-800" data-testid="access-mgmt-tabs">
				<Tabs.Trigger value="0" class="flex-1" data-testid="access-tab-permissions" aria-current={currentTab === '0' ? 'page' : undefined}>
					<div class="flex items-center justify-center gap-1 py-4">
						<iconify-icon icon="mdi:shield-lock-outline" width={24}></iconify-icon>
						<span class={currentTab === '0' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>{system_permission()}</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Trigger value="1" class="flex-1" data-testid="access-tab-roles" aria-current={currentTab === '1' ? 'page' : undefined}>
					<div class="flex items-center justify-center gap-1 py-4">
						<iconify-icon icon="mdi:account-group" width={24}></iconify-icon>
						<span class={currentTab === '1' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>{system_roles()}</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Trigger value="2" class="flex-1" data-testid="access-tab-admin" aria-current={currentTab === '2' ? 'page' : undefined}>
					<div class="flex items-center justify-center gap-1 py-4">
						<iconify-icon icon="mdi:account-cog" width={24}></iconify-icon>
						<span class={currentTab === '2' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>Admin</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Trigger value="3" class="flex-1" data-testid="access-tab-tokens" aria-current={currentTab === '3' ? 'page' : undefined}>
					<div class="flex items-center justify-center gap-1 py-4">
						<iconify-icon icon="mdi:web" width={24}></iconify-icon>
						<span class={currentTab === '3' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''}>Website Tokens</span>
					</div>
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="0"><div class="p-2"><Permissions roleData={rolesData} {setRoleData} {updateModifiedCount} /></div></Tabs.Content>
			<Tabs.Content value="1"
				><div class="p-2"><Roles roleData={rolesData} {setRoleData} {updateModifiedCount} permissions={page.data.permissions} /></div></Tabs.Content
			>
			<Tabs.Content value="2"><div class="p-2"><AdminRole roleData={rolesData} {setRoleData} /></div></Tabs.Content>
			<Tabs.Content value="3"><div class="p-2"><WebsiteTokens permissions={page.data.permissions} /></div></Tabs.Content>
		</Tabs>
	</AdminCard>
</AdminPageShell>

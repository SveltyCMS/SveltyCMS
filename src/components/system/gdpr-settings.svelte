<!--
@file src/components/system/gdpr-settings.svelte
@component
**GDPR settings component for managing user data export and anonymization**

### Props
- `group`: The setting group containing GDPR settings

### Features
- Exports user data to JSON
- Anonymizes user data
- Supports both dark and light mode
- Uses toast for notifications
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import type { SettingGroup } from '../../routes/(app)/config/system-settings/settings-groups';

	interface Props {
		group: SettingGroup;
	}

	let { group }: Props = $props();

	let userIdExport = $state('');
	let userIdAnonymize = $state('');
	let loadingExport = $state(false);
	let loadingAnonymize = $state(false);
	let confirmAnonymize = $state(false);

	async function handleExport() {
		if (!userIdExport) {
			return;
		}
		loadingExport = true;
		try {
			const res = await fetch('/api/gdpr', {
				method: 'POST',
				body: JSON.stringify({ action: 'export', userId: userIdExport })
			});
			const result = await res.json();
			if (result.success) {
				// Trigger download
				const blob = new Blob([JSON.stringify(result.data, null, 2)], {
					type: 'application/json'
				});
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `user-export-${userIdExport}-${new Date().toISOString()}.json`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
				toast.success('Data export downloaded successfully.');
			} else {
				toast.error({ description: result.error || 'Export failed' });
			}
		} catch (err: any) {
			toast.error({ description: err.message || 'Export error' });
		} finally {
			loadingExport = false;
		}
	}

	async function handleAnonymize() {
		if (!userIdAnonymize) {
			return;
		}
		if (!confirmAnonymize) {
			confirmAnonymize = true;
			setTimeout(() => (confirmAnonymize = false), 3000); // Reset after 3s
			return;
		}

		loadingAnonymize = true;
		try {
			const res = await fetch('/api/gdpr', {
				method: 'POST',
				body: JSON.stringify({ action: 'anonymize', userId: userIdAnonymize })
			});
			const result = await res.json();
			if (result.success) {
				toast.success(`User ${userIdAnonymize} successfully anonymized.`);
				userIdAnonymize = '';
				confirmAnonymize = false;
			} else {
				toast.error({ description: result.error || 'Anonymization failed' });
			}
		} catch (err: any) {
			toast.error({ description: err.message || 'Anonymization error' });
		} finally {
			loadingAnonymize = false;
		}
	}
</script>

<div class="space-y-6 max-w-full pb-32">
	<!-- Header -->
	<div class="mb-6">
		<h2 class="mb-2 text-xl font-bold md:text-2xl flex items-center gap-2">
			<span>{group.icon}</span>
			{group.name}
		</h2>
		<p class="text-sm text-surface-600 dark:text-surface-300">{group.description}</p>
	</div>

	<!-- Info Alert -->
	<div class="alert preset-filled-tertiary-500 dark:preset-filled-primary-500/10 border-s-4 border-tertiary-500 dark:border-primary-500 rounded p-4 mb-6">
		<div class="flex items-start gap-3">
			<iconify-icon icon="mdi:shield-check" width="24" class="text-tertiary-500 dark:text-primary-500 mt-0.5"></iconify-icon>
			<div>
				<h3 class="font-bold text-sm">Compliance Tools</h3>
				<p class="text-xs text-surface-600 dark:text-surface-300 mt-1">
					These tools perform permanent actions to comply with GDPR Articles 17 & 20. All actions are strictly logged in the Audit Trail.
				</p>
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
		<!-- Data Export (Article 20) -->
		<div class="card preset-tonal-surface p-6 rounded space-y-4 border border-surface-200 dark:border-surface-700">
			<div class="flex items-center gap-3 mb-2">
				<div class="p-2 rounded-full bg-tertiary-500 dark:bg-primary-500/10 text-tertiary-500 dark:text-primary-500"><iconify-icon icon="mdi:database-export" width="24"></iconify-icon></div>
				<div>
					<h3 class="font-bold">Data Portability</h3>
					<p class="text-xs opacity-70">Export all user data to JSON</p>
				</div>
			</div>

			<Input
				label="User ID"
				type="text"
				placeholder="Enter User ID..."
				bind:value={userIdExport}
			/>

			<Button variant="tertiary" disabled={!userIdExport || loadingExport} onclick={handleExport} class="w-full">
				{#if loadingExport}
					<iconify-icon icon="mdi:loading" class="animate-spin me-2"></iconify-icon>
					Exporting...
				{:else}
					Download JSON
				{/if}
			</Button>
		</div>

		<!-- Right to Erasure (Article 17) -->
		<div class="card preset-tonal-surface p-6 rounded space-y-4 border border-surface-200 dark:border-surface-700">
			<div class="flex items-center gap-3 mb-2">
				<div class="p-2 rounded-full bg-error-500/10 text-error-500"><iconify-icon icon="mdi:account-remove" width="24"></iconify-icon></div>
				<div>
					<h3 class="font-bold">Right to Erasure</h3>
					<p class="text-xs opacity-70">Permanently anonymize user</p>
				</div>
			</div>

			<Input
				label="User ID"
				type="text"
				placeholder="Enter User ID..."
				bind:value={userIdAnonymize}
			/>

			<Button variant="error"
				disabled={!userIdAnonymize || loadingAnonymize}
				onclick={handleAnonymize}
			 class="{confirmAnonymize ? ' ' : ' '} w-full transition-all">
				{#if loadingAnonymize}
					<iconify-icon icon="mdi:loading" class="animate-spin me-2"></iconify-icon>
					Processing...
				{:else if confirmAnonymize}
					⚠️ Confirm Anonymization?
				{:else}
					Anonymize User
				{/if}
			</Button>
			{#if confirmAnonymize}
				<p class="text-xs text-center text-error-500 animate-pulse">Click again to confirm. This action cannot be undone.</p>
			{/if}
		</div>
	</div>
</div>

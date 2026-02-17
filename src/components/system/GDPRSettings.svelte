<script lang="ts">
	import { toaster } from '@stores/store.svelte';
	import type { SettingGroup } from '../../routes/(app)/config/systemsetting/settingsGroups';

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
		if (!userIdExport) return;
		loadingExport = true;
		try {
			const res = await fetch('/api/gdpr', {
				method: 'POST',
				body: JSON.stringify({ action: 'export', userId: userIdExport })
			});
			const result = await res.json();
			if (result.success) {
				// Trigger download
				const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `user-export-${userIdExport}-${new Date().toISOString()}.json`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
				toaster.success({ description: 'Data export downloaded successfully.' });
			} else {
				toaster.error({ description: result.error || 'Export failed' });
			}
		} catch (err: any) {
			toaster.error({ description: err.message || 'Export error' });
		} finally {
			loadingExport = false;
		}
	}

	async function handleAnonymize() {
		if (!userIdAnonymize) return;
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
				toaster.success({ description: `User ${userIdAnonymize} successfully anonymized.` });
				userIdAnonymize = '';
				confirmAnonymize = false;
			} else {
				toaster.error({ description: result.error || 'Anonymization failed' });
			}
		} catch (err: any) {
			toaster.error({ description: err.message || 'Anonymization error' });
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
	<div class="alert preset-filled-primary-500/10 border-l-4 border-primary-500 rounded-lg p-4 mb-6">
		<div class="flex items-start gap-3">
			<iconify-icon icon="mdi:shield-check" width="24" class="text-primary-500 mt-0.5"></iconify-icon>
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
		<div class="card preset-tonal-surface p-6 rounded-xl space-y-4 border border-surface-200 dark:border-surface-700">
			<div class="flex items-center gap-3 mb-2">
				<div class="p-2 rounded-full bg-primary-500/10 text-primary-500"><iconify-icon icon="mdi:database-export" width="24"></iconify-icon></div>
				<div>
					<h3 class="font-bold">Data Portability</h3>
					<p class="text-xs opacity-70">Export all user data to JSON</p>
				</div>
			</div>

			<label class="label">
				<span class="label-text text-sm font-medium">User ID</span>
				<input class="input" type="text" placeholder="Enter User ID..." bind:value={userIdExport}>
			</label>

			<button class="btn preset-filled-primary-500 w-full" disabled={!userIdExport || loadingExport} onclick={handleExport}>
				{#if loadingExport}
					<iconify-icon icon="mdi:loading" class="animate-spin mr-2"></iconify-icon>
					Exporting...
				{:else}
					Download JSON
				{/if}
			</button>
		</div>

		<!-- Right to Erasure (Article 17) -->
		<div class="card preset-tonal-surface p-6 rounded-xl space-y-4 border border-surface-200 dark:border-surface-700">
			<div class="flex items-center gap-3 mb-2">
				<div class="p-2 rounded-full bg-error-500/10 text-error-500"><iconify-icon icon="mdi:account-remove" width="24"></iconify-icon></div>
				<div>
					<h3 class="font-bold">Right to Erasure</h3>
					<p class="text-xs opacity-70">Permanently anonymize user</p>
				</div>
			</div>

			<label class="label">
				<span class="label-text text-sm font-medium">User ID</span>
				<input class="input" type="text" placeholder="Enter User ID..." bind:value={userIdAnonymize}>
			</label>

			<button
				class="btn {confirmAnonymize ? 'preset-filled-error-500' : 'preset-tonal-error'} w-full transition-all"
				disabled={!userIdAnonymize || loadingAnonymize}
				onclick={handleAnonymize}
			>
				{#if loadingAnonymize}
					<iconify-icon icon="mdi:loading" class="animate-spin mr-2"></iconify-icon>
					Processing...
				{:else if confirmAnonymize}
					⚠️ Confirm Anonymization?
				{:else}
					Anonymize User
				{/if}
			</button>
			{#if confirmAnonymize}
				<p class="text-xs text-center text-error-500 animate-pulse">Click again to confirm. This action cannot be undone.</p>
			{/if}
		</div>
	</div>
</div>

<!-- 
@file src/routes/(app)/user/components/modal-privacy-data.svelte
@component
**A modal for GDPR-related privacy and data management (Export & Anonymization)**
-->

<script lang="ts">
	import { toast } from '@src/stores/toast.svelte.ts';
	import { modalState } from '@utils/modal-state.svelte';
	import { showConfirm } from '@utils/modal-utils';
	import { page } from '$app/state';

	// Props
	interface Props {
		user: any;
	}
	const { user }: Props = $props();

	// Get data from page store for additional context
	const { totalUsers, isAdmin } = page.data;

	// GDPR: Data Portability
	async function handleExportData() {
		try {
			const res = await fetch('/api/gdpr', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'export', userId: user._id })
			});
			const result = await res.json();
			if (result.success) {
				const blob = new Blob([JSON.stringify(result.data, null, 2)], {
					type: 'application/json'
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `sveltycms-data-export-${user.username}-${new Date().toISOString().split('T')[0]}.json`;
				a.click();
				URL.revokeObjectURL(url);
				toast.success('Data export started');
			} else {
				toast.error(result.error || 'Export failed');
			}
		} catch (_err) {
			toast.error('Failed to export data');
		}
	}

	// GDPR: Right to Erasure
	function handleAnonymize() {
		showConfirm({
			title: 'Delete & Anonymize Account',
			body: 'This will permanently anonymize your account. This action cannot be undone. Are you sure?',
			onConfirm: async () => {
				try {
					const res = await fetch('/api/gdpr', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							action: 'anonymize',
							userId: user._id,
							reason: 'User self-request (Right to Erasure)'
						})
					});
					const result = await res.json();
					if (result.success) {
						toast.success('Account anonymized successfully');
						// Force logout by redirecting to logout
						window.location.href = '/api/user/logout';
					} else {
						toast.error(result.error || 'Anonymization failed');
					}
				} catch (_err) {
					toast.error('Failed to anonymize account');
				}
			}
		});
	}
</script>

<div class="space-y-6 text-black dark:text-white p-2">
	<header class="flex items-center gap-3 border-b border-surface-500/20 pb-4">
		<iconify-icon icon="mdi:shield-lock" class="text-primary-500" width="32"></iconify-icon>
		<div>
			<h2 class="text-xl font-bold">Privacy & Data Management</h2>
			<p class="text-sm opacity-70">Manage your personal data and account privacy (GDPR)</p>
		</div>
	</header>

	<div class="grid grid-cols-1 gap-4 focus:outline-none">
		<!-- Export Data -->
		<div
			class="card p-5 bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 hover:border-primary-500/50 transition-colors"
		>
			<div class="flex items-start gap-4">
				<div class="p-3 rounded-lg bg-secondary-500/10 text-secondary-500">
					<iconify-icon icon="mdi:database-export" width="24"></iconify-icon>
				</div>
				<div class="flex-1">
					<h3 class="font-bold text-lg">Download My Data</h3>
					<p class="mt-1 text-sm text-surface-600 dark:text-surface-400">
						Receive a copy of all your personal data stored in the SveltyCMS system. The data will be provided in a structured JSON format for
						portability.
					</p>
					<button onclick={handleExportData} class="btn preset-filled-secondary-500 mt-4 w-full sm:w-auto">
						<iconify-icon icon="mdi:download" class="mr-2"></iconify-icon>
						Request Data Export
					</button>
				</div>
			</div>
		</div>

		<!-- Anonymize/Delete Account -->
		{#if (totalUsers ?? 1) > 1 || !isAdmin}
			<div
				class="card p-5 bg-surface-50 dark:bg-surface-900/40 border border-surface-200 dark:border-surface-700 hover:border-error-500/50 transition-colors"
			>
				<div class="flex items-start gap-4">
					<div class="p-3 rounded-lg bg-error-500/10 text-error-500">
						<iconify-icon icon="mdi:account-remove" width="24"></iconify-icon>
					</div>
					<div class="flex-1">
						<h3 class="font-bold text-lg text-error-500">Delete & Anonymize My Account</h3>
						<p class="mt-1 text-sm text-surface-600 dark:text-surface-400">
							Exercise your "Right to Erasure". This will permanently anonymize your personal data and delete your account. This action is
							irreversible.
						</p>
						<button onclick={handleAnonymize} class="btn preset-filled-error-500 mt-4 w-full sm:w-auto">
							<iconify-icon icon="mdi:alert-circle" class="mr-2"></iconify-icon>
							Permanently Anonymize Account
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<footer class="flex justify-end pt-4 border-t border-surface-500/20">
		<button class="btn preset-tonal-surface" onclick={() => modalState.close()}> Close </button>
	</footer>
</div>

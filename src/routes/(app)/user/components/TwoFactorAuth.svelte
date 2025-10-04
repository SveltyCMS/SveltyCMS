<!--
@file src/routes/(app)/user/components/TwoFactorAuth.svelte
@component
**Two-Factor Authentication Management Component**

This component provides a user interface for managing 2FA settings:
- Enable/disable 2FA
- Display setup QR code
- Show backup codes
- Verify setup

@example
<TwoFactorAuth {user} />

### Props
- `user` {User} - Current user object

### Features
- QR code generation for authenticator apps
- Backup codes management
- Enable/disable 2FA toggle
- Setup verification workflow
- Responsive design with proper accessibility
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	// Auth
	import type { User } from '@src/databases/auth/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import TwoFactorSetupModal from './TwoFactorSetupModal.svelte';
	import TwoFactorVerifyModal from './TwoFactorVerifyModal.svelte';
	// Skeleton
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { showModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';

	// Props
	let { user } = $props<{ user: User }>();

	// Note: modalStore is not directly used; kept to ensure modal system initializes if required
	getModalStore();

	// State
	let isLoading = $state(false);
	let backupCodes = $state<string[]>([]);

	// Check if 2FA is enabled
	let is2FAEnabled = $derived(user?.is2FAEnabled || false);

	// Show success toast
	function showSuccessToast(message: string) {
		showToast(`<iconify-icon icon=\"mdi:check-circle\" color=\"white\" width=\"24\" class=\"mr-2\"></iconify-icon>${message}`, 'success');
	}
	function showErrorToast(message: string) {
		showToast(`<iconify-icon icon=\"mdi:alert-circle\" color=\"white\" width=\"24\" class=\"mr-2\"></iconify-icon>${message}`, 'error');
	}

	// Setup 2FA - Show QR code modal
	async function setup2FA() {
		if (isLoading) return;

		isLoading = true;

		try {
			const response = await fetch('/api/auth/2fa/setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to setup 2FA');
			}

			// Show setup modal with QR code
			const modalComponent: ModalComponent = {
				ref: TwoFactorSetupModal,
				props: {
					qrCodeUrl: result.qrCodeUrl,
					secret: result.secret,
					backupCodes: result.backupCodes
				}
			};

			const modalSettings: ModalSettings = {
				type: 'component',
				title: m.twofa_setup_title(),
				component: modalComponent,
				response: async (verified: boolean) => {
					if (verified) {
						showSuccessToast(m.twofa_success_enabled());
						await invalidateAll();
					}
				}
			};

			showModal(modalSettings);
		} catch (error) {
			console.error('2FA setup error:', error);
			showErrorToast(error instanceof Error ? error.message : m.twofa_error_setup_failed());
		} finally {
			isLoading = false;
		}
	}

	// Disable 2FA
	async function disable2FA() {
		if (isLoading) return;

		// Show verification modal first
		const modalComponent: ModalComponent = {
			ref: TwoFactorVerifyModal,
			props: {
				title: m.twofa_disable_verify_title(),
				description: m.twofa_disable_verify_description()
			}
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: m.twofa_disable_title(),
			component: modalComponent,
			response: async (code: string | null) => {
				if (!code) return;

				isLoading = true;

				try {
					const response = await fetch('/api/auth/2fa/disable', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ code })
					});

					const result = await response.json();

					if (!response.ok) {
						throw new Error(result.message || 'Failed to disable 2FA');
					}

					showSuccessToast(m.twofa_success_disabled());
					await invalidateAll();
				} catch (error) {
					console.error('2FA disable error:', error);
					showErrorToast(error instanceof Error ? error.message : 'Failed to disable 2FA');
				} finally {
					isLoading = false;
				}
			}
		};

		showModal(modalSettings);
	}

	// Generate new backup codes
	async function generateBackupCodes() {
		if (isLoading) return;

		isLoading = true;

		try {
			const response = await fetch('/api/auth/2fa/backup-codes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to generate backup codes');
			}

			backupCodes = result.backupCodes;
			showSuccessToast(m.twofa_backup_codes_generated());
		} catch (error) {
			console.error('Backup codes error:', error);
			showErrorToast(error instanceof Error ? error.message : 'Failed to generate backup codes');
		} finally {
			isLoading = false;
		}
	}
</script>

<!-- TwoFactorAuth is rendered conditionally by parent based on is2FAEnabledGlobal -->
{#if true}
	<div class="card p-6 shadow-md">
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<iconify-icon icon="mdi:shield-check" width="24" class="text-primary-500"></iconify-icon>
				<h3 class="h3">{m.twofa_title()}</h3>
			</div>

			<!-- Status badge -->
			<div class="badge {is2FAEnabled ? 'variant-filled-success' : 'variant-filled-surface'}">
				<iconify-icon icon="mdi:{is2FAEnabled ? 'check-circle' : 'circle-outline'}" width="16" class="mr-1"></iconify-icon>
				{is2FAEnabled ? m.twofa_status_enabled() : m.twofa_status_disabled()}
			</div>
		</div>

		<p class="mb-6 text-surface-600 dark:text-surface-300">
			{m.twofa_description()}
		</p>

		<div class="space-y-4">
			{#if !is2FAEnabled}
				<!-- Setup 2FA -->
				<div class="flex flex-col gap-3 sm:flex-row">
					<button onclick={setup2FA} disabled={isLoading} class="variant-filled-primary btn flex-1">
						{#if isLoading}
							<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
							{m.twofa_setting_up()}
						{:else}
							<iconify-icon icon="mdi:shield-plus" width="20" class="mr-2"></iconify-icon>
							{m.twofa_setup_button()}
						{/if}
					</button>
				</div>

				<div class="alert variant-ghost-primary">
					<iconify-icon icon="mdi:information" width="20"></iconify-icon>
					<div class="alert-message">
						<h4 class="h4">{m.twofa_setup_info_title()}</h4>
						<p>{m.twofa_setup_info_description()}</p>
						<ul class="mt-2 list-inside list-disc space-y-1 text-sm">
							<li>{m.twofa_setup_step_1()}</li>
							<li>{m.twofa_setup_step_2()}</li>
							<li>{m.twofa_setup_step_3()}</li>
						</ul>
					</div>
				</div>
			{:else}
				<!-- 2FA is enabled -->
				<div class="space-y-3">
					<div class="flex flex-col gap-3 sm:flex-row">
						<button onclick={disable2FA} disabled={isLoading} class="variant-filled-error btn flex-1">
							{#if isLoading}
								<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
								{m.twofa_disabling()}
							{:else}
								<iconify-icon icon="mdi:shield-remove" width="20" class="mr-2"></iconify-icon>
								{m.twofa_disable_button()}
							{/if}
						</button>

						<button onclick={generateBackupCodes} disabled={isLoading} class="variant-filled-secondary btn flex-1">
							{#if isLoading}
								<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
								{m.twofa_generating_codes()}
							{:else}
								<iconify-icon icon="mdi:key-variant" width="20" class="mr-2"></iconify-icon>
								{m.twofa_generate_backup_codes()}
							{/if}
						</button>
					</div>

					<!-- Show backup codes if generated -->
					{#if backupCodes.length > 0}
						<div class="alert variant-ghost-warning">
							<iconify-icon icon="mdi:key-variant" width="20"></iconify-icon>
							<div class="alert-message">
								<h4 class="h4">{m.twofa_backup_codes_title()}</h4>
								<p class="mb-3">{m.twofa_backup_codes_description()}</p>
								<div class="grid grid-cols-2 gap-2 font-mono text-sm">
									{#each backupCodes as code}
										<div class="rounded bg-surface-200 p-2 text-center dark:bg-surface-700">
											{code}
										</div>
									{/each}
								</div>
								<p class="mt-3 text-sm text-warning-600 dark:text-warning-400">
									<iconify-icon icon="mdi:alert" width="16" class="mr-1"></iconify-icon>
									{m.twofa_backup_codes_warning()}
								</p>
							</div>
						</div>
					{/if}

					<div class="alert variant-ghost-success">
						<iconify-icon icon="mdi:shield-check" width="20"></iconify-icon>
						<div class="alert-message">
							<h4 class="h4">{m.twofa_enabled_title()}</h4>
							<p>{m.twofa_enabled_description()}</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Tailwind styles are applied via class attributes directly */
</style>

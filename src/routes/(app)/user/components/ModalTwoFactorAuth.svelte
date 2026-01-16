<!--
@file src/routes/(app)/user/components/ModalTwoFactorAuth.svelte
@component
**Two-Factor Authentication Management Modal**

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
	import type { User } from '@src/databases/auth/types';
	// Skeleton & Stores
	// getModalStore deprecated - use modalState from @utils/modalState.svelte;
	import TwoFactorVerifyModal from './TwoFactorVerifyModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { logger } from '@utils/logger';
	import { toaster } from '@stores/store.svelte';

	interface Props {
		parent?: {
			regionFooter?: string;
			onClose?: (event: MouseEvent) => void;
			buttonPositive?: string;
		};
		user?: User;
		title?: string;
		body?: string;
		close?: (result?: any) => void;
	}

	const { user, title, body, close }: Props = $props();

	// State
	let isLoading = $state(false);
	let backupCodes = $state<string[]>([]);
	let setupData = $state<{ qrCodeUrl: string; secret: string; backupCodes: string[] } | null>(null);
	let verificationCode = $state('');

	// Check if 2FA is enabled
	const is2FAEnabled = $derived(user?.is2FAEnabled || false);

	// Load setup data when modal opens if 2FA is not enabled
	$effect(() => {
		if (!is2FAEnabled && !setupData) {
			loadSetupData();
		}
	});

	// Show success toast
	function showSuccessToast(message: string) {
		toaster.success({ description: `<iconify-icon icon="mdi:check-circle" color="white" width="24" class="mr-2"></iconify-icon>${message}` });
	}
	function showErrorToast(message: string) {
		toaster.error({ description: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-2"></iconify-icon>${message}` });
	}

	// Load setup data (QR code, secret, backup codes)
	async function loadSetupData() {
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

			// The data is nested inside result.data
			const data = result.data || result;

			// Get the otpauth URL
			const otpauthUrl = data.qrCodeURL || data.qrCodeUrl || data.qrCode || data.qr_code_url || '';

			// Generate QR code image URL using a QR code API
			// Using qrcode.show API (simple, no registration needed)
			const qrCodeImageUrl = otpauthUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}` : '';

			setupData = {
				qrCodeUrl: qrCodeImageUrl,
				secret: data.secret || data.secretKey || data.secret_key || '',
				backupCodes: data.backupCodes || data.backup_codes || []
			};
		} catch (error) {
			logger.error('2FA setup error:', error);
			showErrorToast(error instanceof Error ? error.message : m.twofa_error_setup_failed());
		} finally {
			isLoading = false;
		}
	}

	// Verify and enable 2FA
	async function verify2FA() {
		if (isLoading || !verificationCode || verificationCode.length !== 6) return;

		isLoading = true;

		try {
			const response = await fetch('/api/auth/2fa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: verificationCode })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || 'Failed to verify 2FA code');
			}

			showSuccessToast(m.twofa_success_enabled());
			await invalidateAll();
			close?.({ success: true });
		} catch (error) {
			logger.error('2FA verification error:', error);
			showErrorToast(error instanceof Error ? error.message : m.twofa_error_invalid_code());
		} finally {
			isLoading = false;
		}
	}

	// Disable 2FA
	async function disable2FA() {
		if (isLoading) return;

		// Show verification modal first
		const { modalState } = await import('@utils/modalState.svelte');

		modalState.trigger(
			TwoFactorVerifyModal as any,
			{
				title: m.twofa_disable_verify_title(),
				description: m.twofa_disable_verify_description()
			},
			async (code: string | null) => {
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
					logger.error('2FA disable error:', error);
					showErrorToast(error instanceof Error ? error.message : 'Failed to disable 2FA');
				} finally {
					isLoading = false;
				}
			}
		);
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
			logger.error('Backup codes error:', error);
			showErrorToast(error instanceof Error ? error.message : 'Failed to generate backup codes');
		} finally {
			isLoading = false;
		}
	}

	// Base Classes for modal
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl overflow-y-auto flex-1';
</script>

<!-- Main Modal Component -->
<div class="modal-2fa space-y-4">
	<header class={`text-center text-primary-500 ${cHeader} shrink-0`}>
		{title ?? m.twofa_title()}
	</header>

	<article class="shrink-0 text-center text-sm">
		{body ?? m.twofa_description()}
	</article>

	<form class="modal-form {cForm}">
		<!-- Status Section -->
		<div class="mb-4 flex items-center justify-between rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
			<div class="flex items-center gap-3">
				<div class="rounded-lg bg-primary-500/10 p-2 dark:bg-primary-500/20">
					<iconify-icon icon="mdi:shield-check" width="24" class="text-primary-500"></iconify-icon>
				</div>
				<div>
					<p class="text-sm font-semibold">{m.twofa_title()}</p>
					<p class="text-xs text-surface-600 dark:text-surface-300">{m.twofa_description()}</p>
				</div>
			</div>
			<!-- Status badge - aligned right -->
			<span class="badge {is2FAEnabled ? 'preset-filled-success-500' : 'preset-filled-surface-500'}">
				<iconify-icon icon="mdi:{is2FAEnabled ? 'check-circle' : 'circle-outline'}" width="14" class="mr-1"></iconify-icon>
				{is2FAEnabled ? m.twofa_status_enabled() : m.twofa_status_disabled()}
			</span>
		</div>

		{#if !is2FAEnabled}
			{#if isLoading && !setupData}
				<!-- Loading state -->
				<div class="flex flex-col items-center justify-center gap-4 py-8">
					<iconify-icon icon="svg-spinners:ring-resize" width="48" class="text-primary-500"></iconify-icon>
					<p class="text-sm text-surface-600 dark:text-surface-300">{m.twofa_setting_up()}</p>
				</div>
			{:else if setupData}
				<!-- QR Code Setup -->
				<div class="space-y-4">
					<!-- Step 1: Scan QR Code -->
					<div class="space-y-3">
						<h4 class="h4 flex items-center gap-2">
							<span class="preset-soft-primary-500 badge">1</span>
							{m.twofa_setup_scan_title()}
						</h4>
						<p class="text-sm text-surface-600 dark:text-surface-300">{m.twofa_setup_step_1()}</p>

						<!-- QR Code -->
						<div class="flex justify-center rounded-lg bg-white p-4 dark:bg-white">
							{#if setupData.qrCodeUrl}
								<img src={setupData.qrCodeUrl} alt="2FA QR Code" class="h-48 w-48" />
							{:else}
								<div class="flex h-48 w-48 items-center justify-center bg-surface-200">
									<p class="text-sm text-surface-600">QR Code not available</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Step 2: Manual Entry (Optional) -->
					<div class="space-y-3">
						<h4 class="h4 flex items-center gap-2">
							<span class="preset-soft-secondary-500 badge">2</span>
							{m.twofa_show_secret()}
						</h4>
						<p class="text-sm text-surface-600 dark:text-surface-300">{m.twofa_manual_entry_description()}</p>
						<div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
							<code class="break-all text-sm">{setupData.secret}</code>
						</div>
					</div>

					<!-- Step 3: Verify -->
					<div class="space-y-3">
						<h4 class="h4 flex items-center gap-2">
							<span class="preset-soft-tertiary-500 badge">3</span>
							{m.twofa_verify_setup_title()}
						</h4>
						<p class="text-sm text-surface-600 dark:text-surface-300">{m.twofa_verify_setup_description()}</p>

						<label class="label">
							<span>{m.twofa_code_placeholder()}</span>
							<input
								type="text"
								class="input"
								placeholder="000000"
								maxlength="6"
								bind:value={verificationCode}
								oninput={(e) => {
									const target = e.target as HTMLInputElement;
									target.value = target.value.replace(/\D/g, '');
								}}
							/>
						</label>
					</div>

					<!-- Backup Codes Warning -->
					<div class="alert preset-ghost-warning-500">
						<iconify-icon icon="mdi:information" width="20"></iconify-icon>
						<div class="alert-message">
							<h5 class="h5 mb-1">{m.twofa_backup_codes_title()}</h5>
							<p class="text-sm">{m.twofa_backup_codes_save_description()}</p>
						</div>
					</div>
				</div>
			{/if}
		{:else}
			<!-- 2FA Already Enabled - Management Options -->
			<div class="alert preset-ghost-success-500">
				<iconify-icon icon="mdi:shield-check" width="20"></iconify-icon>
				<div class="alert-message">
					<p class="text-sm">{m.twofa_enabled_description()}</p>
				</div>
			</div>

			<!-- Show backup codes if generated -->
			{#if backupCodes.length > 0}
				<div class="alert preset-ghost-warning-500">
					<iconify-icon icon="mdi:key-variant" width="20"></iconify-icon>
					<div class="alert-message">
						<h5 class="h5 mb-2">{m.twofa_backup_codes_title()}</h5>
						<p class="mb-3 text-sm">{m.twofa_backup_codes_description()}</p>
						<div class="mb-3 grid grid-cols-2 gap-2 font-mono text-sm">
							{#each backupCodes as code, index (index)}
								<div class="rounded bg-surface-200 p-2 text-center dark:bg-surface-700">
									{code}
								</div>
							{/each}
						</div>
						<p class="text-sm text-warning-600 dark:text-warning-400">
							<iconify-icon icon="mdi:alert" width="16" class="mr-1"></iconify-icon>
							{m.twofa_backup_codes_warning()}
						</p>
					</div>
				</div>
			{/if}
		{/if}
	</form>

	<footer class="modal-footer mt-4 flex shrink-0 justify-end gap-2 pt-4 border-t border-surface-500/20">
		<!-- Close button -->
		<button class="preset-outlined-secondary-500 btn" onclick={() => close?.()} disabled={isLoading}>
			{m.button_cancel()}
		</button>

		<!-- Action buttons -->
		{#if !is2FAEnabled && setupData}
			<!-- Verify button when setting up -->
			<button onclick={verify2FA} disabled={isLoading || !verificationCode || verificationCode.length !== 6} class="preset-filled-primary-500 btn">
				{#if isLoading}
					<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
					{m.twofa_verifying()}
				{:else}
					<iconify-icon icon="mdi:check-circle" width="20" class="mr-2"></iconify-icon>
					{m.twofa_verify_button()}
				{/if}
			</button>
		{:else if is2FAEnabled}
			<!-- Management buttons when 2FA is enabled -->
			<button onclick={generateBackupCodes} disabled={isLoading} class="preset-soft-secondary-500 btn">
				{#if isLoading}
					<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
					{m.twofa_generating_codes()}
				{:else}
					<iconify-icon icon="mdi:key-variant" width="20" class="mr-2"></iconify-icon>
					{m.twofa_generate_backup_codes()}
				{/if}
			</button>

			<button onclick={disable2FA} disabled={isLoading} class="preset-filled-error-500 btn">
				{#if isLoading}
					<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
					{m.twofa_disabling()}
				{:else}
					<iconify-icon icon="mdi:shield-remove" width="20" class="mr-2"></iconify-icon>
					{m.twofa_disable_button()}
				{/if}
			</button>
		{/if}
	</footer>
</div>

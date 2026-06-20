<!--
@file src/routes/(app)/user/components/modal-two-factor-auth.svelte
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
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import type { User } from '@src/databases/auth/types';
	// ParaglideJS
	import {
		button_cancel,
		twofa_backup_codes_description,
		twofa_backup_codes_generated,
		twofa_backup_codes_save_description,
		twofa_backup_codes_title,
		twofa_backup_codes_warning,
		twofa_code_placeholder,
		twofa_description,
		twofa_disable_button,
		twofa_disable_verify_description,
		twofa_disable_verify_title,
		twofa_disabling,
		twofa_enabled_description,
		twofa_error_invalid_code,
		twofa_error_setup_failed,
		twofa_generate_backup_codes,
		twofa_generating_codes,
		twofa_manual_entry_description,
		twofa_setting_up,
		twofa_setup_scan_title,
		twofa_setup_step_1,
		twofa_show_secret,
		twofa_status_disabled,
		twofa_status_enabled,
		twofa_success_disabled,
		twofa_success_enabled,
		twofa_title,
		twofa_verify_button,
		twofa_verify_setup_description,
		twofa_verify_setup_title,
		twofa_verifying
	} from '@src/paraglide/messages';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { invalidateAll } from '$app/navigation';
	// Native UI Components & Stores
	// getModalStore deprecated - use modalState from @utils/modal-state.svelte;
	import TwoFactorVerifyModal from './two-factor-verify-modal.svelte';
	import QrCode from '@components/ui/qr-code.svelte';

	interface Props {
		body?: string;
		close?: (result?: any) => void;
		parent?: {
			regionFooter?: string;
			onClose?: (event: MouseEvent) => void;
			buttonPositive?: string;
		};
		title?: string;
		user?: User;
	}

	const { user, title, body, close }: Props = $props();

	// State
	let isLoading = $state(false);
	let backupCodes = $state<string[]>([]);
	let setupData = $state<{
		otpauthUrl: string;
		secret: string;
		backupCodes: string[];
	} | null>(null);
	let verificationCode = $state('');

	// Check if 2FA is enabled
	const is2FAEnabled = $derived(user?.is2FAEnabled);

	// Load setup data when modal opens if 2FA is not enabled
	$effect(() => {
		if (!(is2FAEnabled || setupData)) {
			loadSetupData();
		}
	});

	// Show success toast
	function showSuccessToast(message: string) {
		toast.success({ title: 'Success', description: message });
	}
	function showErrorToast(message: string) {
		toast.error({ title: 'Error', description: message });
	}

	// Load setup data (QR code, secret, backup codes)
	async function loadSetupData() {
		if (isLoading) {
			return;
		}

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

			setupData = {
				otpauthUrl,
				secret: data.secret || data.secretKey || data.secret_key || '',
				backupCodes: data.backupCodes || data.backup_codes || []
			};
		} catch (error) {
			logger.error('2FA setup error:', error);
			showErrorToast(error instanceof Error ? error.message : twofa_error_setup_failed());
		} finally {
			isLoading = false;
		}
	}

	// Verify and enable 2FA
	async function verify2FA() {
		if (isLoading || !verificationCode || verificationCode.length !== 6) {
			return;
		}

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

			showSuccessToast(twofa_success_enabled());
			await invalidateAll();
			close?.({ success: true });
		} catch (error) {
			logger.error('2FA verification error:', error);
			showErrorToast(error instanceof Error ? error.message : twofa_error_invalid_code());
		} finally {
			isLoading = false;
		}
	}

	// Disable 2FA
	async function disable2FA() {
		if (isLoading) {
			return;
		}

		// Show verification modal first
		const { modalState } = await import('@utils/modal.svelte');

		modalState.trigger(
			TwoFactorVerifyModal as any,
			{
				title: twofa_disable_verify_title(),
				description: twofa_disable_verify_description()
			},
			async (code: string | null) => {
				if (!code) {
					return;
				}

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

					showSuccessToast(twofa_success_disabled());
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
		if (isLoading) {
			return;
		}

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
			showSuccessToast(twofa_backup_codes_generated());
		} catch (error) {
			logger.error('Backup codes error:', error);
			showErrorToast(error instanceof Error ? error.message : 'Failed to generate backup codes');
		} finally {
			isLoading = false;
		}
	}

	// Base Classes for modal
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-3 space-y-3 rounded overflow-y-auto flex-1';
</script>

<!-- Main Modal Component -->
<div class="modal-2fa space-y-3">
	<header class={`text-center text-tertiary-500 dark:text-primary-500 ${cHeader} shrink-0`}>{title ?? twofa_title()}</header>

	<article class="shrink-0 text-center text-sm">{body ?? twofa_description()}</article>

	<form class="modal-form {cForm} max-h-[60vh]">
		<!-- Status Section -->
		<div class="mb-4 flex items-center justify-between rounded bg-surface-100 p-3 dark:bg-surface-700">
			<div class="flex items-center gap-3">
				<div class="rounded bg-tertiary-500 p-2 dark:bg-primary-500/20"><iconify-icon icon="mdi:shield-check" width={24}></iconify-icon></div>
				<div>
					<p class="text-sm font-semibold">{twofa_title()}</p>
					<p class="text-xs text-surface-600 dark:text-surface-300">{twofa_description()}</p>
				</div>
			</div>
			<!-- Status badge - aligned end -->
			<Badge variant={is2FAEnabled ? 'success' : 'surface'}>
				<iconify-icon icon="mdi:{is2FAEnabled ? 'check-circle' : 'circle-outline'}" width={24}></iconify-icon>
				{is2FAEnabled ? twofa_status_enabled() : twofa_status_disabled()}
			</Badge>
		</div>

		{#if !is2FAEnabled}
			{#if isLoading && !setupData}
				<!-- Loading state -->
				<div class="flex flex-col items-center justify-center gap-4 py-8">
					<iconify-icon icon="svg-spinners:ring-resize" width={24}></iconify-icon>
					<p class="text-sm text-surface-600 dark:text-surface-300">{twofa_setting_up()}</p>
				</div>
			{:else if setupData}
				<!-- QR Code Setup -->
				<div class="space-y-4">
					<!-- Step 1: Scan QR Code -->
					<div class="space-y-3">
						<h4 class="h4 flex items-center gap-2">
							<Badge preset="tonal" color="primary" size="sm">1</Badge>
							{twofa_setup_scan_title()}
						</h4>
						<p class="text-sm text-surface-600 dark:text-surface-300">{twofa_setup_step_1()}</p>

						<!-- QR Code -->
						<div class="flex justify-center rounded bg-white p-4 dark:bg-white">
							{#if setupData.otpauthUrl}
								<QrCode value={setupData.otpauthUrl} size={150} color="#000000" backgroundColor="#ffffff" />
							{:else}
								<div class="flex h-32 w-32 items-center justify-center bg-surface-200">
									<p class="text-xs text-surface-600">QR Code</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Step 2: Manual Entry (Optional) -->
					<div class="space-y-3">
						<h4 class="h4 flex items-center gap-2">
							<Badge preset="tonal" color="secondary" size="sm">2</Badge>
							{twofa_show_secret()}
						</h4>
						<p class="text-sm text-surface-600 dark:text-surface-300">{twofa_manual_entry_description()}</p>
						<div class="rounded bg-surface-100 p-3 dark:bg-surface-700"><code class="break-all text-sm">{setupData.secret}</code></div>
					</div>

					<!-- Step 3: Verify -->
					<div class="space-y-3">
						<h4 class="h4 flex items-center gap-2">
							<Badge preset="tonal" color="tertiary" size="sm">3</Badge>
							{twofa_verify_setup_title()}
						</h4>
						<p class="text-sm text-surface-600 dark:text-surface-300">{twofa_verify_setup_description()}</p>

						<Input
							label={twofa_code_placeholder()}
							type="text"
							placeholder="000000"
							maxlength={6}
							bind:value={verificationCode}
							oninput={(e) => {
								const target = e.target as HTMLInputElement;
								verificationCode = target.value.replace(/\D/g, '');
							}}
						/>
					</div>

					<!-- Backup Codes Warning -->
					<div class="alert preset-ghost-warning-500">
						<iconify-icon icon="mdi:information" width={20}></iconify-icon>
						<div class="alert-message">
							<h5 class="h5 mb-1">{twofa_backup_codes_title()}</h5>
							<p class="text-sm">{twofa_backup_codes_save_description()}</p>
						</div>
					</div>
				</div>
			{/if}
		{:else}
			<!-- 2FA Already Enabled - Management Options -->
			<div class="alert preset-ghost-success-500">
				<iconify-icon icon="mdi:shield-check" width={24}></iconify-icon>
				<div class="alert-message">
					<p class="text-sm">{twofa_enabled_description()}</p>
				</div>
			</div>

			<!-- Show backup codes if generated -->
			{#if backupCodes.length > 0}
				<div class="alert preset-ghost-warning-500">
					<iconify-icon icon="mdi:key-variant" width={24}></iconify-icon>
					<div class="alert-message">
						<h5 class="h5 mb-2">{twofa_backup_codes_title()}</h5>
						<p class="mb-3 text-sm">{twofa_backup_codes_description()}</p>
						<div class="mb-3 grid grid-cols-2 gap-2 font-mono text-sm">
							{#each backupCodes as code, index (index)}
								<div class="rounded bg-surface-200 p-2 text-center dark:bg-surface-700">{code}</div>
							{/each}
						</div>
						<p class="text-sm text-warning-600 dark:text-warning-400">
							<iconify-icon icon="mdi:alert" width={16} class="me-1"></iconify-icon>
							{twofa_backup_codes_warning()}
						</p>
					</div>
				</div>
			{/if}
		{/if}
	</form>

	<footer class="modal-footer mt-4 flex shrink-0 justify-end gap-2 pt-4 border-t border-surface-500/20">
		<!-- Close button -->
		<Button variant="outline" onclick={() => close?.()} disabled={isLoading}>{button_cancel()}</Button>

		<!-- Action buttons -->
		{#if !is2FAEnabled && setupData}
			<!-- Verify button when setting up -->
			<Button variant="tertiary" onclick={verify2FA} disabled={isLoading || !verificationCode || verificationCode.length !== 6} class="dark:">
				{#if isLoading}
					<iconify-icon icon="svg-spinners:3-dots-fade" width={24}></iconify-icon>
					{twofa_verifying()}
				{:else}
					<iconify-icon icon="mdi:check-circle" width={20} class="me-2"></iconify-icon>
					{twofa_verify_button()}
				{/if}
			</Button>
		{:else if is2FAEnabled}
			<!-- Management buttons when 2FA is enabled -->
			<Button variant="surface" onclick={generateBackupCodes} disabled={isLoading} class="-secondary-500">
				{#if isLoading}
					<iconify-icon icon="svg-spinners:3-dots-fade" width={24}></iconify-icon>
					{twofa_generating_codes()}
				{:else}
					<iconify-icon icon="mdi:key-variant" width={24}></iconify-icon>
					{twofa_generate_backup_codes()}
				{/if}
			</Button>

			<Button variant="error" onclick={disable2FA} disabled={isLoading}>
				{#if isLoading}
					<iconify-icon icon="svg-spinners:3-dots-fade" width={24}></iconify-icon>
					{twofa_disabling()}
				{:else}
					<iconify-icon icon="mdi:shield-remove" width={24}></iconify-icon>
					{twofa_disable_button()}
				{/if}
			</Button>
		{/if}
	</footer>
</div>

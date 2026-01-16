<!--
@file src/routes/(app)/user/components/TwoFactorSetupModal.svelte
@component
**Two-Factor Authentication Setup Modal**

This modal displays the QR code for setting up 2FA and handles verification.

@example
<TwoFactorSetupModal qrCodeUrl="..." secret="..." backupCodes={[]} />

### Props
- `parent` {ModalComponent} - Modal parent component with skeleton modal properties
- `qrCodeUrl` {string} - QR code URL for authenticator app
- `secret` {string} - Secret key for manual entry
- `backupCodes` {string[]} - Backup codes for recovery

### Features
- QR code display
- Manual secret key entry option
- Code verification
- Backup codes display (all visible at once)
- Responsive design
-->

<script lang="ts">
	// Utils
	import { logger } from '@utils/logger';
	import { toaster } from '@stores/store.svelte';

	// Skeleton
	// getModalStore deprecated - use modalState from @utils/modalState.svelte;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	interface Props {
		parent?: { regionFooter?: string; onClose?: (success: boolean) => void; buttonPositive?: string };
		qrCodeUrl: string;
		secret: string;
		backupCodes: string[];
		title?: string;
		body?: string;
		close?: (result?: any) => void;
	}

	const { parent = { regionFooter: 'modal-footer p-4' }, qrCodeUrl, secret, backupCodes, title, body, close }: Props = $props();

	// State
	let verificationCode = $state('');
	let isVerifying = $state(false);
	let currentStep = $state<'setup' | 'complete'>('setup');
	let error = $state('');

	// Copy text to clipboard
	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toaster.success({ description: `<iconify-icon icon="mdi:check" width="20" class="mr-1"></iconify-icon> ${m.button_copy()} successful` });
		} catch (err) {
			logger.error('Failed to copy:', err);
			toaster.error({ description: `<iconify-icon icon="mdi:alert-circle" width="20" class="mr-1"></iconify-icon> Failed to copy` });
		}
	}

	// Verify the setup code
	async function verifySetup(event: SubmitEvent) {
		event.preventDefault();

		if (!verificationCode.trim() || verificationCode.length !== 6) {
			error = m.twofa_error_invalid_code();
			return;
		}

		isVerifying = true;
		error = '';

		try {
			const response = await fetch('/api/auth/2fa/verify-setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: verificationCode.trim() })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || m.twofa_error_invalid_code());
			}

			currentStep = 'complete';
			toaster.success({
				description: `<iconify-icon icon="mdi:check-circle" width="20" class="mr-1"></iconify-icon> ${m.twofa_setup_complete_title()}`
			});
		} catch (err) {
			error = err instanceof Error ? err.message : m.twofa_error_invalid_code();
			toaster.error({ description: `<iconify-icon icon="mdi:alert-circle" width="20" class="mr-1"></iconify-icon> ${error}` });
		} finally {
			isVerifying = false;
		}
	}

	// Complete setup and close modal
	function completeSetup() {
		if (parent?.onClose) parent.onClose(true);
		close?.({ success: true });
	}

	// Cancel setup
	function cancelSetup() {
		if (parent?.onClose) parent.onClose(false);
		close?.({ success: false });
	}

	// Handle input for verification code (only allow 6 digits)
	function handleInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const value = input.value.replace(/\D/g, '').slice(0, 6);
		verificationCode = value;
		error = '';
	}

	// Format secret key for better readability
	function formatSecret(secret: string): string {
		return secret.replace(/(.{4})/g, '$1 ').trim();
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="modal-example-form {cBase}">
	<header class={`text-center dark:text-primary-500 ${cHeader}`}>
		{title ?? '(title missing)'}
	</header>

	<article class="text-center text-sm text-black dark:text-white">
		{body ?? '(body missing)'}
	</article>

	{#if currentStep === 'setup'}
		<!-- Setup Form -->
		<form class="modal-form {cForm}" onsubmit={verifySetup} id="twofa-form">
			<!-- QR Code Section -->
			<div class="space-y-4">
				<div class="text-center">
					<!-- QR Code -->
					<div class="mb-4 flex justify-center">
						<div class="rounded-lg bg-white p-4 shadow-sm">
							<img src={qrCodeUrl} alt="2FA QR Code" class="h-48 w-48" style="image-rendering: pixelated;" />
						</div>
					</div>
				</div>

				<!-- Manual Entry Section (Always Visible) -->
				<div class="rounded-xl bg-surface-100 p-4 dark:bg-surface-700">
					<p class="mb-3 text-sm font-medium text-surface-700 dark:text-surface-300">
						{m.twofa_manual_entry_description()}
					</p>
					<div class="flex items-center gap-2">
						<code class="flex-1 rounded bg-surface-200 p-3 font-mono text-sm dark:bg-surface-600">
							{formatSecret(secret)}
						</code>
						<button
							type="button"
							onclick={() => copyToClipboard(secret)}
							class="preset-soft-primary-500 btn btn-sm"
							title={m.button_copy()}
							aria-label={m.button_copy()}
						>
							<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
						</button>
					</div>
				</div>

				<!-- Verification Code Input -->
				<div>
					<label for="verification-code" class="mb-2 block text-sm font-medium text-black dark:text-white">
						{m.twofa_verify_setup_description()}
					</label>
					<div class="relative">
						<input
							id="verification-code"
							type="text"
							bind:value={verificationCode}
							oninput={handleInput}
							placeholder={m.twofa_code_placeholder()}
							class="input w-full text-center font-mono text-2xl tracking-widest"
							maxlength="6"
							autocomplete="off"
							class:border-error-500={error}
							class:focus\:border-error-500={error}
							aria-label="Verification code"
						/>
					</div>

					{#if error}
						<p class="mt-2 text-sm text-error-500">{error}</p>
					{/if}
				</div>
			</div>
		</form>
	{:else if currentStep === 'complete'}
		<!-- Setup Complete -->
		<div class="modal-form {cForm}">
			<div class="text-center">
				<div class="mb-4">
					<iconify-icon icon="mdi:check-circle" width="64" class="mx-auto text-success-500"></iconify-icon>
				</div>

				<p class="mb-6 text-surface-600 dark:text-surface-300">
					{m.twofa_setup_complete_description()}
				</p>
			</div>

			<!-- Backup Codes (Always Visible) -->
			{#if backupCodes.length > 0}
				<div class="preset-ghost-warning-500 rounded-lg border p-4">
					<div class="mb-3 flex items-start gap-3">
						<iconify-icon icon="mdi:key-variant" width="24" class="shrink-0"></iconify-icon>
						<div class="flex-1">
							<h5 class="mb-1 font-semibold">{m.twofa_backup_codes_title()}</h5>
							<p class="text-sm">{m.twofa_backup_codes_save_description()}</p>
						</div>
					</div>

					<div class="mb-3 grid grid-cols-2 gap-2">
						{#each backupCodes as code}
							<div class="rounded bg-surface-200 p-2 text-center font-mono text-sm dark:bg-surface-700">
								{code}
							</div>
						{/each}
					</div>

					<div class="mb-3 flex justify-center">
						<button type="button" onclick={() => copyToClipboard(backupCodes.join('\n'))} class="preset-soft-primary-500 btn btn-sm">
							<iconify-icon icon="mdi:content-copy" width="16" class="mr-1"></iconify-icon>
							{m.button_copy_all()}
						</button>
					</div>

					<div class="flex items-start gap-2 rounded bg-warning-500/10 p-3">
						<iconify-icon icon="mdi:alert" width="16" class="mt-0.5 shrink-0 text-warning-600"></iconify-icon>
						<p class="text-sm text-warning-600 dark:text-warning-400">
							{m.twofa_backup_codes_warning()}
						</p>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<footer class="modal-footer flex items-center justify-between p-4 {parent?.regionFooter ?? ''}">
		{#if currentStep === 'setup'}
			<!-- Setup Footer -->
			<button type="button" class="preset-outlined-secondary-500 btn" onclick={cancelSetup}>
				{m.button_cancel()}
			</button>
			<button
				type="submit"
				form="twofa-form"
				disabled={verificationCode.length !== 6 || isVerifying}
				class="preset-filled-primary-500 btn {parent?.buttonPositive ?? ''}"
			>
				{#if isVerifying}
					<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
					{m.twofa_verifying()}
				{:else}
					<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
					{m.twofa_verify_button()}
				{/if}
			</button>
		{:else}
			<!-- Complete Footer -->
			<button type="button" class="preset-outlined-secondary-500 btn" onclick={cancelSetup}>
				{m.button_cancel()}
			</button>
			<button type="button" onclick={completeSetup} class="preset-filled-success-500 btn {parent?.buttonPositive ?? ''}">
				<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
				{m.button_complete()}
			</button>
		{/if}
	</footer>
</div>

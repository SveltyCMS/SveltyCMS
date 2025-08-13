<!--
@file src/routes/(app)/user/components/TwoFactorSetupModal.svelte
@component
**Two-Factor Authentication Setup Modal**

This modal displays the QR code for setting up 2FA and handles verification.

@example
<TwoFactorSetupModal qrCodeUrl="..." secret="..." backupCodes={[]} />

### Props
- `parent` {SvelteComponent} - Modal parent component
- `qrCodeUrl` {string} - QR code URL for authenticator app
- `secret` {string} - Secret key for manual entry
- `backupCodes` {string[]} - Backup codes for recovery

### Features
- QR code display
- Manual secret key entry option
- Code verification
- Backup codes display
- Responsive design
-->

<script lang="ts">
	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	let { parent, qrCodeUrl, secret, backupCodes } = $props<{
		parent: any;
		qrCodeUrl: string;
		secret: string;
		backupCodes: string[];
	}>();

	const modalStore = getModalStore();

	// State
	let verificationCode = $state('');
	let isVerifying = $state(false);
	let showSecret = $state(false);
	let showBackupCodes = $state(false);
	let currentStep = $state<'setup' | 'verify' | 'complete'>('setup');
	let error = $state('');

	//Copy text to clipboard
	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			// Could add a toast here if needed
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Verify the setup code
	async function verifySetup() {
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
			showBackupCodes = true;
		} catch (err) {
			error = err instanceof Error ? err.message : m.twofa_error_invalid_code();
		} finally {
			isVerifying = false;
		}
	}

	// Complete setup and close modal
	function completeSetup() {
		if (parent.onClose) parent.onClose();
		modalStore.close(true); // Return true to indicate successful setup
	}

	// Cancel setup
	function cancelSetup() {
		if (parent.onClose) parent.onClose();
		modalStore.close(false);
	}

	// Handle input for verification code (only allow 6 digits)
	function handleInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const value = input.value.replace(/\D/g, '').slice(0, 6);
		verificationCode = value;
		error = '';
	}

	/**
	 * Format secret key for better readability
	 */
	function formatSecret(secret: string): string {
		return secret.replace(/(.{4})/g, '$1 ').trim();
	}
</script>

<div class="modal-content max-w-2xl">
	{#if currentStep === 'setup'}
		<!-- Step 1: Show QR Code -->
		<div class="mb-6 text-center">
			<h4 class="h4 mb-2">{m.twofa_setup_scan_title()}</h4>
			<p class="mb-4 text-surface-600 dark:text-surface-300">
				{m.twofa_setup_scan_description()}
			</p>

			<!-- QR Code -->
			<div class="mb-4 flex justify-center">
				<div class="rounded-lg bg-white p-4 shadow-sm">
					<img src={qrCodeUrl} alt="2FA QR Code" class="h-48 w-48" style="image-rendering: pixelated;" />
				</div>
			</div>

			<!-- Manual entry option -->
			<div class="mt-4">
				<button onclick={() => (showSecret = !showSecret)} class="text-sm text-primary-500 underline hover:text-primary-600">
					{showSecret ? m.twofa_hide_secret() : m.twofa_show_secret()}
				</button>

				{#if showSecret}
					<div class="mt-3 rounded-lg bg-surface-100 p-3 dark:bg-surface-700">
						<p class="mb-2 text-sm text-surface-600 dark:text-surface-300">
							{m.twofa_manual_entry_description()}
						</p>
						<div class="flex items-center gap-2">
							<code class="flex-1 rounded bg-surface-200 p-2 font-mono text-sm dark:bg-surface-600">
								{formatSecret(secret)}
							</code>
							<button
								onclick={() => copyToClipboard(secret)}
								class="variant-soft-primary btn btn-sm"
								title={m.button_copy()}
								aria-label={m.button_copy()}
							>
								<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Next Step Button -->
		<div class="flex justify-center">
			<button onclick={() => (currentStep = 'verify')} class="variant-filled-primary btn">
				<iconify-icon icon="mdi:arrow-right" width="20" class="mr-2"></iconify-icon>
				{m.twofa_setup_next()}
			</button>
		</div>
	{:else if currentStep === 'verify'}
		<!-- Step 2: Verify Code -->
		<div class="mb-6 text-center">
			<h4 class="h4 mb-2">{m.twofa_verify_setup_title()}</h4>
			<p class="mb-4 text-surface-600 dark:text-surface-300">
				{m.twofa_verify_setup_description()}
			</p>

			<!-- Verification Code Input -->
			<div class="mx-auto max-w-xs">
				<div class="relative">
					<input
						type="text"
						bind:value={verificationCode}
						oninput={handleInput}
						placeholder={m.twofa_code_placeholder()}
						class="input text-center font-mono text-2xl tracking-widest"
						maxlength="6"
						autocomplete="off"
						class:input-error={error}
					/>
				</div>

				{#if error}
					<p class="mt-2 text-sm text-error-500">{error}</p>
				{/if}
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex justify-center gap-3">
			<button onclick={() => (currentStep = 'setup')} class="variant-soft-surface btn">
				<iconify-icon icon="mdi:arrow-left" width="20" class="mr-2"></iconify-icon>
				{m.button_back()}
			</button>

			<button onclick={verifySetup} disabled={verificationCode.length !== 6 || isVerifying} class="variant-filled-primary btn">
				{#if isVerifying}
					<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
					{m.twofa_verifying()}
				{:else}
					<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
					{m.twofa_verify_button()}
				{/if}
			</button>
		</div>
	{:else if currentStep === 'complete'}
		<!-- Step 3: Setup Complete -->
		<div class="mb-6 text-center">
			<div class="mb-4">
				<iconify-icon icon="mdi:check-circle" width="64" class="mx-auto text-success-500"></iconify-icon>
			</div>

			<h4 class="h4 mb-2 text-success-600 dark:text-success-400">
				{m.twofa_setup_complete_title()}
			</h4>
			<p class="mb-6 text-surface-600 dark:text-surface-300">
				{m.twofa_setup_complete_description()}
			</p>
		</div>

		<!-- Backup Codes -->
		{#if showBackupCodes && backupCodes.length > 0}
			<div class="mb-6">
				<div class="alert variant-ghost-warning">
					<iconify-icon icon="mdi:key-variant" width="24"></iconify-icon>
					<div class="alert-message">
						<h5 class="h5 mb-2">{m.twofa_backup_codes_title()}</h5>
						<p class="mb-3 text-sm">{m.twofa_backup_codes_save_description()}</p>

						<div class="mb-3 grid grid-cols-2 gap-2">
							{#each backupCodes as code}
								<div class="rounded bg-surface-200 p-2 text-center font-mono text-sm dark:bg-surface-700">
									{code}
								</div>
							{/each}
						</div>

						<div class="flex justify-center gap-2">
							<button onclick={() => copyToClipboard(backupCodes.join('\n'))} class="variant-soft-primary btn btn-sm">
								<iconify-icon icon="mdi:content-copy" width="16" class="mr-1"></iconify-icon>
								{m.button_copy_all()}
							</button>
						</div>

						<p class="mt-3 text-sm text-warning-600 dark:text-warning-400">
							<iconify-icon icon="mdi:alert" width="16" class="mr-1"></iconify-icon>
							{m.twofa_backup_codes_warning()}
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Complete Button -->
		<div class="flex justify-center">
			<button onclick={completeSetup} class="variant-filled-success btn">
				<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
				{m.button_complete()}
			</button>
		</div>
	{/if}

	<!-- Cancel Button (always visible) -->
	<div class="mt-4 flex justify-center">
		<button onclick={cancelSetup} class="variant-soft-surface btn">
			{m.button_cancel()}
		</button>
	</div>
</div>

<style>
	.modal-content {
		@apply p-6;
	}

	.alert {
		@apply flex gap-3 rounded-lg border p-4;
	}

	.alert-message {
		@apply flex-1;
	}

	.input-error {
		@apply border-error-500 focus:border-error-500;
	}
</style>

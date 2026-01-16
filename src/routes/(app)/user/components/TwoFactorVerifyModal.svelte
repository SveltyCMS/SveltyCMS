<!--
@file src/routes/(app)/user/components/TwoFactorVerifyModal.svelte
@component
**Two-Factor Authentication Verification Modal**

This modal handles verification of 2FA codes for various operations like disabling 2FA.

@example
<TwoFactorVerifyModal title="Verify 2FA" description="Enter your code..." />

### Props
- `parent` {SvelteComponent} - Modal parent component
- `title` {string} - Modal title override
- `description` {string} - Description text

### Features
- Code input with validation
- Support for backup codes
- Toggle between authenticator and backup codes
- Input sanitization and formatting
-->

<script lang="ts">
	// getModalStore deprecated - use modalState from @utils/modalState.svelte;
	import * as m from '@src/paraglide/messages';

	// Props
	const { parent, title = '', description = '', close } = $props();

	// State
	let code = $state('');
	let isVerifying = $state(false);
	let useBackupCode = $state(false);
	let error = $state('');

	// Handle code input with validation
	function handleInput(event: Event) {
		const input = event.target as HTMLInputElement;
		let value = input.value;

		if (!useBackupCode) {
			// For TOTP codes, only allow 6 digits
			value = value.replace(/\D/g, '').slice(0, 6);
		} else {
			// For backup codes, allow alphanumeric and remove spaces
			value = value
				.replace(/[^a-zA-Z0-9]/g, '')
				.toLowerCase()
				.slice(0, 10);
		}

		code = value;
		error = '';
	}

	// Submit verification code
	async function submitCode() {
		const trimmedCode = code.trim();

		if (!trimmedCode) {
			error = m.twofa_error_empty_code();
			return;
		}

		if (!useBackupCode && trimmedCode.length !== 6) {
			error = m.twofa_error_invalid_code();
			return;
		}

		if (useBackupCode && trimmedCode.length < 8) {
			error = m.twofa_error_invalid_backup_code();
			return;
		}

		isVerifying = true;
		error = '';

		try {
			// Return the code to the parent modal
			if (parent.onClose) parent.onClose(trimmedCode);
			close?.(trimmedCode);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Verification failed';
		} finally {
			isVerifying = false;
		}
	}

	// Cancel verification
	function cancelVerification() {
		if (parent.onClose) parent.onClose(null);
		close?.(null);
	}

	// Toggle between authenticator and backup code
	function toggleCodeType() {
		useBackupCode = !useBackupCode;
		code = '';
		error = '';
	}

	// Handle Enter key press
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !isVerifying) {
			submitCode();
		}
	}
</script>

<div class="max-w-md p-6">
	<div class="mb-6 text-center">
		<div class="mb-4">
			<iconify-icon icon="mdi:shield-key" width="48" class="mx-auto text-primary-500"></iconify-icon>
		</div>

		<h4 class="h4 mb-2">
			{title || m.twofa_verify_title()}
		</h4>

		<p class="text-surface-600 dark:text-surface-300">
			{description || (useBackupCode ? m.twofa_backup_verify_description() : m.twofa_verify_description())}
		</p>
	</div>

	<!-- Code Input -->
	<div class="mb-6">
		<div class="relative">
			<input
				type="text"
				bind:value={code}
				oninput={handleInput}
				onkeydown={handleKeydown}
				placeholder={useBackupCode ? m.twofa_backup_code_placeholder() : m.twofa_code_placeholder()}
				class={'input text-center font-mono tracking-wider ' +
					(useBackupCode ? 'text-lg' : 'text-2xl') +
					(error ? ' border-error-500 focus:border-error-500' : '')}
				maxlength={useBackupCode ? 10 : 6}
				autocomplete="off"
			/>

			<!-- Character counter for backup codes -->
			{#if useBackupCode}
				<div class="mt-1 text-center text-xs text-surface-500">
					{code.length}/10
				</div>
			{/if}
		</div>

		{#if error}
			<p class="mt-2 text-center text-sm text-error-500">{error}</p>
		{/if}
	</div>

	<!-- Toggle Code Type -->
	<div class="mb-6 text-center">
		<button onclick={toggleCodeType} class="text-sm text-primary-500 underline hover:text-primary-600">
			{useBackupCode ? m.twofa_use_authenticator() : m.twofa_use_backup_code()}
		</button>
	</div>

	<!-- Action Buttons -->
	<div class="flex gap-3">
		<button onclick={cancelVerification} class="preset-soft-surface-500 btn flex-1">
			{m.button_cancel()}
		</button>

		<button
			onclick={submitCode}
			disabled={!code.trim() || isVerifying || (!useBackupCode && code.length !== 6) || (useBackupCode && code.length < 8)}
			class="preset-filled-primary-500 btn flex-1"
		>
			{#if isVerifying}
				<iconify-icon icon="svg-spinners:3-dots-fade" width="20" class="mr-2"></iconify-icon>
				{m.twofa_verifying()}
			{:else}
				<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
				{m.twofa_verify_button()}
			{/if}
		</button>
	</div>

	<!-- Help Text -->
	<div class="mt-4 text-center">
		<div class="space-y-1 text-xs text-surface-500">
			{#if !useBackupCode}
				<p>{m.twofa_help_authenticator()}</p>
			{:else}
				<p>{m.twofa_help_backup()}</p>
			{/if}
		</div>
	</div>
</div>

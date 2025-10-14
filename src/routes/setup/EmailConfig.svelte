<!--
@file src/routes/setup/EmailConfig.svelte
@description Optional SMTP Configuration step for SveltyCMS setup wizard

### Features:
- Optional step - can be skipped without blocking setup
- Tests SMTP connection before proceeding
- Sends test email to admin's email address
- Saves configuration to database on success
- Clear explanation of why SMTP is needed
-->
<script lang="ts">
	import { setupStore } from '@stores/setupStore.svelte';
	import * as m from '@src/paraglide/messages';
	import { showToast } from '@utils/toast';

	// Props
	interface Props {
		onNext: () => void;
		onBack: () => void;
		onSkip: () => void;
	}

	let { onNext, onBack, onSkip }: Props = $props();

	const { wizard } = setupStore;

	// Local state
	let isTesting = $state(false);
	let testSuccess = $state(false);
	let testError = $state('');
	let testEmailSent = $state(false);

	// SMTP Configuration
	let smtpHost = $state('');
	let smtpPort = $state(587);
	let smtpUser = $state('');
	let smtpPassword = $state('');
	let smtpFrom = $state('');
	let smtpSecure = $state(true);

	// Validation
	const isFormValid = $derived(smtpHost.trim() !== '' && smtpPort > 0 && smtpUser.trim() !== '' && smtpPassword.trim() !== '');

	// Common SMTP presets
	const presets = [
		{
			name: 'Gmail',
			host: 'smtp.gmail.com',
			port: 587,
			secure: true,
			note: 'Use App Password, not your regular password'
		},
		{
			name: 'Outlook/Office365',
			host: 'smtp.office365.com',
			port: 587,
			secure: true,
			note: ''
		},
		{
			name: 'SendGrid',
			host: 'smtp.sendgrid.net',
			port: 587,
			secure: true,
			note: 'Use API Key as password'
		},
		{
			name: 'Mailgun',
			host: 'smtp.mailgun.org',
			port: 587,
			secure: true,
			note: ''
		},
		{
			name: 'Custom',
			host: '',
			port: 587,
			secure: true,
			note: ''
		}
	];

	let selectedPreset = $state('Custom');

	function applyPreset(presetName: string) {
		const preset = presets.find((p) => p.name === presetName);
		if (preset) {
			selectedPreset = presetName;
			smtpHost = preset.host;
			smtpPort = preset.port;
			smtpSecure = preset.secure;
			testSuccess = false;
			testError = '';
		}
	}

	async function testConnection() {
		if (!isFormValid) {
			showToast(m.setup_email_test_required(), 'warning');
			return;
		}

		isTesting = true;
		testSuccess = false;
		testError = '';
		testEmailSent = false;

		try {
			const response = await fetch('/api/setup/email-test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					host: smtpHost,
					port: smtpPort,
					user: smtpUser,
					password: smtpPassword,
					from: smtpFrom || smtpUser,
					secure: smtpSecure,
					testEmail: wizard.adminUser.email,
					saveToDatabase: true
				})
			});

			const result = await response.json();

			if (result.success) {
				testSuccess = true;
				testEmailSent = result.testEmailSent || false;

				// Mark SMTP as configured in wizard state
				wizard.emailSettings.smtpConfigured = true;
				wizard.emailSettings.skipWelcomeEmail = false;

				const message = testEmailSent
					? `${m.setup_email_test_success()} ${m.setup_email_test_email_sent({ email: wizard.adminUser.email })}`
					: m.setup_email_test_success();
				showToast(message, 'success');
			} else {
				testError = result.error || 'Connection failed';
				showToast(`${m.setup_email_test_failed()}: ${testError}`, 'error');
			}
		} catch (error) {
			testError = error instanceof Error ? error.message : 'Unknown error occurred';
			showToast(`${m.setup_email_test_failed()}: ${testError}`, 'error');
		} finally {
			isTesting = false;
		}
	}

	function handleNext() {
		if (!testSuccess) {
			showToast(m.setup_email_test_required(), 'warning');
			return;
		}
		onNext();
	}

	function handleSkip() {
		// Confirm skip action
		if (confirm(m.setup_email_skip_confirm())) {
			onSkip();
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="space-y-2">
		<h2 class="text-surface-900-50 text-2xl font-bold">{m.setup_step_email()}</h2>
		<p class="text-surface-600-300">{m.setup_step_email_desc()}</p>
	</div>

	<!-- Why SMTP is Needed -->
	<div class="card variant-ghost-primary space-y-2 p-4">
		<div class="flex items-start gap-3">
			<iconify-icon icon="mdi:information" class="mt-0.5 text-xl text-primary-500"></iconify-icon>
			<div class="flex-1 space-y-2">
				<h3 class="font-semibold text-primary-700 dark:text-primary-400">{m.setup_email_why_title()}</h3>
				<p class="text-surface-600-300 text-sm">{m.setup_email_why_desc()}</p>
				<ul class="text-surface-600-300 list-inside list-disc space-y-1 text-sm">
					<li>{m.setup_email_feature_user_mgmt()}</li>
					<li>{m.setup_email_feature_password()}</li>
					<li>{m.setup_email_feature_2fa()}</li>
					<li>{m.setup_email_feature_notifications()}</li>
					<li>{m.setup_email_feature_workflow()}</li>
				</ul>
				<p class="text-surface-600-300 mt-2 text-sm italic">{m.setup_email_skip_note()}</p>
			</div>
		</div>
	</div>

	<!-- SMTP Provider Presets -->
	<div class="space-y-2">
		<div class="label">
			<span class="font-medium">{m.setup_email_provider()}</span>
		</div>
		<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
			{#each presets as preset}
				<button
					type="button"
					class="variant-ghost-surface btn {selectedPreset === preset.name ? 'variant-filled-primary' : ''}"
					onclick={() => applyPreset(preset.name)}
				>
					{preset.name}
				</button>
			{/each}
		</div>
		{#if selectedPreset !== 'Custom'}
			{@const preset = presets.find((p) => p.name === selectedPreset)}
			{#if preset?.note}
				<div class="card variant-ghost-warning flex items-start gap-2 p-3">
					<iconify-icon icon="mdi:alert" class="mt-0.5 text-lg text-warning-500"></iconify-icon>
					<p class="text-sm text-warning-700 dark:text-warning-300">{preset.note}</p>
				</div>
			{/if}
		{/if}
	</div>

	<!-- SMTP Configuration Form -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- SMTP Host -->
		<label class="label">
			<span class="font-medium">SMTP Host <span class="text-error-500">*</span></span>
			<input
				type="text"
				class="input"
				bind:value={smtpHost}
				placeholder="smtp.example.com"
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
		</label>

		<!-- SMTP Port -->
		<label class="label">
			<span class="font-medium">SMTP Port <span class="text-error-500">*</span></span>
			<input
				type="number"
				class="input"
				bind:value={smtpPort}
				placeholder="587"
				min="1"
				max="65535"
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
			<span class="text-xs text-surface-500">Common: 587 (TLS), 465 (SSL), 25 (unencrypted)</span>
		</label>

		<!-- SMTP User -->
		<label class="label">
			<span class="font-medium">SMTP Username <span class="text-error-500">*</span></span>
			<input
				type="text"
				class="input"
				bind:value={smtpUser}
				placeholder="your-email@example.com"
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
		</label>

		<!-- SMTP Password -->
		<label class="label">
			<span class="font-medium">SMTP Password <span class="text-error-500">*</span></span>
			<input
				type="password"
				class="input"
				bind:value={smtpPassword}
				placeholder="••••••••"
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
		</label>

		<!-- From Email (Optional) -->
		<label class="label md:col-span-2">
			<span class="font-medium">From Email Address (Optional)</span>
			<input type="email" class="input" bind:value={smtpFrom} placeholder={smtpUser || 'noreply@example.com'} />
			<span class="text-xs text-surface-500">If empty, will use SMTP username as sender</span>
		</label>
	</div>

	<!-- Security Options -->
	<div class="space-y-2">
		<label class="flex cursor-pointer items-center space-x-2">
			<input type="checkbox" class="checkbox" bind:checked={smtpSecure} />
			<span class="text-sm">Use TLS/STARTTLS (Recommended)</span>
		</label>
	</div>

	<!-- Test Connection Button -->
	<div class="space-y-3">
		<button type="button" class="variant-filled-primary btn w-full" onclick={testConnection} disabled={!isFormValid || isTesting}>
			<iconify-icon icon="mdi:email" class="mr-2 text-xl"></iconify-icon>
			{isTesting ? 'Testing Connection...' : 'Test SMTP Connection'}
		</button>

		<!-- Test Result -->
		{#if testSuccess}
			<div class="card variant-ghost-success flex items-start gap-3 p-4">
				<iconify-icon icon="mdi:check-circle" class="text-2xl text-success-500"></iconify-icon>
				<div class="flex-1">
					<p class="font-semibold text-success-700 dark:text-success-300">Connection Successful!</p>
					{#if testEmailSent}
						<p class="mt-1 text-sm text-success-600 dark:text-success-400">
							Test email sent to {wizard.adminUser.email}. Please check your inbox.
						</p>
					{/if}
					<p class="mt-1 text-sm text-success-600 dark:text-success-400">SMTP settings have been saved to the database.</p>
				</div>
			</div>
		{/if}

		{#if testError}
			<div class="card variant-ghost-error flex items-start gap-3 p-4">
				<iconify-icon icon="mdi:close-circle" class="text-2xl text-error-500"></iconify-icon>
				<div class="flex-1">
					<p class="font-semibold text-error-700 dark:text-error-300">Connection Failed</p>
					<p class="mt-1 text-sm text-error-600 dark:text-error-400">{testError}</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Navigation Buttons -->
	<div class="flex justify-between gap-4 pt-4">
		<button type="button" class="variant-ghost-surface btn" onclick={onBack}>
			← {m.setup_back() || 'Back'}
		</button>

		<div class="flex gap-2">
			<button type="button" class="variant-ghost-surface btn" onclick={handleSkip}>
				{m.setup_skip() || 'Skip'}
			</button>
			<button type="button" class="variant-filled-primary btn" onclick={handleNext} disabled={!testSuccess}>
				{m.setup_next() || 'Next'} →
			</button>
		</div>
	</div>
</div>

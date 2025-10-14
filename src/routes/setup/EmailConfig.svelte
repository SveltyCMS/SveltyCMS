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

	const { wizard } = setupStore;

	// Local state
	let isTesting = $state(false);
	let testSuccess = $state(false);
	let testError = $state('');
	let testEmailSent = $state(false);
	let showSuccessDetails = $state(true); // Default to true on desktop, controlled on mobile

	// "Why Configure SMTP?" section - collapsed by default on both mobile and desktop
	let showWhySmtp = $state(false);

	// SMTP Configuration
	let smtpHost = $state('');
	let smtpPort = $state(587);
	let smtpUser = $state('');
	let smtpPassword = $state('');
	let smtpFrom = $state('');
	let smtpSecure = $state(true);
	let useCustomPort = $state(false);

	// Common SMTP ports with descriptions
	const commonPorts = $derived([
		{ value: 587, label: m.setup_email_port_587(), description: m.setup_email_port_587_desc() },
		{ value: 465, label: m.setup_email_port_465(), description: m.setup_email_port_465_desc() },
		{ value: 2525, label: m.setup_email_port_2525(), description: m.setup_email_port_2525_desc() },
		{ value: 25, label: m.setup_email_port_25(), description: m.setup_email_port_25_desc() }
	]);

	// Auto-detect TLS/STARTTLS based on port
	function autoDetectSecure(port: number): boolean {
		switch (port) {
			case 465: // SSL/TLS (implicit)
				return true;
			case 587: // STARTTLS (explicit)
				return true;
			case 2525: // Alternative STARTTLS port
				return true;
			case 25: // Usually unencrypted (legacy)
				return false;
			default:
				// For custom ports, default to secure
				return true;
		}
	}

	// Automatically update security setting when port changes
	$effect(() => {
		smtpSecure = autoDetectSecure(smtpPort);
	});

	// Validation
	const isFormValid = $derived(smtpHost.trim() !== '' && smtpPort > 0 && smtpUser.trim() !== '' && smtpPassword.trim() !== '');

	// Common SMTP presets
	const presets = [
		{
			name: m.setup_email_preset_gmail(),
			host: 'smtp.gmail.com',
			port: 587,
			secure: true,
			note: m.setup_email_preset_note_gmail()
		},
		{
			name: m.setup_email_preset_outlook(),
			host: 'smtp.office365.com',
			port: 587,
			secure: true,
			note: ''
		},
		{
			name: m.setup_email_preset_sendgrid(),
			host: 'smtp.sendgrid.net',
			port: 587,
			secure: true,
			note: m.setup_email_preset_note_sendgrid()
		},
		{
			name: m.setup_email_preset_mailgun(),
			host: 'smtp.mailgun.org',
			port: 587,
			secure: true,
			note: ''
		},
		{
			name: m.setup_email_preset_custom(),
			host: '',
			port: 587,
			secure: true,
			note: ''
		}
	];

	let selectedPreset = $state(m.setup_email_preset_custom());

	function applyPreset(presetName: string) {
		const preset = presets.find((p) => p.name === presetName);
		if (preset) {
			selectedPreset = presetName;
			smtpHost = preset.host;
			smtpPort = preset.port;
			smtpSecure = preset.secure;
			useCustomPort = false; // Reset to standard port dropdown
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
</script>

<div class="space-y-6">
	<!-- Why SMTP is Needed -->
	<div class="card variant-ghost-primary p-4">
		<!-- Header - Always visible with toggle button -->
		<button type="button" class="flex w-full items-start gap-3 text-left" onclick={() => (showWhySmtp = !showWhySmtp)}>
			<iconify-icon icon="mdi:information" class="mt-0.5 shrink-0 text-xl text-primary-500"></iconify-icon>
			<div class="flex-1">
				<h3 class="font-semibold text-primary-700 dark:text-primary-400">{m.setup_email_why_title()}</h3>
			</div>
			<iconify-icon icon={showWhySmtp ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="mt-0.5 shrink-0 text-xl text-primary-500"></iconify-icon>
		</button>

		<!-- Collapsible content -->
		{#if showWhySmtp}
			<div class="ml-8 mt-2 space-y-2">
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
		{/if}
	</div>

	<!-- SMTP Provider Presets -->
	<div class="space-y-2">
		<label class="label">
			<span class="font-medium">{m.setup_email_provider()}</span>
			<select class="select" bind:value={selectedPreset} onchange={() => applyPreset(selectedPreset)}>
				{#each presets as preset}
					<option value={preset.name}>{preset.name}</option>
				{/each}
			</select>
		</label>
		{#if selectedPreset !== m.setup_email_preset_custom()}
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
			<span class="font-medium">{m.setup_email_host()} <span class="text-error-500">*</span></span>
			<input
				type="text"
				class="input"
				bind:value={smtpHost}
				placeholder={m.setup_email_host_placeholder()}
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
		</label>

		<!-- SMTP Port -->
		<label class="label">
			<span class="font-medium">{m.setup_email_port()} <span class="text-error-500">*</span></span>

			{#if useCustomPort}
				<!-- Custom port input -->
				<div class="flex gap-2">
					<input
						type="number"
						class="input flex-1"
						bind:value={smtpPort}
						placeholder={m.setup_email_port_custom()}
						min="1"
						max="65535"
						required
						onchange={() => {
							testSuccess = false;
							testError = '';
						}}
					/>
					<button
						type="button"
						class="variant-ghost-surface btn btn-sm"
						onclick={() => {
							useCustomPort = false;
							smtpPort = 587; // Reset to default
						}}
					>
						<iconify-icon icon="mdi:arrow-u-left-top" class="text-lg"></iconify-icon>
						{m.setup_email_button_use_standard()}
					</button>
				</div>
				<span class="text-xs text-surface-600 dark:text-surface-400">{m.setup_email_port_custom_desc()}</span>
			{:else}
				<!-- Standard port dropdown -->
				<div class="flex gap-2">
					<select
						class="select flex-1"
						bind:value={smtpPort}
						onchange={() => {
							testSuccess = false;
							testError = '';
						}}
					>
						{#each commonPorts as port}
							<option value={port.value}>{port.label}</option>
						{/each}
					</select>
					<button type="button" class="variant-ghost-surface btn btn-sm whitespace-nowrap" onclick={() => (useCustomPort = true)}>
						<iconify-icon icon="mdi:pencil" class="text-lg"></iconify-icon>
						{m.setup_email_button_custom()}
					</button>
				</div>
				{@const selectedPort = commonPorts.find((p) => p.value === smtpPort)}
				{#if selectedPort}
					<span class="text-xs text-surface-600 dark:text-surface-400">{selectedPort.description}</span>
				{/if}
			{/if}
		</label>

		<!-- SMTP User -->
		<label class="label">
			<span class="font-medium">{m.setup_email_user()} <span class="text-error-500">*</span></span>
			<input
				type="text"
				class="input"
				bind:value={smtpUser}
				placeholder={m.setup_email_user_placeholder()}
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
		</label>

		<!-- SMTP Password -->
		<label class="label">
			<span class="font-medium">{m.setup_email_password()} <span class="text-error-500">*</span></span>
			<input
				type="password"
				class="input"
				bind:value={smtpPassword}
				placeholder={m.setup_email_password_placeholder()}
				required
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
		</label>

		<!-- From Email (Optional) -->
		<label class="label md:col-span-2">
			<span class="font-medium">{m.setup_email_from()}</span>
			<input type="email" class="input" bind:value={smtpFrom} placeholder={smtpUser || 'noreply@example.com'} />
			<span class="text-xs text-surface-600 dark:text-surface-400">{m.setup_email_from_note()}</span>
		</label>
	</div>

	<!-- Security Options -->
	<div class="space-y-2">
		<label class="flex items-start space-x-2">
			<input type="checkbox" class="checkbox mt-0.5" bind:checked={smtpSecure} disabled />
			<div class="flex-1">
				<span class="text-sm font-medium">{smtpSecure ? m.setup_email_tls_enabled() : m.setup_email_tls_disabled()}</span>
				<p class="text-xs text-surface-600 dark:text-surface-400">
					{#if smtpPort === 587}
						{m.setup_email_port_auto_starttls()}
					{:else if smtpPort === 465}
						{m.setup_email_port_auto_ssl()}
					{:else if smtpPort === 2525}
						{m.setup_email_port_auto_2525()}
					{:else if smtpPort === 25}
						{m.setup_email_port_auto_25()}
					{:else}
						{m.setup_email_port_auto_custom({ port: smtpPort })}
					{/if}
				</p>
			</div>
		</label>
	</div>

	<!-- Test Connection Button -->
	<div class="space-y-3">
		<button type="button" class="variant-filled-primary btn w-full" onclick={testConnection} disabled={!isFormValid || isTesting}>
			<iconify-icon icon="mdi:email" class="mr-2 text-xl"></iconify-icon>
			{isTesting ? m.setup_email_testing() : m.setup_email_test_button()}
		</button>

		<!-- Test Result -->
		{#if testSuccess}
			<div class="card variant-ghost-success p-4">
				<!-- Header - Always visible with toggle button on mobile -->
				<div class="flex items-start gap-3">
					<iconify-icon icon="mdi:check-circle" class="text-2xl text-success-500"></iconify-icon>
					<div class="flex-1">
						<p class="font-semibold text-success-700 dark:text-success-300">{m.setup_email_connection_success()}</p>
					</div>
					<!-- Toggle button - visible only on mobile -->
					<button
						type="button"
						class="btn-icon btn-sm md:hidden"
						onclick={() => (showSuccessDetails = !showSuccessDetails)}
						aria-label={showSuccessDetails ? m.setup_email_button_hide_details() : m.setup_email_button_show_details()}
					>
						<iconify-icon icon={showSuccessDetails ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="text-xl"></iconify-icon>
					</button>
				</div>

				<!-- Collapsible details -->
				<div class="mt-2 overflow-hidden transition-all" class:hidden={!showSuccessDetails} class:md:block={true}>
					{#if testEmailSent}
						<p class="text-sm text-success-600 dark:text-success-400">
							{m.setup_email_test_sent_to({ email: wizard.adminUser.email })}
						</p>
					{/if}
					<p class="mt-1 text-sm text-success-600 dark:text-success-400">{m.setup_email_settings_saved()}</p>
				</div>
			</div>
		{/if}

		{#if testError}
			<div class="card variant-ghost-error flex items-start gap-3 p-4">
				<iconify-icon icon="mdi:close-circle" class="text-2xl text-error-500"></iconify-icon>
				<div class="flex-1">
					<p class="font-semibold text-error-700 dark:text-error-300">{m.setup_email_connection_failed()}</p>
					<p class="mt-1 text-sm text-error-600 dark:text-error-400">{testError}</p>
				</div>
			</div>
		{/if}
	</div>
</div>

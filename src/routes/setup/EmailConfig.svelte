<!--
@file src/routes/setup/EmailConfig.svelte
@description Optional SMTP Configuration with Auto-Detection step for SveltyCMS setup wizard

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
	import { toaster } from '@stores/store.svelte';
	import { safeParse } from 'valibot';
	import { smtpConfigSchema, type SmtpConfigSchema } from '@utils/formSchemas';

	const { wizard } = setupStore;

	// Local state
	let isTesting = $state(false);
	let testSuccess = $state(false);
	let testError = $state('');
	let testEmailSent = $state(false);
	let showSuccessDetails = $state(true);
	let showWhySmtp = $state(false);
	const validationErrors = $state<Record<string, string>>({});
	let touchedFields = $state(new Set<string>());
	let localValidationErrors = $derived(() => validationResult().errors);

	// SMTP Configuration
	let smtpHost = $state('');
	let smtpPort = $state(587);
	let smtpUser = $state('');
	let smtpPassword = $state('');
	let smtpFrom = $state('');
	let useCustomPort = $state(false);
	let portAutoDetected = $state(false);
	let showPassword = $state(false);

	// Derived values for auto-detection
	let detectedPort = $derived(() => {
		if (!useCustomPort && smtpHost) {
			const provider = detectProviderFromHost(smtpHost);
			return provider?.port;
		}
		return null;
	});

	let detectedSecure = $derived(() => {
		const port = detectedPort() ?? smtpPort;
		return autoDetectSecure(port);
	});

	// Effective values (use detected values when available)
	let effectivePort = $derived(() => detectedPort() ?? smtpPort);
	let effectiveSecure = $derived(() => detectedSecure());

	// Common SMTP ports with descriptions
	const commonPorts = $derived([
		{ value: 587, label: m.setup_email_port_587(), description: m.setup_email_port_587_desc() },
		{ value: 465, label: m.setup_email_port_465(), description: m.setup_email_port_465_desc() },
		{ value: 2525, label: m.setup_email_port_2525(), description: m.setup_email_port_2525_desc() },
		{ value: 25, label: m.setup_email_port_25(), description: m.setup_email_port_25_desc() }
	]);

	// Enhanced SMTP provider detection
	const providerPatterns = [
		{
			pattern: /gmail\.com|googlemail\.com/i,
			name: 'Gmail',
			host: 'smtp.gmail.com',
			port: 587,
			secure: true,
			note: m.setup_email_preset_note_gmail()
		},
		{
			pattern: /outlook\.com|hotmail\.com|live\.com|office365\.com/i,
			name: 'Outlook/Office 365',
			host: 'smtp.office365.com',
			port: 587,
			secure: true,
			note: ''
		},
		{
			pattern: /sendgrid/i,
			name: 'SendGrid',
			host: 'smtp.sendgrid.net',
			port: 587,
			secure: true,
			note: m.setup_email_preset_note_sendgrid()
		},
		{
			pattern: /mailgun/i,
			name: 'Mailgun',
			host: 'smtp.mailgun.org',
			port: 587,
			secure: true,
			note: ''
		},
		{
			pattern: /smtp\.mail\.yahoo\.com/i,
			name: 'Yahoo Mail',
			host: 'smtp.mail.yahoo.com',
			port: 465,
			secure: true,
			note: ''
		},
		{
			pattern: /smtp\.zoho\.com/i,
			name: 'Zoho Mail',
			host: 'smtp.zoho.com',
			port: 465,
			secure: true,
			note: ''
		},
		{
			pattern: /smtp\.ionos\.(com|de)/i,
			name: 'IONOS',
			host: 'smtp.ionos.com',
			port: 587,
			secure: true,
			note: ''
		},
		{
			pattern: /smtp\.1und1\.(de|com)/i,
			name: '1&1',
			host: 'smtp.1und1.de',
			port: 587,
			secure: true,
			note: ''
		},
		{
			pattern: /smtp\.strato\.(de|com)/i,
			name: 'Strato',
			host: 'smtp.strato.de',
			port: 465,
			secure: true,
			note: ''
		}
	];

	// Detect provider from host and auto-configure
	function detectProviderFromHost(host: string) {
		if (!host) return null;

		for (const provider of providerPatterns) {
			if (provider.pattern.test(host)) {
				return provider;
			}
		}
		return null;
	}

	// Auto-detect TLS/STARTTLS based on port
	function autoDetectSecure(port: number): boolean {
		switch (port) {
			case 465:
				return true; // SSL/TLS (implicit)
			case 587:
				return true; // STARTTLS (explicit)
			case 2525:
				return true; // Alternative STARTTLS port
			case 25:
				return false; // Usually unencrypted (legacy)
			default:
				return true; // For custom ports, default to secure
		}
	}

	// Automatically update security setting when port changes
	$effect(() => {
		if (!detectedPort()) {
			// Security is now computed by effectiveSecure()
		}
	});

	// Watch for host changes and auto-detect provider
	let lastDetectedHost = '';
	$effect(() => {
		// Only auto-detect if user isn't using custom port and host has changed
		if (!useCustomPort && smtpHost !== lastDetectedHost) {
			lastDetectedHost = smtpHost;

			const provider = detectProviderFromHost(smtpHost);
			if (provider) {
				smtpPort = provider.port;
				portAutoDetected = true;

				// Show subtle feedback
			} else {
				portAutoDetected = false;
			}
		}
	});

	// Validation using schema
	const validationResult = $derived(() => {
		const config: SmtpConfigSchema = {
			host: smtpHost,
			port: effectivePort(),
			user: smtpUser,
			password: smtpPassword,
			from: smtpFrom || smtpUser,
			secure: effectiveSecure()
		};

		const result = safeParse(smtpConfigSchema, config);

		if (result.success) {
			return { valid: true, errors: {} };
		} else {
			// Extract validation errors
			const errors: Record<string, any> = {};
			if (result.issues) {
				for (const issue of result.issues) {
					const path = issue.path?.[0]?.key as string;
					if (path) {
						errors[path] = issue.message;
					}
				}
			}
			return { valid: false, errors };
		}
	});

	const isFormValid = $derived(validationResult().valid);

	// Only display errors for fields that have been touched (blurred)
	const displayErrors = $derived.by(() => {
		const errors: Record<string, any> = {};
		// Show validation errors only for touched fields
		for (const field of touchedFields) {
			if (localValidationErrors()[field]) {
				errors[field] = localValidationErrors()[field];
			}
		}

		// Parent validation errors always show (from API responses)
		return {
			...errors,
			...validationErrors
		};
	});

	// Mark field as touched on blur
	function handleBlur(fieldName: string) {
		touchedFields.add(fieldName);
		touchedFields = touchedFields;
	}

	// Legacy hostname validation for UI feedback
	const isValidHostname = $derived(() => {
		if (!smtpHost.trim()) return true;
		if (smtpHost.includes('@')) return false;
		return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(smtpHost);
	});

	// SMTP presets for dropdown
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
			selectedPreset = presetName as any;
			smtpHost = preset.host;
			smtpPort = preset.port;
			useCustomPort = false;
			portAutoDetected = false;
			testSuccess = false;
			testError = '';
		}
	}

	async function testConnection() {
		if (!isFormValid) {
			toaster.warning({ description: m.setup_email_test_required() });
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
					port: effectivePort(),
					user: smtpUser,
					password: smtpPassword,
					from: smtpFrom || smtpUser,
					secure: effectiveSecure(),
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
				toaster.success({ description: message });
			} else {
				testError = result.error || 'Connection failed';
				toaster.error({ description: `${m.setup_email_test_failed()}: ${testError}` });
			}
		} catch (error) {
			testError = error instanceof Error ? error.message : 'Unknown error occurred';
			toaster.error({ description: `${m.setup_email_test_failed()}: ${testError}` });
		} finally {
			isTesting = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Why SMTP is Needed -->
	<div class="card preset-ghost-primary-500 p-4">
		<!-- Header - Always visible with toggle button -->
		<button
			type="button"
			class="flex w-full items-start gap-3 text-left"
			onclick={() => (showWhySmtp = !showWhySmtp)}
			aria-expanded={showWhySmtp}
			aria-controls="why-smtp-content"
		>
			<iconify-icon icon="mdi:information" class="mt-0.5 shrink-0 text-xl text-primary-500" aria-hidden="true"></iconify-icon>
			<div class="flex-1">
				<h3 class="font-semibold text-primary-700 dark:text-primary-400">{m.setup_email_why_title()}</h3>
			</div>
			<iconify-icon icon={showWhySmtp ? 'mdi:chevron-up' : 'mdi:chevron-down'} class="mt-0.5 shrink-0 text-xl text-primary-500" aria-hidden="true"
			></iconify-icon>
		</button>

		<!-- Collapsible content -->
		{#if showWhySmtp}
			<div id="why-smtp-content" class="ml-8 mt-2 space-y-2">
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
			<select class="select" bind:value={selectedPreset} onchange={() => applyPreset(selectedPreset)} aria-label="Select an SMTP provider preset">
				{#each presets as preset, index (index)}
					<option value={preset.name}>{preset.name}</option>
				{/each}
			</select>
		</label>
		{#if selectedPreset !== m.setup_email_preset_custom()}
			{@const preset = presets.find((p) => p.name === selectedPreset)}
			{#if preset?.note}
				<div class="card preset-ghost-warning-500 flex items-start gap-2 p-3" role="alert">
					<iconify-icon icon="mdi:alert" class="mt-0.5 text-lg text-warning-500" aria-hidden="true"></iconify-icon>
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
				class:input-error={displayErrors.host || (smtpHost.trim() && !isValidHostname())}
				bind:value={smtpHost}
				placeholder={m.setup_email_host_placeholder()}
				required
				onblur={() => handleBlur('host')}
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
			{#if displayErrors.host}
				<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
					<iconify-icon icon="mdi:alert-circle" class="text-sm"></iconify-icon>
					{displayErrors.host}
				</span>
			{:else if smtpHost.trim() && !isValidHostname()}
				<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
					<iconify-icon icon="mdi:alert-circle" class="text-sm"></iconify-icon>
					{#if smtpHost.includes('@')}
						Invalid hostname. Use "smtp.domain.com" not "email@domain.com"
					{:else}
						Invalid hostname format. Example: smtp.gmail.com
					{/if}
				</span>
			{/if}
		</label>

		<!-- SMTP Port with Auto-Detection -->
		<label class="label">
			<div class="mb-1 flex items-center justify-between">
				<span class="font-medium">{m.setup_email_port()} <span class="text-error-500">*</span></span>
				{#if portAutoDetected && !useCustomPort}
					<span class="preset-soft-success-500 badge flex items-center gap-1 text-xs">
						<iconify-icon icon="mdi:auto-fix" class="text-sm"></iconify-icon>
						Auto-detected
					</span>
				{/if}
			</div>

			{#if useCustomPort}
				<!-- Custom port input -->
				<div class="flex gap-2">
					<input
						type="number"
						class="input flex-1"
						class:input-error={displayErrors.port}
						bind:value={smtpPort}
						placeholder={m.setup_email_port_custom()}
						min="1"
						max="65535"
						required
						onblur={() => handleBlur('port')}
						onchange={() => {
							testSuccess = false;
							testError = '';
							portAutoDetected = false;
						}}
					/>
					<button
						type="button"
						class="preset-ghost-surface-500 btn btn-sm"
						aria-label="Switch back to standard SMTP ports"
						onclick={() => {
							useCustomPort = false;
							smtpPort = 587; // Reset to default
						}}
					>
						<iconify-icon icon="mdi:arrow-u-left-top" class="text-lg" aria-hidden="true"></iconify-icon>
						{m.setup_email_button_use_standard()}
					</button>
				</div>
				{#if displayErrors.port}
					<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
						<iconify-icon icon="mdi:alert-circle" class="text-sm"></iconify-icon>
						{displayErrors.port}
					</span>
				{:else}
					<span class="text-xs text-surface-600 dark:text-surface-400">{m.setup_email_port_custom_desc()}</span>
				{/if}
			{:else}
				<!-- Standard port dropdown -->
				<div class="flex gap-2">
					<select
						class="select flex-1"
						bind:value={smtpPort}
						aria-label="Select a standard SMTP port"
						onchange={() => {
							testSuccess = false;
							testError = '';
							portAutoDetected = false;
						}}
					>
						{#each commonPorts as port, index (index)}
							<option value={port.value}>{port.label}</option>
						{/each}
					</select>
					<button
						type="button"
						class="preset-ghost-surface-500 btn btn-sm whitespace-nowrap"
						aria-label="Enter a custom SMTP port"
						onclick={() => {
							useCustomPort = true;
							portAutoDetected = false;
						}}
					>
						<iconify-icon icon="mdi:pencil" class="text-lg" aria-hidden="true"></iconify-icon>
						{m.setup_email_button_custom()}
					</button>
				</div>
				{@const selectedPort = commonPorts.find((p) => p.value === effectivePort())}
				{#if selectedPort}
					<div class="mt-1 flex items-center gap-2">
						{#if effectiveSecure()}
							<span class="preset-soft-success-500 badge flex items-center gap-1 text-xs">
								<iconify-icon icon="mdi:lock" class="text-sm"></iconify-icon>
								Encrypted
							</span>
						{/if}
						<span class="text-xs text-surface-600 dark:text-surface-400">{selectedPort.description}</span>
					</div>
				{/if}
			{/if}
		</label>

		<!-- SMTP User -->
		<label class="label">
			<span class="font-medium">{m.setup_email_user()} <span class="text-error-500">*</span></span>
			<input
				type="text"
				class="input"
				class:input-error={displayErrors.user}
				bind:value={smtpUser}
				placeholder={m.setup_email_user_placeholder()}
				required
				onblur={() => {
					const trimmed = smtpUser.trim();
					if (trimmed !== smtpUser) {
						smtpUser = trimmed;
					}
					handleBlur('user');
				}}
				onchange={() => {
					testSuccess = false;
					testError = '';
				}}
			/>
			{#if displayErrors.user}
				<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
					<iconify-icon icon="mdi:alert-circle" class="text-sm"></iconify-icon>
					{displayErrors.user}
				</span>
			{/if}
		</label>

		<!-- SMTP Password -->
		<label class="label">
			<span class="font-medium">{m.setup_email_password()} <span class="text-error-500">*</span></span>
			<div class="relative">
				<input
					type={showPassword ? 'text' : 'password'}
					class="input pr-10"
					class:input-error={displayErrors.password}
					bind:value={smtpPassword}
					placeholder={m.setup_email_password_placeholder()}
					required
					onblur={() => {
						const trimmed = smtpPassword.trim();
						if (trimmed !== smtpPassword) {
							smtpPassword = trimmed;
						}
						handleBlur('password');
					}}
					onchange={() => {
						testSuccess = false;
						testError = '';
					}}
				/>
				<button
					type="button"
					class="btn-icon btn-sm absolute right-1 top-1/2 -translate-y-1/2"
					onclick={() => (showPassword = !showPassword)}
					aria-label={showPassword ? 'Hide password' : 'Show password'}
				>
					<iconify-icon icon={showPassword ? 'mdi:eye-off' : 'mdi:eye'} class="text-lg text-surface-600 dark:text-surface-400"></iconify-icon>
				</button>
			</div>
			{#if displayErrors.password}
				<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
					<iconify-icon icon="mdi:alert-circle" class="text-sm"></iconify-icon>
					{displayErrors.password}
				</span>
			{/if}
		</label>

		<!-- From Email (Optional) -->
		<label class="label md:col-span-2">
			<span class="font-medium">{m.setup_email_from()}</span>
			<input
				type="email"
				class="input"
				bind:value={smtpFrom}
				placeholder={smtpUser || 'noreply@example.com'}
				onblur={() => {
					const trimmed = smtpFrom.trim();
					if (trimmed !== smtpFrom) {
						smtpFrom = trimmed;
					}
				}}
			/>
			<span class="text-xs text-surface-600 dark:text-surface-400">{m.setup_email_from_note()}</span>
		</label>
	</div>

	<!-- Test Connection Button -->
	<div class="space-y-3">
		<button type="button" class="preset-filled-primary-500 btn w-full" onclick={testConnection} disabled={!isFormValid || isTesting}>
			<iconify-icon icon="mdi:email" class="mr-2 text-xl"></iconify-icon>
			{isTesting ? m.setup_email_testing() : m.setup_email_test_button()}
		</button>

		<!-- Test Result -->
		{#if testSuccess}
			<div class="card preset-ghost-success-500 p-4">
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
			<div class="card preset-ghost-error-500 flex items-start gap-3 p-4">
				<iconify-icon icon="mdi:close-circle" class="text-2xl text-error-500"></iconify-icon>
				<div class="flex-1">
					<p class="font-semibold text-error-700 dark:text-error-300">{m.setup_email_connection_failed()}</p>
					<p class="mt-1 text-sm text-error-600 dark:text-error-400">{testError}</p>
				</div>
			</div>
		{/if}
	</div>
</div>

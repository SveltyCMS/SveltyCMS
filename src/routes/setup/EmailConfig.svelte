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
	import Icon from '@iconify/svelte';
	import Info from '@lucide/svelte/icons/info';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Pencil from '@lucide/svelte/icons/pencil';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import { setupStore } from '@stores/setupStore.svelte.ts';
	import * as m from '@src/paraglide/messages';
	import { showToast } from '@utils/toast';
	import { safeParse } from 'valibot';
	import { smtpConfigSchema, type SmtpConfigSchema } from '@utils/formSchemas';
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';

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

				// Show subtle feedback
			} else {
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
	<div class="card preset-outlined-primary-500 p-4">
		<!-- Header - Always visible with toggle button -->
		<button
			type="button"
			class="flex w-full items-start gap-3 text-left"
			onclick={() => (showWhySmtp = !showWhySmtp)}
			aria-expanded={showWhySmtp}
			aria-controls="why-smtp-content"
		>
			<Info class="mt-0.5 shrink-0 text-xl dark:text-primary-500 text-tertiary-500" aria-hidden="true" />
			<div class="flex-1">
				<h3 class="font-semibold text-tertiary-500 dark:text-primary-500">{m.setup_email_why_title()}</h3>
			</div>
			{#if showWhySmtp}
				<ChevronUp class="mt-0.5 shrink-0 text-xl text-tertiary-500 dark:text-primary-500" aria-hidden="true" />
			{:else}
				<ChevronDown class="mt-0.5 shrink-0 text-xl text-tertiary-500 dark:text-primary-500" aria-hidden="true" />
			{/if}
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
			<div class="mb-1 flex items-center gap-1 text-sm font-medium">
				<span class="text-black dark:text-white">{m.setup_email_provider()}</span>
				<Tooltip positioning={{ placement: 'top' }}>
					<Tooltip.Trigger>
						<button
							type="button"
							tabindex="-1"
							aria-label={m.setup_email_aria_help_provider()}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<CircleQuestionMark size={24} />
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content
								class="card w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
							>
								<p>{m.setup_email_help_provider()}</p>
								<Tooltip.Arrow
									class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
								>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
			<select class="select" bind:value={selectedPreset} onchange={() => applyPreset(selectedPreset)} aria-label="Select an SMTP provider preset">
				{#each presets as preset, index (index)}
					<option value={preset.name}>{preset.name}</option>
				{/each}
			</select>
		</label>
		{#if selectedPreset !== m.setup_email_preset_custom()}
			{@const preset = presets.find((p) => p.name === selectedPreset)}
			{#if preset?.note}
				<div class="card preset-outlined-warning-500 flex items-start gap-2 p-3" role="alert">
					<TriangleAlert class="mt-0.5 text-lg text-warning-500" aria-hidden="true" />
					<p class="text-sm text-warning-700 dark:text-warning-300">{preset.note}</p>
				</div>
			{/if}
		{/if}
	</div>

	<!-- SMTP Configuration Form -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- SMTP Host -->
		<label class="label">
			<div class="mb-1 flex items-center gap-1 text-sm font-medium">
				<span class="text-black dark:text-white">{m.setup_email_host()} <span class="text-error-500">*</span></span>
				<Tooltip positioning={{ placement: 'top' }}>
					<Tooltip.Trigger>
						<button
							type="button"
							tabindex="-1"
							aria-label={m.setup_email_aria_help_host()}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<CircleQuestionMark size={24} />
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content
								class="card w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
							>
								<p>{m.setup_email_help_host()}</p>
								<Tooltip.Arrow
									class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
								>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
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
					<CircleAlert class="text-sm" />
					{displayErrors.host}
				</span>
			{:else if smtpHost.trim() && !isValidHostname()}
				<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
					<CircleAlert class="text-sm" />
					{#if smtpHost.includes('@')}
						{m.setup_email_invalid_hostname()}
					{:else}
						{m.setup_email_invalid_hostname_format()}
					{/if}
				</span>
			{/if}
		</label>

		<!-- SMTP Port with Auto-Detection -->
		<label class="label">
			<div class="mb-1 flex items-center justify-between">
				<div class="flex items-center gap-1">
					<span class="font-medium text-black dark:text-white">{m.setup_email_port()} <span class="text-error-500">*</span></span>
					<Tooltip positioning={{ placement: 'top' }}>
						<Tooltip.Trigger>
							<button
								type="button"
								tabindex="-1"
								aria-label={m.setup_email_aria_help_port()}
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<CircleQuestionMark size={24} />
							</button>
						</Tooltip.Trigger>
						<Portal>
							<Tooltip.Positioner>
								<Tooltip.Content
									class="card w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
								>
									<p>{m.setup_email_help_port()}</p>
									<Tooltip.Arrow
										class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
									>
										<Tooltip.ArrowTip />
									</Tooltip.Arrow>
								</Tooltip.Content>
							</Tooltip.Positioner>
						</Portal>
					</Tooltip>
				</div>
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
						}}
					/>
					<button
						type="button"
						class="preset-outlined-surface-500btn btn-sm"
						aria-label={m.setup_email_aria_switch_standard()}
						onclick={() => {
							useCustomPort = false;
							smtpPort = 587; // Reset to default
						}}
					>
						<CircleQuestionMark size={24} class="text-lg" />
						{m.setup_email_button_use_standard()}
					</button>
				</div>
				{#if displayErrors.port}
					<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
						<CircleAlert class="text-sm" />
						{displayErrors.port}
					</span>
				{:else}
					<span class="text-xs text-surface-600 dark:text-surface-50">{m.setup_email_port_custom_desc()}</span>
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
						}}
					>
						{#each commonPorts as port, index (index)}
							<option value={port.value}>{port.label}</option>
						{/each}
					</select>
					<button
						type="button"
						class="preset-outlined-surface-500btn btn-sm whitespace-nowrap"
						aria-label="Enter a custom SMTP port"
						onclick={() => {
							useCustomPort = true;
						}}
					>
						<Pencil class="text-lg" aria-hidden="true" />
						{m.setup_email_button_custom()}
					</button>
				</div>
				{@const selectedPort = commonPorts.find((p) => p.value === effectivePort())}
				{#if selectedPort}
					<div class="mt-1 flex items-center gap-2">
						{#if effectiveSecure()}
							<span class="variant-soft-success badge flex items-center gap-1 text-xs">
								<CircleQuestionMark size={24} class="text-sm" />
								{m.setup_email_port_encrypted()}
							</span>
						{/if}
						<span class="text-xs text-surface-600 dark:text-surface-50">{selectedPort.description}</span>
					</div>
				{/if}
			{/if}
		</label>

		<!-- SMTP User -->
		<label class="label">
			<div class="mb-1 flex items-center gap-1 text-sm font-medium">
				<span class="text-black dark:text-white">{m.setup_email_user()} <span class="text-error-500">*</span></span>
				<Tooltip positioning={{ placement: 'top' }}>
					<Tooltip.Trigger>
						<button
							type="button"
							tabindex="-1"
							aria-label={m.setup_email_aria_help_user()}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<CircleQuestionMark size={24} />
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content
								class="card w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
							>
								<p>{m.setup_email_help_user()}</p>
								<Tooltip.Arrow
									class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
								>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
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
					<CircleAlert class="text-sm" />
					{displayErrors.user}
				</span>
			{/if}
		</label>

		<!-- SMTP Password -->
		<label class="label">
			<div class="mb-1 flex items-center gap-1 text-sm font-medium">
				<span class="text-black dark:text-white">{m.setup_email_password()} <span class="text-error-500">*</span></span>
				<Tooltip positioning={{ placement: 'top' }}>
					<Tooltip.Trigger>
						<button
							type="button"
							tabindex="-1"
							aria-label={m.setup_email_aria_help_password()}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<CircleQuestionMark size={24} />
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content
								class="card w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
							>
								<p>{m.setup_email_help_password()}</p>
								<Tooltip.Arrow
									class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-50)] dark:[--arrow-background:var(--color-surface-700)]"
								>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>
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
					aria-label={showPassword ? m.setup_email_aria_hide_password() : m.setup_email_aria_show_password()}
				>
					{#if showPassword}
						<EyeOff class="text-lg text-surface-600 dark:text-surface-50" />
					{:else}
						<Eye class="text-lg text-surface-600 dark:text-surface-50" />
					{/if}
				</button>
			</div>
			{#if displayErrors.password}
				<span class="mt-1 flex items-center gap-1 text-xs text-error-500">
					<CircleAlert class="text-sm" />
					{displayErrors.password}
				</span>
			{/if}
		</label>

		<!-- From Email (Optional) -->
		<label class="label md:col-span-2">
			<span class="font-medium text-black dark:text-white">{m.setup_email_from()}</span>
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
			<span class="text-xs text-surface-600 dark:text-surface-50">{m.setup_email_from_note()}</span>
		</label>
	</div>

	<!-- Test Connection Button -->
	<div class="space-y-3">
		<button
			type="button"
			class="preset-filled-tertiary-500 dark:preset-filled-primary-500 btn w-full"
			onclick={testConnection}
			disabled={!isFormValid || isTesting}
		>
			<CircleQuestionMark size={24} class="mr-2 text-xl" />
			{isTesting ? m.setup_email_testing() : m.setup_email_test_button()}
		</button>

		<!-- Test Result -->
		{#if testSuccess}
			<div class="card preset-outlined-primary-500 p-4">
				<!-- Header - Always visible with toggle button on mobile -->
				<div class="flex items-start gap-3">
					<CircleCheck class="text-2xl text-success-500" />
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
						{#if iconsData[showSuccessDetails ? 'mdi:chevron-up' : ('mdi:chevron-down' as keyof typeof iconsData)] as any}<Icon
								icon={iconsData[showSuccessDetails ? 'mdi:chevron-up' : ('mdi:chevron-down' as keyof typeof iconsData)] as any}
								class="text-xl"
							/>{/if}
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
			<div class="card preset-outlined-error-500 flex items-start gap-3 p-4">
				<CircleX class="text-2xl text-error-500" />
				<div class="flex-1">
					<p class="font-semibold text-error-700 dark:text-error-300">{m.setup_email_connection_failed()}</p>
					<p class="mt-1 text-sm text-error-600 dark:text-error-400">{testError}</p>
				</div>
			</div>
		{/if}
	</div>
</div>

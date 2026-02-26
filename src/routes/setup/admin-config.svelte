<!--
@file src/routes/setup/AdminConfig.svelte
@component
**Administrator account setup step**

### Props
- `adminUser`
- `validationErrors`
- `passwordRequirements`
- `showAdminPassword`
- `showConfirmPassword`
- `toggleAdminPassword`
- `toggleConfirmPassword`
- `checkPasswordRequirements`

### Features
- Real-time validation
- Password strength meter
- Password visibility toggle
- Form submission handling

-->
<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		form_confirmpassword,
		form_email,
		form_password,
		form_username,
		setup_admin_placeholder_confirm_password,
		setup_admin_placeholder_email,
		setup_admin_placeholder_password,
		setup_admin_placeholder_username,
		setup_help_admin_confirm_password,
		setup_help_admin_email,
		setup_help_admin_password,
		setup_help_admin_password_requirements_account_note,
		setup_help_admin_password_requirements_character,
		setup_help_admin_password_requirements_length,
		setup_help_admin_password_requirements_letter,
		setup_help_admin_password_requirements_match,
		setup_help_admin_password_requirements_number,
		setup_help_admin_username
	} from '@src/paraglide/messages';
	import type { ValidationErrors } from '@src/stores/setup-store.svelte.ts';
	import { setupAdminSchema } from '@utils/form-schemas';
	import { safeParse } from 'valibot';

	// Props from parent
	let {
		adminUser = $bindable(),
		validationErrors,
		passwordRequirements,
		showAdminPassword = $bindable(),
		showConfirmPassword = $bindable(),
		toggleAdminPassword,
		toggleConfirmPassword,
		checkPasswordRequirements // This is still called by oninput
	} = $props(); // Now uses imported type

	// Local real-time validation state
	let touchedFields = $state(new Set<string>());
	let localValidationErrors = $state<Record<string, string>>({});

	const validationResult = $derived(
		safeParse(setupAdminSchema, {
			username: adminUser.username,
			email: adminUser.email,
			password: adminUser.password,
			confirmPassword: adminUser.confirmPassword
		})
	);

	// ✅ FIX: Removed unused getIsValid() function.

	// Update local validation errors
	$effect(() => {
		const newErrors: ValidationErrors = {};
		if (!validationResult.success) {
			for (const issue of validationResult.issues) {
				const path = issue.path?.[0]?.key as string;
				if (path) {
					newErrors[path] = issue.message;
				}
			}
		}
		localValidationErrors = newErrors;
	});

	// Merge local errors (for touched fields) with parent errors (from API)
	const displayErrors = $derived.by(() => {
		const errors: ValidationErrors = {};
		for (const field of touchedFields) {
			if (localValidationErrors[field]) {
				errors[field] = localValidationErrors[field];
			}
		}
		return { ...errors, ...validationErrors };
	});

	function handleBlur(fieldName: string) {
		touchedFields.add(fieldName);
		touchedFields = touchedFields; // Trigger reactivity
	}
</script>

<div class="fade-in">
	<div class="mb-4">
		<p class="text-sm text-center md:text-left text-tertiary-500 dark:text-primary-500 sm:text-base">
			{setup_help_admin_username?.() || 'Create your administrator account with full access to manage content, users, and system settings.'}
		</p>
	</div>

	<form onsubmit={(e) => e.preventDefault()} class="space-y-4">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
			<!-- Username -->
			<div>
				<label for="admin-username" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:account" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{form_username?.() || 'Username'}</span>
					<SystemTooltip title={setup_help_admin_username()}>
						<button
							type="button"
							tabindex="-1"
							aria-label={setup_help_admin_username?.() || 'Help: Username'}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<input
					id="admin-username"
					bind:value={adminUser.username}
					onblur={() => {
						const trimmed = adminUser.username.trim();
						if (trimmed !== adminUser.username) {
							adminUser.username = trimmed;
						}
						handleBlur('username');
					}}
					type="text"
					autocomplete="username"
					placeholder={setup_admin_placeholder_username?.() || 'Enter username'}
					class="input w-full rounded {displayErrors.username ? 'border-error-500' : 'border-slate-200'}"
					aria-invalid={!!displayErrors.username}
					aria-describedby={displayErrors.username ? 'admin-username-error' : undefined}
					aria-required="true"
				/>
				{#if displayErrors.username}
					<div id="admin-username-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.username}</div>
				{/if}
			</div>

			<!-- Email -->
			<div>
				<label for="admin-email" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:email" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{form_email?.() || 'Email'}</span>
					<SystemTooltip title={setup_help_admin_email()}>
						<button
							type="button"
							tabindex="-1"
							aria-label={setup_help_admin_email?.() || 'Help: Email'}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<input
					id="admin-email"
					bind:value={adminUser.email}
					onblur={() => {
						const trimmed = adminUser.email.trim();
						if (trimmed !== adminUser.email) {
							adminUser.email = trimmed;
						}
						handleBlur('email');
					}}
					type="email"
					autocomplete="email"
					placeholder={setup_admin_placeholder_email?.() || 'admin@example.com'}
					class="input w-full rounded {displayErrors.email ? 'border-error-500' : 'border-slate-200'}"
					aria-invalid={!!displayErrors.email}
					aria-describedby={displayErrors.email ? 'admin-email-error' : undefined}
					aria-required="true"
				/>
				{#if displayErrors.email}
					<div id="admin-email-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.email}</div>
				{/if}
			</div>

			<!-- Password -->
			<div>
				<label for="admin-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:key-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{form_password()}</span>
					<SystemTooltip title={setup_help_admin_password()}>
						<button
							type="button"
							tabindex="-1"
							aria-label={setup_help_admin_password?.() || 'Help: Password'}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<div class="relative">
					<input
						id="admin-password"
						bind:value={adminUser.password}
						oninput={checkPasswordRequirements}
						onblur={() => handleBlur('password')}
						type={showAdminPassword ? 'text' : 'password'}
						autocomplete="new-password"
						placeholder={setup_admin_placeholder_password?.() || 'Enter secure password'}
						class="input w-full rounded {displayErrors.password ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.password}
						aria-describedby={displayErrors.password ? 'admin-password-error' : undefined}
						aria-required="true"
					/>
					<button
						type="button"
						tabindex="-1"
						onclick={toggleAdminPassword}
						class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
						aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
					>
						<iconify-icon icon={showAdminPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18" aria-hidden="true"></iconify-icon>
					</button>
				</div>

				<!-- Password Strength Meter -->
				{#if adminUser.password}
					{@const score = Object.values(passwordRequirements).filter(Boolean).length}
					<div class="space-y-4">
						<div class="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
							<div class="h-full transition-all duration-500 {score >= 1 ? 'bg-error-500' : ''}" style="width: 20%" aria-hidden="true"></div>
							<div class="h-full transition-all duration-500 {score >= 2 ? 'bg-warning-500' : ''}" style="width: 20%" aria-hidden="true"></div>
							<div class="h-full transition-all duration-500 {score >= 3 ? 'bg-yellow-500' : ''}" style="width: 20%" aria-hidden="true"></div>
							<div class="h-full transition-all duration-500 {score >= 4 ? 'bg-primary-500' : ''}" style="width: 20%" aria-hidden="true"></div>
							<div class="h-full transition-all duration-500 {score >= 5 ? 'bg-emerald-500' : ''}" style="width: 20%" aria-hidden="true"></div>
						</div>
						<div class="flex justify-between text-[10px] font-bold uppercase tracking-wider">
							<span class={score >= 1 ? 'text-error-500' : 'text-slate-400'}>Weak</span>
							<span class={score >= 3 ? 'text-yellow-500' : 'text-slate-400'}>Moderate</span>
							<span class={score >= 5 ? 'text-emerald-500' : 'text-slate-400'}>Strong</span>
						</div>
					</div>
				{/if}

				{#if displayErrors.password}
					<div id="admin-password-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.password}</div>
				{/if}
			</div>

			<!-- Confirm Password -->
			<div>
				<label for="admin-confirm-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:key" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span class="text-black dark:text-white">{form_confirmpassword?.() || 'Confirm Password'}</span>
					<SystemTooltip title={setup_help_admin_confirm_password()}>
						<button
							type="button"
							tabindex="-1"
							aria-label={setup_help_admin_confirm_password?.() || 'Help: Confirm Password'}
							class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</SystemTooltip>
				</label>

				<div class="relative">
					<input
						id="admin-confirm-password"
						bind:value={adminUser.confirmPassword}
						oninput={checkPasswordRequirements}
						onblur={() => handleBlur('confirmPassword')}
						type={showConfirmPassword ? 'text' : 'password'}
						autocomplete="new-password"
						placeholder={setup_admin_placeholder_confirm_password?.() || 'Confirm your password'}
						class="input w-full rounded {displayErrors.confirmPassword ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.confirmPassword}
						aria-describedby={displayErrors.confirmPassword ? 'admin-confirm-password-error' : undefined}
						aria-required="true"
					/>
					<button
						type="button"
						tabindex="-1"
						onclick={toggleConfirmPassword}
						class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
						aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
					>
						<iconify-icon icon={showConfirmPassword ? 'mdi:eye-off' : 'mdi:eye'} width="18" height="18" aria-hidden="true"></iconify-icon>
					</button>
				</div>
				{#if displayErrors.confirmPassword}
					<div id="admin-confirm-password-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.confirmPassword}</div>
				{/if}
			</div>
		</div>

		<!-- Password Requirements Box -->
		<div class="mt-4 rounded border border-x-6 border-tertiary-500 bg-white p-4 shadow-xl dark:border-primary-500 dark:bg-surface-800">
			<h4 class="mb-2 text-center text-sm font-bold tracking-tight dark:text-white" id="password-reqs-heading">
				{setup_help_admin_password?.() || 'Password Requirements'}
			</h4>
			<ul class="space-y-2 text-sm" aria-labelledby="password-reqs-heading">
				<li
					class="flex items-center font-semibold {passwordRequirements.length
						? 'text-tertiary-500 dark:text-primary-500'
						: 'text-surface-500 dark:text-surface-50'}"
				>
					<span
						class="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {passwordRequirements.length
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500'}"
					>
						{#if passwordRequirements.length}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{setup_help_admin_password_requirements_length?.() || 'Minimum 8 characters'}
					<span class="sr-only">, {passwordRequirements.length ? 'complete' : 'incomplete'}.</span>
				</li>
				<li
					class="flex items-center font-semibold {passwordRequirements.letter
						? 'text-tertiary-500 dark:text-primary-500'
						: 'text-surface-500 dark:text-surface-50'}"
				>
					<span
						class="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {passwordRequirements.letter
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500'}"
					>
						{#if passwordRequirements.letter}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{setup_help_admin_password_requirements_letter?.() || 'At least one letter (A-Z or a-z)'}
					<span class="sr-only">, {passwordRequirements.letter ? 'complete' : 'incomplete'}.</span>
				</li>
				<li
					class="flex items-center font-semibold {passwordRequirements.number
						? 'text-tertiary-500 dark:text-primary-500'
						: 'text-surface-500 dark:text-surface-50'}"
				>
					<span
						class="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {passwordRequirements.number
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500'}"
					>
						{#if passwordRequirements.number}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{setup_help_admin_password_requirements_number?.() || 'At least one number (0-9)'}
					<span class="sr-only">, {passwordRequirements.number ? 'complete' : 'incomplete'}.</span>
				</li>
				<li
					class="flex items-center font-semibold {passwordRequirements.special
						? 'text-tertiary-500 dark:text-primary-500'
						: 'text-surface-500 dark:text-surface-50'}"
				>
					<span
						class="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {passwordRequirements.special
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500'}"
					>
						{#if passwordRequirements.special}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{setup_help_admin_password_requirements_character?.() || 'At least one special character (@$!%*#?&)'}
					<span class="sr-only">, {passwordRequirements.special ? 'complete' : 'incomplete'}.</span>
				</li>
				<li
					class="flex items-center font-semibold {passwordRequirements.match
						? 'text-tertiary-500 dark:text-primary-500'
						: 'text-surface-500 dark:text-surface-50'}"
				>
					<span
						class="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {passwordRequirements.match
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-500'}"
					>
						{#if passwordRequirements.match}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{setup_help_admin_password_requirements_match?.() || 'Passwords match'}
					<span class="sr-only">, {passwordRequirements.match ? 'complete' : 'incomplete'}.</span>
				</li>
				<li class="mt-2 flex items-center justify-center border-t border-slate-700 pt-2 font-bold dark:border-slate-200 dark:text-white">
					<span class="mr-2 inline-flex h-5 w-5 items-center justify-center">
						<iconify-icon icon="mdi:shield-check" width="18" class="text-error-500" aria-hidden="true"></iconify-icon>
					</span>
					{setup_help_admin_password_requirements_account_note?.() || 'This account will have full administrative privileges'}
				</li>
			</ul>
		</div>
	</form>
</div>

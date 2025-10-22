<!--
@file src/routes/setup/AdminConfig.svelte
@description Administrator account setup step for SveltyCMS setup wizard. Handles admin user creation, password validation, and error display

Features:
- Enter admin username, email, password, and confirm password
- Toggle password visibility
- Show validation errors
- Display password requirements
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Skelton
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';
	// Types from setupStore
	import type { AdminUser } from '@stores/setupStore.svelte';

	// Popup settings (click event)
	const popupAdminUsername: PopupSettings = { event: 'click', target: 'popupAdminUsername', placement: 'top' };
	const popupAdminEmail: PopupSettings = { event: 'click', target: 'popupAdminEmail', placement: 'top' };
	const popupAdminPassword: PopupSettings = { event: 'click', target: 'popupAdminPassword', placement: 'top' };
	const popupAdminConfirmPassword: PopupSettings = { event: 'click', target: 'popupAdminConfirmPassword', placement: 'top' };

	type ValidationErrors = {
		username?: string;
		email?: string;
		password?: string;
		confirmPassword?: string;
		[key: string]: string | undefined;
	};
	type PasswordRequirements = {
		length: boolean;
		letter: boolean;
		number: boolean;
		special: boolean;
		match: boolean;
	};

	// Receive reactive state & handlers from parent via $props to safely mutate nested fields
	let {
		adminUser = $bindable(),
		validationErrors,
		passwordRequirements,
		showAdminPassword = $bindable(),
		showConfirmPassword = $bindable(),
		toggleAdminPassword,
		toggleConfirmPassword,
		checkPasswordRequirements
	} = $props<{
		adminUser: AdminUser;
		validationErrors: ValidationErrors;
		passwordRequirements: PasswordRequirements;
		showAdminPassword: boolean;
		showConfirmPassword: boolean;
		toggleAdminPassword: () => void;
		toggleConfirmPassword: () => void;
		checkPasswordRequirements: () => void;
	}>();
</script>

<div class="fade-in">
	<!-- Admin User -->
	<div class="mb-8">
		<p class="text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			{m.setup_help_admin_username?.() || 'Create your administrator account with full access to manage content, users, and system settings.'}
		</p>
	</div>

	<div class="space-y-6">
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<label for="admin-username" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:account" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.form_username?.() || 'Username'}</span>
					<button
						type="button"
						tabindex="-1"
						use:popup={popupAdminUsername}
						aria-label="Help: Username"
						class="ml-1 text-slate-400 hover:text-primary-500"
					>
						<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
					</button>
				</label>
				<div
					data-popup="popupAdminUsername"
					class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_admin_username()}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<input
					id="admin-username"
					value={adminUser.username}
					oninput={(e) => (adminUser.username = (e.target as HTMLInputElement).value.trim())}
					type="text"
					placeholder={m.setup_admin_placeholder_username?.() || 'Enter username'}
					class="input w-full rounded {validationErrors.username ? 'border-error-500' : 'border-slate-200'}"
					aria-invalid={!!validationErrors.username}
					aria-describedby={validationErrors.username ? 'admin-username-error' : undefined}
				/>
				{#if validationErrors.username}
					<div id="admin-username-error" class="mt-1 text-xs text-error-500" role="alert">
						{validationErrors.username}
					</div>
				{/if}
			</div>
			<div>
				<label for="admin-email" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:email" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.form_email?.() || 'Email'}</span>
					<button type="button" tabindex="-1" use:popup={popupAdminEmail} aria-label="Help: Email" class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>
				<div
					data-popup="popupAdminEmail"
					class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_admin_email()}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<input
					id="admin-email"
					value={adminUser.email}
					oninput={(e) => (adminUser.email = (e.target as HTMLInputElement).value.trim())}
					type="email"
					placeholder={m.setup_admin_placeholder_email?.() || 'admin@example.com'}
					class="input w-full rounded {validationErrors.email ? 'border-error-500' : 'border-slate-200'}"
					aria-invalid={!!validationErrors.email}
					aria-describedby={validationErrors.email ? 'admin-email-error' : undefined}
				/>
				{#if validationErrors.email}
					<div id="admin-email-error" class="mt-1 text-xs text-error-500" role="alert">
						{validationErrors.email}
					</div>
				{/if}
			</div>
			<div>
				<label for="admin-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:key-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.form_password()}</span>
					<button
						type="button"
						tabindex="-1"
						use:popup={popupAdminPassword}
						aria-label="Help: Password"
						class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>
				<div
					data-popup="popupAdminPassword"
					class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_admin_password()}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<div class="relative">
					<input
						id="admin-password"
						value={adminUser.password}
						oninput={(e) => {
							adminUser.password = (e.target as HTMLInputElement).value.trim();
							checkPasswordRequirements();
						}}
						type={showAdminPassword ? 'text' : 'password'}
						placeholder={m.setup_admin_placeholder_password?.() || 'Enter secure password'}
						class="input w-full rounded {validationErrors.password ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!validationErrors.password}
						aria-describedby={validationErrors.password ? 'admin-password-error' : undefined}
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
				{#if validationErrors.password}
					<div id="admin-password-error" class="mt-1 text-xs text-error-500" role="alert">
						{validationErrors.password}
					</div>
				{/if}
			</div>
			<div>
				<label for="admin-confirm-password" class="mb-1 flex items-center gap-1 text-sm font-medium">
					<iconify-icon icon="mdi:key" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					<span>{m.form_confirmpassword?.() || 'Confirm Password'}</span>
					<button
						tabindex="-1"
						type="button"
						use:popup={popupAdminConfirmPassword}
						aria-label="Help: Confirm Password"
						class="ml-1 text-slate-400 hover:text-primary-500"
						><iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon></button
					>
				</label>
				<div
					data-popup="popupAdminConfirmPassword"
					class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
				>
					<p>{m.setup_help_admin_confirm_password()}</p>
					<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
				</div>
				<div class="relative">
					<input
						id="admin-confirm-password"
						value={adminUser.confirmPassword}
						oninput={(e) => {
							adminUser.confirmPassword = (e.target as HTMLInputElement).value.trim();
							checkPasswordRequirements();
						}}
						type={showConfirmPassword ? 'text' : 'password'}
						placeholder={m.setup_admin_placeholder_confirm_password?.() || 'Confirm your password'}
						class="input w-full rounded {validationErrors.confirmPassword ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!validationErrors.confirmPassword}
						aria-describedby={validationErrors.confirmPassword ? 'admin-confirm-password-error' : undefined}
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
				{#if validationErrors.confirmPassword}
					<div id="admin-confirm-password-error" class="mt-1 text-xs text-error-500" role="alert">
						{validationErrors.confirmPassword}
					</div>
				{/if}
			</div>
		</div>

		<div class="mt-4 rounded border-l-4 border-tertiary-500 bg-white p-4 shadow-xl dark:bg-surface-500">
			<h4 class="mb-2 text-center text-sm font-bold tracking-tight text-tertiary-500 dark:text-primary-500" id="password-reqs-heading">
				{m.setup_help_admin_password?.() || 'Password Requirements'}
			</h4>
			<ul class="space-y-2 text-sm" aria-labelledby="password-reqs-heading">
				<li class="flex items-center {passwordRequirements.length ? 'text-tertiary-500 dark:text-primary-500' : 'text-slate-500'}">
					<span
						class="mr-2 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border {passwordRequirements.length
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400'}"
					>
						{#if passwordRequirements.length}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{m.setup_help_admin_password_requirements_length?.() || 'Minimum 8 characters'}
					<span class="sr-only">, {passwordRequirements.length ? 'complete' : 'incomplete'}.</span>
				</li>
				<li class="flex items-center {passwordRequirements.letter ? 'text-tertiary-500 dark:text-primary-500' : 'text-slate-500'}">
					<span
						class="mr-2 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border {passwordRequirements.letter
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400'}"
					>
						{#if passwordRequirements.letter}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{m.setup_help_admin_password_requirements_letter?.() || 'At least one letter (A-Z or a-z)'}
					<span class="sr-only">, {passwordRequirements.letter ? 'complete' : 'incomplete'}.</span>
				</li>
				<li class="flex items-center {passwordRequirements.number ? 'text-tertiary-500 dark:text-primary-500' : 'text-slate-500'}">
					<span
						class="mr-2 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border {passwordRequirements.number
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400'}"
					>
						{#if passwordRequirements.number}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{m.setup_help_admin_password_requirements_number?.() || 'At least one number (0-9)'}
					<span class="sr-only">, {passwordRequirements.number ? 'complete' : 'incomplete'}.</span>
				</li>
				<li class="flex items-center {passwordRequirements.special ? 'text-tertiary-500 dark:text-primary-500' : 'text-slate-500'}">
					<span
						class="mr-2 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border {passwordRequirements.special
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400'}"
					>
						{#if passwordRequirements.special}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{m.setup_help_admin_password_requirements_character?.() || 'At least one special character (@$!%*#?&)'}
					<span class="sr-only">, {passwordRequirements.special ? 'complete' : 'incomplete'}.</span>
				</li>
				<li class="flex items-center {passwordRequirements.match ? 'text-tertiary-500 dark:text-primary-500' : 'text-slate-500'}">
					<span
						class="mr-2 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border {passwordRequirements.match
							? 'border-primary-300 bg-primary-100 text-primary-500'
							: 'border-slate-300 bg-slate-100 text-slate-400'}"
					>
						{#if passwordRequirements.match}
							<iconify-icon icon="mdi:check-bold" class="h-3.5 w-3.5" aria-hidden="true"></iconify-icon>
						{/if}
					</span>
					{m.setup_help_admin_password_requirements_match?.() || 'Passwords match'}
					<span class="sr-only">, {passwordRequirements.match ? 'complete' : 'incomplete'}.</span>
				</li>
				<li class="mt-2 flex items-center justify-center border-t border-slate-200 pt-2 font-bold text-tertiary-500 dark:text-primary-500">
					<span class="mr-2 inline-flex h-5 w-5 items-center justify-center">
						<iconify-icon icon="mdi:shield-check" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
					</span>
					{m.setup_help_admin_password_requirements_account_note?.() || 'This account will have full administrative privileges'}
				</li>
			</ul>
		</div>
	</div>
</div>

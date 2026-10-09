<!--
@file src/routes/(app)/config/access-management/sso-providers.svelte
@component
**SSO & OIDC Provider Configuration component**

### Props
- `availableRoles`: Array<any> — List of local roles for JIT assignment

### Features:
- OpenID Connect IdP registration (Google, Microsoft Entra, Okta, Auth0, Keycloak)
- Automated RFC 7636 PKCE (S256) challenge & verifier support
- Just-In-Time (JIT) user auto-provisioning configuration
- Dynamic group/claim to local role mapping matrix
- Status badges, provider pre-sets, and OIDC discovery validation
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Badge from '@components/ui/badge.svelte';
	import {
		button_cancel,
		button_edit,
		sso_add_aria,
		sso_add_provider,
		sso_add_rule,
		sso_add_rule_aria,
		sso_cancel_aria,
		sso_claim_field_aria,
		sso_claim_field_label,
		sso_claim_field_placeholder,
		sso_claim_value_placeholder,
		sso_client_id_aria,
		sso_client_id_label,
		sso_client_id_placeholder,
		sso_client_secret_aria,
		sso_client_secret_label,
		sso_close_form_aria,
		sso_configure_first,
		sso_configure_first_aria,
		sso_default_role_aria,
		sso_default_role_label,
		sso_discover,
		sso_discover_aria,
		sso_display_name_aria,
		sso_display_name_label,
		sso_display_name_placeholder,
		sso_editor_aria,
		sso_heading,
		sso_icon_aria,
		sso_icon_label,
		sso_icon_placeholder,
		sso_intro,
		sso_issuer_aria,
		sso_issuer_label,
		sso_issuer_placeholder,
		sso_jit_disabled,
		sso_jit_enable_aria,
		sso_jit_enable_label,
		sso_jit_heading,
		sso_jit_intro,
		sso_loading,
		sso_mappings_label,
		sso_no_rules,
		sso_none,
		sso_on_claim,
		sso_pkce_active_body,
		sso_pkce_active_strong,
		sso_pkce_badge,
		sso_pkce_s256,
		sso_provider_id_aria,
		sso_provider_id_label,
		sso_provider_id_placeholder,
		sso_quick_presets,
		sso_redirects_aria,
		sso_redirects_label,
		sso_redirects_placeholder,
		sso_role_sync,
		sso_rule_singular,
		sso_save_aria,
		sso_save_provider,
		sso_scopes_aria,
		sso_scopes_label,
		sso_scopes_placeholder,
		sso_sync_roles_aria,
		sso_sync_roles_label
	} from '@src/paraglide/messages';
	import { toast } from '@src/stores/toast.svelte';
	import { fetchApi } from '@utils/api';
	import { showConfirm } from '@utils/modal.svelte';
	import { logger } from '@utils/logger';
	import type { SsoProviderConfig, RoleMappingRule } from '@src/databases/auth/sso-session';

	interface Props {
		availableRoles?: Array<{ _id?: string; name?: string } | string>;
	}

	const { availableRoles = [] }: Props = $props();

	const roleOptions = $derived(
		availableRoles.map((r) => {
			const name = typeof r === 'string' ? r : r.name || r._id || 'user';
			return { value: name, label: name };
		})
	);

	const PRESET_PROVIDERS = [
		{
			id: 'google',
			name: 'Google Workspace',
			icon: 'flat-color-icons:google',
			issuer: 'https://accounts.google.com',
			scopes: ['openid', 'profile', 'email'],
			claimField: 'groups'
		},
		{
			id: 'microsoft',
			name: 'Microsoft Entra ID',
			icon: 'logos:microsoft-icon',
			issuer: 'https://login.microsoftonline.com/common/v2.0',
			scopes: ['openid', 'profile', 'email'],
			claimField: 'roles'
		},
		{
			id: 'okta',
			name: 'Okta Workforce',
			icon: 'logos:okta',
			issuer: 'https://your-org.okta.com',
			scopes: ['openid', 'profile', 'email', 'groups'],
			claimField: 'groups'
		},
		{
			id: 'auth0',
			name: 'Auth0',
			icon: 'logos:auth0-icon',
			issuer: 'https://your-tenant.auth0.com/',
			scopes: ['openid', 'profile', 'email'],
			claimField: 'roles'
		},
		{
			id: 'keycloak',
			name: 'Keycloak',
			icon: 'mdi:shield-key-outline',
			issuer: 'https://keycloak.example.com/realms/master',
			scopes: ['openid', 'profile', 'email'],
			claimField: 'groups'
		}
	];

	let providers = $state<SsoProviderConfig[]>([]);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isEditing = $state(false);

	// Form state for Add/Edit
	let formId = $state('');
	let formName = $state('');
	let formIcon = $state('mdi:shield-key-outline');
	let formIssuer = $state('');
	let formClientId = $state('');
	let formClientSecret = $state('');
	let formScopes = $state('openid profile email');
	let formRedirectUris = $state('');
	let formJitProvisioning = $state(true);
	let formDefaultRole = $state('user');
	let formSyncRolesOnLogin = $state(false);
	let formClaimField = $state('groups');
	let formRules = $state<RoleMappingRule[]>([]);
	let isDiscovering = $state(false);
	let discoveryNotice = $state<string | null>(null);

	async function loadProviders() {
		isLoading = true;
		try {
			const res = await fetchApi<SsoProviderConfig[]>('/api/auth/sso-providers');
			if (res.success && Array.isArray(res.data)) {
				providers = res.data;
			}
		} catch (err) {
			logger.error('Failed to load SSO providers', err);
			toast.error('Failed to load SSO providers');
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadProviders();
	});

	function applyPreset(preset: (typeof PRESET_PROVIDERS)[number]) {
		formId = preset.id;
		formName = preset.name;
		formIcon = preset.icon;
		formIssuer = preset.issuer;
		formScopes = preset.scopes.join(' ');
		formClaimField = preset.claimField;
	}

	function openAddModal() {
		applyPreset(PRESET_PROVIDERS[0]);
		formClientId = '';
		formClientSecret = '';
		formRedirectUris = '';
		formJitProvisioning = true;
		formDefaultRole = roleOptions[0]?.value || 'user';
		formSyncRolesOnLogin = false;
		formRules = [];
		discoveryNotice = null;
		isEditing = true;
	}

	function openEditModal(provider: SsoProviderConfig) {
		formId = provider.id;
		formName = provider.name || provider.id;
		formIcon = provider.icon || 'mdi:shield-key-outline';
		formIssuer = provider.issuer;
		formClientId = provider.clientId || '';
		formClientSecret = provider.clientSecret || '';
		formScopes = (provider.scopes || ['openid', 'profile', 'email']).join(' ');
		formRedirectUris = (provider.allowedRedirectUris || []).join(', ');
		formJitProvisioning = provider.jitProvisioning !== false;
		formDefaultRole = provider.defaultRole || roleOptions[0]?.value || 'user';
		formSyncRolesOnLogin = provider.syncRolesOnLogin === true;
		formClaimField = provider.roleMapping?.claimField || 'groups';
		formRules = (provider.roleMapping?.rules || []).map((r) => ({ ...r }));
		discoveryNotice = null;
		isEditing = true;
	}

	function addMappingRule() {
		formRules = [...formRules, { claimValue: '', role: formDefaultRole || 'user' }];
	}

	function removeMappingRule(index: number) {
		formRules = formRules.filter((_, i) => i !== index);
	}

	async function testDiscovery() {
		if (!formIssuer) {
			toast.warning('Enter an Issuer URL first');
			return;
		}
		isDiscovering = true;
		discoveryNotice = null;
		try {
			const wellKnown = `${formIssuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
			const res = await fetch(wellKnown);
			if (res.ok) {
				const data = await res.json();
				discoveryNotice = `Discovered endpoints: Auth: ${data.authorization_endpoint ? 'OK' : 'Missing'}, Token: ${data.token_endpoint ? 'OK' : 'Missing'}`;
				toast.success('OIDC configuration discovered successfully!');
			} else {
				discoveryNotice = `Discovery HTTP ${res.status}: endpoint unreachable or invalid`;
				toast.warning('Could not reach OIDC discovery endpoint');
			}
		} catch (e: any) {
			discoveryNotice = `Discovery network check: ${e.message || 'Failed'}`;
			toast.info('Discovery check finished (server egress guard will validate on save)');
		} finally {
			isDiscovering = false;
		}
	}

	async function saveCurrentProvider() {
		if (!formId.trim()) {
			toast.error('Provider identifier is required');
			return;
		}
		if (!formIssuer.trim()) {
			toast.error('Issuer URL is required');
			return;
		}

		const updated: SsoProviderConfig = {
			id: formId.trim().toLowerCase(),
			name: formName.trim() || formId.trim(),
			icon: formIcon.trim() || 'mdi:shield-key-outline',
			issuer: formIssuer.trim(),
			clientId: formClientId.trim() || undefined,
			clientSecret: formClientSecret.trim() || undefined,
			scopes: formScopes.split(/\s+/).filter(Boolean),
			allowedRedirectUris: formRedirectUris
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean),
			jitProvisioning: formJitProvisioning,
			defaultRole: formDefaultRole,
			syncRolesOnLogin: formSyncRolesOnLogin,
			roleMapping: {
				claimField: formClaimField.trim() || 'groups',
				rules: formRules.filter((r) => r.claimValue.trim() && r.role.trim())
			}
		};

		const nextProviders = providers.filter((p) => p.id !== updated.id);
		nextProviders.push(updated);

		await submitAllProviders(nextProviders);
		isEditing = false;
	}

	async function deleteProvider(id: string) {
		showConfirm({
			title: 'Delete SSO Provider',
			body: `Are you sure you want to remove the SSO provider "${id}"? Users will no longer be able to log in via this provider.`,
			confirmText: 'Delete Provider',
			onConfirm: async () => {
				const nextProviders = providers.filter((p) => p.id !== id);
				await submitAllProviders(nextProviders);
			}
		});
	}

	async function submitAllProviders(newProviders: SsoProviderConfig[]) {
		isSaving = true;
		try {
			const res = await fetchApi('/api/auth/sso-providers', {
				method: 'POST',
				body: JSON.stringify(newProviders)
			});
			if (res.success) {
				toast.success('SSO configuration updated successfully!');
				await loadProviders();
			} else {
				toast.error(res.message || 'Failed to update SSO configuration');
			}
		} catch (err: any) {
			logger.error('Save SSO error', err);
			toast.error('Network error while saving SSO configuration');
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Overview header -->
	<div
		class="p-4 rounded-lg border border-surface-500/30 bg-surface-500/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
	>
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<iconify-icon
					icon="mdi:shield-key-outline"
					width={24}
					class="text-tertiary-500 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">
					{sso_heading()}
				</h3>
				<Badge variant="success" class="text-xs">{sso_pkce_badge()}</Badge>
			</div>
			<p class="text-sm text-surface-600 dark:text-surface-400">
				{sso_intro()}
			</p>
		</div>
		<Button
			variant="tertiary"
			onclick={openAddModal}
			aria-label={sso_add_aria()}
			class="shadow-xs shrink-0"
		>
			<iconify-icon icon="mdi:plus" width={18} aria-hidden="true"></iconify-icon>
			<span>{sso_add_provider()}</span>
		</Button>
	</div>

	<!-- Edit / Add Modal Card -->
	{#if isEditing}
		<div
			class="p-5 rounded-lg border border-surface-500/40 bg-surface-500/10 dark:bg-surface-900/50 shadow-md space-y-5 animate-fade-in"
			role="region"
			aria-label={sso_editor_aria()}
		>
			<div class="flex items-center justify-between border-b border-surface-500/20 pb-3">
				<div class="flex items-center gap-2">
					<iconify-icon icon={formIcon} width={24} aria-hidden="true"></iconify-icon>
					<h4 class="text-base font-bold text-surface-900 dark:text-surface-100">
						{formId ? `Configure ${formName || formId}` : 'Add SSO Provider'}
					</h4>
				</div>
				<Button
					variant="ghost"
					onclick={() => {
						isEditing = false;
					}}
					aria-label={sso_close_form_aria()}
					class="p-1"
				>
					<iconify-icon icon="mdi:close" width={20} aria-hidden="true"></iconify-icon>
				</Button>
			</div>

			<!-- Preset selector -->
			<div>
				<span class="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2"
					>{sso_quick_presets()}</span
				>
				<div class="flex flex-wrap gap-2">
					{#each PRESET_PROVIDERS as preset (preset.id)}
						<button
							type="button"
							onclick={() => applyPreset(preset)}
							class="px-3 py-1.5 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors {formId ===
							preset.id
								? 'border-tertiary-500 bg-tertiary-500/10 text-tertiary-500 dark:text-primary-500'
								: 'border-surface-500/30 hover:bg-surface-500/10 text-surface-600 dark:text-surface-400'}"
							aria-label={`Apply ${preset.name} preset`}
						>
							<iconify-icon icon={preset.icon} width={16} aria-hidden="true"></iconify-icon>
							<span>{preset.name}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Core OIDC Settings Grid -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label
						for="sso-id"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_provider_id_label()}</label
					>
					<Input
						id="sso-id"
						bind:value={formId}
						placeholder={sso_provider_id_placeholder()}
						aria-label={sso_provider_id_aria()}
					/>
				</div>

				<div>
					<label
						for="sso-name"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_display_name_label()}</label
					>
					<Input
						id="sso-name"
						bind:value={formName}
						placeholder={sso_display_name_placeholder()}
						aria-label={sso_display_name_aria()}
					/>
				</div>

				<div>
					<label
						for="sso-icon"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_icon_label()}</label
					>
					<Input
						id="sso-icon"
						bind:value={formIcon}
						placeholder={sso_icon_placeholder()}
						aria-label={sso_icon_aria()}
					/>
				</div>

				<div>
					<label
						for="sso-issuer"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
					>
						{sso_issuer_label()}
					</label>
					<div class="flex gap-2">
						<Input
							id="sso-issuer"
							bind:value={formIssuer}
							placeholder={sso_issuer_placeholder()}
							aria-label={sso_issuer_aria()}
							class="grow"
						/>
						<Button
							variant="outline"
							onclick={testDiscovery}
							loading={isDiscovering}
							aria-label={sso_discover_aria()}
							class="shrink-0 text-xs"
						>
							{sso_discover()}
						</Button>
					</div>
					{#if discoveryNotice}
						<p class="text-xs text-tertiary-500 dark:text-primary-500 mt-1">{discoveryNotice}</p>
					{/if}
				</div>

				<div>
					<label
						for="sso-client-id"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_client_id_label()}</label
					>
					<Input
						id="sso-client-id"
						bind:value={formClientId}
						placeholder={sso_client_id_placeholder()}
						aria-label={sso_client_id_aria()}
					/>
				</div>

				<div>
					<label
						for="sso-client-secret"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_client_secret_label()}</label
					>
					<Input
						id="sso-client-secret"
						type="password"
						bind:value={formClientSecret}
						placeholder="••••••••"
						aria-label={sso_client_secret_aria()}
					/>
				</div>

				<div>
					<label
						for="sso-scopes"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_scopes_label()}</label
					>
					<Input
						id="sso-scopes"
						bind:value={formScopes}
						placeholder={sso_scopes_placeholder()}
						aria-label={sso_scopes_aria()}
					/>
				</div>

				<div>
					<label
						for="sso-redirect-uris"
						class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
						>{sso_redirects_label()}</label
					>
					<Input
						id="sso-redirect-uris"
						bind:value={formRedirectUris}
						placeholder={sso_redirects_placeholder()}
						aria-label={sso_redirects_aria()}
					/>
				</div>
			</div>

			<!-- PKCE Banner -->
			<div
				class="p-3 rounded border border-success-500/30 bg-success-500/10 flex items-center justify-between text-xs text-surface-600 dark:text-surface-400"
			>
				<div class="flex items-center gap-2">
					<iconify-icon
						icon="mdi:shield-check"
						width={18}
						class="text-success-500"
						aria-hidden="true"
					></iconify-icon>
					<span
						><strong>{sso_pkce_active_strong()}</strong>{' '}
						{sso_pkce_active_body()}</span
					>
				</div>
			</div>

			<!-- JIT & Role Mapping Section -->
			<div class="border-t border-surface-500/20 pt-4 space-y-4">
				<div class="flex items-center justify-between">
					<div>
						<h5 class="text-sm font-bold text-surface-900 dark:text-surface-100">
							{sso_jit_heading()}
						</h5>
						<p class="text-xs text-surface-500">
							{sso_jit_intro()}
						</p>
					</div>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							aria-label={sso_jit_enable_aria()}
							type="checkbox"
							bind:checked={formJitProvisioning}
							class="rounded border-surface-500/30 text-tertiary-500 focus:ring-tertiary-500"
						/>
						<span class="text-xs font-medium text-surface-600 dark:text-surface-400"
							>{sso_jit_enable_label()}</span
						>
					</label>
				</div>

				{#if formJitProvisioning}
					<div
						class="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded bg-surface-500/10 border border-surface-500/20"
					>
						<div>
							<label
								for="sso-default-role"
								class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
								>{sso_default_role_label()}</label
							>
							<Select
								id="sso-default-role"
								bind:value={formDefaultRole}
								options={roleOptions.length > 0
									? roleOptions
									: [
											{ value: 'user', label: 'user' },
											{ value: 'editor', label: 'editor' },
											{ value: 'admin', label: 'admin' }
										]}
								aria-label={sso_default_role_aria()}
							/>
						</div>

						<div>
							<label
								for="sso-claim-field"
								class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1"
								>{sso_claim_field_label()}</label
							>
							<Input
								id="sso-claim-field"
								bind:value={formClaimField}
								placeholder={sso_claim_field_placeholder()}
								aria-label={sso_claim_field_aria()}
							/>
						</div>

						<div class="flex items-center pt-5">
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									aria-label={sso_sync_roles_aria()}
									type="checkbox"
									bind:checked={formSyncRolesOnLogin}
									class="rounded border-surface-500/30 text-tertiary-500 focus:ring-tertiary-500"
								/>
								<span class="text-xs text-surface-600 dark:text-surface-400"
									>{sso_sync_roles_label()}</span
								>
							</label>
						</div>
					</div>

					<!-- Rule Mapping Matrix -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span
								class="text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider"
								>{sso_mappings_label()}</span
							>
							<Button
								variant="ghost"
								onclick={addMappingRule}
								aria-label={sso_add_rule_aria()}
								class="text-xs py-1 px-2"
							>
								<iconify-icon icon="mdi:plus" width={16} aria-hidden="true"></iconify-icon>
								<span>{sso_add_rule()}</span>
							</Button>
						</div>

						{#if formRules.length === 0}
							<p
								class="text-xs text-surface-500 italic p-3 border border-dashed border-surface-500/30 rounded text-center"
							>
								{sso_no_rules({ role: formDefaultRole })}
							</p>
						{:else}
							<div class="space-y-2">
								{#each formRules as rule, i (i)}
									<div
										class="flex items-center gap-3 p-2 rounded bg-surface-500/10 border border-surface-500/20"
									>
										<div class="flex-1">
											<Input
												bind:value={rule.claimValue}
												placeholder={sso_claim_value_placeholder()}
												aria-label={`Claim value rule ${i + 1}`}
											/>
										</div>
										<iconify-icon
											icon="mdi:arrow-right"
											width={18}
											class="text-surface-400 shrink-0"
											aria-hidden="true"
										></iconify-icon>
										<div class="w-44 shrink-0">
											<Select
												bind:value={rule.role}
												options={roleOptions.length > 0
													? roleOptions
													: [
															{ value: 'user', label: 'user' },
															{ value: 'editor', label: 'editor' },
															{ value: 'admin', label: 'admin' }
														]}
												aria-label={`Target role rule ${i + 1}`}
											/>
										</div>
										<Button
											variant="ghost"
											onclick={() => removeMappingRule(i)}
											aria-label={`Remove rule ${i + 1}`}
											class="p-1 text-error-500 hover:bg-error-500/10"
										>
											<iconify-icon icon="mdi:delete-outline" width={18} aria-hidden="true"
											></iconify-icon>
										</Button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Action buttons -->
			<div class="flex items-center justify-end gap-3 pt-3 border-t border-surface-500/20">
				<Button
					variant="ghost"
					onclick={() => {
						isEditing = false;
					}}
					aria-label={sso_cancel_aria()}
				>
					{button_cancel()}
				</Button>
				<Button
					variant="tertiary"
					onclick={saveCurrentProvider}
					loading={isSaving}
					aria-label={sso_save_aria()}
					class="shadow-xs font-semibold"
				>
					{sso_save_provider()}
				</Button>
			</div>
		</div>
	{/if}

	<!-- Providers List -->
	{#if isLoading}
		<div class="p-8 text-center text-sm text-surface-500">{sso_loading()}</div>
	{:else if providers.length === 0}
		<div
			class="p-8 text-center rounded-lg border border-dashed border-surface-500/30 text-surface-500 space-y-3"
		>
			<iconify-icon icon="mdi:shield-outline" width={40} class="text-surface-400" aria-hidden="true"
			></iconify-icon>
			<p class="text-sm">{sso_none()}</p>
			<Button
				variant="outline"
				onclick={openAddModal}
				aria-label={sso_configure_first_aria()}
				class="text-xs font-medium"
			>
				{sso_configure_first()}
			</Button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4">
			{#each providers as provider (provider.id)}
				<div
					class="p-4 rounded-lg border border-surface-500/30 bg-surface-500/10 dark:bg-surface-900/20 hover:border-surface-500/50 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4"
				>
					<div class="flex items-start gap-3">
						<div
							class="w-10 h-10 rounded-lg bg-surface-500/10 flex items-center justify-center shrink-0 border border-surface-500/20"
						>
							<iconify-icon
								icon={provider.icon || 'mdi:shield-key-outline'}
								width={24}
								aria-hidden="true"
							></iconify-icon>
						</div>
						<div class="space-y-1">
							<div class="flex items-center gap-2 flex-wrap">
								<h4 class="font-bold text-base text-surface-900 dark:text-surface-100">
									{provider.name || provider.id}
								</h4>
								<code
									class="text-xs px-1.5 py-0.5 rounded bg-surface-500/10 text-surface-600 dark:text-surface-400"
									>{provider.id}</code
								>
								<Badge variant="success" class="text-xs">{sso_pkce_s256()}</Badge>
								{#if provider.jitProvisioning !== false}
									<Badge variant="tertiary" class="text-xs"
										>JIT: {provider.defaultRole || 'user'}</Badge
									>
								{:else}
									<Badge variant="surface" class="text-xs">{sso_jit_disabled()}</Badge>
								{/if}
								{#if provider.syncRolesOnLogin}
									<Badge variant="secondary" class="text-xs">{sso_role_sync()}</Badge>
								{/if}
							</div>
							<p class="text-xs text-surface-500 truncate max-w-md">{provider.issuer}</p>
							{#if provider.roleMapping?.rules && provider.roleMapping.rules.length > 0}
								<p class="text-xs text-tertiary-500 dark:text-primary-500">
									{provider.roleMapping.rules.length}
									{sso_rule_singular()}{provider.roleMapping.rules.length > 1 ? 's' : ''}
									{sso_on_claim({ field: provider.roleMapping.claimField || 'groups' })}
								</p>
							{/if}
						</div>
					</div>

					<div class="flex items-center gap-2 self-end md:self-center">
						<Button
							variant="ghost"
							onclick={() => openEditModal(provider)}
							aria-label={`Edit ${provider.name || provider.id}`}
							class="text-xs"
						>
							<iconify-icon icon="mdi:pencil" width={16} aria-hidden="true"></iconify-icon>
							<span>{button_edit()}</span>
						</Button>
						<Button
							variant="ghost"
							onclick={() => deleteProvider(provider.id)}
							aria-label={`Delete ${provider.name || provider.id}`}
							class="text-xs text-error-500 hover:bg-error-500/10"
						>
							<iconify-icon icon="mdi:trash-can-outline" width={16} aria-hidden="true"
							></iconify-icon>
							<span>Delete</span>
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

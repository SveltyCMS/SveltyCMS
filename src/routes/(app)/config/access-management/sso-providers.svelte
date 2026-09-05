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
import { onMount } from "svelte";
import Button from "@components/ui/button.svelte";
import Input from "@components/ui/input.svelte";
import Select from "@components/ui/select.svelte";
import Badge from "@components/ui/badge.svelte";
import { toast } from "@src/stores/toast.svelte";
import { fetchApi } from "@utils/api";
import { showConfirm } from "@utils/modal.svelte";
import { logger } from "@utils/logger";
import type { SsoProviderConfig, RoleMappingRule } from "@src/databases/auth/sso-session";

interface Props {
	availableRoles?: Array<{ _id?: string; name?: string } | string>;
}

const { availableRoles = [] }: Props = $props();

const roleOptions = $derived(
	availableRoles.map((r) => {
		const name = typeof r === "string" ? r : r.name || r._id || "user";
		return { value: name, label: name };
	}),
);

const PRESET_PROVIDERS = [
	{
		id: "google",
		name: "Google Workspace",
		icon: "flat-color-icons:google",
		issuer: "https://accounts.google.com",
		scopes: ["openid", "profile", "email"],
		claimField: "groups",
	},
	{
		id: "microsoft",
		name: "Microsoft Entra ID",
		icon: "logos:microsoft-icon",
		issuer: "https://login.microsoftonline.com/common/v2.0",
		scopes: ["openid", "profile", "email"],
		claimField: "roles",
	},
	{
		id: "okta",
		name: "Okta Workforce",
		icon: "logos:okta",
		issuer: "https://your-org.okta.com",
		scopes: ["openid", "profile", "email", "groups"],
		claimField: "groups",
	},
	{
		id: "auth0",
		name: "Auth0",
		icon: "logos:auth0-icon",
		issuer: "https://your-tenant.auth0.com/",
		scopes: ["openid", "profile", "email"],
		claimField: "roles",
	},
	{
		id: "keycloak",
		name: "Keycloak",
		icon: "mdi:shield-key-outline",
		issuer: "https://keycloak.example.com/realms/master",
		scopes: ["openid", "profile", "email"],
		claimField: "groups",
	},
];

let providers = $state<SsoProviderConfig[]>([]);
let isLoading = $state(true);
let isSaving = $state(false);
let isEditing = $state(false);

// Form state for Add/Edit
let formId = $state("");
let formName = $state("");
let formIcon = $state("mdi:shield-key-outline");
let formIssuer = $state("");
let formClientId = $state("");
let formClientSecret = $state("");
let formScopes = $state("openid profile email");
let formRedirectUris = $state("");
let formJitProvisioning = $state(true);
let formDefaultRole = $state("user");
let formSyncRolesOnLogin = $state(false);
let formClaimField = $state("groups");
let formRules = $state<RoleMappingRule[]>([]);
let isDiscovering = $state(false);
let discoveryNotice = $state<string | null>(null);

async function loadProviders() {
	isLoading = true;
	try {
		const res = await fetchApi<SsoProviderConfig[]>("/api/auth/sso-providers");
		if (res.success && Array.isArray(res.data)) {
			providers = res.data;
		}
	} catch (err) {
		logger.error("Failed to load SSO providers", err);
		toast.error("Failed to load SSO providers");
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
	formScopes = preset.scopes.join(" ");
	formClaimField = preset.claimField;
}

function openAddModal() {
	applyPreset(PRESET_PROVIDERS[0]);
	formClientId = "";
	formClientSecret = "";
	formRedirectUris = "";
	formJitProvisioning = true;
	formDefaultRole = roleOptions[0]?.value || "user";
	formSyncRolesOnLogin = false;
	formRules = [];
	discoveryNotice = null;
	isEditing = true;
}

function openEditModal(provider: SsoProviderConfig) {
	formId = provider.id;
	formName = provider.name || provider.id;
	formIcon = provider.icon || "mdi:shield-key-outline";
	formIssuer = provider.issuer;
	formClientId = provider.clientId || "";
	formClientSecret = provider.clientSecret || "";
	formScopes = (provider.scopes || ["openid", "profile", "email"]).join(" ");
	formRedirectUris = (provider.allowedRedirectUris || []).join(", ");
	formJitProvisioning = provider.jitProvisioning !== false;
	formDefaultRole = provider.defaultRole || roleOptions[0]?.value || "user";
	formSyncRolesOnLogin = provider.syncRolesOnLogin === true;
	formClaimField = provider.roleMapping?.claimField || "groups";
	formRules = (provider.roleMapping?.rules || []).map((r) => ({ ...r }));
	discoveryNotice = null;
	isEditing = true;
}

function addMappingRule() {
	formRules = [...formRules, { claimValue: "", role: formDefaultRole || "user" }];
}

function removeMappingRule(index: number) {
	formRules = formRules.filter((_, i) => i !== index);
}

async function testDiscovery() {
	if (!formIssuer) {
		toast.warning("Enter an Issuer URL first");
		return;
	}
	isDiscovering = true;
	discoveryNotice = null;
	try {
		const wellKnown = `${formIssuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
		const res = await fetch(wellKnown);
		if (res.ok) {
			const data = await res.json();
			discoveryNotice = `Discovered endpoints: Auth: ${data.authorization_endpoint ? "OK" : "Missing"}, Token: ${data.token_endpoint ? "OK" : "Missing"}`;
			toast.success("OIDC configuration discovered successfully!");
		} else {
			discoveryNotice = `Discovery HTTP ${res.status}: endpoint unreachable or invalid`;
			toast.warning("Could not reach OIDC discovery endpoint");
		}
	} catch (e: any) {
		discoveryNotice = `Discovery network check: ${e.message || "Failed"}`;
		toast.info("Discovery check finished (server egress guard will validate on save)");
	} finally {
		isDiscovering = false;
	}
}

async function saveCurrentProvider() {
	if (!formId.trim()) {
		toast.error("Provider identifier is required");
		return;
	}
	if (!formIssuer.trim()) {
		toast.error("Issuer URL is required");
		return;
	}

	const updated: SsoProviderConfig = {
		id: formId.trim().toLowerCase(),
		name: formName.trim() || formId.trim(),
		icon: formIcon.trim() || "mdi:shield-key-outline",
		issuer: formIssuer.trim(),
		clientId: formClientId.trim() || undefined,
		clientSecret: formClientSecret.trim() || undefined,
		scopes: formScopes.split(/\s+/).filter(Boolean),
		allowedRedirectUris: formRedirectUris.split(",").map((s) => s.trim()).filter(Boolean),
		jitProvisioning: formJitProvisioning,
		defaultRole: formDefaultRole,
		syncRolesOnLogin: formSyncRolesOnLogin,
		roleMapping: {
			claimField: formClaimField.trim() || "groups",
			rules: formRules.filter((r) => r.claimValue.trim() && r.role.trim()),
		},
	};

	const nextProviders = providers.filter((p) => p.id !== updated.id);
	nextProviders.push(updated);

	await submitAllProviders(nextProviders);
	isEditing = false;
}

async function deleteProvider(id: string) {
	showConfirm({
		title: "Delete SSO Provider",
		body: `Are you sure you want to remove the SSO provider "${id}"? Users will no longer be able to log in via this provider.`,
		confirmText: "Delete Provider",
		onConfirm: async () => {
			const nextProviders = providers.filter((p) => p.id !== id);
			await submitAllProviders(nextProviders);
		},
	});
}

async function submitAllProviders(newProviders: SsoProviderConfig[]) {
	isSaving = true;
	try {
		const res = await fetchApi("/api/auth/sso-providers", {
			method: "POST",
			body: JSON.stringify(newProviders),
		});
		if (res.success) {
			toast.success("SSO configuration updated successfully!");
			await loadProviders();
		} else {
			toast.error(res.message || "Failed to update SSO configuration");
		}
	} catch (err: any) {
		logger.error("Save SSO error", err);
		toast.error("Network error while saving SSO configuration");
	} finally {
		isSaving = false;
	}
}
</script>

<div class="space-y-6">
	<!-- Overview header -->
	<div class="p-4 rounded-lg border border-surface-500/30 bg-surface-500/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:shield-key-outline" width={24} class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
				<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Enterprise Single Sign-On (OIDC & PKCE)</h3>
				<Badge variant="success" class="text-xs">RFC 7636 PKCE (S256)</Badge>
			</div>
			<p class="text-sm text-surface-600 dark:text-surface-400">
				Federate authentication with enterprise OpenID Connect Identity Providers. New users are automatically provisioned with Just-In-Time (JIT) role mapping based on IdP claims.
			</p>
		</div>
		<Button
			variant="tertiary"
			onclick={openAddModal}
			aria-label="Add new SSO Provider"
			class="shadow-xs shrink-0"
		>
			<iconify-icon icon="mdi:plus" width={18} aria-hidden="true"></iconify-icon>
			<span>Add Provider</span>
		</Button>
	</div>

	<!-- Edit / Add Modal Card -->
	{#if isEditing}
		<div class="p-5 rounded-lg border border-surface-500/40 bg-surface-500/10 dark:bg-surface-900/50 shadow-md space-y-5 animate-fade-in" role="region" aria-label="SSO Provider Editor">
			<div class="flex items-center justify-between border-b border-surface-500/20 pb-3">
				<div class="flex items-center gap-2">
					<iconify-icon icon={formIcon} width={24} aria-hidden="true"></iconify-icon>
					<h4 class="text-base font-bold text-surface-900 dark:text-surface-100">
						{formId ? `Configure ${formName || formId}` : 'Add SSO Provider'}
					</h4>
				</div>
				<Button
					variant="ghost"
					onclick={() => { isEditing = false; }}
					aria-label="Close form"
					class="p-1"
				>
					<iconify-icon icon="mdi:close" width={20} aria-hidden="true"></iconify-icon>
				</Button>
			</div>

			<!-- Preset selector -->
			<div>
				<span class="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Quick Presets</span>
				<div class="flex flex-wrap gap-2">
					{#each PRESET_PROVIDERS as preset (preset.id)}
						<button
							type="button"
							onclick={() => applyPreset(preset)}
							class="px-3 py-1.5 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors {formId === preset.id ? 'border-tertiary-500 bg-tertiary-500/10 text-tertiary-500 dark:text-primary-500' : 'border-surface-500/30 hover:bg-surface-500/10 text-surface-600 dark:text-surface-400'}"
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
					<label for="sso-id" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Provider ID (URL slug)</label>
					<Input
						id="sso-id"
						bind:value={formId}
						placeholder="google, okta, azure-ad, keycloak"
						aria-label="Provider ID"
					/>
				</div>

				<div>
					<label for="sso-name" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Display Name (Login button text)</label>
					<Input
						id="sso-name"
						bind:value={formName}
						placeholder="Google Workspace, Microsoft Entra ID"
						aria-label="Display Name"
					/>
				</div>

				<div>
					<label for="sso-icon" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Iconify Icon Identifier</label>
					<Input
						id="sso-icon"
						bind:value={formIcon}
						placeholder="flat-color-icons:google, logos:okta, logos:microsoft-icon"
						aria-label="Icon Identifier"
					/>
				</div>

				<div>
					<label for="sso-issuer" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">
						OIDC Issuer URL
					</label>
					<div class="flex gap-2">
						<Input
							id="sso-issuer"
							bind:value={formIssuer}
							placeholder="https://accounts.google.com"
							aria-label="OIDC Issuer URL"
							class="grow"
						/>
						<Button
							variant="outline"
							onclick={testDiscovery}
							loading={isDiscovering}
							aria-label="Test OIDC auto-discovery"
							class="shrink-0 text-xs"
						>
							Discover
						</Button>
					</div>
					{#if discoveryNotice}
						<p class="text-xs text-tertiary-500 dark:text-primary-500 mt-1">{discoveryNotice}</p>
					{/if}
				</div>

				<div>
					<label for="sso-client-id" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Client ID</label>
					<Input
						id="sso-client-id"
						bind:value={formClientId}
						placeholder="OIDC OAuth Client ID"
						aria-label="Client ID"
					/>
				</div>

				<div>
					<label for="sso-client-secret" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Client Secret (stored securely on server)</label>
					<Input
						id="sso-client-secret"
						type="password"
						bind:value={formClientSecret}
						placeholder="••••••••"
						aria-label="Client Secret"
					/>
				</div>

				<div>
					<label for="sso-scopes" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">OAuth Scopes</label>
					<Input
						id="sso-scopes"
						bind:value={formScopes}
						placeholder="openid profile email groups"
						aria-label="OAuth Scopes"
					/>
				</div>

				<div>
					<label for="sso-redirect-uris" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Allowed Post-Logout Redirects</label>
					<Input
						id="sso-redirect-uris"
						bind:value={formRedirectUris}
						placeholder="https://example.com/logout, https://*.example.com/*"
						aria-label="Allowed Post-Logout Redirects"
					/>
				</div>
			</div>

			<!-- PKCE Banner -->
			<div class="p-3 rounded border border-success-500/30 bg-success-500/10 flex items-center justify-between text-xs text-surface-600 dark:text-surface-400">
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:shield-check" width={18} class="text-success-500" aria-hidden="true"></iconify-icon>
					<span><strong>RFC 7636 PKCE S256 Active:</strong> SveltyCMS automatically mints high-entropy code verifiers and SHA-256 challenges on every authorization flow.</span>
				</div>
			</div>

			<!-- JIT & Role Mapping Section -->
			<div class="border-t border-surface-500/20 pt-4 space-y-4">
				<div class="flex items-center justify-between">
					<div>
						<h5 class="text-sm font-bold text-surface-900 dark:text-surface-100">Just-In-Time (JIT) Auto-Provisioning & Role Mapping</h5>
						<p class="text-xs text-surface-500">Automatically register new CMS users upon successful SSO login and map their IdP claims to local roles.</p>
					</div>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" bind:checked={formJitProvisioning} aria-label="Enable JIT provisioning" class="rounded border-surface-500/30 text-tertiary-500 focus:ring-tertiary-500" />
						<span class="text-xs font-medium text-surface-600 dark:text-surface-400">Enable JIT Provisioning</span>
					</label>
				</div>

				{#if formJitProvisioning}
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded bg-surface-500/10 border border-surface-500/20">
						<div>
							<label for="sso-default-role" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Default Local Role</label>
							<Select
								id="sso-default-role"
								bind:value={formDefaultRole}
								options={roleOptions.length > 0 ? roleOptions : [{ value: "user", label: "user" }, { value: "editor", label: "editor" }, { value: "admin", label: "admin" }]}
								aria-label="Default Local Role"
							/>
						</div>

						<div>
							<label for="sso-claim-field" class="block text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">IdP Claim Field Name</label>
							<Input
								id="sso-claim-field"
								bind:value={formClaimField}
								placeholder="groups, roles, department"
								aria-label="Claim Field Name"
							/>
						</div>

						<div class="flex items-center pt-5">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="checkbox" bind:checked={formSyncRolesOnLogin} aria-label="Synchronize roles on each login" class="rounded border-surface-500/30 text-tertiary-500 focus:ring-tertiary-500" />
								<span class="text-xs text-surface-600 dark:text-surface-400">Synchronize roles on each login</span>
							</label>
						</div>
					</div>

					<!-- Rule Mapping Matrix -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider">Claim Value $\to$ Local Role Mappings</span>
							<Button
								variant="ghost"
								onclick={addMappingRule}
								aria-label="Add mapping rule"
								class="text-xs py-1 px-2"
							>
								<iconify-icon icon="mdi:plus" width={16} aria-hidden="true"></iconify-icon>
								<span>Add Mapping Rule</span>
							</Button>
						</div>

						{#if formRules.length === 0}
							<p class="text-xs text-surface-500 italic p-3 border border-dashed border-surface-500/30 rounded text-center">
								No custom claim rules defined. Users will be assigned the default role ("{formDefaultRole}").
							</p>
						{:else}
							<div class="space-y-2">
								{#each formRules as rule, i (rule)}
									<div class="flex items-center gap-3 p-2 rounded bg-surface-500/10 border border-surface-500/20">
										<div class="flex-1">
											<Input
												bind:value={rule.claimValue}
												placeholder="IdP claim value (e.g. SveltyAdmins, Devs)"
												aria-label={`Claim value rule ${i + 1}`}
											/>
										</div>
										<iconify-icon icon="mdi:arrow-right" width={18} class="text-surface-400 shrink-0" aria-hidden="true"></iconify-icon>
										<div class="w-44 shrink-0">
											<Select
												bind:value={rule.role}
												options={roleOptions.length > 0 ? roleOptions : [{ value: "user", label: "user" }, { value: "editor", label: "editor" }, { value: "admin", label: "admin" }]}
												aria-label={`Target role rule ${i + 1}`}
											/>
										</div>
										<Button
											variant="ghost"
											onclick={() => removeMappingRule(i)}
											aria-label={`Remove rule ${i + 1}`}
											class="p-1 text-error-500 hover:bg-error-500/10"
										>
											<iconify-icon icon="mdi:delete-outline" width={18} aria-hidden="true"></iconify-icon>
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
					onclick={() => { isEditing = false; }}
					aria-label="Cancel editing"
				>
					Cancel
				</Button>
				<Button
					variant="tertiary"
					onclick={saveCurrentProvider}
					loading={isSaving}
					aria-label="Save SSO Provider"
					class="shadow-xs font-semibold"
				>
					Save Provider
				</Button>
			</div>
		</div>
	{/if}

	<!-- Providers List -->
	{#if isLoading}
		<div class="p-8 text-center text-sm text-surface-500">
			Loading configured SSO providers…
		</div>
	{:else if providers.length === 0}
		<div class="p-8 text-center rounded-lg border border-dashed border-surface-500/30 text-surface-500 space-y-3">
			<iconify-icon icon="mdi:shield-outline" width={40} class="text-surface-400" aria-hidden="true"></iconify-icon>
			<p class="text-sm">No SSO identity providers configured yet.</p>
			<Button
				variant="outline"
				onclick={openAddModal}
				aria-label="Configure your first SSO provider"
				class="text-xs font-medium"
			>
				Configure First Provider
			</Button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4">
			{#each providers as provider (provider.id)}
				<div class="p-4 rounded-lg border border-surface-500/30 bg-surface-500/10 dark:bg-surface-900/20 hover:border-surface-500/50 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4">
					<div class="flex items-start gap-3">
						<div class="w-10 h-10 rounded-lg bg-surface-500/10 flex items-center justify-center shrink-0 border border-surface-500/20">
							<iconify-icon icon={provider.icon || "mdi:shield-key-outline"} width={24} aria-hidden="true"></iconify-icon>
						</div>
						<div class="space-y-1">
							<div class="flex items-center gap-2 flex-wrap">
								<h4 class="font-bold text-base text-surface-900 dark:text-surface-100">{provider.name || provider.id}</h4>
								<code class="text-xs px-1.5 py-0.5 rounded bg-surface-500/10 text-surface-600 dark:text-surface-400">{provider.id}</code>
								<Badge variant="success" class="text-xs">PKCE S256</Badge>
								{#if provider.jitProvisioning !== false}
									<Badge variant="tertiary" class="text-xs">JIT: {provider.defaultRole || 'user'}</Badge>
								{:else}
									<Badge variant="surface" class="text-xs">JIT Disabled</Badge>
								{/if}
								{#if provider.syncRolesOnLogin}
									<Badge variant="secondary" class="text-xs">Role Sync</Badge>
								{/if}
							</div>
							<p class="text-xs text-surface-500 truncate max-w-md">{provider.issuer}</p>
							{#if provider.roleMapping?.rules && provider.roleMapping.rules.length > 0}
								<p class="text-xs text-tertiary-500 dark:text-primary-500">
									{provider.roleMapping.rules.length} role mapping rule{provider.roleMapping.rules.length > 1 ? 's' : ''} on claim "{provider.roleMapping.claimField || 'groups'}"
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
							<span>Edit</span>
						</Button>
						<Button
							variant="ghost"
							onclick={() => deleteProvider(provider.id)}
							aria-label={`Delete ${provider.name || provider.id}`}
							class="text-xs text-error-500 hover:bg-error-500/10"
						>
							<iconify-icon icon="mdi:trash-can-outline" width={16} aria-hidden="true"></iconify-icon>
							<span>Delete</span>
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

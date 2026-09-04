<!--
@file src/routes/login/components/oauth-login.svelte
@component
**OAuth Login button**

### Props
- `showGoogleOAuth`: boolean — whether to render the Google OAuth button (controlled by parent/server)
- `showGithubOAuth`: boolean — whether to render the GitHub OAuth button (controlled by parent/server)
- `ssoProviders`: PublicSsoProvider[] — active enterprise SSO/OIDC providers (Google, Okta, Azure, Auth0, Keycloak)
- `firstCollectionPath`: string — passed from parent; avoids a server round-trip on hover

### Features:
- Prefetches first collection on hover for instant navigation post-auth
- Accessible Google sign-in button with <span> (not <p>) inside <Button variant="outline">
- Dynamic branded enterprise SSO buttons with official icons and preloading
-->

<script lang="ts">
import { logger } from "@utils/logger";
import { preloadData } from "$app/navigation";
import Button from '@components/ui/button.svelte';
import type { PublicSsoProvider } from "@src/databases/auth/sso-session";

const {
	showGoogleOAuth = true,
	showGithubOAuth = true,
	ssoProviders = [],
	firstCollectionPath = "",
}: {
	showGoogleOAuth?: boolean;
	showGithubOAuth?: boolean;
	ssoProviders?: PublicSsoProvider[];
	firstCollectionPath?: string;
} = $props();

let prefetched = $state(false);

/**
 * Parent already has firstCollectionPath from the load function.
 * Use it directly instead of firing a ?/prefetch server action on every hover.
 * This eliminates an unnecessary server round-trip.
 */
async function prefetchFirstCollection() {
	if (prefetched || !firstCollectionPath) return;
	prefetched = true;
	try {
		await preloadData(firstCollectionPath);
	} catch (error) {
		logger.error("OAuth prefetch failed:", error);
	}
}
</script>

<div class="flex flex-col gap-2 w-full sm:w-auto">
	{#if showGoogleOAuth}
		<form
			id="google-oauth-login"
			action="?/signInOAuth"
			method="post"
			class="flex flex-col items-center justify-center w-full"
		>
			<Button variant="surface"
				form="google-oauth-login"
				type="submit"
				aria-label="Sign in with Google"
				onmouseenter={prefetchFirstCollection}
			 class="w-full">
				<iconify-icon icon="flat-color-icons:google" width={24} aria-hidden="true"></iconify-icon>
				<span>Sign in with Google</span>
			</Button>
		</form>
	{/if}

	{#if showGithubOAuth}
		<form
			id="github-oauth-login"
			action="?/signInOAuthGithub"
			method="post"
			class="flex flex-col items-center justify-center w-full"
		>
			<Button variant="surface"
				form="github-oauth-login"
				type="submit"
				aria-label="Sign in with GitHub"
				onmouseenter={prefetchFirstCollection}
			 class="w-full">
				<iconify-icon icon="mdi:github" width={24} aria-hidden="true"></iconify-icon>
				<span>Sign in with GitHub</span>
			</Button>
		</form>
	{/if}

	{#each ssoProviders as provider (provider.id)}
		<a
			href={provider.authUrl}
			data-preload="hover"
			onmouseenter={prefetchFirstCollection}
			class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-surface-500/30 bg-surface-500/10 hover:bg-surface-500/20 text-surface-900 dark:text-surface-100 transition-colors shadow-xs"
			aria-label={`Sign in with ${provider.name}`}
		>
			<iconify-icon icon={provider.icon} width={22} aria-hidden="true"></iconify-icon>
			<span>Sign in with {provider.name}</span>
		</a>
	{/each}
</div>
